import ts from "typescript";
import { EditMap, locationOf, offsetOf, type TextEdit, toProtocolEdits } from "./edits.js";
import type { Position, Result, Warning } from "./protocol.js";
import { refuse } from "./results.js";
import { forEachDescendant, identifierAt, isReservedWord, isValidIdentifierText } from "./syntax.js";
import { collectBoundOccurrences, describeDiagnostic, findBindingChanges, findNewDiagnostics } from "./verification.js";
import type { Workspace } from "./workspace.js";

export interface RenameRequest {
    /** Relative to the workspace root, or absolute. */
    file: string;
    position: Position;
    newName: string;
}

/**
 * Member names that the JavaScript runtime or common protocols look up by spelling,
 * so renaming a member to or from one changes behavior without changing any binding.
 */
const runtimeProtocolNames = new Set([
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

const memberFlags =
    ts.SymbolFlags.Property | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor | ts.SymbolFlags.EnumMember;

export function rename(workspace: Workspace, request: RenameRequest): Result {
    const fileName = workspace.absolutePath(request.file);
    const text = workspace.files.get(fileName);
    if (text === undefined) throw new Error(`The file ${request.file} is not part of the workspace.`);
    const offset = offsetOf(text, request.position);
    if (offset === undefined)
        throw new Error(`The position ${request.position.line}:${request.position.column} is outside ${request.file}.`);

    const service = workspace.createLanguageService();
    const program = service.getProgram()!;
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(fileName)!;
    const cursorSite = { fileName, start: offset, end: offset };

    const identifier = identifierAt(sourceFile, offset);
    if (!identifier) return refuse(workspace, "no-symbol", "There is no identifier at the cursor.", cursorSite);
    const identifierSite = { fileName, start: identifier.getStart(sourceFile), end: identifier.end };
    const symbol = checker.getSymbolAtLocation(identifier);
    if (!symbol)
        return refuse(workspace, "no-symbol", `\`${identifier.text}\` does not resolve to a symbol.`, identifierSite);

    const oldName = identifier.text;
    const newName = request.newName;
    const isMember = (symbol.flags & memberFlags) !== 0;
    const invalidNameReason = findInvalidNameReason(oldName, newName, isMember);
    if (invalidNameReason) return refuse(workspace, "invalid-identifier", invalidNameReason, identifierSite);

    const renameInfo = service.getRenameInfo(fileName, identifierSite.start, { allowRenameOfImportPath: false });
    if (!renameInfo.canRename)
        return refuse(workspace, "not-renameable", renameInfo.localizedErrorMessage, identifierSite);

    const locations = service.findRenameLocations(fileName, identifierSite.start, false, false, {
        providePrefixAndSuffixTextForRename: true,
    });
    if (!locations || locations.length === 0) {
        return refuse(workspace, "no-symbol", `Found no references to \`${oldName}\`.`, identifierSite);
    }
    const outside = locations.find((location) => !workspace.files.has(location.fileName));
    if (outside) {
        return refuse(
            workspace,
            "not-renameable",
            `\`${oldName}\` is also declared or referenced in ${outside.fileName}, which is outside the workspace.`,
            identifierSite,
        );
    }

    const evalCall = findDirectEval(program, workspace, new Set(locations.map((location) => location.fileName)));
    if (evalCall) {
        return refuse(
            workspace,
            "dynamic-access-possible",
            "A file the rename edits calls `eval` directly, which can refer to names in code the compiler can't see.",
            evalCall,
        );
    }
    if (isMember && (runtimeProtocolNames.has(oldName) || runtimeProtocolNames.has(newName))) {
        return refuse(
            workspace,
            "runtime-protocol-name",
            `The runtime or a library may look up the member \`${runtimeProtocolNames.has(oldName) ? oldName : newName}\` by name, so renaming it could change behavior.`,
            identifierSite,
        );
    }
    if (isMember) {
        const dynamicAccess = findDynamicMemberAccess(program, workspace, checker, [oldName, newName]);
        if (dynamicAccess) {
            return refuse(
                workspace,
                "dynamic-access-possible",
                `\`${dynamicAccess.name}\` is accessed on a value whose type does not say which member it is, so the rename can't tell whether it refers to the renamed member.`,
                dynamicAccess.site,
            );
        }
        const collision = findInheritedMemberCollision(program, workspace, checker, symbol, newName);
        if (collision) {
            return refuse(
                workspace,
                "conflicting-declaration",
                `A type related to the renamed member already has a member named \`${newName}\`; the renamed member could override it or be overridden by it.`,
                collision,
            );
        }
    }

    if (isMember) {
        const renamedSpans = new Set(locations.map((location) => `${location.fileName}#${location.textSpan.start}`));
        const literalUse = findLiteralUseOfName(program, workspace, checker, oldName, renamedSpans);
        if (literalUse) {
            return refuse(
                workspace,
                "string-names-symbol",
                `A string names the member \`${oldName}\` where the property name reaches the runtime as text, and the rename would not change it.`,
                literalUse,
            );
        }
    }

    const edits: TextEdit[] = locations.map((location) => ({
        fileName: location.fileName,
        start: location.textSpan.start,
        end: location.textSpan.start + location.textSpan.length,
        newText: (location.prefixText ?? "") + newName + (location.suffixText ?? ""),
    }));
    const editMap = new EditMap(edits);
    const changedFiles = new Map<string, string>();
    for (const changed of editMap.changedFiles)
        changedFiles.set(changed, editMap.apply(changed, workspace.files.get(changed)!));
    const renamedWorkspace = workspace.withChangedFiles(changedFiles);
    const renamedProgram = renamedWorkspace.createLanguageService().getProgram()!;

    const newDiagnostics = findNewDiagnostics(program, renamedProgram, editMap);
    if (newDiagnostics.length > 0) {
        const isDuplicate = newDiagnostics.some((diagnostic) => duplicateDeclarationCodes.has(diagnostic.code));
        return refuse(
            workspace,
            isDuplicate ? "conflicting-declaration" : "would-introduce-errors",
            `Renaming \`${oldName}\` to \`${newName}\` would introduce errors: ${newDiagnostics.map(describeDiagnostic).join("; ")}`,
            identifierSite,
        );
    }

    const bindingChanges = findBindingChanges(
        collectBoundOccurrences(program, workspace),
        renamedProgram,
        renamedWorkspace,
        editMap,
    );
    if (bindingChanges.length > 0) {
        const change = bindingChanges[0];
        return refuse(
            workspace,
            "binding-would-change",
            `After renaming \`${oldName}\` to \`${newName}\`, \`${change.name}\` would refer to a different declaration.`,
            { fileName: change.fileName, start: change.oldPosition, end: change.oldPosition + change.name.length },
        );
    }

    const fileCount = new Set(edits.map((edit) => edit.fileName)).size;
    const position = locationOf(workspace, fileName, identifierSite.start, identifierSite.start).start;
    return {
        status: "success",
        workspaceRoot: workspace.root,
        edits: toProtocolEdits(workspace, edits),
        warnings: findStringsNamingSymbol(program, workspace, oldName),
        commit: {
            subject: `. r Rename ${oldName} to ${newName}`,
            body: `Behavior-preserving rename across ${fileCount} file${fileCount === 1 ? "" : "s"} (${edits.length} reference${edits.length === 1 ? "" : "s"}).`,
            trailer: `Refactor: rename typescript ${workspace.relativePath(fileName)}:${position.line}:${position.column} ${oldName} -> ${newName}`,
        },
    };
}

const duplicateDeclarationCodes = new Set([2300, 2393, 2440, 2451, 2567, 2718]);

/** Reserved words may name members (`box.class`); compile errors catch a member also declared as a parameter. */
function findInvalidNameReason(oldName: string, newName: string, isMember: boolean): string | undefined {
    const isPrivateName = oldName.startsWith("#");
    if (isPrivateName !== newName.startsWith("#")) {
        return `\`${oldName}\` is ${isPrivateName ? "" : "not "}a private name, so the new name must ${isPrivateName ? "" : "not "}start with \`#\`.`;
    }
    const bareName = isPrivateName ? newName.slice(1) : newName;
    if (!isValidIdentifierText(bareName)) return `\`${newName}\` is not a valid identifier.`;
    if (!isPrivateName && !isMember && isReservedWord(newName)) return `\`${newName}\` is a reserved word.`;
    return undefined;
}

interface NamedSite {
    name: string;
    site: { fileName: string; start: number; end: number };
}

/** A property access by name on a value whose type doesn't resolve it, such as `any`. */
function findDynamicMemberAccess(
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

function isUntypedObject(type: ts.Type): boolean {
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

function siteOf(sourceFile: ts.SourceFile, node: ts.Node) {
    return { fileName: sourceFile.fileName, start: node.getStart(sourceFile), end: node.end };
}

/**
 * Renaming a member of a class or interface to a name that a base or derived type already has
 * can make one override the other without any reference changing what it binds to.
 */
function findInheritedMemberCollision(
    program: ts.Program,
    workspace: Workspace,
    checker: ts.TypeChecker,
    symbol: ts.Symbol,
    newName: string,
) {
    const containers = new Set<ts.ClassLikeDeclaration | ts.InterfaceDeclaration>();
    for (const declaration of symbol.declarations ?? []) {
        const parent = declaration.parent;
        if (ts.isClassLike(parent) || ts.isInterfaceDeclaration(parent)) containers.add(parent);
    }
    if (containers.size === 0) return undefined;
    const containerTypes = [...containers].map((container) => checker.getTypeAtLocation(container));
    for (const container of containers) {
        if (checker.getTypeAtLocation(container).getProperty(newName))
            return siteOf(container.getSourceFile(), container.name ?? container);
    }
    for (const fileName of workspace.files.keys()) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: ReturnType<typeof siteOf> | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found || !(ts.isClassLike(node) || ts.isInterfaceDeclaration(node))) return;
            const type = checker.getTypeAtLocation(node);
            if (!type.getProperty(newName)) return;
            if (containerTypes.some((containerType) => isSubtypeByHeritage(checker, type, containerType))) {
                found = siteOf(sourceFile, node.name ?? node);
            }
        });
        if (found) return found;
    }
    return undefined;
}

