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
| `invalid-selection` | Extract IIFE: the selection is not exactly one expression that has a value, or whole statements of one block, or it is inside an enum, a decorator, a type, a `with` statement, or an ambient declaration. |
| `non-local-control-flow` | Extract IIFE: `return`, `break`, `continue`, `yield`, or a label would cross the boundary of the function. |
| `contains-await` | Extract IIFE: the selection contains `await` (outside a nested function). |
| `this-or-arguments` | Extract IIFE: the selection uses `this`, `super`, `arguments`, or `new.target`, which the arrow function would capture. |
| `direct-eval` | Extract IIFE: the selection, or a function around it, calls `eval` directly, which can see local variables by name. |
| `selection-is-reference` | Extract IIFE: the expression is used as a reference rather than a value: it is assigned to, deleted, called as a method (so it supplies `this`), or part of an optional chain. |
| `expression-writes-variable` | Extract IIFE: the selected expression assigns a variable that would become a parameter, so only the copy would change. |
| `captured-variable` | Extract IIFE: a variable crossing the boundary is assigned somewhere and also used by a closure, so code would see a stale copy. |
| `possible-temporal-dead-zone` | Extract IIFE: a `let`, `const`, or class crossing the boundary may be read before it is initialized; passing it as an argument would throw earlier than the original. |
| `writes-lost-on-exception` | Extract IIFE: inside a `try`, the selection assigns a variable declared outside it; an exception would lose the assignment, because the function returns values only when it completes. |
| `declaration-escapes` | Extract IIFE: a declaration in the selection is used outside it in a way the call can't return (anything but a `let` or `const` used only after the selection, or such declarations together with assigned outer variables), or a `using` declaration would be disposed early. |
| `type-not-nameable` | Extract IIFE: a type that has to be written out as a parameter or return type annotation can't be. |
| `internal-verification-failed` | The tool's own check of its result failed. This is a bug in the tool; please report it. |
