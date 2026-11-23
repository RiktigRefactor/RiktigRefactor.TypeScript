import ts from "typescript";
import { offsetOf, type TextEdit } from "./edits.js";
import {
    analyze,
    cursorTrailer,
    findReferences,
    findRelatedMemberNamed,
    isProvablyNonNull,
    lowerCamelCase,
    memberNameText,
    nameResolvesTo,
    Refusal,
    refusalResult,
    successResult,
    symbolAtCursor,
    verifyEdits,
} from "./methodSupport.js";
import type { Position, Result } from "./protocol.js";
import { bindsOwnArgumentsAndSuper, findDynamicMemberAccess, isSubtypeByHeritage } from "./semantics.js";
import { forEachDescendant, isReservedWord, isValidIdentifierText } from "./syntax.js";
import type { Workspace } from "./workspace.js";

export interface MakeMethodStaticRequest {
    file: string;
    position: Position;
    /** The new receiver parameter's name; defaults to the class name in camelCase. */
    receiverName?: string;
    /** Only "receiver" is supported. */
    pass?: "receiver" | "members";
}

export interface RefactoringOptions {
    /** Skips every precondition and the verification; only the tests use it. */
    naive?: boolean;
}

export function makeMethodStatic(
    workspace: Workspace,
    request: MakeMethodStaticRequest,
    options: RefactoringOptions = {},
): Result {
    const fileName = workspace.absolutePath(request.file);
    const text = workspace.files.get(fileName);
    if (text === undefined) throw new Error(`The file ${request.file} is not part of the workspace.`);
    const offset = offsetOf(text, request.position);
    if (offset === undefined) throw new Error(`The position is outside ${request.file}.`);
    const analysis = analyze(workspace);
    const naive = options.naive === true;
    try {
        if (request.pass === "members") {
            throw new Refusal(
                "option-not-supported",
                'Passing members (`pass: "members"`) is not supported yet; pass the receiver instead.',
            );
        }
        const { symbol, identifier } = symbolAtCursor(analysis, workspace, fileName, offset);
        const method = symbol.valueDeclaration;
        if (!method || !ts.isMethodDeclaration(method) || !method.body || !ts.isClassDeclaration(method.parent)) {
            throw new Refusal(
                "not-an-instance-method",
                `\`${identifier.text}\` is not a method with a body in a class.`,
                identifier,
            );
        }
        const classDeclaration = method.parent;
        const modifiers = ts.getCombinedModifierFlags(method);
        if (modifiers & ts.ModifierFlags.Static) {
            throw new Refusal("not-an-instance-method", "The method is already static.", method.name);
        }
        if (!classDeclaration.name)
            throw new Refusal(
                "not-an-instance-method",
                "The class has no name to call the static method through.",
                classDeclaration,
            );
        const className = classDeclaration.name.text;
        const methodName = memberNameText(method.name);
        if (methodName === undefined)
            throw new Refusal("not-an-instance-method", "The method's name is computed.", method.name);
        const receiverName = request.receiverName ?? lowerCamelCase(className);
        if (!isValidIdentifierText(receiverName) || isReservedWord(receiverName)) {
            throw new Refusal("invalid-identifier", `\`${receiverName}\` is not a valid parameter name.`);
        }

        if (!naive) checkDeclaration(analysis, workspace, method, classDeclaration, methodName);
        const references = findReferences(analysis, workspace, method);
        const calls = references.map((reference) => callThrough(reference, naive));
        if (!naive) {
            for (const call of calls) {
                if (!isProvablyNonNull(analysis.checker, call.receiver)) {
                    throw new Refusal(
                        "receiver-may-be-null",
                        "This call's receiver can't be proved non-null; a null receiver would fail at a different point after the change.",
                        call.receiver,
                    );
                }
                if (
                    !nameResolvesTo(
                        analysis.checker,
                        call.call,
                        className,
                        analysis.checker.getSymbolAtLocation(classDeclaration.name)!,
                    )
                ) {
                    throw new Refusal(
                        "class-name-not-in-scope",
                        `\`${className}\` does not name the class at this call.`,
                        call.call,
                    );
                }
            }
        }

        const edits: TextEdit[] = [];
        const methodFile = method.getSourceFile();
        edits.push({
            fileName: methodFile.fileName,
            start: staticInsertionPoint(method),
            end: staticInsertionPoint(method),
            newText: "static ",
        });
        const parameterText = `${receiverName}: ${className}${method.parameters.length > 0 ? ", " : ""}`;
        edits.push({
            fileName: methodFile.fileName,
            start: method.parameters.pos,
            end: method.parameters.pos,
            newText: parameterText,
        });
        for (const thisKeyword of receiverUses(method)) {
            edits.push({
                fileName: methodFile.fileName,
                start: thisKeyword.getStart(methodFile),
                end: thisKeyword.end,
                newText: receiverName,
            });
        }
        for (const call of calls) {
            const file = call.call.getSourceFile();
            const receiverStart = call.receiver.getStart(file);
            edits.push({
                fileName: file.fileName,
                start: receiverStart,
                end: receiverStart,
                newText: `${className}.${methodName}(`,
            });
            edits.push({
                fileName: file.fileName,
                start: call.receiver.end,
                end: call.call.arguments.pos,
                newText: call.call.arguments.length > 0 ? ", " : "",
            });
        }

        if (!naive) {
            const refusal = verifyEdits(workspace, analysis, edits, {
                expectedKeyOverride: (_, candidate) =>
                    candidate.declarations?.includes(method) ? "(unchecked)" : undefined,
            });
            if (refusal) return refusal;
        }
        return successResult(
            workspace,
            edits,
            `. r Make ${className}.${methodName} static`,
            `Behavior-preserving change of an instance method to a static method, updating ${calls.length} call${calls.length === 1 ? "" : "s"}.`,
            cursorTrailer(workspace, "make-method-static", fileName, offset),
        );
    } catch (error) {
        if (error instanceof Refusal) return refusalResult(workspace, error);
        throw error;
    }
}

