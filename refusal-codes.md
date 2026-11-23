# Refusal codes

The TypeScript tool defines its own refusal codes; the [specification](https://github.com/RiktigRefactor/riktigrefactor.spec) does not list any, except `internal-verification-failed`.
This file is the source of truth for them, and `src/protocol.ts` defines them in code.
Codes are stable, and messages may change.
A new code is listed in the release notes.

| Code | Meaning |
|---|---|
| `no-symbol` | There is no renameable symbol at the cursor. |
| `not-renameable` | The symbol can't be renamed: it is declared or referenced outside the workspace, such as in the standard library or a package. |
| `invalid-identifier` | The new name is not a valid identifier, is a reserved word, or doesn't match whether the old name is a private name (`#name`). |
| `conflicting-declaration` | The new name collides with an existing declaration, or with a member of a base or derived type, which the renamed member would override or be overridden by. |
| `would-introduce-errors` | The change would introduce compile errors that are not a declaration conflict. |
| `binding-would-change` | After the rename, a reference would bind to a different symbol, such as when a name is captured, or a declaration would merge with another of the same meaning. |
| `runtime-protocol-name` | Rename: the member's old or new name is one the runtime or common libraries look up by spelling (such as `toString`, `then`, `next`, or `toJSON`). |
| `dynamic-access-possible` | Rename: a member with the old or new name is accessed on a value of type `any` or `unknown`, which may be the renamed member. |
| `internal-verification-failed` | The tool's own check of its result failed. This is a bug in the tool; please report it. |
