import ts from "typescript";
import { offsetOf, type TextEdit } from "./edits.js";
import {
    analyze,
    type Analysis,
    cursorTrailer,
    findReferences,
    findRelatedMemberNamed,
    memberNameText,
    nameResolvesTo,
    Refusal,
    refusalResult,
    successResult,
    symbolAtCursor,
    verifyEdits,
} from "./methodSupport.js";
import type { Position, Result } from "./protocol.js";
import type { RefactoringOptions } from "./makeMethodStatic.js";
import { bindsOwnArgumentsAndSuper, enclosingRuntimeFunction, isSubtypeByHeritage } from "./semantics.js";
import { forEachDescendant } from "./syntax.js";
import type { Workspace } from "./workspace.js";

export interface MoveStaticMemberRequest {
    file: string;
    position: Position;
    /** `path/to/file.ts#ClassName`, relative to the workspace root. */
    target: string;
}

type MovableMember = ts.MethodDeclaration | ts.PropertyDeclaration;

export function moveStaticMember(
    workspace: Workspace,
    request: MoveStaticMemberRequest,
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
        const { symbol, identifier } = symbolAtCursor(analysis, workspace, fileName, offset);
        const member = symbol.valueDeclaration;
        if (!member || !isMovableMember(member)) {
            throw new Refusal(
                "not-movable",
                `\`${identifier.text}\` is not a static method or field of a class; only those can move for now.`,
                identifier,
                "To move an instance method, make it static first (make-method-static).",
            );
        }
        const source = member.parent as ts.ClassDeclaration;
        const memberName = memberNameText(member.name);
        if (memberName === undefined || ts.isPrivateIdentifier(member.name)) {
            throw new Refusal("not-movable", "A member with a computed or private (#) name can't move.", member.name);
        }
        const target = findTarget(analysis, workspace, request.target);
        if (target === source)
            throw new Refusal("target-not-found", "The target is the member's own class.", target.name);
        const targetSymbol = analysis.checker.getSymbolAtLocation(target.name!)!;
        const targetName = target.name!.text;

        if (!naive) checkMember(analysis, workspace, member, source, target, memberName);
        const references = findReferences(analysis, workspace, member);
        const edits: TextEdit[] = [];
        const rewrittenQualifiers: ts.Identifier[] = [];
        for (const reference of references) {
            const qualifier = qualifierOf(analysis, reference, source, ts.isPropertyDeclaration(member), naive);
            if (!naive) {
                if (!enclosingRuntimeFunction(reference)) {
                    throw new Refusal(
                        "initialization-order",
                        "This reference runs while modules or classes are being defined, when the target class may not be defined yet.",
                        reference,
                    );
                }
                if (!nameResolvesTo(analysis.checker, reference, targetName, targetSymbol)) {
                    throw new Refusal(
                        "target-not-in-scope",
                        `\`${targetName}\` does not name the target class here.`,
                        reference,
                        `Import ${targetName} in this file first.`,
                    );
                }
            }
            const file = reference.getSourceFile();
            edits.push({
                fileName: file.fileName,
                start: qualifier.getStart(file),
                end: qualifier.end,
                newText: targetName,
            });
            rewrittenQualifiers.push(qualifier);
        }
        if (!naive) checkImportsStay(analysis, rewrittenQualifiers);

        const sourceFile = member.getSourceFile();
        const targetFile = target.getSourceFile();
        const moved = movedRange(sourceFile, member);
        const insertion = insertionInto(targetFile, target);
        const memberText = reindent(sourceFile, moved.textStart, member.end, moved.indentation, insertion.indentation);
        edits.push({ fileName: sourceFile.fileName, start: moved.deleteStart, end: moved.deleteEnd, newText: "" });
        edits.push({
            fileName: targetFile.fileName,
            start: insertion.position,
            end: insertion.position,
            newText: insertion.prefix + memberText + insertion.suffix,
        });

        if (!naive) {
            const qualifierPositions = new Set(
                rewrittenQualifiers.map((qualifier) => `${qualifier.getSourceFile().fileName}#${qualifier.getStart()}`),
            );
            const refusal = verifyEdits(workspace, analysis, edits, {
                expectedKeyOverride: (occurrence, candidate) => {
                    if (qualifierPositions.has(`${occurrence.fileName}#${occurrence.position}`)) return "(unchecked)";
                    if (candidate.declarations?.includes(member)) return "(unchecked)";
                    return undefined;
                },
                movedText: {
                    fileName: sourceFile.fileName,
                    oldStart: moved.deleteStart,
                    oldEnd: moved.deleteEnd,
                    insertedInto: targetFile.fileName,
                    insertedAt: insertion.position,
                },
            });
            if (refusal) return refusal;
        }
        const sourceName = source.name!.text;
        return successResult(
            workspace,
            edits,
            `. r Move ${sourceName}.${memberName} to ${targetName}`,
            `Behavior-preserving move of a static member, updating ${references.length} reference${references.length === 1 ? "" : "s"}.`,
            `${cursorTrailer(workspace, "move-static-member", fileName, offset)} -> ${request.target}`,
        );
    } catch (error) {
        if (error instanceof Refusal) return refusalResult(workspace, error);
        throw error;
    }
}

