/** A 1-based position; the column counts Unicode scalar values. */
export interface Position {
    line: number;
    column: number;
}

export interface Location {
    file: string;
    start: Position;
    end: Position;
}

export interface Edit extends Location {
    newText: string;
}

export interface Warning {
    code: string;
    message: string;
    location?: Location;
}

export interface Reason {
    code: RefusalCode;
    message: string;
    location?: Location;
    suggestion?: string;
}

export interface CommitMessage {
    subject: string;
    body: string;
    trailer: string;
}

export interface SuccessResult {
    status: "success";
    workspaceRoot: string;
    edits: Edit[];
    warnings: Warning[];
    commit: CommitMessage;
}

export interface RefusedResult {
    status: "refused";
    workspaceRoot: string;
    reasons: Reason[];
}

export type Result = SuccessResult | RefusedResult;

/** The stable refusal codes; refusal-codes.md documents each one. */
export const RefusalCodes = [
    "no-symbol",
    "not-renameable",
    "invalid-identifier",
    "would-introduce-errors",
    "conflicting-declaration",
    "binding-would-change",
    "dynamic-access-possible",
    "runtime-protocol-name",
    "internal-verification-failed",
] as const;

export type RefusalCode = (typeof RefusalCodes)[number];
