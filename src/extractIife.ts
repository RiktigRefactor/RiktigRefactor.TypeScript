import ts from "typescript";
import { EditMap, locationOf, offsetOf, type TextEdit, toProtocolEdits } from "./edits.js";
import type { Position, RefusalCode, Result } from "./protocol.js";
import { bugReportSuggestion, refuse } from "./results.js";
import {
    bindsOwnArgumentsAndSuper,
    enclosingRuntimeFunction,
    isAssignmentTarget,
    isClassFieldInitializerBoundary,
    isRuntimeFunction,
    skipParenthesesUpward,
} from "./semantics.js";
import { forEachDescendant } from "./syntax.js";
import {
    collectBoundOccurrences,
    describeDiagnostic,
    findBindingChanges,
    findNewDiagnostics,
    symbolKey,
    symbolsBoundBy,
    unchecked,
} from "./verification.js";
import type { Workspace } from "./workspace.js";

export interface ExtractIifeRequest {
    /** Relative to the workspace root, or absolute. */
    file: string;
    start: Position;
    /** The position just after the selection. */
    end: Position;
}

/** Thrown while analyzing the selection when the refactoring must refuse. */
class Refusal {
    constructor(
        readonly code: RefusalCode,
        readonly message: string,
        readonly node?: ts.Node,
        readonly suggestion?: string,
    ) {}
}

type Selection =
    { kind: "expression"; expression: ts.Expression } | { kind: "statements"; statements: readonly ts.Statement[] };

/** A local of an enclosing function that the selection uses, which becomes a parameter. */
interface Parameter {
    symbol: ts.Symbol;
    name: string;
    typeText: string;
    isWrittenInSelection: boolean;
}

export interface ExtractIifeOptions {
    /**
     * Skips every precondition, the write-back of assigned variables, and the verification.
     * Only the tests use it, to prove that edge cases can detect a wrong result.
     */
    naive?: boolean;
}

export function extractIife(
    workspace: Workspace,
    request: ExtractIifeRequest,
    options: ExtractIifeOptions = {},
): Result {
    const fileName = workspace.absolutePath(request.file);
    const text = workspace.files.get(fileName);
    if (text === undefined) throw new Error(`The file ${request.file} is not part of the workspace.`);
    const rawStart = offsetOf(text, request.start);
    const rawEnd = offsetOf(text, request.end);
    if (rawStart === undefined || rawEnd === undefined || rawEnd < rawStart) {
        throw new Error(`The range is outside ${request.file}.`);
    }

    const program = workspace.createLanguageService().getProgram()!;
    const sourceFile = program.getSourceFile(fileName)!;
    const { start, end } = trimWhitespace(text, rawStart, rawEnd);
    const site = (node?: ts.Node) => {
        if (!node) return { fileName, start, end };
        return { fileName, start: node.getStart(sourceFile), end: node.end };
    };

    let plan: ExtractionPlan;
    try {
        plan = new ExtractionAnalysis(program, sourceFile, start, end, options.naive === true).analyze();
    } catch (error) {
        if (error instanceof Refusal)
            return refuse(workspace, error.code, error.message, site(error.node), error.suggestion);
        throw error;
    }

    const edits = plan.edits;
    if (options.naive) return successResult(workspace, fileName, start, end, edits);

    const editMap = new EditMap(edits);
    const changedText = editMap.apply(fileName, text);
    const extractedWorkspace = workspace.withChangedFiles(new Map([[fileName, changedText]]));
    const extractedProgram = extractedWorkspace.createLanguageService().getProgram()!;

    const newDiagnostics = findNewDiagnostics(program, extractedProgram, editMap);
    if (newDiagnostics.length > 0) {
        const annotationProblem = newDiagnostics.find((diagnostic) => plan.isInAnnotation(editMap, diagnostic));
        return refuse(
            workspace,
            annotationProblem ? "type-not-nameable" : "would-introduce-errors",
            `The extracted code would not compile: ${newDiagnostics.map(describeDiagnostic).join("; ")}`,
            site(),
        );
    }

    const typeChange = plan.findTypeChange(program, extractedProgram, editMap);
    if (typeChange) return refuse(workspace, "type-would-change", typeChange, site());

    const verificationProblem = plan.verify(program, extractedProgram, workspace, extractedWorkspace, editMap);
    if (verificationProblem) {
        return refuse(workspace, "internal-verification-failed", verificationProblem, site(), bugReportSuggestion);
    }
    return successResult(workspace, fileName, start, end, edits);
}

function successResult(workspace: Workspace, fileName: string, start: number, end: number, edits: TextEdit[]): Result {
    const location = locationOf(workspace, fileName, start, end);
    const range = `${location.start.line}:${location.start.column}-${location.end.line}:${location.end.column}`;
    return {
        status: "success",
        workspaceRoot: workspace.root,
        edits: toProtocolEdits(workspace, edits),
        warnings: [],
        commit: {
            subject: `. r Extract IIFE in ${location.file} at line ${location.start.line}`,
            body: "Behavior-preserving extraction of an immediately-invoked arrow function.",
            trailer: `Refactor: extract-iife typescript ${location.file}:${range}`,
        },
    };
}

