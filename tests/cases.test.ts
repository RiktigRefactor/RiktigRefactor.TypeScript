import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "node:test";
import { applyProtocolEdits, positionOf } from "../src/edits.js";
import { extractIife } from "../src/extractIife.js";
import { makeMethodStatic } from "../src/makeMethodStatic.js";
import type { Position, Result } from "../src/protocol.js";
import { rename } from "../src/rename.js";
import { Workspace } from "../src/workspace.js";
import { naiveExtractIife } from "./naive/naiveExtractIife.js";
import { naiveRename } from "./naive/naiveRename.js";
import { compileAndRun } from "./programRunner.js";

const repositoryRoot = path.resolve(__dirname, "../..");
const casesRoot = path.join(repositoryRoot, "tests", "cases");
const writeExpected = process.env.RIKTIG_WRITE_EXPECTED === "1";

interface CaseMetadata {
    options?: { newName?: string; [option: string]: unknown };
    refuse?: string;
    naiveShouldFail?: boolean;
    warnings?: string[];
    spec: string[];
    notes?: string;
}

interface Selection {
    file: string;
    start: Position;
    end: Position;
}

const cursorMarker = "/*|*/";
const rangeStartMarker = "/*[*/";
const rangeEndMarker = "/*]*/";

function findCaseDirectories(directory: string): string[] {
    if (fs.existsSync(path.join(directory, "case.json"))) return [directory];
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => findCaseDirectories(path.join(directory, entry.name)));
}

function readFilesRecursively(directory: string): Map<string, string> {
    const files = new Map<string, string>();
    if (!fs.existsSync(directory)) return files;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile()) continue;
        const absolute = path.join(entry.parentPath, entry.name);
        files.set(path.relative(directory, absolute).replace(/\\/g, "/"), fs.readFileSync(absolute, "utf8"));
    }
    return files;
}

function removeMarkers(files: Map<string, string>): { files: Map<string, string>; selection: Selection } {
    const unmarked = new Map<string, string>();
    let selection: Selection | undefined;
    for (const [file, text] of files) {
        const cursor = text.indexOf(cursorMarker);
        const rangeStart = text.indexOf(rangeStartMarker);
        if (cursor >= 0) {
            assert.equal(selection, undefined, "Only one file may hold a selection marker");
            const withoutMarker = text.replace(cursorMarker, "");
            const position = positionOf(withoutMarker, cursor);
            selection = { file, start: position, end: position };
            unmarked.set(file, withoutMarker);
        } else if (rangeStart >= 0) {
            assert.equal(selection, undefined, "Only one file may hold a selection marker");
            const withoutStart = text.replace(rangeStartMarker, "");
            const rangeEnd = withoutStart.indexOf(rangeEndMarker);
            assert.ok(rangeEnd >= 0, `${file} has ${rangeStartMarker} without ${rangeEndMarker}`);
            const withoutMarkers = withoutStart.replace(rangeEndMarker, "");
            selection = {
                file,
                start: positionOf(withoutMarkers, rangeStart),
                end: positionOf(withoutMarkers, rangeEnd),
            };
            unmarked.set(file, withoutMarkers);
        } else {
            unmarked.set(file, text);
        }
    }
    assert.ok(selection, "The input has no selection marker");
    return { files: unmarked, selection };
}

type CursorRefactoring = (
    workspace: Workspace,
    request: { file: string; position: Position; [option: string]: unknown },
    options?: { naive?: boolean },
) => Result;

/** Refactorings that take a cursor and options, with a `naive` option the edge cases run against. */
const cursorRefactorings: Record<string, CursorRefactoring> = {
    "make-method-static": makeMethodStatic as CursorRefactoring,
};

function runRefactoring(
    refactoring: string,
    workspace: Workspace,
    selection: Selection,
    metadata: CaseMetadata,
): Result {
    if (refactoring === "rename") {
        return rename(workspace, {
            file: selection.file,
            position: selection.start,
            newName: metadata.options!.newName!,
        });
    }
    if (refactoring === "extract-iife") {
        return extractIife(workspace, { file: selection.file, start: selection.start, end: selection.end });
    }
    const cursorRefactoring = cursorRefactorings[refactoring];
    if (!cursorRefactoring) throw new Error(`Unknown refactoring ${refactoring}`);
    return cursorRefactoring(workspace, { file: selection.file, position: selection.start, ...metadata.options });
}

