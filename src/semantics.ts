import ts from "typescript";
import type { Workspace } from "./workspace.js";
import { forEachDescendant } from "./syntax.js";

export interface NamedSite {
    name: string;
    site: { fileName: string; start: number; end: number };
}

export function skipParenthesesUpward(node: ts.Node): ts.Node {
    while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
    return node;
}

/**
 * Member names that the JavaScript runtime or common protocols look up by spelling,
 * so renaming a member to or from one changes behavior without changing any binding.
 */
export const runtimeProtocolNames = new Set([
    "constructor",
    "prototype",
    "__proto__",
    "toString",
    "toLocaleString",
    "valueOf",
    "toJSON",
    "then",
    "catch",
    "finally",
    "next",
    "return",
    "throw",
    "done",
    "value",
    "length",
    "name",
    "message",
    "stack",
    "cause",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "call",
    "apply",
    "bind",
    "get",
    "set",
    "has",
    "size",
    "handleEvent",
]);

/** A property access by name on a value whose type doesn't resolve it, such as `any`. */
export function findDynamicMemberAccess(
    program: ts.Program,
    workspace: Workspace,
    checker: ts.TypeChecker,
    names: readonly string[],
): NamedSite | undefined {
    for (const fileName of workspace.files.keys()) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: NamedSite | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found) return;
            let nameNode: ts.Node | undefined;
            let name: string | undefined;
            if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
                nameNode = node.name;
                name = node.name.text;
            } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
                nameNode = node.argumentExpression;
                name = node.argumentExpression.text;
            } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
                const key = node.propertyName ?? node.name;
                if (ts.isIdentifier(key) || ts.isStringLiteral(key)) {
                    nameNode = key;
                    name = key.text;
                }
            }
            if (!nameNode || name === undefined || !names.includes(name)) return;
            if (ts.isBindingElement(node)) {
                const patternType = checker.getTypeAtLocation(node.parent);
                if (isUntypedObject(patternType)) found = { name, site: siteOf(sourceFile, nameNode) };
                return;
            }
            const receiver = (node as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression;
            if (isUntypedObject(checker.getTypeAtLocation(receiver)))
                found = { name, site: siteOf(sourceFile, nameNode) };
        });
        if (found) return found;
    }
    return undefined;
}

export function isUntypedObject(type: ts.Type): boolean {
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

export function siteOf(sourceFile: ts.SourceFile, node: ts.Node) {
    return { fileName: sourceFile.fileName, start: node.getStart(sourceFile), end: node.end };
}

export function isSubtypeByHeritage(checker: ts.TypeChecker, type: ts.Type, ancestor: ts.Type): boolean {
    const seen = new Set<ts.Type>();
    const visit = (current: ts.Type): boolean => {
        if (seen.has(current)) return false;
        seen.add(current);
        if (current === ancestor || current.symbol === ancestor.symbol) return true;
        const target = (current as ts.TypeReference).target ?? current;
        if (
            !(target.flags & ts.TypeFlags.Object) ||
            !((target as ts.ObjectType).objectFlags & ts.ObjectFlags.ClassOrInterface)
        )
            return false;
        const bases = checker.getBaseTypes(target as ts.InterfaceType);
        const implemented = implementedTypes(checker, target);
        return [...bases, ...implemented].some(visit);
    };
    return visit(type);
}

export function implementedTypes(checker: ts.TypeChecker, type: ts.Type): ts.Type[] {
    const result: ts.Type[] = [];
    for (const declaration of type.symbol?.declarations ?? []) {
        if (!ts.isClassLike(declaration)) continue;
        for (const clause of declaration.heritageClauses ?? []) {
            if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
            for (const implemented of clause.types) result.push(checker.getTypeAtLocation(implemented));
        }
    }
    return result;
}

const runtimeFunctionKinds = new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.Constructor,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
    ts.SyntaxKind.ClassStaticBlockDeclaration,
]);

export function isRuntimeFunction(node: ts.Node): boolean {
    return runtimeFunctionKinds.has(node.kind);
}

/** Functions that bind their own `arguments`, `super`, and `new.target`; arrow functions don't. */
export function bindsOwnArgumentsAndSuper(node: ts.Node): boolean {
    return isRuntimeFunction(node) && node.kind !== ts.SyntaxKind.ArrowFunction;
}

/** Class members other than methods run with their own `this` (field initializers). */
export function isClassFieldInitializerBoundary(node: ts.Node): boolean {
    return ts.isPropertyDeclaration(node) && ts.isClassLike(node.parent);
}

export function enclosingRuntimeFunction(node: ts.Node): ts.Node | undefined {
    for (let current = node.parent; current; current = current.parent) {
        if (isRuntimeFunction(current)) return current;
    }
    return undefined;
}

/** True when the expression is a target that gets assigned, not a value that is read. */
export function isAssignmentTarget(node: ts.Node): boolean {
    const outer = skipParenthesesUpward(node);
    const parent = outer.parent;
    if (ts.isBinaryExpression(parent) && parent.left === outer && isAssignmentOperator(parent.operatorToken.kind))
        return true;
    if (
        (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
        isIncrementOrDecrement(parent.operator)
    ) {
        return true;
    }
    if ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === outer) return true;
    if (ts.isShorthandPropertyAssignment(parent) || ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)) {
        return isDestructuringTarget(parent.parent);
    }
    if (ts.isPropertyAssignment(parent) && parent.initializer === outer) return isDestructuringTarget(parent.parent);
    if (ts.isArrayLiteralExpression(parent)) return isDestructuringTarget(parent);
    return false;
}

export function isDestructuringTarget(literal: ts.Node): boolean {
    if (!ts.isObjectLiteralExpression(literal) && !ts.isArrayLiteralExpression(literal)) return false;
    return isAssignmentTarget(literal);
}

export function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

export function isIncrementOrDecrement(operator: ts.SyntaxKind): boolean {
    return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

export function findDirectEval(program: ts.Program, workspace: Workspace, fileNames: ReadonlySet<string>) {
    for (const fileName of fileNames) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile || !workspace.files.has(fileName)) continue;
        let found: ReturnType<typeof siteOf> | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (
                !found &&
                ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === "eval"
            ) {
                found = siteOf(sourceFile, node);
            }
        });
        if (found) return found;
    }
    return undefined;
}