function trimWhitespace(text: string, start: number, end: number) {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return { start, end };
}

/**
 * Members are looked up by spelling at run time, and the selected text doesn't change,
 * so only a type annotation can change which declaration a member resolves to.
 */
const memberSymbolFlags = ts.SymbolFlags.Property | ts.SymbolFlags.Method | ts.SymbolFlags.Accessor;

function isDirectEval(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval";
}

interface ExtractionPlan {
    edits: TextEdit[];
    isInAnnotation(editMap: EditMap, diagnostic: ts.Diagnostic): boolean;
    /** The selected expression's type must be the type of the call that replaces it. */
    findTypeChange(oldProgram: ts.Program, newProgram: ts.Program, editMap: EditMap): string | undefined;
    verify(
        oldProgram: ts.Program,
        newProgram: ts.Program,
        oldWorkspace: Workspace,
        newWorkspace: Workspace,
        editMap: EditMap,
    ): string | undefined;
}

class ExtractionAnalysis {
    private readonly checker: ts.TypeChecker;
    private readonly text: string;

    constructor(
        program: ts.Program,
        private readonly sourceFile: ts.SourceFile,
        private readonly start: number,
        private readonly end: number,
        private readonly naive: boolean,
    ) {
        this.checker = program.getTypeChecker();
        this.text = sourceFile.text;
    }

    analyze(): ExtractionPlan {
        const selection = this.findSelection();
        const selectedNodes = selection.kind === "expression" ? [selection.expression] : selection.statements;
        if (!this.naive) {
            this.checkSelectionContext(selectedNodes[0]);
            if (selection.kind === "expression") this.checkExpressionIsValue(selection.expression);
            for (const node of selectedNodes) this.checkContents(node);
            this.checkNoDirectEval();
        }
        const parameters = this.findParameters(selectedNodes, selection.kind);
        if (!this.naive) this.checkDeclarationsStayInside(selection);
        return this.buildPlan(selection, selectedNodes, parameters);
    }

    private isInSelection(node: ts.Node): boolean {
        return node.getStart(this.sourceFile) >= this.start && node.end <= this.end;
    }

    private findSelection(): Selection {
        const statements = this.findSelectedStatements();
        if (statements) return { kind: "statements", statements };
        const expression = this.findSelectedExpression();
        if (expression) return { kind: "expression", expression };
        throw new Refusal(
            "invalid-selection",
            "The selection is not exactly one expression or whole statements of one block.",
            undefined,
            "Select a complete expression, or complete statements in the same block.",
        );
    }

