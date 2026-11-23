import ts from "typescript";
import { EditMap, locationOf, type TextEdit, toProtocolEdits } from "./edits.js";
import type { RefusalCode, Result } from "./protocol.js";
import { bugReportSuggestion, refuse } from "./results.js";
import { forEachDescendant, identifierAt } from "./syntax.js";
import {
    collectBoundOccurrences,
    describeDiagnostic,
    type ExpectedKeyOverride,
    findBindingChanges,
    findNewDiagnostics,
    symbolKey,
    symbolsBoundBy,
} from "./verification.js";
import type { Workspace } from "./workspace.js";

/** Thrown while analyzing a refactoring when it must refuse. */
export class Refusal {
    constructor(
        readonly code: RefusalCode,
        readonly message: string,
        readonly node?: ts.Node,
        readonly suggestion?: string,
    ) {}
}

export function refusalResult(workspace: Workspace, refusal: Refusal): Result {
    let site: { fileName: string; start: number; end: number } | undefined;
    if (refusal.node) {
        const sourceFile = refusal.node.getSourceFile();
        site = { fileName: sourceFile.fileName, start: refusal.node.getStart(sourceFile), end: refusal.node.end };
    }
    return refuse(workspace, refusal.code, refusal.message, site, refusal.suggestion);
}

export interface Analysis {
    service: ts.LanguageService;
    program: ts.Program;
    checker: ts.TypeChecker;
}

export function analyze(workspace: Workspace): Analysis {
    const service = workspace.createLanguageService();
    const program = service.getProgram()!;
    return { service, program, checker: program.getTypeChecker() };
}

/** The symbol named at the cursor, with the identifier the cursor is on. */
export function symbolAtCursor(analysis: Analysis, workspace: Workspace, fileName: string, offset: number) {
    const sourceFile = analysis.program.getSourceFile(fileName);
    if (!sourceFile || !workspace.files.has(fileName))
        throw new Error(`The file ${fileName} is not part of the workspace.`);
    const identifier = identifierAt(sourceFile, offset);
    if (!identifier) throw new Refusal("no-symbol", "There is no identifier at the cursor.");
    let symbol = analysis.checker.getSymbolAtLocation(identifier);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = analysis.checker.getAliasedSymbol(symbol);
    if (!symbol) throw new Refusal("no-symbol", `\`${identifier.text}\` does not resolve to a symbol.`, identifier);
    return { identifier, symbol };
}

/** Every identifier in the workspace, other than declaration names, that refers to the symbol. */
export function findReferences(analysis: Analysis, workspace: Workspace, declaration: ts.NamedDeclaration): ts.Node[] {
    const name = declaration.name!;
    const sourceFile = declaration.getSourceFile();
    const referenced = analysis.service.findReferences(sourceFile.fileName, name.getStart(sourceFile)) ?? [];
    const result: ts.Node[] = [];
    for (const group of referenced) {
        for (const entry of group.references) {
            const file = analysis.program.getSourceFile(entry.fileName)!;
            if (!workspace.files.has(entry.fileName)) {
                throw new Refusal("not-renameable", `The symbol is used in ${entry.fileName}, outside the workspace.`);
            }
            const node = nodeStartingAt(file, entry.textSpan.start, entry.textSpan.length);
            if (!node) continue;
            if ((node.parent as ts.NamedDeclaration).name === node && isDeclarationOf(node.parent)) continue;
            if (!result.includes(node)) result.push(node);
        }
    }
    return result;
}

function isDeclarationOf(node: ts.Node): boolean {
    return (
        ts.isMethodDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isGetAccessor(node) ||
        ts.isSetAccessor(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isPropertySignature(node)
    );
}

function nodeStartingAt(sourceFile: ts.SourceFile, start: number, length: number): ts.Node | undefined {
    let found: ts.Node | undefined;
    forEachDescendant(sourceFile, (node) => {
        if (found) return;
        if (node.getStart(sourceFile) === start && node.end === start + length) found = node;
    });
    return found;
}

/**
 * True when evaluating the expression can't give `null` or `undefined`: `this`, an object creation, a literal,
 * or a `const` initialized with one of those. Type annotations are not proof; they aren't enforced at run time.
 */
export function isProvablyNonNull(checker: ts.TypeChecker, expression: ts.Expression, depth = 0): boolean {
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    if (depth > 5) return false;
    if (expression.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (
        ts.isNewExpression(expression) ||
        ts.isObjectLiteralExpression(expression) ||
        ts.isArrayLiteralExpression(expression)
    ) {
        return true;
    }
    if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression)) return true;
    if (ts.isIdentifier(expression)) {
        const symbol = checker.getSymbolAtLocation(expression);
        const declaration = symbol?.valueDeclaration;
        if (!declaration) return false;
        if (ts.isClassDeclaration(declaration) || ts.isFunctionDeclaration(declaration)) return true;
        if (
            ts.isVariableDeclaration(declaration) &&
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const
        ) {
            return isProvablyNonNull(checker, declaration.initializer, depth + 1);
        }
    }
    return false;
}

