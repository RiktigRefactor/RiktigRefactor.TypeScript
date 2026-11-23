import ts from "typescript";
import type { EditMap } from "./edits.js";
import type { Workspace } from "./workspace.js";

/** An identifier in the original program and the symbols it binds to. */
export interface BoundOccurrence {
    fileName: string;
    position: number;
    name: string;
    symbols: ts.Symbol[];
}

/** Returns the symbols an identifier binds to, including the second symbol of names that bind two (such as `{ x }`). */
export function symbolsBoundBy(checker: ts.TypeChecker, identifier: ts.Identifier | ts.PrivateIdentifier): ts.Symbol[] {
    const symbols: ts.Symbol[] = [];
    const add = (symbol: ts.Symbol | undefined) => {
        if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
    };
    add(checker.getSymbolAtLocation(identifier));
    const parent = identifier.parent;
    if (ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
        add(checker.getShorthandAssignmentValueSymbol(parent));
    }
    if (ts.isExportSpecifier(parent) && parent.propertyName === undefined) {
        add(checker.getExportSpecifierLocalTargetSymbol(parent));
    }
    if (ts.isImportSpecifier(parent) && parent.propertyName === undefined) {
        const alias = checker.getSymbolAtLocation(identifier);
        if (alias) add(checker.getImmediateAliasedSymbol(alias));
    }
    if (
        ts.isBindingElement(parent) &&
        parent.name === identifier &&
        parent.propertyName === undefined &&
        ts.isObjectBindingPattern(parent.parent)
    ) {
        add(checker.getTypeAtLocation(parent.parent).getProperty(identifier.text));
    }
    return symbols;
}

export function collectBoundOccurrences(program: ts.Program, workspace: Workspace): BoundOccurrence[] {
    const checker = program.getTypeChecker();
    const occurrences: BoundOccurrence[] = [];
    for (const fileName of workspace.files.keys()) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) continue;
        const visit = (node: ts.Node) => {
            if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
                occurrences.push({
                    fileName,
                    position: node.getStart(sourceFile),
                    name: node.text,
                    symbols: symbolsBoundBy(checker, node),
                });
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    return occurrences;
}

export type DeclarationPositionMapper = (fileName: string, position: number) => number;

const valueMeaning = 1;
const typeMeaning = 2;
const namespaceMeaning = 4;
const everyMeaning = valueMeaning | typeMeaning | namespaceMeaning;

/** Which of the value, type, and namespace meanings a declaration contributes to its symbol. */
function meaningOf(declaration: ts.Declaration): number {
    if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) return typeMeaning;
    if (ts.isTypeParameterDeclaration(declaration)) return typeMeaning;
    if (ts.isClassLike(declaration) || ts.isEnumDeclaration(declaration)) return valueMeaning | typeMeaning;
    if (ts.isModuleDeclaration(declaration)) return valueMeaning | namespaceMeaning;
    if (
        ts.isVariableDeclaration(declaration) ||
        ts.isParameter(declaration) ||
        ts.isBindingElement(declaration) ||
        ts.isFunctionLike(declaration) ||
        ts.isPropertyDeclaration(declaration) ||
        ts.isPropertySignature(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isShorthandPropertyAssignment(declaration) ||
        ts.isEnumMember(declaration)
    ) {
        return valueMeaning;
    }
    return everyMeaning;
}

/** Identifies a symbol by its declarations, so symbols from two programs can be compared. */
export function symbolKey(symbol: ts.Symbol, mapDeclarationPosition: DeclarationPositionMapper): string {
    const declarations = symbol.declarations ?? [];
    if (declarations.length === 0) return `@${symbol.escapedName as string}`;
    return declarations
        .map((declaration) => {
            const fileName = declaration.getSourceFile().fileName;
            return `${fileName}#${mapDeclarationPosition(fileName, declaration.getStart())}#${meaningOf(declaration)}`;
        })
        .sort()
        .join("|");
}

/**
 * True when the actual symbol is the expected one, or the expected one merged with declarations
 * of other meanings only (a type alias that now shares its name with a const), which can't change what a reference means.
 */