    private findSelectedStatements(): readonly ts.Statement[] | undefined {
        let found: readonly ts.Statement[] | undefined;
        const visit = (node: ts.Node) => {
            if (found || node.getStart(this.sourceFile) > this.start || node.end < this.end) return;
            const list = statementListOf(node);
            if (list) {
                const first = list.findIndex((statement) => statement.getStart(this.sourceFile) === this.start);
                const last = list.findIndex((statement) => statement.end === this.end);
                if (first >= 0 && last >= first) {
                    found = list.slice(first, last + 1);
                    return;
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(this.sourceFile);
        return found;
    }

    private findSelectedExpression(): ts.Expression | undefined {
        let found: ts.Expression | undefined;
        const visit = (node: ts.Node) => {
            if (node.getStart(this.sourceFile) > this.start || node.end < this.end) return;
            if (node.getStart(this.sourceFile) === this.start && node.end === this.end && isExpressionKind(node)) {
                found ??= node as ts.Expression;
            }
            ts.forEachChild(node, visit);
        };
        visit(this.sourceFile);
        return found;
    }

    private checkSelectionContext(first: ts.Node) {
        for (let current: ts.Node | undefined = first.parent; current; current = current.parent) {
            if (ts.isEnumDeclaration(current)) {
                throw new Refusal("invalid-selection", "The selection is inside an enum declaration.", current);
            }
            if (ts.isDecorator(current))
                throw new Refusal("invalid-selection", "The selection is inside a decorator.", current);
            if (ts.isTypeNode(current) || ts.isHeritageClause(current)) {
                throw new Refusal("invalid-selection", "The selection is part of a type, not a value.", current);
            }
            if (ts.isWithStatement(current)) {
                throw new Refusal(
                    "invalid-selection",
                    "The selection is inside a `with` statement, which binds names dynamically.",
                    current,
                );
            }
            if (ts.getCombinedModifierFlags(current as ts.Declaration) & ts.ModifierFlags.Ambient) {
                throw new Refusal("invalid-selection", "The selection is in an ambient declaration.", current);
            }
        }
    }

    private checkExpressionIsValue(expression: ts.Expression) {
        const parent = expression.parent;
        const notAValue = () =>
            new Refusal(
                "invalid-selection",
                "The selection is a name, not an expression that has a value.",
                expression,
            );
        if (ts.isPropertyAccessExpression(parent) && parent.name === expression) throw notAValue();
        if (ts.isQualifiedName(parent) || ts.isTypeNode(expression)) throw notAValue();
        if (ts.isShorthandPropertyAssignment(parent)) throw notAValue();
        if (
            ts.isJsxTagNameExpression(expression) &&
            (ts.isJsxOpeningLikeElement(parent) || ts.isJsxClosingElement(parent))
        ) {
            throw notAValue();
        }
        const declarationName = (parent as ts.NamedDeclaration).name;
        if (declarationName === expression && !ts.isPropertyAccessExpression(parent)) throw notAValue();
        if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) throw notAValue();
        if (ts.isExpressionStatement(parent) && ts.isStringLiteral(expression) && isPrologueDirective(parent)) {
            throw new Refusal("invalid-selection", 'The selection is a directive such as "use strict".', expression);
        }
        if (ts.isSpreadElement(expression) || ts.isOmittedExpression(expression)) throw notAValue();

        if (isAssignmentTarget(expression)) {
            throw new Refusal(
                "selection-is-reference",
                "The selected expression is assigned to, so it denotes a variable, not a value.",
                expression,
            );
        }
        const outer = skipParenthesesUpward(expression);
        const outerParent = outer.parent;
        if (ts.isDeleteExpression(outerParent) || ts.isTypeOfExpression(outerParent)) {
            if (ts.isDeleteExpression(outerParent) || ts.isIdentifier(expression)) {
                throw new Refusal(
                    "selection-is-reference",
                    "The operand of `delete` or `typeof` is a reference, not a value.",
                    expression,
                );
            }
        }
        const unparenthesized = skipParenthesesDownward(expression);
        const isCallee =
            ((ts.isCallExpression(outerParent) || ts.isNewExpression(outerParent)) &&
                outerParent.expression === outer) ||
            (ts.isTaggedTemplateExpression(outerParent) && outerParent.tag === outer);
        if (
            isCallee &&
            (ts.isPropertyAccessExpression(unparenthesized) || ts.isElementAccessExpression(unparenthesized))
        ) {
            throw new Refusal(
                "selection-is-reference",
                "The selected member is called as a method; extracting it would lose the `this` it is called with.",
                expression,
            );
        }
        if (
            ts.isOptionalChain(outerParent) &&
            (outerParent as ts.PropertyAccessExpression).expression === outer &&
            isOptionalChainPart(expression)
        ) {
            throw new Refusal(
                "selection-is-reference",
                "The selection is part of an optional chain; extracting it would change where the chain short-circuits.",
                expression,
            );
        }
    }

    /** Checks `arguments`, `super`, `new.target`, `await`, `yield`, and jumps inside the selection. */
    private checkContents(selected: ts.Node) {
        const visit = (
            node: ts.Node,
            insideFunction: boolean,
            insideOwnArgumentsBinder: boolean,
            jumpTargets: JumpTargets,
        ) => {
            this.checkNode(node, insideFunction, insideOwnArgumentsBinder, jumpTargets);
            const nextInsideFunction = insideFunction || isRuntimeFunction(node);
            const nextInsideOwnArgumentsBinder =
                insideOwnArgumentsBinder || bindsOwnArgumentsAndSuper(node) || isClassFieldInitializerBoundary(node);
            let nextTargets = jumpTargets;
            if (isRuntimeFunction(node)) nextTargets = { labels: [], loops: 0, switches: 0 };
            else nextTargets = jumpTargetsInside(node, jumpTargets);
            ts.forEachChild(node, (child) =>
                visit(child, nextInsideFunction, nextInsideOwnArgumentsBinder, nextTargets),
            );
        };
        visit(selected, false, false, { labels: [], loops: 0, switches: 0 });
    }

    private checkNode(
        node: ts.Node,
        insideFunction: boolean,
        insideOwnArgumentsBinder: boolean,
        jumpTargets: JumpTargets,
    ) {
        if (!insideOwnArgumentsBinder) {
            const isNewTarget = ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.NewKeyword;
            const isArguments = ts.isIdentifier(node) && node.text === "arguments" && this.isImplicitArguments(node);
            if (node.kind === ts.SyntaxKind.SuperKeyword || isNewTarget || isArguments) {
                throw new Refusal(
                    "arguments-or-super",
                    `The selection uses \`${node.getText(this.sourceFile)}\`, which the arrow function would take from the enclosing function.`,
                    node,
                );
            }
        }
        if (insideFunction) return;
        if (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier)) {
            throw new Refusal("contains-await", "The selection contains `await`.", node);
        }
        if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing) {
            throw new Refusal("contains-await", "The selection contains `await using`.", node);
        }
        if (ts.isYieldExpression(node)) {
            throw new Refusal(
                "non-local-control-flow",
                "The selection contains `yield`, which can't cross a function boundary.",
                node,
            );
        }
        if (ts.isReturnStatement(node)) {
            throw new Refusal(
                "non-local-control-flow",
                "The selection contains `return`, which would return from the arrow function instead.",
                node,
            );
        }
        if (ts.isBreakOrContinueStatement(node)) this.checkJump(node, jumpTargets);
    }

