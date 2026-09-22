import test from "node:test";
import assert from "node:assert/strict";

test("documents patient id format", () => {
  const example = "DR-2610001";
  assert.match(example, /^DR-\d{4}\d{3}$/);
});
