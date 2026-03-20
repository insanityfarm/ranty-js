export class SourceReader {
  readonly source: string;
  #index = 0;

  constructor(source: string) {
    this.source = source;
  }

  index(): number {
    return this.#index;
  }

  setIndex(index: number): void {
    this.#index = index;
  }

  isEof(): boolean {
    return this.#index >= this.source.length;
  }

  peek(offset = 0): string | undefined {
    return this.source[this.#index + offset];
  }

  next(): string | undefined {
    const char = this.peek();
    if (char != null) {
      this.#index += 1;
    }
    return char;
  }

  consumeWhile(predicate: (char: string) => boolean): string {
    const start = this.#index;
    while (!this.isEof()) {
      const char = this.peek();
      if (char == null || !predicate(char)) {
        break;
      }
      this.#index += 1;
    }
    return this.source.slice(start, this.#index);
  }
}
