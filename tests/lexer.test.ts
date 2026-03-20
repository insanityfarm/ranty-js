import { describe, expect, test } from "vitest";

import { nullReporter } from "../src/core/compiler/message";
import { lex } from "../src/core/compiler/lexer";
import { Ranty } from "../src/index";

describe("compiler pipeline", () => {
  test("lexer tokenizes core syntax instead of rejecting it up front", () => {
    const tokens = lex(
      '<$list = (1;2;3)><list/-1 ? fallback>[$/pick:arg?]{<arg?>}[pick:"ok"]',
      nullReporter()
    );

    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "<")
    ).toBe(true);
    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "(")
    ).toBe(true);
    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "?")
    ).toBe(true);
    expect(
      tokens.some(
        (token) => token.type === "identifier" && token.value === "pick"
      )
    ).toBe(true);
    expect(tokens.at(-1)?.type).toBe("eof");
  });

  test("lexer preserves compound assignment symbols as single tokens", () => {
    const tokens = lex("<x -= 1><y **= 2><z |= 3>", nullReporter());

    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "-=")
    ).toBe(true);
    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "**=")
    ).toBe(true);
    expect(
      tokens.some((token) => token.type === "symbol" && token.value === "|=")
    ).toBe(true);
  });

  test("compileQuiet still compiles supported syntax through the tokenized front door", () => {
    const ranty = new Ranty();

    expect(
      ranty.run(
        ranty.compileQuiet(
          "[$/pick:arg?]{[alt:<arg?>;fallback]}<$list = (1;2;3)><list/-1>, [pick], [pick:ok]"
        )
      )
    ).toBe("3, fallback, ok");
  });
});