function isSubtypeByHeritage(checker: ts.TypeChecker, type: ts.Type, ancestor: ts.Type): boolean {
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

function implementedTypes(checker: ts.TypeChecker, type: ts.Type): ts.Type[] {
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

function findStringsNamingSymbol(program: ts.Program, workspace: Workspace, oldName: string): Warning[] {
    const warnings: Warning[] = [];
    for (const fileName of workspace.files.keys()) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) continue;
        forEachDescendant(sourceFile, (node) => {
            if (!ts.isStringLiteralLike(node) || node.text !== oldName) return;
            if (
                ts.isElementAccessExpression(node.parent) ||
                ts.isImportDeclaration(node.parent) ||
                ts.isExportDeclaration(node.parent)
            )
                return;
            warnings.push({
                code: "string-mentions-name",
                message: `This string equals the old name \`${oldName}\`; the rename does not change strings.`,
                location: locationOf(workspace, fileName, node.getStart(sourceFile), node.end),
            });
        });
    }
    return warnings;
}

/**
 * Property names reach the runtime as text in `in`, bracket access, string literal types, and computed keys.
 * A string the rename doesn't change there could stop matching the renamed member.
 */
function findLiteralUseOfName(
    program: ts.Program,
    workspace: Workspace,
    checker: ts.TypeChecker,
    name: string,
    renamedSpans: ReadonlySet<string>,
) {
    for (const fileName of workspace.files.keys()) {
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) continue;
        let found: ReturnType<typeof siteOf> | undefined;
        forEachDescendant(sourceFile, (node) => {
            if (found) return;
            if (ts.isComputedPropertyName(node)) {
                const keyType = checker.getTypeAtLocation(node.expression);
                const keyTypes = keyType.isUnion() ? keyType.types : [keyType];
                if (keyTypes.some((type) => type.isStringLiteral() && type.value === name))
                    found = siteOf(sourceFile, node);
                return;
            }
            if (!ts.isStringLiteralLike(node) || node.text !== name) return;
            if (renamedSpans.has(`${fileName}#${node.getStart(sourceFile) + 1}`)) return;
            const parent = node.parent;
            const isInOperand =
                ts.isBinaryExpression(parent) &&
                parent.operatorToken.kind === ts.SyntaxKind.InKeyword &&
                parent.left === node;
            const isBracketKey = ts.isElementAccessExpression(parent) && parent.argumentExpression === node;
            const isLiteralType = ts.isLiteralTypeNode(parent);
            if (isInOperand || isBracketKey || isLiteralType) found = siteOf(sourceFile, node);
        });
        if (found) return found;
    }
    return undefined;
}

function findDirectEval(program: ts.Program, workspace: Workspace, fileNames: ReadonlySet<string>) {
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
