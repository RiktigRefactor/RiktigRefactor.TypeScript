import { locationOf } from "./edits.js";
import type { RefusalCode, RefusedResult, Reason } from "./protocol.js";
import type { Workspace } from "./workspace.js";

export interface RefusalSite {
    fileName: string;
    start: number;
    end: number;
}

export function refuse(
    workspace: Workspace,
    code: RefusalCode,
    message: string,
    site?: RefusalSite,
    suggestion?: string,
): RefusedResult {
    const reason: Reason = { code, message };
    if (site) reason.location = locationOf(workspace, site.fileName, site.start, site.end);
    if (suggestion) reason.suggestion = suggestion;
    return { status: "refused", workspaceRoot: workspace.root, reasons: [reason] };
}

export const bugReportSuggestion = "This is a bug in RiktigRefactor.TypeScript; please report it.";
