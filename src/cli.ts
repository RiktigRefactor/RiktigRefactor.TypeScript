#!/usr/bin/env node
import * as fs from "node:fs";
import { parseArgs } from "node:util";
import { unifiedDiff } from "./diff.js";
import { applyProtocolEdits, toTextEdits } from "./edits.js";
import { extractIife } from "./extractIife.js";
import type { Position, Result } from "./protocol.js";
import { rename } from "./rename.js";
import { Workspace } from "./workspace.js";

export interface Output {
    out(text: string): void;
    err(text: string): void;
}

const usage = `Usage:
  riktig-ts rename --workspace tsconfig.json --file src/foo.ts --at 12:5 --new-name count [--apply] [--json]
  riktig-ts extract-iife --workspace tsconfig.json --file src/foo.ts --from 12:19 --to 12:30 [--apply] [--json]

Positions are line:column, 1-based; columns count Unicode scalar values.
--to is the position just after the selection.
Without --apply, prints a unified diff. With --json, prints the protocol result instead.
Exit codes: 0 success, 1 refused, 2 error.`;

class UsageError extends Error {}

function parsePosition(text: string | undefined, option: string): Position {
    const match = /^(\d+):(\d+)$/.exec(text ?? "");
    if (!match) throw new UsageError(`--${option} needs a position written as line:column.`);
    return { line: Number(match[1]), column: Number(match[2]) };
}

function required(value: string | undefined, option: string): string {
    if (!value) throw new UsageError(`--${option} is required.`);
    return value;
}

export function main(argv: readonly string[], output: Output): number {
    try {
        const [command, ...rest] = argv;
        const { values } = parseArgs({
            args: rest,
            options: {
                workspace: { type: "string" },
                file: { type: "string" },
                at: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                "new-name": { type: "string" },
                apply: { type: "boolean", default: false },
                json: { type: "boolean", default: false },
            },
        });
        if (command !== "rename" && command !== "extract-iife")
            throw new UsageError(`Unknown command ${command ?? "(none)"}.`);
        const workspace = Workspace.fromTsconfig(required(values.workspace, "workspace"));
        const file = required(values.file, "file");
        let result: Result;
        if (command === "rename") {
            result = rename(workspace, {
                file,
                position: parsePosition(values.at, "at"),
                newName: required(values["new-name"], "new-name"),
            });
        } else {
            result = extractIife(workspace, {
                file,
                start: parsePosition(values.from, "from"),
                end: parsePosition(values.to, "to"),
            });
        }
        report(workspace, result, values.json, output);
        if (result.status !== "success") return 1;
        if (values.apply) {
            for (const [fileName, text] of applyProtocolEdits(workspace, result.edits))
                fs.writeFileSync(fileName, text);
        }
        return 0;
    } catch (error) {
        if (error instanceof UsageError) output.err(`${error.message}\n\n${usage}\n`);
        else output.err(`${error instanceof Error ? error.message : String(error)}\n`);
        return 2;
    }
}

function report(workspace: Workspace, result: Result, asJson: boolean, output: Output) {
    if (asJson) {
        output.out(JSON.stringify(result, undefined, 2) + "\n");
        return;
    }
    if (result.status === "refused") {
        for (const reason of result.reasons) {
            const where = reason.location
                ? `${reason.location.file}:${reason.location.start.line}:${reason.location.start.column}: `
                : "";
            output.err(`${where}refused (${reason.code}): ${reason.message}\n`);
            if (reason.suggestion) output.err(`  ${reason.suggestion}\n`);
        }
        return;
    }
    const textEdits = toTextEdits(workspace, result.edits);
    for (const fileName of new Set(textEdits.map((edit) => edit.fileName))) {
        const fileEdits = textEdits.filter((edit) => edit.fileName === fileName);
        output.out(unifiedDiff(workspace.relativePath(fileName), workspace.files.get(fileName)!, fileEdits));
    }
    for (const warning of result.warnings) output.err(`warning (${warning.code}): ${warning.message}\n`);
}

if (require.main === module) {
    process.exitCode = main(process.argv.slice(2), {
        out: (text) => process.stdout.write(text),
        err: (text) => process.stderr.write(text),
    });
}
