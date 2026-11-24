# Refusals and limitations

Each refusal has a code, listed in [refusal-codes.md](../refusal-codes.md).

See [limitations](https://github.com/RiktigRefactor/riktigrefactor.spec/blob/main/limitations.md) for what is out of scope, such as reflection, serialization by name, and updating comments and strings.
Rename warns when a string literal equals the old name.
Like C#'s `typeof(T).Name`, these observe names as text and are not detected:

- a function's or class's `name` property, such as `User.name` or `this.constructor.name`;
- the keys of an object, such as through `Object.keys`, `JSON.stringify`, or `for…in`, after renaming a property;
- the reverse mapping of a numeric `enum`;
- values that reach a renamed property's type without the compiler seeing it, such as through `as` assertions or `JSON.parse`.
