# Extract IIFE

Extract IIFE wraps a selected expression, or whole statements of one block, in an immediately-invoked arrow function:

```ts
// Before
const total = price * qty;

// After
const total = ((price: number, qty: number): number => price * qty)(price, qty);
```

Local variables of enclosing functions become parameters, annotated with the type the selection sees (narrowed where every use agrees), so the arrow function captures no local; module-level names are used directly.
An arrow function takes `this` from the enclosing function, so `this` is used directly too.
Statements that assign variables declared before them return those in an object that is assigned back at the call site (`({ a, b } = …)`); object destructuring, unlike array destructuring, doesn't run the iterator protocol.
Statement lines are indented one more level, except lines inside a string or template literal.
Where a line would start with `(` after a line without a semicolon, the tool adds `;`.
It refuses when it can't prove that wrapping keeps behavior, for example when:

- the selection contains `return`, `yield`, `await`, or a `break` or `continue` whose target is outside it;
- it uses `arguments`, `super`, or `new.target`;
- the expression is used as a reference: assigned to, deleted, called as a method (which would lose its `this`), or part of an optional chain;
- the expression assigns a variable that would become a parameter;
- a variable crossing the boundary is assigned somewhere and also used by a closure, so a copy could go stale;
- a `let` or `const` crossing the boundary might be read before it is initialized, so passing it would throw earlier;
- inside a `try`, the statements assign a variable declared outside it, which an exception would lose;
- the statements declare a `var` or a function (hoisted to the enclosing function), or a `let`, `const`, or class that is used after them;
- a type it must write out can't be written, such as an anonymous class or `typeof` of a name the parameters shadow;
- the file calls `eval` directly.

After extracting, it type-checks the result, checks that the call has the type the expression had (a literal keeps its literal type only where a `const` or a contextual type kept it), and checks that every variable binds as before, with the selection's uses of locals now bound to the new parameters.

## Command

```shell
riktig-ts extract-iife --workspace tsconfig.json --file src/order.ts --from 12:19 --to 12:30
```

See [the command line](command-line.md) for the options every command accepts.
