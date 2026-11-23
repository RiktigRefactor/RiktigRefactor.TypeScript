import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

export const defaultCompilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    lib: ["lib.es2023.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    types: [],
    noEmit: true,
};

/** The source files of a workspace held in memory, keyed by absolute path with `/` separators. */
export class Workspace {
    readonly root: string;
    readonly files: ReadonlyMap<string, string>;
    readonly compilerOptions: ts.CompilerOptions;

    constructor(root: string, files: ReadonlyMap<string, string>, compilerOptions: ts.CompilerOptions) {
        this.root = toForwardSlashes(path.resolve(root));
        this.files = files;
        this.compilerOptions = compilerOptions;
    }

    static fromRelativeFiles(
        root: string,
        relativeFiles: ReadonlyMap<string, string>,
        options = defaultCompilerOptions,
    ) {
        const absoluteRoot = toForwardSlashes(path.resolve(root));
        const files = new Map<string, string>();
        for (const [relative, text] of relativeFiles) files.set(`${absoluteRoot}/${relative}`, text);
        return new Workspace(absoluteRoot, files, options);
    }

    static fromTsconfig(tsconfigPath: string): Workspace {
        const absoluteConfig = path.resolve(tsconfigPath);
        const config = ts.readConfigFile(absoluteConfig, ts.sys.readFile);
        if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
        const root = path.dirname(absoluteConfig);
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
        const files = new Map<string, string>();
        for (const fileName of parsed.fileNames) {
            files.set(toForwardSlashes(path.resolve(fileName)), fs.readFileSync(fileName, "utf8"));
        }
        return new Workspace(root, files, { ...parsed.options, noEmit: true });
    }

    relativePath(fileName: string): string {
        return path.posix.relative(this.root, fileName);
    }

    absolutePath(relativeOrAbsolute: string): string {
        return toForwardSlashes(path.resolve(this.root, relativeOrAbsolute));
    }

    withChangedFiles(changed: ReadonlyMap<string, string>): Workspace {
        const files = new Map(this.files);
        for (const [fileName, text] of changed) files.set(fileName, text);
        return new Workspace(this.root, files, this.compilerOptions);
    }

    createLanguageService(): ts.LanguageService {
        return ts.createLanguageService(new InMemoryLanguageServiceHost(this), sharedDocumentRegistry);
    }
}

export function toForwardSlashes(fileName: string): string {
    return fileName.replace(/\\/g, "/");
}

const sharedDocumentRegistry = ts.createDocumentRegistry();

class InMemoryLanguageServiceHost implements ts.LanguageServiceHost {
    private readonly workspace: Workspace;

    constructor(workspace: Workspace) {
        this.workspace = workspace;
    }

    getCompilationSettings() {
        return this.workspace.compilerOptions;
    }
    getScriptFileNames() {
        return [...this.workspace.files.keys()];
    }
    getScriptVersion(fileName: string) {
        const text = this.workspace.files.get(fileName);
        if (text === undefined) return "disk";
        return hashText(text);
    }
    getScriptSnapshot(fileName: string) {
        const text = this.readFile(fileName);
        if (text === undefined) return undefined;
        return ts.ScriptSnapshot.fromString(text);
    }
    getCurrentDirectory() {
        return this.workspace.root;
    }
    getDefaultLibFileName(options: ts.CompilerOptions) {
        return ts.getDefaultLibFilePath(options);
    }
    fileExists(fileName: string) {
        return (
            this.workspace.files.has(fileName) ||
            (isOutsideWorkspace(this.workspace, fileName) && ts.sys.fileExists(fileName))
        );
    }
    readFile(fileName: string) {
        const text = this.workspace.files.get(fileName);
        if (text !== undefined) return text;
        if (isOutsideWorkspace(this.workspace, fileName)) return ts.sys.readFile(fileName);
        return undefined;
    }
    directoryExists(directoryName: string) {
        return ts.sys.directoryExists(directoryName) || this.workspaceHasDirectory(directoryName);
    }
    getDirectories(directoryName: string) {
        return ts.sys.getDirectories(directoryName);
    }

    private workspaceHasDirectory(directoryName: string) {
        const prefix = toForwardSlashes(directoryName).replace(/\/?$/, "/");
        for (const fileName of this.workspace.files.keys()) if (fileName.startsWith(prefix)) return true;
        return false;
    }
}

/** Files under the workspace root come only from memory, so an edited workspace never sees stale disk contents. */
function isOutsideWorkspace(workspace: Workspace, fileName: string) {
    return !toForwardSlashes(fileName).startsWith(workspace.root + "/") || fileName.includes("/node_modules/");
}

function hashText(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex");
}
