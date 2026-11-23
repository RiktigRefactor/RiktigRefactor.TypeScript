# RiktigRefactor.TypeScript

Behavior-preserving refactorings for TypeScript, built on the TypeScript compiler API.

*Riktig* (Swedish/Norwegian) means correct.
When the tool cannot prove a transformation is safe, it refuses with a clear reason instead of guessing.

This is the TypeScript implementation of the [RiktigRefactor specification](https://github.com/RiktigRefactor/riktigrefactor.spec).
The specification defines the correctness model, the refactorings, the JSON protocol, and the test format.

## Build and test

Run `./build-and-test` on Linux or macOS, or `build-and-test.cmd` on Windows (it needs Git for Windows).
It needs Node.js (the major version in [.node-version](.node-version)); it installs the pinned npm packages, checks formatting, compiles, and runs every test.
Run `./tidy-code` to format the code.

The tool uses the compiler API of TypeScript 6; see [UPDATING_DEPENDENCIES.md](UPDATING_DEPENDENCIES.md) for why it does not use TypeScript 7 yet.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the commit message convention.
