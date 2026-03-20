export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface SequenceNodeBase {
  readonly span: SourceSpan;
}

export interface TextNode extends SequenceNodeBase {
  readonly kind: "text";
  readonly value: string;
}

export interface StringLiteralNode extends SequenceNodeBase {
  readonly kind: "string";
  readonly value: string;
}

export interface NumberLiteralNode extends SequenceNodeBase {
  readonly kind: "number";
  readonly value: bigint | number;
}

export interface PipeValueNode extends SequenceNodeBase {
  readonly kind: "pipe-value";
}

export interface MapLiteralEntryNode {
  readonly key: string;
  readonly value: Sequence;
}

export interface MapLiteralNode extends SequenceNodeBase {
  readonly kind: "map";
  readonly entries: readonly MapLiteralEntryNode[];
}

export interface ListLiteralNode extends SequenceNodeBase {
  readonly kind: "list";
  readonly items: readonly Sequence[];
}

export interface TupleLiteralNode extends SequenceNodeBase {
  readonly kind: "tuple";
  readonly items: readonly Sequence[];
}

export interface UnaryOpNode extends SequenceNodeBase {
  readonly kind: "unary-op";
  readonly op: "not" | "neg";
  readonly operand: Sequence;
}

export interface BinaryOpNode extends SequenceNodeBase {
  readonly kind: "binary-op";
  readonly op:
    | "add"
    | "sub"
    | "mul"
    | "div"
    | "mod"
    | "pow"
    | "eq"
    | "neq"
    | "lt"
    | "le"
    | "gt"
    | "ge"
    | "and"
    | "or"
    | "xor";
  readonly left: Sequence;
  readonly right: Sequence;
}

export interface SpreadNode extends SequenceNodeBase {
  readonly kind: "spread";
  readonly value: Sequence;
  readonly temporal?: boolean;
  readonly label?: string;
}

export interface InvocationNode extends SequenceNodeBase {
  readonly kind: "invoke";
  readonly name: string;
  readonly args: readonly Sequence[];
}

export interface BlockNode extends SequenceNodeBase {
  readonly kind: "block";
  readonly elements: readonly BlockElementNode[];
  readonly sink: boolean;
}

export interface BlockEditDirective {
  readonly name?: string;
  readonly body: Sequence;
}

export interface BlockElementNode {
  readonly sequence: Sequence;
  readonly on?: Sequence;
  readonly weight?: Sequence;
  readonly edit?: BlockEditDirective;
}

export interface AngleStaticPathSegment {
  readonly kind: "static";
  readonly value: string;
}

export interface AngleDynamicPathSegment {
  readonly kind: "dynamic";
  readonly value: Sequence;
}

export interface AngleSlicePathSegment {
  readonly kind: "slice";
  readonly start?: Sequence;
  readonly end?: Sequence;
}

export type AnglePathSegment =
  | AngleStaticPathSegment
  | AngleDynamicPathSegment
  | AngleSlicePathSegment;

export interface AngleAccessStatement {
  readonly kind: "access";
  readonly span: SourceSpan;
  readonly base?: Sequence;
  readonly name: string;
  readonly path: readonly AnglePathSegment[];
  readonly fallback?: Sequence;
  readonly global: boolean;
  readonly descope: number;
}

export interface AngleSetStatement {
  readonly kind: "set";
  readonly span: SourceSpan;
  readonly base?: Sequence;
  readonly name: string;
  readonly path: readonly AnglePathSegment[];
  readonly global: boolean;
  readonly descope: number;
  readonly define: boolean;
  readonly isConst: boolean;
  readonly isLazy: boolean;
  readonly compoundOp?:
    | "add"
    | "sub"
    | "mul"
    | "div"
    | "mod"
    | "pow"
    | "and"
    | "or"
    | "xor";
  readonly value: Sequence;
}

export type AngleStatement = AngleAccessStatement | AngleSetStatement;

export interface AngleNode extends SequenceNodeBase {
  readonly kind: "angle";
  readonly statements: readonly AngleStatement[];
}

export interface FunctionDefNode extends SequenceNodeBase {
  readonly kind: "function";
  readonly name: string | null;
  readonly global: boolean;
  readonly descope: number;
  readonly isConst: boolean;
  readonly params: readonly FunctionParam[];
  readonly body: Sequence;
}

export interface FunctionParam {
  readonly span: SourceSpan;
  readonly name: string;
  readonly isLazy: boolean;
  readonly optional: boolean;
  readonly variadic: "none" | "star" | "plus";
  readonly defaultValue?: Sequence;
}

export type SequenceNode =
  | TextNode
  | StringLiteralNode
  | NumberLiteralNode
  | PipeValueNode
  | MapLiteralNode
  | ListLiteralNode
  | TupleLiteralNode
  | UnaryOpNode
  | BinaryOpNode
  | SpreadNode
  | InvocationNode
  | BlockNode
  | AngleNode
  | FunctionDefNode;

export interface Sequence {
  readonly kind: "sequence";
  readonly nodes: readonly SequenceNode[];
}
