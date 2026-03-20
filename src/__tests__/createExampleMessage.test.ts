import { describe, expect, it } from "vitest";

import { createExampleMessage } from "../index.js";

describe("createExampleMessage", () => {
  it("returns the default message when no name is provided", () => {
    expect(createExampleMessage()).toBe("Hello, world.");
  });

  it("trims the provided name before formatting the message", () => {
    expect(createExampleMessage("  Ada  ")).toBe("Hello, Ada.");
  });
});
