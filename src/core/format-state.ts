import type { RantyValue } from "./values";

export type WhitespaceFormatMode =
  | "default"
  | "ignore-all"
  | "verbatim"
  | "custom";
export type NumeralSystem =
  | "west-arabic"
  | "east-arabic"
  | "persian"
  | "roman"
  | "babylonian"
  | "hex"
  | "octal"
  | "binary"
  | "alpha";
export type Endianness = "big" | "little";
export type SignStyle = "negative-only" | "explicit" | "explicit-non-zero";
export type InfinityStyle = "keyword" | "symbol";

export interface WhitespaceFormatState {
  mode: WhitespaceFormatMode;
  customValue: RantyValue;
}

export interface NumberFormatState {
  system: NumeralSystem;
  alt: boolean;
  precision: number | null;
  padding: number;
  upper: boolean;
  endian: Endianness;
  sign: SignStyle;
  infinity: InfinityStyle;
  groupSep: string;
  decimalSep: string;
}

export interface OutputFormatState {
  whitespace: WhitespaceFormatState;
  number: NumberFormatState;
}

export function defaultOutputFormatState(): OutputFormatState {
  return {
    whitespace: {
      mode: "default",
      customValue: null
    },
    number: {
      system: "west-arabic",
      alt: false,
      precision: null,
      padding: 0,
      upper: false,
      endian: "big",
      sign: "negative-only",
      infinity: "keyword",
      groupSep: "",
      decimalSep: ""
    }
  };
}
