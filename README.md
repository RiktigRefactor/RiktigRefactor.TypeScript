# RiktigRefactor.TypeScript

[![Build and test](https://github.com/RiktigRefactor/RiktigRefactor.TypeScript/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/RiktigRefactor/RiktigRefactor.TypeScript/actions/workflows/build-and-test.yml)
![Status: early development](https://img.shields.io/badge/status-early%20development-orange)

Seriously safe behavior-preserving refactorings for TypeScript.
*Riktig* means "correct" in Swedish/Norwegian.
When the tool cannot prove a transformation is safe, it refuses with a clear reason instead of guessing.

This is the TypeScript implementation of the [RiktigRefactor specification](https://github.com/RiktigRefactor/riktigrefactor.spec).

<!-- toc -->
## Contents

  * [What it can do](#what-it-can-do)
    * [Rename](#rename)
    * [Extract IIFE](#extract-iife)
    * [Make method static](#make-method-static)
    * [Move static member](#move-static-member)
  * [Using it](#using-it)
  * [Building and testing](#building-and-testing)<!-- endToc -->

## What it can do

The tool has these refactorings:

### Rename

Rename renames a symbol and every reference to it across the workspace, keeping implicit keys such as `{ total }` intact.

#### Before

```ts
class Order {
  qty = 0;
  total() { return this.qty * 2; }
}
```

#### After

```ts
class Order {
  quantity = 0;
  total() { return this.quantity * 2; }
}
```

See more details in [docs/rename.md](docs/rename.md).

### Extract IIFE

Extract IIFE wraps a selected expression, or whole statements of one block, in an immediately-invoked arrow function.

#### Before

```ts
const total = price * qty;
```

#### After

```ts
const total = ((price: number, qty: number): number => price * qty)(price, qty);
```

See more details in [docs/extract-iife.md](docs/extract-iife.md).

### Make method static

Make method static turns an instance method into a static method of its class, with the receiver as its first parameter.

#### Before

```ts
total(qty: number) { return this.price * qty; }
const t = order.total(3);
```

#### After

```ts
static total(order: Order, qty: number) { return order.price * qty; }
const t = Order.total(order, 3);
```

See more details in [docs/make-method-static.md](docs/make-method-static.md).

### Move static member

Move static member moves a static method or field of a class to another class, and rewrites every reference.

#### Before

```ts
class Order {
  static rate() { return 0.2; }
}
const r = Order.rate();
```

#### After

```ts
class Pricing {
  static rate() { return 0.2; }
}
const r = Pricing.rate();
```

See more details in [docs/move-static-member.md](docs/move-static-member.md).

## Using it

The package is not published yet; from a clone, build it with `./build-and-test` and run:

```shell
node dist/src/cli.js rename --workspace tsconfig.json --file src/order.ts --at 12:5 --new-name count
```

See [the command line](docs/command-line.md) for the options and exit codes, and [the library](docs/library.md) for using it from code.

## Building and testing

```shell
./build-and-test
```

For more information, see [CONTRIBUTING.md](CONTRIBUTING.md).
