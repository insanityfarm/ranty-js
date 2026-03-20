import { toExactInt } from "./int64";

const MASK_64 = (1n << 64n) - 1n;
const SPLITMIX_GAMMA = 0x9e3779b97f4a7c15n;
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function mask64(value: bigint): bigint {
  return value & MASK_64;
}

function rotl(value: bigint, shift: bigint): bigint {
  return mask64((value << shift) | (value >> (64n - shift)));
}

function splitMix64(seed: bigint): () => bigint {
  let state = mask64(seed);

  return () => {
    state = mask64(state + SPLITMIX_GAMMA);
    let z = state;
    z = mask64((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = mask64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return mask64(z ^ (z >> 31n));
  };
}

function fnv1a64(bytes: Uint8Array, seed: bigint = FNV_OFFSET_BASIS): bigint {
  let hash = seed;

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = mask64(hash * FNV_PRIME);
  }

  return hash;
}

function encodeUtf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function encodeU64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remainder = mask64(value);

  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remainder & 0xffn);
    remainder >>= 8n;
  }

  return bytes;
}

function encodeI64(value: bigint): Uint8Array {
  return encodeU64(mask64(value));
}

function leadingZeros64(value: bigint): number {
  if (value === 0n) {
    return 64;
  }

  return 64 - value.toString(2).length;
}

function wrapI64(value: bigint): bigint {
  return BigInt.asIntN(64, value);
}

export class RantyRng {
  #seed: bigint;
  #state: [bigint, bigint, bigint, bigint];

  constructor(seed: bigint | number) {
    this.#seed = BigInt(seed);
    const nextSeed = splitMix64(this.#seed);
    this.#state = [nextSeed(), nextSeed(), nextSeed(), nextSeed()];
  }

  seed(): bigint {
    return this.#seed;
  }

  forkU64(seed: bigint | number): RantyRng {
    const hash = fnv1a64(encodeU64(this.#seed), FNV_OFFSET_BASIS);
    return new RantyRng(fnv1a64(encodeU64(BigInt(seed)), hash));
  }

  forkI64(seed: bigint | number): RantyRng {
    const hash = fnv1a64(encodeU64(this.#seed), FNV_OFFSET_BASIS);
    return new RantyRng(fnv1a64(encodeI64(BigInt(seed)), hash));
  }

  forkStr(seed: string): RantyRng {
    const hash = fnv1a64(encodeU64(this.#seed), FNV_OFFSET_BASIS);
    return new RantyRng(fnv1a64(encodeUtf8(seed), hash));
  }

  forkRandom(): RantyRng {
    const hash = fnv1a64(encodeU64(this.#seed), FNV_OFFSET_BASIS);
    return new RantyRng(fnv1a64(encodeU64(this.nextU64()), hash));
  }

  nextU64(): bigint {
    const [s0, s1, s2, s3] = this.#state;
    const result = mask64(rotl(mask64(s0 + s3), 23n) + s0);
    const t = mask64(s1 << 17n);

    this.#state[2] = mask64(s2 ^ s0);
    this.#state[3] = mask64(s3 ^ s1);
    this.#state[1] = mask64(s1 ^ this.#state[2]);
    this.#state[0] = mask64(s0 ^ this.#state[3]);
    this.#state[2] = mask64(this.#state[2] ^ t);
    this.#state[3] = rotl(this.#state[3], 45n);

    return result;
  }

  nextNormalF64(): number {
    const value = this.nextU64() >> 11n;
    return Number(value) / 9007199254740992;
  }

  nextBool(probability: number): boolean {
    const clamped = Math.min(1, Math.max(0, probability));
    return this.nextNormalF64() < clamped;
  }

  nextI64(a: bigint | number, b: bigint | number): bigint {
    const av = toExactInt(a);
    const bv = toExactInt(b);
    const min = av < bv ? av : bv;
    const max = av > bv ? av : bv;

    if (min === max) {
      return min;
    }

    const range = mask64(max - min + 1n);
    if (range === 0n) {
      return wrapI64(this.nextU64());
    }

    const zone = mask64((range << BigInt(leadingZeros64(range))) - 1n);

    while (true) {
      const value = this.nextU64();
      const product = value * range;
      const hi = product >> 64n;
      const lo = mask64(product);

      if (lo <= zone) {
        return wrapI64(min + hi);
      }
    }
  }

  nextF64(a: number, b: number): number {
    if (Object.is(a, b)) {
      return a;
    }

    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return min + (max - min) * this.nextNormalF64();
  }

  nextUsize(max: number): number {
    if (!Number.isInteger(max) || max <= 0) {
      throw new RangeError(`max must be a positive integer, got ${max}`);
    }

    return Number(this.nextU64() % BigInt(max));
  }

  nextWeightedIndex(
    max: number,
    weights: readonly number[],
    weightSum: number
  ): number {
    if (weightSum > 0) {
      let remainder = this.nextF64(0, weightSum);
      for (const [index, weight] of weights.entries()) {
        if (weight === 0) {
          continue;
        }

        if (remainder < weight) {
          return index;
        }

        remainder -= weight;
      }
    }

    return max - 1;
  }
}
