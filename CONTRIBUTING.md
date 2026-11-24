# Contributing

See [building and testing](docs/building-and-testing.md) for the toolchain, the test cases, and how they cite the C++ standard.

## Commit messages

Commits use [Arlo's Commit Notation](https://github.com/RefactoringCombos/ArlosCommitNotation).

Uppercase intentions mean a user-facing change; lowercase means the change is not user-facing.
For example, `^ F` adds a feature users can see, and `. r` is a refactoring.

### Extension intentions

This project uses these [extension intentions](https://github.com/RefactoringCombos/ArlosCommitNotation/blob/main/Extension%20Intentions.md):

| Prefix | Name | Intention |
|---|---|---|
| `t` | Test-only | Change automated tests without changing product code, such as adding an edge-case test. |
| `a` | Auto | Automatic formatting, code generation, or similar tasks. |
| `e` | Environment | Development setup and tooling changes that don't affect program behavior, such as CI, linting, and dependency-update configuration. |

Dependency updates use `^ r` for packages and SDKs, and `. e` for CI actions.