    private checkJump(node: ts.BreakOrContinueStatement, jumpTargets: JumpTargets) {
        const keyword = ts.isBreakStatement(node) ? "break" : "continue";
        let staysInside: boolean;
        if (node.label) staysInside = jumpTargets.labels.includes(node.label.text);
        else if (ts.isBreakStatement(node)) staysInside = jumpTargets.loops + jumpTargets.switches > 0;
        else staysInside = jumpTargets.loops > 0;
        if (!staysInside) {
            throw new Refusal(
                "non-local-control-flow",
                `The selection contains a \`${keyword}\` whose target is outside it.`,
                node,
            );
        }
    }

    private isImplicitArguments(identifier: ts.Identifier): boolean {
        const symbol = this.checker.getSymbolAtLocation(identifier);
        return !symbol || !symbol.declarations || symbol.declarations.length === 0;
    }

    private checkNoDirectEval() {
        let found: ts.Node | undefined;
        forEachDescendant(this.sourceFile, (node) => {
            if (!found && isDirectEval(node)) found = node;
        });
        if (found) {
            throw new Refusal(
                "direct-eval",
                "The file calls `eval` directly, which can read and write local variables by name.",
                found,
            );
        }
    }

    private isLocalVariable(symbol: ts.Symbol): boolean {
        if (!(symbol.flags & (ts.SymbolFlags.BlockScopedVariable | ts.SymbolFlags.FunctionScopedVariable)))
            return false;
        const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
        if (!declaration || declaration.getSourceFile() !== this.sourceFile) return false;
        if (enclosingRuntimeFunction(declaration)) return true;
        if (ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)) {
            const list = findAncestor(declaration, ts.isVariableDeclarationList);
            if (!list) return false;
            if (!(list.flags & ts.NodeFlags.BlockScoped)) return false;
            const statement = list.parent;
            return !(
                ts.isVariableStatement(statement) &&
                (ts.isSourceFile(statement.parent) || ts.isModuleBlock(statement.parent))
            );
        }
        return ts.isCatchClause(declaration.parent);
    }

    /** The occurrences, anywhere in the file, of identifiers that bind (as a value) to the symbol. */
    private occurrencesOf(symbol: ts.Symbol): ts.Identifier[] {
        const occurrences: ts.Identifier[] = [];
        forEachDescendant(this.sourceFile, (node) => {
            if (ts.isIdentifier(node) && symbolsBoundBy(this.checker, node).includes(symbol)) occurrences.push(node);
        });
        return occurrences;
    }

    private findParameters(selectedNodes: readonly ts.Node[], kind: Selection["kind"]): Parameter[] {
        const parameters: Parameter[] = [];
        const occurrencesBySymbol = new Map<ts.Symbol, ts.Identifier[]>();
        for (const selected of selectedNodes) {
            const visit = (node: ts.Node) => {
                if (ts.isIdentifier(node)) {
                    for (const symbol of symbolsBoundBy(this.checker, node)) {
                        if (!this.isLocalVariable(symbol)) continue;
                        const declaration = symbol.valueDeclaration ?? symbol.declarations![0];
                        if (this.isInSelection(declaration)) continue;
                        const list = occurrencesBySymbol.get(symbol) ?? [];
                        list.push(node);
                        occurrencesBySymbol.set(symbol, list);
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(selected);
        }
        for (const [symbol, occurrences] of occurrencesBySymbol) {
            const isWrittenInSelection = occurrences.some(isAssignmentTarget);
            const declaration = symbol.valueDeclaration ?? symbol.declarations![0];
            if (!this.naive) {
                if (kind === "expression" && isWrittenInSelection) {
                    throw new Refusal(
                        "expression-writes-variable",
                        `The selected expression assigns \`${symbol.name}\`; the arrow function would assign only its parameter.`,
                        occurrences.find(isAssignmentTarget),
                    );
                }
                this.checkNotCapturedAndMutable(symbol);
                this.checkNoTemporalDeadZone(symbol, declaration);
                if (isWrittenInSelection) this.checkWritesSurviveExceptions(symbol, declaration);
            }
            parameters.push({
                symbol,
                name: symbol.name,
                typeText: this.parameterTypeText(symbol, occurrences, isWrittenInSelection),
                isWrittenInSelection: isWrittenInSelection && kind === "statements",
            });
        }
        if (!this.naive) this.checkTypesDoNotNameParameters(parameters);
        return parameters;
    }

    /** Inside the parameter list, `typeof name` would refer to the parameter, not the original variable. */
    private checkTypesDoNotNameParameters(parameters: Parameter[]) {
        for (const parameter of parameters) {
            for (const other of parameters) {
                if (new RegExp(`\\btypeof\\s+${other.name}\\b`).test(parameter.typeText)) {
                    throw new Refusal(
                        "type-not-nameable",
                        `The type of \`${parameter.name}\` can only be written as \`${parameter.typeText}\`, which inside the parameter list would refer to the parameter \`${other.name}\`.`,
                    );
                }
            }
        }
    }

    /** A copy goes stale if the variable is assigned anywhere while a closure may read or write the original. */
    private checkNotCapturedAndMutable(symbol: ts.Symbol) {
        const declaration = symbol.valueDeclaration ?? symbol.declarations![0];
        const declaringFunction = enclosingRuntimeFunction(declaration);
        const occurrences = this.occurrencesOf(symbol);
        const isAssignedAfterDeclaration = occurrences.some(isAssignmentTarget);
        if (!isAssignedAfterDeclaration) return;
        const inClosure = occurrences.find((occurrence) => enclosingRuntimeFunction(occurrence) !== declaringFunction);
        if (inClosure) {
            throw new Refusal(
                "captured-variable",
                `\`${symbol.name}\` is assigned, and a closure uses it, so a copy passed to the arrow function could go stale.`,
                inClosure,
            );
        }
    }

    private checkNoTemporalDeadZone(symbol: ts.Symbol, declaration: ts.Declaration) {
        const list = findAncestor(declaration, ts.isVariableDeclarationList);
        const isBlockScoped = list !== undefined && (list.flags & ts.NodeFlags.BlockScoped) !== 0;
        if (!isBlockScoped) return;
        const refusal = () =>
            new Refusal(
                "possible-temporal-dead-zone",
                `\`${symbol.name}\` might be read before it is initialized; passing it as an argument would throw earlier than the original code.`,
                declaration,
            );
        const declarationStatement = list.parent;
        if (declarationStatement.end > this.start) throw refusal();
        if (ts.isCaseClause(declarationStatement.parent) || ts.isDefaultClause(declarationStatement.parent))
            throw refusal();
        const declaringFunction = enclosingRuntimeFunction(declaration);
        for (
            let current: ts.Node | undefined = this.firstSelectedNode();
            current && current !== declaringFunction;
            current = current.parent
        ) {
            if (ts.isFunctionDeclaration(current)) throw refusal();
        }
    }

    private firstSelectedNode(): ts.Node {
        let found: ts.Node = this.sourceFile;
        const visit = (node: ts.Node) => {
            if (node.getStart(this.sourceFile) <= this.start && node.end >= this.end) {
                found = node;
                ts.forEachChild(node, visit);
            }
        };
        ts.forEachChild(this.sourceFile, visit);
        return found;
    }

    private checkWritesSurviveExceptions(symbol: ts.Symbol, declaration: ts.Declaration) {
        const declaringFunction = enclosingRuntimeFunction(declaration);
        let child: ts.Node = this.firstSelectedNode();
        for (
            let current = child.parent;
            current && current !== declaringFunction;
            child = current, current = current.parent
        ) {
            const isInTryBlock = ts.isTryStatement(current) && current.tryBlock === child;
            const isInCatchWithFinally =
                ts.isCatchClause(child) && ts.isTryStatement(current) && current.finallyBlock !== undefined;
            if (isInTryBlock || isInCatchWithFinally) {
                throw new Refusal(
                    "writes-lost-on-exception",
                    `The selection assigns \`${symbol.name}\` inside a \`try\`; if it throws, the assignment would be lost.`,
                    current,
                );
            }
        }
    }

    private parameterTypeText(symbol: ts.Symbol, occurrences: ts.Identifier[], isWritten: boolean): string {
        const declaredType = this.checker.getTypeOfSymbol(symbol);
        let type = declaredType;
        if (!isWritten) {
            const narrowedTypes = occurrences.map((occurrence) => this.checker.getTypeAtLocation(occurrence));
            if (narrowedTypes.every((narrowed) => narrowed === narrowedTypes[0])) type = narrowedTypes[0];
        }
        return this.typeText(type, occurrences[0]);
    }

    private typeText(type: ts.Type, node: ts.Node): string {
        const text = this.checker.typeToString(
            type,
            node,
            ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
        );
        if (!this.naive && /\(Anonymous|__type|__object|\.\.\./.test(text)) {
            throw new Refusal("type-not-nameable", `The type \`${text}\` can't be written in an annotation.`, node);
        }
        return text;
    }

    /**
     * `var` and function declarations are hoisted to the enclosing function, and a `let`, `const` or class used after
     * the selection would need its temporal dead zone and constness kept, so the specification refuses both.
     */
    private checkDeclarationsStayInside(selection: Selection) {
        if (selection.kind === "expression") return;
        for (const statement of selection.statements) {
            if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Using) {
                throw new Refusal(
                    "declaration-escapes",
                    "A `using` declaration would be disposed when the arrow function returns instead of at the end of its block.",
                    statement,
                );
            }
        }
        const declaredSymbols = new Set<ts.Symbol>();
        for (const statement of selection.statements) {
            const visit = (node: ts.Node, insideFunction: boolean) => {
                if (!insideFunction && isHoistedDeclaration(node)) {
                    throw new Refusal(
                        "hoisted-declaration",
                        "The selection declares a `var` or a function, which is hoisted to the enclosing function.",
                        node,
                    );
                }
                const name = (node as ts.NamedDeclaration).name;
                if (name && ts.isIdentifier(name) && isDeclarationNode(node)) {
                    const symbol = this.checker.getSymbolAtLocation(name);
                    if (symbol) declaredSymbols.add(symbol);
                }
                ts.forEachChild(node, (child) => visit(child, insideFunction || isRuntimeFunction(node)));
            };
            visit(statement, false);
        }
        for (const symbol of declaredSymbols) {
            const outside = this.occurrencesOf(symbol).filter((occurrence) => !this.isInSelection(occurrence));
            if (outside.length > 0) {
                throw new Refusal(
                    "declaration-escapes",
                    `\`${symbol.name}\` is declared in the selection and used after it.`,
                    outside[0],
                    "Move the declaration out of the selection, or extend the selection to include its uses.",
                );
            }
        }
    }

    private buildPlan(
        selection: Selection,
        selectedNodes: readonly ts.Node[],
        parameters: Parameter[],
    ): ExtractionPlan {
        const fileName = this.sourceFile.fileName;
        const outputs = this.naive ? [] : parameters.filter((parameter) => parameter.isWrittenInSelection);
        const needsSemicolon = !this.naive && this.startsStatementAfterUnterminatedLine(selectedNodes[0]);
        const outputNames = outputs.map((output) => output.name).join(", ");

        // Object destructuring, unlike array destructuring, doesn't run the iterator protocol.
        let callPrefix = "";
        let callSuffix = "";
        if (outputs.length > 0) {
            callPrefix = `({ ${outputNames} } = `;
            callSuffix = ")";
        }
        if (needsSemicolon) callPrefix = ";" + callPrefix;

        const parameterList = parameters.map((parameter) => `${parameter.name}: ${parameter.typeText}`).join(", ");
        const argumentList = parameters.map((parameter) => parameter.name).join(", ");
        let returnTypeText: string;
        if (selection.kind === "expression") returnTypeText = this.expressionReturnTypeText(selection.expression);
        else if (outputs.length === 0) returnTypeText = "void";
        else returnTypeText = `{ ${outputs.map((output) => `${output.name}: ${output.typeText}`).join("; ")} }`;

        const edits: TextEdit[] = [];
        let header: string;
        let footer: string;
        let callOffsetInHeader: number;
        if (selection.kind === "expression") {
            const needsParenthesizedBody =
                !this.naive && (isLowerPrecedenceThanAssignment(selection.expression) || this.text[this.start] === "{");
            const isNewCallee =
                !this.naive &&
                ts.isNewExpression(selection.expression.parent) &&
                selection.expression.parent.expression === selection.expression;
            header = `${isNewCallee ? "(" : ""}((${parameterList}): ${returnTypeText} => ${needsParenthesizedBody ? "(" : ""}`;
            footer = `${needsParenthesizedBody ? ")" : ""})(${argumentList})${isNewCallee ? ")" : ""}`;
            if (needsSemicolon) header = ";" + header;
            callOffsetInHeader = (needsSemicolon ? 1 : 0) + (isNewCallee ? 1 : 0);
            edits.push({ fileName, start: this.start, end: this.start, newText: header });
            edits.push({ fileName, start: this.end, end: this.end, newText: footer });
        } else {
            const indentation = this.lineIndentation(this.start);
            const unit = indentation.includes("\t") ? "\t" : "    ";
            header = `${callPrefix}((${parameterList}): ${returnTypeText} => {\n${indentation}${unit}`;
            callOffsetInHeader = callPrefix.length;
            const returnStatement = outputs.length > 0 ? `\n${indentation}${unit}return { ${outputNames} };` : "";
            footer = `${returnStatement}\n${indentation}})(${argumentList})${callSuffix};`;
            edits.push({ fileName, start: this.start, end: this.start, newText: header });
            for (const lineStart of this.indentableLineStarts()) {
                edits.push({ fileName, start: lineStart, end: lineStart, newText: unit });
            }
            edits.push({ fileName, start: this.end, end: this.end, newText: footer });
        }

        const headerText = header;
        const footerText = footer;
        const parameterOffsetsInHeader = new Map<ts.Symbol, number>();
        {
            let offset = callOffsetInHeader + 2;
            for (const parameter of parameters) {
                parameterOffsetsInHeader.set(parameter.symbol, offset);
                offset += `${parameter.name}: ${parameter.typeText}, `.length;
            }
        }
        const start = this.start;
        const end = this.end;
        const isInSelection = (position: number) => position >= start && position < end;

        return {
            edits,
            isInAnnotation(editMap, diagnostic) {
                if (diagnostic.file?.fileName !== fileName || diagnostic.start === undefined) return false;
                const origin = editMap.newToOld(fileName, diagnostic.start);
                return origin.isPureInsertion && origin.oldPosition === start;
            },
            findTypeChange(oldProgram, newProgram, editMap) {
                if (selection.kind !== "expression") return undefined;
                const oldChecker = oldProgram.getTypeChecker();
                const oldExpression = findNodeAt(oldProgram.getSourceFile(fileName)!, start, end) as ts.Expression;
                const oldType = oldChecker.typeToString(typeAsUsed(oldChecker, oldExpression));
                const newSourceFile = newProgram.getSourceFile(fileName)!;
                const callStart = editMap.oldToNew(fileName, start) - headerText.length + callOffsetInHeader;
                const callEnd =
                    editMap.oldToNew(fileName, end) -
                    footerText.length +
                    footerText.lastIndexOf(`(${argumentList})`) +
                    argumentList.length +
                    2;
                const call = findNodeAt(newSourceFile, callStart, callEnd);
                if (!call) return "The call that replaces the expression was not found.";
                const newChecker = newProgram.getTypeChecker();
                const newType = newChecker.typeToString(newChecker.getTypeAtLocation(call));
                if (oldType === newType) return undefined;
                return `The expression has type \`${oldType}\`, but the call that replaces it would have type \`${newType}\`.`;
            },
            verify(oldProgram, newProgram, oldWorkspace, newWorkspace, editMap) {
                const newStart = editMap.oldToNew(fileName, start);
                const headerStart = newStart - headerText.length;
                const footerStart = editMap.oldToNew(fileName, end) - footerText.length;
                const parameterKey = (symbol: ts.Symbol) =>
                    `${fileName}#${headerStart + parameterOffsetsInHeader.get(symbol)!}#1`;
                const changes = findBindingChanges(
                    collectBoundOccurrences(oldProgram, oldWorkspace),
                    newProgram,
                    newWorkspace,
                    editMap,
                    (occurrence, symbol) => {
                        if (symbol.flags & memberSymbolFlags) return unchecked;
                        if (occurrence.fileName !== fileName) return undefined;
                        const inside = isInSelection(occurrence.position);
                        if (inside && parameterOffsetsInHeader.has(symbol)) return parameterKey(symbol);
                        return undefined;
                    },
                );
                if (changes.length > 0) {
                    const change = changes[0];
                    return `After extracting, \`${change.name}\` would bind to a different declaration (expected ${change.expected}, found ${change.actual.join(", ") || "nothing"}).`;
                }
                const newChecker = newProgram.getTypeChecker();
                const newSourceFile = newProgram.getSourceFile(fileName)!;
                const argumentsStart = footerStart + footerText.lastIndexOf(`(${argumentList})`) + 1;
                let offset = argumentsStart;
                for (const parameter of parameters) {
                    const problem = checkIdentifierBindsTo(newChecker, newSourceFile, offset, parameter, editMap);
                    if (problem) return problem;
                    offset += `${parameter.name}, `.length;
                }
                return undefined;
            },
        };
    }

    private expressionReturnTypeText(expression: ts.Expression): string {
        return this.typeText(typeAsUsed(this.checker, expression), expression);
    }

    private lineIndentation(position: number): string {
        const lineStart = this.text.lastIndexOf("\n", position - 1) + 1;
        return /^[ \t]*/.exec(this.text.slice(lineStart))![0];
    }

    /** Starts of the selection's lines after the first, except lines that start inside a string or template literal. */
    private indentableLineStarts(): number[] {
        const literalRanges: [number, number][] = [];
        forEachDescendant(this.sourceFile, (node) => {
            if (node.end <= this.start || node.getStart(this.sourceFile) >= this.end) return;
            if (
                ts.isStringLiteral(node) ||
                ts.isNoSubstitutionTemplateLiteral(node) ||
                ts.isTemplateLiteralToken(node)
            ) {
                literalRanges.push([node.getStart(this.sourceFile), node.end]);
            }
        });
        const starts: number[] = [];
        for (
            let index = this.text.indexOf("\n", this.start);
            index >= 0 && index < this.end;
            index = this.text.indexOf("\n", index + 1)
        ) {
            const lineStart = index + 1;
            if (lineStart >= this.end) break;
            const isInsideLiteral = literalRanges.some(([from, to]) => lineStart > from && lineStart < to);
            if (isInsideLiteral && !this.naive) continue;
            if (this.text[lineStart] === "\n" || this.text.startsWith("\r\n", lineStart)) continue;
            starts.push(lineStart);
        }
        return starts;
    }

    /**
     * Without a semicolon, a line that now starts with `(` or `[` would continue the previous line
     * as a call or an element access.
     */
    private startsStatementAfterUnterminatedLine(first: ts.Node): boolean {
        const statement = findAncestor(first, (node) => ts.isStatement(node) || ts.isSourceFile(node));
        if (!statement || ts.isSourceFile(statement) || statement.getStart(this.sourceFile) !== this.start)
            return false;
        let previous = this.start - 1;
        const scanner = this.text;
        while (previous >= 0 && /\s/.test(scanner[previous])) previous--;
        if (previous < 0) return false;
        return !";{}".includes(scanner[previous]) || this.endsWithComment(previous);
    }

    private endsWithComment(position: number): boolean {
        return this.text[position] === "/" && (this.text[position - 1] === "*" || this.text[position - 1] === "/");
    }
}

/**
 * The expression's type as its context uses it: a literal widens (`"on"` to `string`)
 * unless a `const` declaration or a contextual type keeps it.
 */
function typeAsUsed(checker: ts.TypeChecker, expression: ts.Expression): ts.Type {
    const parent = expression.parent;
    if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === expression &&
        !parent.type &&
        ts.isIdentifier(parent.name)
    ) {
        return checker.getTypeAtLocation(parent.name);
    }
    const type = checker.getTypeAtLocation(expression);
    if (type.flags & ts.TypeFlags.Literal && !checker.getContextualType(expression))
        return checker.getBaseTypeOfLiteralType(type);
    return type;
}

/** The outermost node with exactly this span. */
function findNodeAt(sourceFile: ts.SourceFile, start: number, end: number): ts.Node | undefined {
    let found: ts.Node | undefined;
    forEachDescendant(sourceFile, (node) => {
        if (!found && node.getStart(sourceFile) === start && node.end === end) found = node;
    });
    return found;
}

function checkIdentifierBindsTo(
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    position: number,
    parameter: Parameter,
    editMap: EditMap,
): string | undefined {
    let found: ts.Identifier | undefined;
    forEachDescendant(sourceFile, (node) => {
        if (ts.isIdentifier(node) && node.getStart(sourceFile) === position) found = node;
    });
    if (!found || found.text !== parameter.name) return `The argument for \`${parameter.name}\` is not where expected.`;
    const symbol = checker.getSymbolAtLocation(found);
    const expected = symbolKey(parameter.symbol, (fileName, oldPosition) => editMap.oldToNew(fileName, oldPosition));
    const actual = symbol && symbolKey(symbol, (_, newPosition) => newPosition);
    if (actual !== expected) return `The argument \`${parameter.name}\` would not refer to the original variable.`;
    return undefined;
}

interface JumpTargets {
    labels: string[];
    loops: number;
    switches: number;
}

function jumpTargetsInside(node: ts.Node, targets: JumpTargets): JumpTargets {
    if (ts.isLabeledStatement(node)) return { ...targets, labels: [...targets.labels, node.label.text] };
    if (ts.isIterationStatement(node, false)) return { ...targets, loops: targets.loops + 1 };
    if (ts.isSwitchStatement(node)) return { ...targets, switches: targets.switches + 1 };
    return targets;
}

function statementListOf(node: ts.Node): readonly ts.Statement[] | undefined {
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)) return node.statements;
    if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return node.statements;
    return undefined;
}