function isMovableMember(node: ts.Node): node is MovableMember {
    if (!(ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node))) return false;
    if (!ts.isClassDeclaration(node.parent) || !node.parent.name) return false;
    return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static) !== 0;
}

function findTarget(analysis: Analysis, workspace: Workspace, target: string): ts.ClassDeclaration {
    const [path, className] = target.split("#");
    if (!className) {
        throw new Refusal(
            "option-not-supported",
            "Moving to a module is not supported yet; name a class as `file.ts#ClassName`.",
        );
    }
    const targetFile = analysis.program.getSourceFile(workspace.absolutePath(path));
    if (!targetFile || !workspace.files.has(targetFile.fileName)) {
        throw new Refusal("target-not-found", `The target file ${path} is not in the workspace.`);
    }
    const found = targetFile.statements.find(
        (statement): statement is ts.ClassDeclaration =>
            ts.isClassDeclaration(statement) && statement.name?.text === className,
    );
    if (!found) throw new Refusal("target-not-found", `${path} declares no top-level class ${className}.`);
    return found;
}

function checkMember(
    analysis: Analysis,
    workspace: Workspace,
    member: MovableMember,
    source: ts.ClassDeclaration,
    target: ts.ClassDeclaration,
    memberName: string,
) {
    if (ts.getDecorators(member)?.length) throw new Refusal("not-movable", "The member has decorators.", member);
    if (
        ts.getCombinedModifierFlags(member) &
        (ts.ModifierFlags.Abstract | ts.ModifierFlags.Override | ts.ModifierFlags.Ambient)
    ) {
        throw new Refusal("not-movable", "The member is abstract, an override, or declared only.", member.name);
    }
    if (ts.isMethodDeclaration(member)) {
        if (!member.body) throw new Refusal("not-movable", "The method has no body.", member.name);
        if ((analysis.checker.getSymbolAtLocation(member.name)?.declarations?.length ?? 0) > 1) {
            throw new Refusal(
                "not-movable",
                "The method has overload signatures, which are not supported yet.",
                member.name,
            );
        }
    }
    if (ts.isPropertyDeclaration(member) && member.initializer && !isConstantLiteral(member.initializer)) {
        throw new Refusal(
            "initializer-has-effects",
            "The field's initializer is not a literal, so running it when the target class is defined could change behavior.",
            member.initializer,
        );
    }
    const visit = (node: ts.Node) => {
        if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword) {
            throw new Refusal(
                "this-in-static-member",
                "The member uses `this` or `super`, which is the class it was called through and could be a subclass.",
                node,
            );
        }
        if (bindsOwnArgumentsAndSuper(node) || ts.isClassLike(node)) return;
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(member, visit);
    if (target.typeParameters?.length || source.typeParameters?.length) {
        throw new Refusal(
            "generic-class",
            "Moving members into or out of generic classes is not supported.",
            target.name,
        );
    }
    const existing = target.members.find(
        (candidate) => candidate.name && memberNameText(candidate.name) === memberName,
    );
    if (existing) {
        throw new Refusal(
            "conflicting-declaration",
            `${target.name!.text} already has a member named \`${memberName}\`.`,
            existing,
            "Rename one of them first.",
        );
    }
    const related = findRelatedMemberNamed(analysis, workspace, target, memberName, (candidate, targetType) => {
        return (
            isSubtypeByHeritage(analysis.checker, targetType, candidate) ||
            isSubtypeByHeritage(analysis.checker, candidate, targetType)
        );
    });
    if (related) {
        throw new Refusal(
            "conflicting-declaration",
            `A base or derived class of the target has a member named \`${memberName}\`, which the moved member would hide or be hidden by.`,
            related,
        );
    }
    const targetStatics = target.members.some(
        (candidate) =>
            ts.isClassStaticBlockDeclaration(candidate) ||
            (ts.isPropertyDeclaration(candidate) &&
                ts.getCombinedModifierFlags(candidate) & ts.ModifierFlags.Static &&
                candidate.initializer &&
                !isConstantLiteral(candidate.initializer)),
    );
    if (targetStatics) {
        throw new Refusal(
            "initializer-has-effects",
            "The target class has static initialization that isn't a literal; the moved member's position among it could matter.",
            target.name,
        );
    }
}