function checkDeclaration(
    analysis: Parameters<typeof findReferences>[0],
    workspace: Workspace,
    method: ts.MethodDeclaration,
    classDeclaration: ts.ClassDeclaration,
    methodName: string,
) {
    if (ts.getDecorators(method)?.length)
        throw new Refusal("not-an-instance-method", "The method has decorators.", method);
    if (ts.getCombinedModifierFlags(method) & (ts.ModifierFlags.Abstract | ts.ModifierFlags.Override)) {
        throw new Refusal("dynamic-dispatch", "The method is abstract or overrides another.", method.name);
    }
    if ((analysis.checker.getSymbolAtLocation(method.name)?.declarations?.length ?? 0) > 1) {
        throw new Refusal(
            "not-an-instance-method",
            "The method has overload signatures, which are not supported yet.",
            method.name,
        );
    }
    if (classDeclaration.typeParameters?.length) {
        throw new Refusal(
            "generic-class",
            "A static method can't use the class's type parameters.",
            classDeclaration.name,
        );
    }
    const related = findRelatedMemberNamed(
        analysis,
        workspace,
        classDeclaration,
        methodName,
        (candidate, classType) => {
            return (
                isSubtypeByHeritage(analysis.checker, classType, candidate) ||
                isSubtypeByHeritage(analysis.checker, candidate, classType)
            );
        },
    );
    if (related) {
        throw new Refusal(
            "dynamic-dispatch",
            `A related class or interface also has a member named \`${methodName}\`, so calls may dispatch to another implementation.`,
            related,
        );
    }
    const structural = findTypeMemberNamed(analysis, workspace, methodName);
    if (structural) {
        throw new Refusal(
            "dynamic-dispatch",
            `An interface or object type declares \`${methodName}\`; an instance assigned to it could stop providing the method without a compile error.`,
            structural,
        );
    }
    const dynamic = findDynamicMemberAccess(analysis.program, workspace, analysis.checker, [methodName]);
    if (dynamic) {
        throw new Refusal(
            "dynamic-access-possible",
            `\`${methodName}\` is accessed on a value of type \`any\` or \`unknown\`, which may be this method.`,
        );
    }
    const prototypeUse = findPrototypeAccess(analysis, workspace, classDeclaration);
    if (prototypeUse) {
        throw new Refusal(
            "dynamic-access-possible",
            "The class's `prototype` is used, which may reach the method.",
            prototypeUse,
        );
    }
    forEachDescendant(method, (node) => {
        if (node.kind === ts.SyntaxKind.SuperKeyword) {
            throw new Refusal(
                "super-in-body",
                "The method uses `super`, which a static method can't use for the instance.",
                node,
            );
        }
        if (node.kind === ts.SyntaxKind.ThisType) {
            throw new Refusal("this-type", "The method uses `this` as a type, which a static method can't.", node);
        }
    });
    for (const use of argumentsUses(method)) {
        throw new Refusal(
            "arguments-in-body",
            "The method uses `arguments`, which would include the new receiver parameter.",
            use,
        );
    }
}