function runNaive(refactoring: string, workspace: Workspace, selection: Selection, metadata: CaseMetadata) {
    if (refactoring === "rename")
        return naiveRename(workspace, selection.file, selection.start, metadata.options!.newName!);
    if (refactoring === "extract-iife")
        return naiveExtractIife(workspace, selection.file, selection.start, selection.end);
    const request = { file: selection.file, position: selection.start, ...metadata.options };
    return applyNaive(workspace, cursorRefactorings[refactoring](workspace, request, { naive: true }));
}

function applyNaive(workspace: Workspace, result: Result): Map<string, string> {
    if (result.status !== "success") return new Map();
    return applyProtocolEdits(workspace, result.edits);
}

function describeResult(result: Result) {
    return JSON.stringify(result, undefined, 2);
}

for (const refactoring of fs.readdirSync(casesRoot).sort()) {
    describe(refactoring, () => {
        for (const caseDirectory of findCaseDirectories(path.join(casesRoot, refactoring))) {
            const caseName = path.relative(path.join(casesRoot, refactoring), caseDirectory).replace(/\\/g, "/");
            test(caseName, () => {
                const metadata: CaseMetadata = JSON.parse(
                    fs.readFileSync(path.join(caseDirectory, "case.json"), "utf8"),
                );
                assert.ok(
                    metadata.spec?.length > 0,
                    "case.json must cite the language-specification sections it covers",
                );
                const inputDirectory = path.join(caseDirectory, "input");
                const { files, selection } = removeMarkers(readFilesRecursively(inputDirectory));
                assert.ok(files.has("main.ts"), "The input needs a main.ts entry point");
                const workspace = Workspace.fromRelativeFiles(inputDirectory, files);

                const inputOutcome = compileAndRun(workspace);
                assert.ok(inputOutcome.passed, `The input program must compile and pass:\n${inputOutcome.failure}`);

                const result = runRefactoring(refactoring, workspace, selection, metadata);
                const expectedDirectory = path.join(caseDirectory, "expected");
                if (metadata.refuse) {
                    assert.equal(result.status, "refused", describeResult(result));
                    if (result.status === "refused")
                        assert.equal(result.reasons[0].code, metadata.refuse, describeResult(result));
                    assert.ok(!fs.existsSync(expectedDirectory), "A refusal case has no expected/ directory");
                } else {
                    assert.equal(result.status, "success", describeResult(result));
                    if (result.status !== "success") return;
                    const changed = applyProtocolEdits(workspace, result.edits);
                    const output = workspace.withChangedFiles(changed);
                    if (writeExpected) {
                        for (const [fileName, text] of output.files) {
                            const target = path.join(expectedDirectory, workspace.relativePath(fileName));
                            fs.mkdirSync(path.dirname(target), { recursive: true });
                            fs.writeFileSync(target, text);
                        }
                    }
                    const expected = readFilesRecursively(expectedDirectory);
                    const actual = new Map(
                        [...output.files].map(([fileName, text]) => [workspace.relativePath(fileName), text]),
                    );
                    assert.deepEqual(actual, expected, "The output must match expected/");
                    if (metadata.warnings)
                        assert.deepEqual(
                            result.warnings.map((warning) => warning.code),
                            metadata.warnings,
                        );
                    const outputOutcome = compileAndRun(output);
                    assert.ok(
                        outputOutcome.passed,
                        `The output program must compile and pass:\n${outputOutcome.failure}`,
                    );
                }

                if (metadata.naiveShouldFail) {
                    const naiveOutput = workspace.withChangedFiles(
                        runNaive(refactoring, workspace, selection, metadata),
                    );
                    const naiveOutcome = compileAndRun(naiveOutput);
                    assert.ok(
                        !naiveOutcome.passed,
                        "The naive implementation passes this edge case, so its assertion can't detect the problem",
                    );
                }
            });
        }
    });
}
