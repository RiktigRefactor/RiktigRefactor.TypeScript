# RiktigRefactor.TypeScript

Behavior-preserving refactorings for TypeScript, built on the TypeScript compiler API.

*Riktig* (Swedish/Norwegian) means correct.
When the tool cannot prove a transformation is safe, it refuses with a clear reason instead of guessing.

This is the TypeScript implementation of the [RiktigRefactor specification](https://github.com/RiktigRefactor/riktigrefactor.spec).
The specification defines the correctness model, the refactorings, the JSON protocol, and the test format.

## What it can do

Rename renames a symbol and every reference to it across the workspace, using the TypeScript language service to find the references.
Where a name is also an implicit key, it keeps the key: renaming `total` in `{ total }` gives `{ total: amount }`, in `const { total } = source` gives `const { total: amount } = source`, and in `export { total }` gives `export { amount as total }`.

After renaming, the tool type-checks the result and re-binds every identifier in the workspace, and refuses if any reference would bind to a different declaration.
It refuses when:

- the new name is not a valid identifier, or is a reserved word;
- the symbol is declared or referenced outside the workspace, such as in the standard library;
- the rename would introduce a compile error, or collide with an existing declaration;
- a name would be captured or un-shadowed, or a declaration would merge with another one of the same kind;
- the renamed member would override, or be overridden by, a member of a related class or interface;
- the member's old or new name is one the runtime looks up by spelling, such as `toString`, `then`, or `next`;
- a member with the old or new name is accessed on a value of type `any` or `unknown`.

Each refusal has a code, listed in [refusal-codes.md](refusal-codes.md).

See [limitations](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/limitations.md) for what is out of scope, such as reflection, serialization by name, and updating comments and strings.
Rename warns when a string literal equals the old name.
Like C#'s `typeof(T).Name`, these observe names as text and are not detected:

- a function's or class's `name` property, such as `User.name` or `this.constructor.name`;
- the keys of an object, such as through `Object.keys`, `JSON.stringify`, or `for…in`, after renaming a property;
- the reverse mapping of a numeric `enum`;
- values that reach a renamed property's type without the compiler seeing it, such as through `as` assertions or `JSON.parse`.

## Library

```ts
import { rename, Workspace } from "riktigrefactor-typescript";

const workspace = Workspace.fromTsconfig("tsconfig.json");
const result = rename(workspace, { file: "src/order.ts", position: { line: 12, column: 5 }, newName: "count" });
```

The package is not published yet.
The result follows the [protocol](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/protocol.md): edits with 1-based lines and columns, or a refusal with a reason code.

## Build and test

Run `./build-and-test` on Linux or macOS, or `build-and-test.cmd` on Windows (it needs Git for Windows).
It needs Node.js (the major version in [.node-version](.node-version)); it installs the pinned npm packages, checks formatting, compiles, and runs every test.
Run `./tidy-code` to format the code.

The tool uses the compiler API of TypeScript 6; see [UPDATING_DEPENDENCIES.md](UPDATING_DEPENDENCIES.md) for why it does not use TypeScript 7 yet.

Test cases live in `tests/cases`, in the [format defined by the specification](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/test-format.md).
Every input and expected program is type-checked with `strict` on, compiled, and run with Node.js, and edge cases must fail under a deliberately naive implementation (in `tests/naive`).

### Citing the language specifications

TypeScript has no current language specification, and its run-time behavior is JavaScript's.
So every test case lists, in its `spec` field, either sections of the ECMAScript specification, written as `ES §<number> <title>` and numbered as in [ECMA-262, 16th edition (ES2025)](https://262.ecma-international.org/16.0/), for example `ES §14.3.1 Let and Const Declarations`; or, for TypeScript-only features, pages of the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html), written as `TS handbook: <page title>`, for example `TS handbook: Declaration Merging`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the commit message convention.