function isConstantLiteral(expression: ts.Expression): boolean {
    if (ts.isParenthesizedExpression(expression)) return isConstantLiteral(expression.expression);
    if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
        return ts.isNumericLiteral(expression.operand);
    }
    return (
        ts.isNumericLiteral(expression) ||
        ts.isStringLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression) ||
        ts.isBigIntLiteral(expression) ||
        expression.kind === ts.SyntaxKind.TrueKeyword ||
        expression.kind === ts.SyntaxKind.FalseKeyword ||
        expression.kind === ts.SyntaxKind.NullKeyword
    );
}

/** The `Source` in `Source.member`; it must name the class itself, or for methods a subclass. */
function qualifierOf(
    analysis: Analysis,
    reference: ts.Node,
    source: ts.ClassDeclaration,
    isField: boolean,
    naive: boolean,
): ts.Identifier {
    const access = reference.parent;
    if (!ts.isPropertyAccessExpression(access) || access.name !== reference || !ts.isIdentifier(access.expression)) {
        throw new Refusal(
            "reference-not-through-class",
            "The member is referenced other than as `ClassName.member`, such as through a variable or by destructuring.",
            reference,
        );
    }
    const qualifier = access.expression;
    if (naive) return qualifier;
    let symbol = analysis.checker.getSymbolAtLocation(qualifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = analysis.checker.getAliasedSymbol(symbol);
    const declaration = symbol?.valueDeclaration;
    if (!declaration || !ts.isClassDeclaration(declaration)) {
        throw new Refusal(
            "reference-not-through-class",
            "The member is referenced through a value of constructor type, which may be a subclass.",
            qualifier,
        );
    }
    if (declaration !== source) {
        const isSubclass = isSubtypeByHeritage(
            analysis.checker,
            analysis.checker.getTypeAtLocation(declaration),
            analysis.checker.getTypeAtLocation(source),
        );
        if (!isSubclass || isField) {
            throw new Refusal(
                "reference-not-through-class",
                "The field is referenced through a subclass, where an assignment would create the subclass's own property.",
                qualifier,
            );
        }
    }
    return qualifier;
}

/** An import whose only remaining value use is rewritten would be elided, and its module would stop running. */
function checkImportsStay(analysis: Analysis, rewritten: readonly ts.Identifier[]) {
    const rewrittenSet = new Set(rewritten);
    for (const qualifier of rewritten) {
        const alias = analysis.checker.getSymbolAtLocation(qualifier);
        if (!alias || !(alias.flags & ts.SymbolFlags.Alias)) continue;
        const importDeclaration = alias.declarations?.[0] && findAncestorImport(alias.declarations[0]);
        if (!importDeclaration) continue;
        const sourceFile = qualifier.getSourceFile();
        const bindings = new Set<ts.Symbol>();
        forEachDescendant(importDeclaration, (node) => {
            if (ts.isIdentifier(node)) {
                const bound = analysis.checker.getSymbolAtLocation(node);
                if (bound && bound.flags & ts.SymbolFlags.Alias) bindings.add(bound);
            }
        });
        let stillUsed = false;
        forEachDescendant(sourceFile, (node) => {
            if (stillUsed || !ts.isIdentifier(node) || rewrittenSet.has(node) || findAncestorImport(node)) return;
            if (ts.isPartOfTypeNode(node)) return;
            const bound = analysis.checker.getSymbolAtLocation(node);
            if (bound && bindings.has(bound)) stillUsed = true;
        });
        if (!stillUsed) {
            throw new Refusal(
                "import-would-be-removed",
                "After the move, this file would no longer use its import of the source module, so the compiler would drop the import and the module would stop running here.",
                importDeclaration,
            );
        }
    }
}

function findAncestorImport(node: ts.Node): ts.ImportDeclaration | undefined {
    for (let current: ts.Node | undefined = node; current; current = current.parent) {
        if (ts.isImportDeclaration(current)) return current;
    }
    return undefined;
}

function lineStart(text: string, position: number): number {
    return text.lastIndexOf("\n", position - 1) + 1;
}

/** The member with its leading comments, and its whole lines when it has them to itself. */
function movedRange(sourceFile: ts.SourceFile, member: ts.Node) {
    const text = sourceFile.text;
    const comments = ts.getLeadingCommentRanges(text, member.getFullStart()) ?? [];
    let textStart = member.getStart(sourceFile);
    const firstComment = comments.find(
        (comment) => text.slice(lineStart(text, comment.pos), comment.pos).trim() === "",
    );
    if (firstComment) textStart = firstComment.pos;
    const start = lineStart(text, textStart);
    const indentation = text.slice(start, textStart);
    let deleteStart = textStart;
    let deleteEnd = member.end;
    const restOfLine = text.slice(
        member.end,
        text.indexOf("\n", member.end) === -1 ? text.length : text.indexOf("\n", member.end),
    );
    if (indentation.trim() === "" && restOfLine.trim() === "") {
        deleteStart = start;
        const newline = text.indexOf("\n", member.end);
        deleteEnd = newline === -1 ? text.length : newline + 1;
        const nextNewline = text.indexOf("\n", deleteEnd);
        const nextLineIsBlank = nextNewline !== -1 && text.slice(deleteEnd, nextNewline).trim() === "";
        const previousLine = text.slice(lineStart(text, Math.max(0, start - 1)), Math.max(0, start - 1)).trim();
        if (nextLineIsBlank && (previousLine === "" || previousLine.endsWith("{"))) deleteEnd = nextNewline + 1;
    }
    return { textStart, deleteStart, deleteEnd, indentation };
}

function insertionInto(targetFile: ts.SourceFile, target: ts.ClassDeclaration) {
    const text = targetFile.text;
    const classIndentation = text.slice(lineStart(text, target.getStart(targetFile)), target.getStart(targetFile));
    if (target.members.length > 0) {
        const first = target.members[0];
        const firstStart = first.getStart(targetFile);
        const comments = ts.getLeadingCommentRanges(text, first.getFullStart()) ?? [];
        const anchor = comments.length > 0 ? comments[0].pos : firstStart;
        const position = lineStart(text, anchor);
        return {
            position,
            indentation: text.slice(position, anchor),
            prefix: text.slice(position, anchor),
            suffix: "\n\n",
        };
    }
    const indentation = classIndentation + "    ";
    const openBrace = text.indexOf("{", target.name!.end);
    return { position: openBrace + 1, indentation, prefix: "\n" + indentation, suffix: "\n" + classIndentation };
}

/** Changes the indentation of the text's lines after the first, except lines inside string or template literals. */
function reindent(sourceFile: ts.SourceFile, start: number, end: number, from: string, to: string): string {
    const text = sourceFile.text.slice(start, end);
    if (from === to) return text;
    const literalRanges: [number, number][] = [];
    forEachDescendant(sourceFile, (node) => {
        if (node.end <= start || node.getStart(sourceFile) >= end) return;
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) {
            literalRanges.push([node.getStart(sourceFile) - start, node.end - start]);
        }
    });
    let result = "";
    let lineBegin = 0;
    for (const line of text.split("\n")) {
        const isInsideLiteral = literalRanges.some(([from, to]) => lineBegin > from && lineBegin < to);
        if (lineBegin > 0 && !isInsideLiteral && line.startsWith(from)) result += "\n" + to + line.slice(from.length);
        else if (lineBegin > 0) result += "\n" + line;
        else result += line;
        lineBegin += line.length + 1;
    }
    return result;
}
