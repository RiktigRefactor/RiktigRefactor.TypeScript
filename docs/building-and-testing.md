# Building and testing

Install [Git](https://git-scm.com/) and [Mise](https://mise.jdx.dev/).
Mise provides Node.js and npm, so nothing else needs to be installed:

```shell
./build-and-test
```

`build-and-test` installs the pinned npm packages, compiles, and runs every test case; `build-and-test.cmd` does the same on Windows through Git for Windows' Bash.
Run `./tidy-code` to format the code.

The tool uses the compiler API of TypeScript 6; see [UPDATING_DEPENDENCIES.md](../UPDATING_DEPENDENCIES.md) for why it does not use TypeScript 7 yet.

Test cases live in `tests/cases`, in the [format defined by the specification](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/test-format.md).
Every input and expected program is type-checked with `strict` on, compiled, and run with Node.js, and edge cases must fail under a deliberately naive implementation (in `tests/naive`).

### Citing the language specifications

TypeScript has no current language specification, and its run-time behavior is JavaScript's.
Following the [specification's citation table](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/test-format.md#citations), every test case lists, in its `spec` field, either sections of the ECMAScript specification, written as `ECMAScript §<number> <title>` and numbered as in [ECMA-262, 16th edition (ES2025)](https://262.ecma-international.org/16.0/), for example `ECMAScript §14.3.1 Let and Const Declarations`; or, for TypeScript's type-system features, the feature's name, written as `TypeScript feature: <name>`, for example `TypeScript feature: declaration merging`.
