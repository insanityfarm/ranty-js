const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

function assertRange(value: bigint): bigint {
  if (value < INT64_MIN || value > INT64_MAX) {
    throw new RangeError(`value ${value} is outside the i64 range`);
  }

  return value;
}

export class RantyInt {
  readonly value: bigint;

  private constructor(value: bigint) {
    this.value = assertRange(value);
  }

  static from(value: bigint | number | string | RantyInt): RantyInt {
    if (value instanceof RantyInt) {
      return value;
    }

    if (typeof value === "number") {
      if (!Number.isInteger(value)) {
        throw new TypeError(`expected integer number, got ${value}`);
      }

      return new RantyInt(BigInt(value));
    }

    if (typeof value === "string") {
      return new RantyInt(BigInt(value));
    }

    return new RantyInt(value);
  }

  toApiValue(): bigint | number {
    if (this.value >= MIN_SAFE_BIGINT && this.value <= MAX_SAFE_BIGINT) {
      return Number(this.value);
    }

    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }
}

export function toExactInt(value: bigint | number | string | RantyInt): bigint {
  return RantyInt.from(value).value;
}
