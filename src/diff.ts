import { EditMap, type TextEdit } from "./edits.js";

const contextLines = 3;

/** A unified diff of the edits to one file, with hunks built around the edited lines. */
export function unifiedDiff(relativePath: string, oldText: string, edits: readonly TextEdit[]): string {
    if (edits.length === 0) return "";
    const lineStarts = [0];
    for (let index = 0; index < oldText.length; index++) if (oldText[index] === "\n") lineStarts.push(index + 1);
    const lineOf = (offset: number) => {
        let line = 0;
        while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line++;
        return line;
    };
    const lineEnd = (line: number) => (line + 1 < lineStarts.length ? lineStarts[line + 1] : oldText.length);
    const sorted = [...edits].sort((a, b) => a.start - b.start);

    const groups: { firstLine: number; lastLine: number; edits: TextEdit[] }[] = [];
    for (const edit of sorted) {
        const firstLine = lineOf(edit.start);
        const lastLine = lineOf(Math.max(edit.start, edit.end - (edit.end > edit.start ? 1 : 0)));
        const previous = groups.at(-1);
        if (previous && firstLine - previous.lastLine <= 2 * contextLines) {
            previous.lastLine = Math.max(previous.lastLine, lastLine);
            previous.edits.push(edit);
        } else {
            groups.push({ firstLine, lastLine, edits: [edit] });
        }
    }

    const splitLines = (text: string) => {
        const lines = text.split("\n");
        if (lines.at(-1) === "") lines.pop();
        return lines;
    };
    let output = `--- a/${relativePath}\n+++ b/${relativePath}\n`;
    let lineDelta = 0;
    for (const group of groups) {
        const coreStart = lineStarts[group.firstLine];
        const coreEnd = lineEnd(group.lastLine);
        const coreText = oldText.slice(coreStart, coreEnd);
        const shifted = group.edits.map((edit) => ({
            ...edit,
            start: edit.start - coreStart,
            end: edit.end - coreStart,
        }));
        const newCoreText = new EditMap(shifted).apply(shifted[0].fileName, coreText);
        const before = splitLines(oldText.slice(lineStarts[Math.max(0, group.firstLine - contextLines)], coreStart));
        const afterLast = Math.min(lineStarts.length - 1, group.lastLine + contextLines);
        const after = splitLines(oldText.slice(coreEnd, lineEnd(afterLast)));
        const oldCore = splitLines(coreText);
        const newCore = splitLines(newCoreText);
        const oldStart = group.firstLine - before.length + 1;
        const oldCount = before.length + oldCore.length + after.length;
        const newCount = before.length + newCore.length + after.length;
        output += `@@ -${oldStart},${oldCount} +${oldStart + lineDelta},${newCount} @@\n`;
        for (const line of before) output += ` ${line}\n`;
        for (const line of oldCore) output += `-${line}\n`;
        for (const line of newCore) output += `+${line}\n`;
        for (const line of after) output += ` ${line}\n`;
        lineDelta += newCore.length - oldCore.length;
    }
    return output;
}
