# Rename

Rename renames a symbol and every reference to it across the workspace, using the TypeScript language service to find the references.
Where a name is also an implicit key, it keeps the key: renaming `total` in `{ total }` gives `{ total: amount }`, in `const { total } = source` gives `const { total: amount } = source`, and in `export { total }` gives `export { amount as total }`.

After renaming, the tool type-checks the result and re-binds every identifier in the workspace, and refuses if any reference would bind to a different declaration.
It refuses when:

- the new name is not a valid identifier, or is a reserved word (allowed for members, as in `box.class`);
- the symbol is declared or referenced outside the workspace, such as in the standard library;
- the rename would introduce a compile error, or collide with an existing declaration;
- a name would be captured or un-shadowed, or a declaration would merge with another one of the same kind;
- the renamed member would override, or be overridden by, a member of a related class or interface;
- the member's old or new name is one the runtime looks up by spelling, such as `toString`, `then`, or `next`;
- a member with the old or new name is accessed on a value of type `any` or `unknown`, or a file the rename edits calls `eval` directly;
- a string equal to the member's old name is used where property names reach the runtime as text: the left side of `in`, a bracket access, a string literal type, or a computed key whose type includes the old name.

## Command

```shell
riktig-ts rename --workspace tsconfig.json --file src/order.ts --at 12:5 --new-name count
```

See [the command line](command-line.md) for the options every command accepts.
