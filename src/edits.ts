import type { Edit, Location, Position } from "./protocol.js";
import type { Workspace } from "./workspace.js";

/** A replacement of the text from `start` up to (not including) `end`, in offsets of the original file. */
export interface TextEdit {
    fileName: string;
    start: number;
    end: number;
    newText: string;
}

export interface NewPositionOrigin {
    oldPosition: number;
    /** True when the new position lies in text an edit inserted; `oldPosition` is then that edit's start. */
    isInsertedText: boolean;
    /** True when that edit replaced nothing, so the new text has no counterpart in the original. */
    isPureInsertion: boolean;
}

/** Maps offsets between the original files and the files after a set of non-overlapping edits. */
export class EditMap {
    private readonly editsByFile = new Map<string, TextEdit[]>();

    constructor(edits: readonly TextEdit[]) {
        for (const edit of edits) {
            const list = this.editsByFile.get(edit.fileName) ?? [];
            list.push(edit);
            this.editsByFile.set(edit.fileName, list);
        }
        for (const list of this.editsByFile.values()) {
            list.sort((a, b) => a.start - b.start || a.end - b.end);
            for (let i = 1; i < list.length; i++) {
                if (list[i].start < list[i - 1].end) throw new Error("Overlapping edits");
            }
        }
    }

    get changedFiles(): string[] {
        return [...this.editsByFile.keys()];
    }

    editsIn(fileName: string): readonly TextEdit[] {
        return this.editsByFile.get(fileName) ?? [];
    }

    apply(fileName: string, text: string): string {
        let result = "";
        let copiedUpTo = 0;
        for (const edit of this.editsIn(fileName)) {
            result += text.slice(copiedUpTo, edit.start) + edit.newText;
            copiedUpTo = edit.end;
        }
        return result + text.slice(copiedUpTo);
    }

    /**
     * A position inside a replaced range maps to the start of its replacement.
     * A position where text is inserted maps to after the inserted text.
     */
    oldToNew(fileName: string, oldPosition: number): number {
        let shift = 0;
        for (const edit of this.editsIn(fileName)) {
            const isReplacement = edit.end > edit.start;
            if (isReplacement && oldPosition >= edit.start && oldPosition < edit.end) return edit.start + shift;
            if (edit.start > oldPosition) break;
            shift += edit.newText.length - (edit.end - edit.start);
        }
        return oldPosition + shift;
    }

    newToOld(fileName: string, newPosition: number): NewPositionOrigin {
        let shift = 0;
        for (const edit of this.editsIn(fileName)) {
            const newStart = edit.start + shift;
            const newEnd = newStart + edit.newText.length;
            if (newPosition < newStart) break;
            if (newPosition < newEnd) {
                return { oldPosition: edit.start, isInsertedText: true, isPureInsertion: edit.end === edit.start };
            }
            shift += edit.newText.length - (edit.end - edit.start);
        }
        return { oldPosition: newPosition - shift, isInsertedText: false, isPureInsertion: false };
    }
}

export function positionOf(text: string, offset: number): Position {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset; i++) {
        if (text.charCodeAt(i) === 10) {
            line++;
            lineStart = i + 1;
        }
    }
    return { line, column: [...text.slice(lineStart, offset)].length + 1 };
}

export function offsetOf(text: string, position: Position): number | undefined {
    let offset = 0;
    for (let line = 1; line < position.line; line++) {
        const newline = text.indexOf("\n", offset);
        if (newline < 0) return undefined;
        offset = newline + 1;
    }
    for (let column = 1; column < position.column; column++) {
        const codePoint = text.codePointAt(offset);
        if (codePoint === undefined || codePoint === 10) return undefined;
        offset += codePoint > 0xffff ? 2 : 1;
    }
    return offset;
}

export function locationOf(workspace: Workspace, fileName: string, start: number, end: number): Location {
    const text = workspace.files.get(fileName) ?? "";
    return { file: workspace.relativePath(fileName), start: positionOf(text, start), end: positionOf(text, end) };
}

export function toProtocolEdits(workspace: Workspace, edits: readonly TextEdit[]): Edit[] {
    return edits.map((edit) => ({
        ...locationOf(workspace, edit.fileName, edit.start, edit.end),
        newText: edit.newText,
    }));
}

/** Converts protocol edits, with 1-based lines and columns, to offsets in the workspace's files. */
export function toTextEdits(workspace: Workspace, edits: readonly Edit[]): TextEdit[] {
    return edits.map((edit) => {
        const fileName = workspace.absolutePath(edit.file);
        const text = workspace.files.get(fileName);
        if (text === undefined) throw new Error(`The edit's file ${edit.file} is not in the workspace.`);
        const start = offsetOf(text, edit.start);
        const end = offsetOf(text, edit.end);
        if (start === undefined || end === undefined) throw new Error(`The edit's range is outside ${edit.file}.`);
        return { fileName, start, end, newText: edit.newText };
    });
}

/** Applies protocol edits to the workspace's files and returns the changed files' new text. */
export function applyProtocolEdits(workspace: Workspace, edits: readonly Edit[]): Map<string, string> {
    const editMap = new EditMap(toTextEdits(workspace, edits));
    const changed = new Map<string, string>();
    for (const fileName of editMap.changedFiles)
        changed.set(fileName, editMap.apply(fileName, workspace.files.get(fileName)!));
    return changed;
}
