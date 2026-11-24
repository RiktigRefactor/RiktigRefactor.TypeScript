# Move static member

Move static member moves a static method or field of a class to another class (`--target src/pricing.ts#Pricing`), in the same file or another, and rewrites every `Source.member` to `Target.member`.
The member goes first in the target class, with its leading comments.
Moving module-level functions and constants, or moving to a module, is not supported yet.
It refuses when:

- the member uses `this` or `super` (the class it was called through, which may be a subclass);
- the target or a class related to it has a member with the same name;
- a field's initializer is not a literal, or the target class has static initialization that is not;
- a reference is not written `ClassName.member` (a variable of constructor type, destructuring), or reaches a field through a subclass;
- a reference runs while modules or classes are being defined (outside any function), when the target may not be defined yet;
- the target class's name doesn't refer to it at a reference, which would need a new import;
- a file's import of the source module would be left unused, so the compiler would drop it and the module would stop running there;
- the moved code would not compile at the target, or a name in it would refer to something else there.

## Command

```shell
riktig-ts move-static-member --workspace tsconfig.json --file src/order.ts --at 12:12 --target src/pricing.ts#Pricing
```

See [the command line](command-line.md) for the options every command accepts.