export function isSameBinding(expectedKey: string, actualKey: string): boolean {
    if (expectedKey === actualKey) return true;
    if (expectedKey.startsWith("@") || actualKey.startsWith("@") || expectedKey === "(unbound)") return false;
    const expected = expectedKey.split("|");
    const actual = actualKey.split("|");
    if (!expected.every((declaration) => actual.includes(declaration))) return false;
    const meaningsOf = (declarations: string[]) =>
        declarations.reduce((meanings, declaration) => meanings | Number(declaration.split("#").at(-1)), 0);
    const extraDeclarations = actual.filter((declaration) => !expected.includes(declaration));
    return (meaningsOf(expected) & meaningsOf(extraDeclarations)) === 0;
}

export interface BindingChange {
    fileName: string;
    oldPosition: number;
    name: string;
    expected: string;
    actual: string[];
}

/**
 * Overrides the symbol key an original occurrence is expected to bind to after the change.
 * Returns undefined to expect the symbol's own declarations, mapped to the new positions.
 */
export type ExpectedKeyOverride = (occurrence: BoundOccurrence, symbol: ts.Symbol) => string | undefined;

/** Re-binding check: every original occurrence must still bind to the same symbols. */
export function findBindingChanges(
    oldOccurrences: readonly BoundOccurrence[],
    newProgram: ts.Program,
    workspace: Workspace,
    editMap: EditMap,
    expectedKeyOverride: ExpectedKeyOverride = () => undefined,
): BindingChange[] {
    const newKeysByOldOccurrence = new Map<string, string[]>();
    for (const occurrence of collectBoundOccurrences(newProgram, workspace)) {
        const origin = editMap.newToOld(occurrence.fileName, occurrence.position);
        const id = `${occurrence.fileName}#${origin.oldPosition}`;
        const keys = newKeysByOldOccurrence.get(id) ?? [];
        for (const symbol of occurrence.symbols) keys.push(symbolKey(symbol, (_, position) => position));
        if (occurrence.symbols.length === 0) keys.push("(unbound)");
        newKeysByOldOccurrence.set(id, keys);
    }
    const mapOld: DeclarationPositionMapper = (fileName, position) => editMap.oldToNew(fileName, position);
    const changes: BindingChange[] = [];
    for (const occurrence of oldOccurrences) {
        const actual = newKeysByOldOccurrence.get(`${occurrence.fileName}#${occurrence.position}`) ?? [];
        const expectedKeys = occurrence.symbols.map(
            (symbol) => expectedKeyOverride(occurrence, symbol) ?? symbolKey(symbol, mapOld),
        );
        if (occurrence.symbols.length === 0) expectedKeys.push("(unbound)");
        for (const expected of expectedKeys) {
            if (!actual.some((actualKey) => isSameBinding(expected, actualKey))) {
                changes.push({
                    fileName: occurrence.fileName,
                    oldPosition: occurrence.position,
                    name: occurrence.name,
                    expected,
                    actual,
                });
                break;
            }
        }
    }
    return changes;
}

export function allDiagnostics(program: ts.Program): readonly ts.Diagnostic[] {
    return ts.getPreEmitDiagnostics(program);
}

/** Diagnostics of the changed program that the original program (positions mapped through the edits) did not have. */
export function findNewDiagnostics(oldProgram: ts.Program, newProgram: ts.Program, editMap: EditMap): ts.Diagnostic[] {
    const keyOf = (diagnostic: ts.Diagnostic, mapPosition: DeclarationPositionMapper) => {
        if (!diagnostic.file || diagnostic.start === undefined) {
            return `#${diagnostic.code}#${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
        }
        return `${diagnostic.file.fileName}#${mapPosition(diagnostic.file.fileName, diagnostic.start)}#${diagnostic.code}`;
    };
    const oldKeys = new Set(allDiagnostics(oldProgram).map((d) => keyOf(d, (f, p) => editMap.oldToNew(f, p))));
    return allDiagnostics(newProgram).filter((d) => !oldKeys.has(keyOf(d, (_, p) => p)));
}

export function describeDiagnostic(diagnostic: ts.Diagnostic): string {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${line + 1}:${character + 1}: TS${diagnostic.code}: ${message}`;
}
