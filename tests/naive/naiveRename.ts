import { EditMap, offsetOf } from "../../src/edits.js";
import type { Position } from "../../src/protocol.js";
import type { Workspace } from "../../src/workspace.js";

/** Applies the compiler's rename locations with no checks and no preserved implicit names. */
export function naiveRename(
    workspace: Workspace,
    file: string,
    position: Position,
    newName: string,
): Map<string, string> {
    const fileName = workspace.absolutePath(file);
    const offset = offsetOf(workspace.files.get(fileName)!, position)!;
    const locations = workspace.createLanguageService().findRenameLocations(fileName, offset, false, false) ?? [];
    const editMap = new EditMap(
        locations.map((location) => ({
            fileName: location.fileName,
            start: location.textSpan.start,
            end: location.textSpan.start + location.textSpan.length,
            newText: newName,
        })),
    );
    const changed = new Map<string, string>();
    for (const changedFile of editMap.changedFiles) {
        changed.set(changedFile, editMap.apply(changedFile, workspace.files.get(changedFile)!));
    }
    return changed;
}
