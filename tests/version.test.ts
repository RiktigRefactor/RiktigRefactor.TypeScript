import assert from "node:assert/strict";
import { test } from "node:test";
import { version } from "../src/index.js";

test("the library has a version", () => {
    assert.match(version, /^\d+\.\d+\.\d+$/);
});
