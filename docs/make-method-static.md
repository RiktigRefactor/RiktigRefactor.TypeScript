# Make method static

Make method static turns an instance method into a static method of its class: the receiver becomes the first parameter (named after the class in camelCase, or `--receiver-name`), `this` in the method (including in arrow functions) becomes that parameter, and every call `recv.total(3)` becomes `Order.total(recv, 3)`.
It refuses when:

- a related class or interface (a base, a subclass, or any interface or object type) has a member with the method's name, or the method is abstract, overrides another, or is called through `super`;
- the method is used other than by a plain call: a method reference, an optional call, a bracket access, or through `any`, `unknown`, or the class's `prototype`;
- a call's receiver can't be proved non-null (`this`, a `new` expression, a literal, or a `const` holding one), since a null receiver fails at a different point after the change;
- the body uses `super`, `this` as a type, or `arguments`;
- the class is generic, or the method has decorators or overload signatures;
- the class name doesn't name the class at a call site;
- `pass: "members"` is asked for; only passing the receiver is supported.

After the change it type-checks the result and re-binds every identifier, so a receiver name that would capture another name is refused.

## Command

```shell
riktig-ts make-method-static --workspace tsconfig.json --file src/order.ts --at 12:5 [--receiver-name order]
```

See [the command line](command-line.md) for the options every command accepts.