/** True when `name`, looked up at the location as a value, means the symbol (directly or through an import). */
export function nameResolvesTo(checker: ts.TypeChecker, location: ts.Node, name: string, symbol: ts.Symbol): boolean {
    const found = checker
        .getSymbolsInScope(location, ts.SymbolFlags.Value | ts.SymbolFlags.Alias)
        .find((candidate) => candidate.name === name);
    if (!found) return false;
    const resolved = found.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found;
    return checker.getExportSymbolOfSymbol(resolved) === checker.getExportSymbolOfSymbol(symbol);
}

export function lowerCamelCase(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Members of a class in its heritage chain (bases, implemented interfaces) or in classes derived from it. */
export function findRelatedMemberNamed(
    analysis: Analysis,
    workspace: Workspace,
    classDeclaration: ts.ClassLikeDeclaration,
    name: string,
    isRelated: (candidate: ts.Type, classType: ts.Type) => boolean,
): ts.Node | undefined {
    const classType = analysis.checker.getTypeAtLocation(classDeclaration);
    for (const fileName of workspace.files.keys()) {
        const sourceFile = analysis.program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: ts.Node | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found || node === classDeclaration) return;
            if (!(ts.isClassLike(node) || ts.isInterfaceDeclaration(node))) return;
            const declaresName = node.members.some(
                (member) => member.name !== undefined && memberNameText(member.name) === name,
            );
            if (declaresName && isRelated(analysis.checker.getTypeAtLocation(node), classType))
                found = node.name ?? node;
        });
        if (found) return found;
    }
    return undefined;
}

export function memberNameText(name: ts.PropertyName | ts.BindingName): string | undefined {
    if (
        ts.isIdentifier(name) ||
        ts.isPrivateIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)
    ) {
        return name.text;
    }
    return undefined;
}

export interface VerificationOptions {
    expectedKeyOverride?: ExpectedKeyOverride;
    /** Identifiers in moved text, checked in order against the identifiers of the text where it lands. */
    movedText?: {
        fileName: string;
        oldStart: number;
        oldEnd: number;
        /** Where the moved copy is inserted, in the original files' offsets. */
        insertedInto: string;
        insertedAt: number;
        skip?: (symbol: ts.Symbol) => boolean;
        /** Names inserted with the moved text that have no counterpart in the original, such as `this`'s replacements. */
        skipNewName?: (name: string) => boolean;
    };
}

/**
 * Applies the edits, type-checks the result, and runs the re-binding check.
 * Returns a refusal, or undefined when the edits are verified.
 */
export function verifyEdits(
    workspace: Workspace,
    analysis: Analysis,
    edits: TextEdit[],
    options: VerificationOptions,
): Result | undefined {
    const editMap = new EditMap(edits);
    const changed = new Map<string, string>();
    for (const fileName of editMap.changedFiles)
        changed.set(fileName, editMap.apply(fileName, workspace.files.get(fileName)!));
    const newWorkspace = workspace.withChangedFiles(changed);
    const newProgram = newWorkspace.createLanguageService().getProgram()!;
    const newDiagnostics = findNewDiagnostics(analysis.program, newProgram, editMap);
    if (newDiagnostics.length > 0) {
        return refuse(
            workspace,
            "would-introduce-errors",
            `The change would not compile: ${newDiagnostics.map(describeDiagnostic).join("; ")}`,
        );
    }
    const moved = options.movedText;
    const isInMovedText = (fileName: string, position: number) =>
        moved !== undefined && fileName === moved.fileName && position >= moved.oldStart && position < moved.oldEnd;
    const override: ExpectedKeyOverride = (occurrence, symbol) => {
        if (isInMovedText(occurrence.fileName, occurrence.position)) return "(unchecked)";
        return options.expectedKeyOverride?.(occurrence, symbol);
    };
    const oldOccurrences = collectBoundOccurrences(analysis.program, workspace);
    const changes = findBindingChanges(oldOccurrences, newProgram, newWorkspace, editMap, override);
    if (changes.length > 0) {
        const change = changes[0];
        return refuse(
            workspace,
            "binding-would-change",
            `After the change, \`${change.name}\` would refer to a different declaration.`,
            { fileName: change.fileName, start: change.oldPosition, end: change.oldPosition + change.name.length },
        );
    }
    if (moved) {
        const problem = checkMovedText(oldOccurrences, newProgram, editMap, moved);
        if (problem) return refuse(workspace, "binding-would-change", problem);
    }
    return undefined;
}

