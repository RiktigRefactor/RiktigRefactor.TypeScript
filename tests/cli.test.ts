import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";

function createProject(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "riktig-ts-cli-"));
    fs.mkdirSync(path.join(directory, "src"));
    fs.writeFileSync(
        path.join(directory, "tsconfig.json"),
        JSON.stringify({
            compilerOptions: { strict: true, target: "es2023", module: "nodenext", types: [] },
            include: ["src"],
        }),
    );
    fs.writeFileSync(
        path.join(directory, "src", "order.ts"),
        "export function invoice(price: number, qty: number) {\n    const total = price * qty;\n    return total;\n}\n",
    );
    return directory;
}

function run(argv: string[]) {
    let out = "";
    let err = "";
    const exitCode = main(argv, { out: (text) => (out += text), err: (text) => (err += text) });
    return { exitCode, out, err };
}

test("rename prints a diff and leaves the file alone", () => {
    const project = createProject();
    const workspace = path.join(project, "tsconfig.json");
    const result = run([
        "rename",
        "--workspace",
        workspace,
        "--file",
        "src/order.ts",
        "--at",
        "2:11",
        "--new-name",
        "amount",
    ]);
    assert.equal(result.exitCode, 0, result.err);
    assert.match(result.out, /^-    const total = price \* qty;$/m);
    assert.match(result.out, /^\+    const amount = price \* qty;$/m);
    assert.match(fs.readFileSync(path.join(project, "src", "order.ts"), "utf8"), /const total/);
});

test("extract-iife --apply writes the file", () => {
    const project = createProject();
    const workspace = path.join(project, "tsconfig.json");
    const result = run([
        "extract-iife",
        "--workspace",
        workspace,
        "--file",
        "src/order.ts",
        "--from",
        "2:19",
        "--to",
        "2:30",
        "--apply",
    ]);
    assert.equal(result.exitCode, 0, result.err);
    assert.match(
        fs.readFileSync(path.join(project, "src", "order.ts"), "utf8"),
        /const total = \(\(price: number, qty: number\): number => price \* qty\)\(price, qty\);/,
    );
});

test("a refusal exits with 1 and prints the protocol result with --json", () => {
    const project = createProject();
    const workspace = path.join(project, "tsconfig.json");
    const result = run([
        "rename",
        "--workspace",
        workspace,
        "--file",
        "src/order.ts",
        "--at",
        "2:11",
        "--new-name",
        "price",
        "--json",
    ]);
    assert.equal(result.exitCode, 1);
    const parsed = JSON.parse(result.out);
    assert.equal(parsed.status, "refused");
    assert.equal(parsed.reasons[0].code, "conflicting-declaration");
});

test("a usage error exits with 2", () => {
    const result = run(["rename"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.err, /--workspace is required/);
});
