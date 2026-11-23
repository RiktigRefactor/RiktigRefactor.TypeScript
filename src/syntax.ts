import ts from "typescript";

/** The identifier that contains the offset, or ends at it (a cursor just after a name). */
export function identifierAt(
    sourceFile: ts.SourceFile,
    offset: number,
): ts.Identifier | ts.PrivateIdentifier | undefined {
    let found: ts.Identifier | ts.PrivateIdentifier | undefined;
    const visit = (node: ts.Node) => {
        const start = node.getStart(sourceFile);
        if (offset < start || offset > node.end) return;
        if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && (found === undefined || offset < node.end)) {
            found = node;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
}

export function isValidIdentifierText(text: string): boolean {
    const codePoints = [...text].map((character) => character.codePointAt(0)!);
    if (codePoints.length === 0) return false;
    if (!ts.isIdentifierStart(codePoints[0], ts.ScriptTarget.Latest)) return false;
    return codePoints.slice(1).every((codePoint) => ts.isIdentifierPart(codePoint, ts.ScriptTarget.Latest));
}

/** Reserved words, including those reserved only in strict mode and `await` in modules. */
export function isReservedWord(text: string): boolean {
    const kind = ts.identifierToKeywordKind(ts.factory.createIdentifier(text));
    if (kind === undefined) return false;
    if (kind >= ts.SyntaxKind.FirstReservedWord && kind <= ts.SyntaxKind.LastReservedWord) return true;
    if (kind >= ts.SyntaxKind.FirstFutureReservedWord && kind <= ts.SyntaxKind.LastFutureReservedWord) return true;
    return kind === ts.SyntaxKind.AwaitKeyword;
}

export function forEachDescendant(node: ts.Node, callback: (descendant: ts.Node) => void) {
    const visit = (child: ts.Node) => {
        callback(child);
        ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
}
