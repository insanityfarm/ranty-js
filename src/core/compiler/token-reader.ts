import type { RantyToken } from "./lexer";

function isTrivia(token: RantyToken | undefined): boolean {
  return token?.type === "whitespace" || token?.type === "comment";
}

export class TokenReader {
  readonly source: string;
  readonly tokens: readonly RantyToken[];
  #index = 0;

  constructor(tokens: readonly RantyToken[], source: string) {
    this.tokens = tokens;
    this.source = source;
  }

  mark(): number {
    return this.#index;
  }

  reset(mark: number): void {
    this.#index = mark;
  }

  index(): number {
    return this.peekRaw()?.start ?? this.source.length;
  }

  isEof(): boolean {
    return this.peekRaw()?.type === "eof";
  }

  peek(offset = 0): RantyToken | undefined {
    const index = this.#index + offset;
    return index >= 0 && index < this.tokens.length
      ? this.tokens[index]
      : undefined;
  }

  peekRaw(offset = 0): RantyToken | undefined {
    return this.peek(offset);
  }

  next(): RantyToken | undefined {
    const token = this.peekRaw();
    if (token) {
      this.#index += 1;
    }
    return token;
  }

  consumeTrivia(): void {
    while (isTrivia(this.peekRaw())) {
      this.#index += 1;
    }
  }

  currentToken(): RantyToken | undefined {
    return this.peekRaw();
  }
}
