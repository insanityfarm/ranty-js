// @vitest-environment jsdom

import { expect, test } from "vitest";

test("bundle entry exposes the browser resolver hook on globalThis", async () => {
  const mod = await import("../src/index");
  expect(mod.Ranty).toBeDefined();
  expect(globalThis).toHaveProperty("__rantyBrowserResolverModule");
});
