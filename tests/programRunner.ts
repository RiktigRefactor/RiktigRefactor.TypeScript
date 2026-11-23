import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describeDiagnostic, allDiagnostics } from "../src/verification.js";
import { Workspace } from "../src/workspace.js";

export interface ProgramOutcome {
    passed: boolean;
    failure?: string;
}

/** Type-checks the workspace, emits it, and runs `main.ts` with Node; the program throws if its behavior is wrong. */
export function compileAndRun(workspace: Workspace): ProgramOutcome {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "riktig-ts-"));
    try {
        const emitting = new Workspace(workspace.root, workspace.files, {
            ...workspace.compilerOptions,
            noEmit: false,
            outDir,
            rootDir: workspace.root,
        });
        const program = emitting.createLanguageService().getProgram()!;
        const diagnostics = allDiagnostics(program);
        if (diagnostics.length > 0) return { passed: false, failure: diagnostics.map(describeDiagnostic).join("\n") };
        program.emit(undefined, (fileName, text) => {
            fs.mkdirSync(path.dirname(fileName), { recursive: true });
            fs.writeFileSync(fileName, text);
        });
        const run = spawnSync(process.execPath, [path.join(outDir, "main.js")], { encoding: "utf8", timeout: 20000 });
        if (run.status !== 0) return { passed: false, failure: `exit ${run.status}: ${run.stderr}${run.stdout}` };
        return { passed: true };
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
}