/** `this` in the method's own scope: not inside nested functions or classes that bind their own. */
function receiverUses(method: ts.MethodDeclaration): ts.Node[] {
    const uses: ts.Node[] = [];
    const visit = (node: ts.Node) => {
        if (node.kind === ts.SyntaxKind.ThisKeyword) uses.push(node);
        if (bindsOwnArgumentsAndSuper(node) || ts.isClassLike(node)) return;
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(method.body!, visit);
    for (const parameter of method.parameters) ts.forEachChild(parameter, visit);
    return uses;
}

function argumentsUses(method: ts.MethodDeclaration): ts.Node[] {
    const uses: ts.Node[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === "arguments") uses.push(node);
        if (bindsOwnArgumentsAndSuper(node)) return;
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(method.body!, visit);
    return uses;
}

interface MethodCall {
    call: ts.CallExpression;
    receiver: ts.Expression;
}

function callThrough(reference: ts.Node, naive: boolean): MethodCall {
    const access = reference.parent;
    const call = access?.parent;
    const isPlainCall =
        ts.isPropertyAccessExpression(access) &&
        access.name === reference &&
        ts.isCallExpression(call) &&
        call.expression === access &&
        !access.questionDotToken &&
        !call.questionDotToken &&
        !call.typeArguments;
    if (!isPlainCall) {
        throw new Refusal(
            "method-used-as-value",
            "The method is referenced other than by a plain call `receiver.method(...)`, such as a method reference or an optional call.",
            reference,
        );
    }
    if (!naive && access.expression.kind === ts.SyntaxKind.SuperKeyword) {
        throw new Refusal("dynamic-dispatch", "The method is called through `super`.", access);
    }
    return { call: call as ts.CallExpression, receiver: access.expression };
}

/** Before `async`, `*`, or the name, after any accessibility modifier. */
function staticInsertionPoint(method: ts.MethodDeclaration): number {
    const sourceFile = method.getSourceFile();
    const asyncModifier = method.modifiers?.find((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
    if (asyncModifier) return asyncModifier.getStart(sourceFile);
    if (method.asteriskToken) return method.asteriskToken.getStart(sourceFile);
    return method.name.getStart(sourceFile);
}

function findTypeMemberNamed(
    analysis: Parameters<typeof findReferences>[0],
    workspace: Workspace,
    name: string,
): ts.Node | undefined {
    for (const fileName of workspace.files.keys()) {
        const sourceFile = analysis.program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: ts.Node | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found || !(ts.isPropertySignature(node) || ts.isMethodSignature(node))) return;
            if (memberNameText(node.name) === name) found = node;
        });
        if (found) return found;
    }
    return undefined;
}

function findPrototypeAccess(
    analysis: Parameters<typeof findReferences>[0],
    workspace: Workspace,
    classDeclaration: ts.ClassDeclaration,
): ts.Node | undefined {
    const classSymbol = analysis.checker.getSymbolAtLocation(classDeclaration.name!);
    for (const fileName of workspace.files.keys()) {
        const sourceFile = analysis.program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: ts.Node | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found || !ts.isPropertyAccessExpression(node) || node.name.text !== "prototype") return;
            let target = analysis.checker.getSymbolAtLocation(node.expression);
            if (target && target.flags & ts.SymbolFlags.Alias) target = analysis.checker.getAliasedSymbol(target);
            if (target === classSymbol) found = node;
        });
        if (found) return found;
    }
    return undefined;
}