/**
 * The moved text lands as an inserted copy; its identifiers, in order, must bind to what the original's did,
 * apart from those the refactoring rewrites (`skip`). Symbols declared inside the moved text are matched by
 * the position of their declaration among the moved identifiers.
 */
function checkMovedText(
    oldOccurrences: ReturnType<typeof collectBoundOccurrences>,
    newProgram: ts.Program,
    editMap: EditMap,
    moved: NonNullable<VerificationOptions["movedText"]>,
): string | undefined {
    const mapOld = (fileName: string, position: number) => editMap.oldToNew(fileName, position);
    const isInMoved = (fileName: string, position: number) =>
        fileName === moved.fileName && position >= moved.oldStart && position < moved.oldEnd;
    const oldList = oldOccurrences
        .filter((occurrence) => isInMoved(occurrence.fileName, occurrence.position))
        .filter((occurrence) => !occurrence.symbols.some((symbol) => moved.skip?.(symbol)))
        .sort((a, b) => a.position - b.position);
    const oldIndexByPosition = new Map(oldList.map((occurrence, index) => [occurrence.position, index]));
    const oldKey = (symbol: ts.Symbol) => {
        const declarations = symbol.declarations ?? [];
        const inner =
            declarations.length > 0 &&
            declarations.every((declaration) =>
                isInMoved(declaration.getSourceFile().fileName, declaration.getStart()),
            );
        if (!inner) return symbolKey(symbol, mapOld);
        return declarations
            .map((declaration) => `inner#${oldIndexByPosition.get(declarationNameStart(declaration))}`)
            .join("|");
    };

    const newChecker = newProgram.getTypeChecker();
    const sourceFile = newProgram.getSourceFile(moved.insertedInto)!;
    const newList: { node: ts.Identifier | ts.PrivateIdentifier; position: number }[] = [];
    forEachDescendant(sourceFile, (node) => {
        if (!(ts.isIdentifier(node) || ts.isPrivateIdentifier(node))) return;
        const position = node.getStart(sourceFile);
        const origin = editMap.newToOld(moved.insertedInto, position);
        if (origin.isPureInsertion && origin.oldPosition === moved.insertedAt) newList.push({ node, position });
    });
    const newIndexByPosition = new Map(newList.map((entry, index) => [entry.position, index]));
    const newKey = (symbol: ts.Symbol) => {
        const declarations = symbol.declarations ?? [];
        const indices = declarations.map((declaration) =>
            declaration.getSourceFile().fileName === moved.insertedInto
                ? newIndexByPosition.get(declarationNameStart(declaration))
                : undefined,
        );
        if (declarations.length > 0 && indices.every((index) => index !== undefined))
            return indices.map((index) => `inner#${index}`).join("|");
        return symbolKey(symbol, (_, position) => position);
    };

    const movedNames = newList.filter((entry) => !(moved.skipNewName?.(entry.node.text) ?? false));
    if (movedNames.length !== oldList.length)
        return "The moved code has a different number of names than the original.";
    for (let index = 0; index < oldList.length; index++) {
        const old = oldList[index];
        const entry = movedNames[index];
        if (old.name !== entry.node.text)
            return `The moved code has \`${entry.node.text}\` where the original had \`${old.name}\`.`;
        const actual = symbolsBoundBy(newChecker, entry.node)
            .filter((symbol) => !isMember(symbol))
            .map(newKey);
        for (const symbol of old.symbols.filter((candidate) => !isMember(candidate))) {
            if (!actual.includes(oldKey(symbol)))
                return `In the moved code, \`${old.name}\` would refer to a different declaration.`;
        }
    }
    return undefined;
}

function declarationNameStart(declaration: ts.Declaration): number {
    const name = (declaration as ts.NamedDeclaration).name;
    return (name ?? declaration).getStart();
}

function isMember(symbol: ts.Symbol): boolean {
    return (symbol.flags & (ts.SymbolFlags.Property | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor)) !== 0;
}

export function successResult(
    workspace: Workspace,
    edits: TextEdit[],
    subject: string,
    body: string,
    trailer: string,
): Result {
    return {
        status: "success",
        workspaceRoot: workspace.root,
        edits: toProtocolEdits(workspace, edits),
        warnings: [],
        commit: { subject, body, trailer },
    };
}

export function cursorTrailer(workspace: Workspace, refactoring: string, fileName: string, offset: number): string {
    const position = locationOf(workspace, fileName, offset, offset).start;
    return `Refactor: ${refactoring} typescript ${workspace.relativePath(fileName)}:${position.line}:${position.column}`;
}

export { bugReportSuggestion };
