# Command line

The package is not published yet; from a clone, build it with `./build-and-test` and run `node dist/src/cli.js` in place of `riktig-ts`.

The commands are `rename`, `extract-iife`, `make-method-static` and `move-static-member`; each refactoring's page shows an example.
The workspace is the set of files a `tsconfig.json` includes.

Positions are 1-based, and columns count Unicode scalar values.

- `--apply` writes the changes to disk.
- `--json` prints the result using the shared protocol, without the diff.

The exit code is 0 on success, 1 when the refactoring is refused, and 2 on an error such as an unknown file.
Each refusal has a code, listed in [refusal codes](../refusal-codes.md); see also [refusals and limitations](limitations.md).
