import { applyProtocolEdits } from "../../src/edits.js";
import { extractIife } from "../../src/extractIife.js";
import type { Position } from "../../src/protocol.js";
import type { Workspace } from "../../src/workspace.js";

/** Wraps the selection with no preconditions, no write-back of assigned variables, and no verification. */
export function naiveExtractIife(
    workspace: Workspace,
    file: string,
    start: Position,
    end: Position,
): Map<string, string> {
    const result = extractIife(workspace, { file, start, end }, { naive: true });
    if (result.status !== "success") return new Map();
    return applyProtocolEdits(workspace, result.edits);
}