function isExpressionKind(node: ts.Node): boolean {
    if (ts.isPartOfTypeNode(node)) return false;
    return (
        ts.isExpression(node) &&
        !ts.isOmittedExpression(node) &&
        !ts.isSpreadElement(node) &&
        node.kind !== ts.SyntaxKind.SuperKeyword &&
        !ts.isTemplateLiteralToken(node)
    );
}

function isHoistedDeclaration(node: ts.Node): boolean {
    if (ts.isFunctionDeclaration(node)) return true;
    return ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0;
}

function isDeclarationNode(node: ts.Node): boolean {
    return (
        ts.isVariableDeclaration(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)
    );
}

function isPrologueDirective(statement: ts.ExpressionStatement): boolean {
    const list = statementListOf(statement.parent);
    if (!list) return false;
    for (const candidate of list) {
        if (!ts.isExpressionStatement(candidate) || !ts.isStringLiteral(candidate.expression)) return false;
        if (candidate === statement) return true;
    }
    return false;
}

function isOptionalChainPart(expression: ts.Expression): boolean {
    let current: ts.Node = skipParenthesesDownward(expression);
    while (
        ts.isPropertyAccessExpression(current) ||
        ts.isElementAccessExpression(current) ||
        ts.isCallExpression(current) ||
        ts.isNonNullExpression(current)
    ) {
        if (ts.isOptionalChain(current) && "questionDotToken" in current && current.questionDotToken) return true;
        current = current.expression;
    }
    return false;
}

function skipParenthesesDownward(expression: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
    return expression;
}

function isLowerPrecedenceThanAssignment(expression: ts.Expression): boolean {
    return ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken;
}

function findAncestor<T extends ts.Node>(node: ts.Node, predicate: (node: ts.Node) => node is T): T | undefined;
function findAncestor(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined;
function findAncestor(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
    for (let current: ts.Node | undefined = node; current; current = current.parent) {
        if (predicate(current)) return current;
    }
    return undefined;
}
