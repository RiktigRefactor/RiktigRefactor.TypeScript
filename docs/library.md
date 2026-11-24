# Library

```ts
import { extractIife, rename, Workspace } from "riktigrefactor-typescript";

const workspace = Workspace.fromTsconfig("tsconfig.json");
const renamed = rename(workspace, { file: "src/order.ts", position: { line: 12, column: 5 }, newName: "count" });
const extracted = extractIife(workspace, { file: "src/order.ts", start: { line: 12, column: 19 }, end: { line: 12, column: 30 } });
```

The package is not published yet.
The result follows the [protocol](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/protocol.md): edits with 1-based lines and columns, or a refusal with a reason code.
