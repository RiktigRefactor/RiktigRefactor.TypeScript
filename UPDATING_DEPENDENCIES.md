# Updating dependencies

Dependabot updates the npm packages and the GitHub Actions.
These need updating by hand:

- Node.js: `.node-version` holds the major version that CI and `build-and-test` use.
- TypeScript stays on the 6.x line: TypeScript 7 is the native port, and its npm package does not provide the compiler API (language service and type checker) that this tool is built on.
  Dependabot is told to ignore major TypeScript updates; revisit when TypeScript 7 offers a stable API.
