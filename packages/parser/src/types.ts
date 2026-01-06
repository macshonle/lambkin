/**
 * Source location for AST nodes and tokens
 */
export interface SourceLocation {
  line: number;      // 1-indexed
  column: number;    // 0-indexed
  offset: number;    // byte offset from start
}

export interface SourceRange {
  start: SourceLocation;
  end: SourceLocation;
}

/**
 * Token types for the lexer
 */
export enum TokenType {
  // Literals/Identifiers
  Identifier = 'Identifier',

  // Keywords
  Let = 'Let',

  // Symbols
  Lambda = 'Lambda',           // \
  Dot = 'Dot',                 // .
  Assign = 'Assign',           // :=
  LParen = 'LParen',           // (
  RParen = 'RParen',           // )

  // Special
  Comment = 'Comment',         // -- ...
  Whitespace = 'Whitespace',
  Newline = 'Newline',
  EOF = 'EOF',
  Error = 'Error',             // Invalid token
}

export interface Token {
  type: TokenType;
  value: string;
  range: SourceRange;
}

/**
 * AST Node types
 */
export enum NodeType {
  Program = 'Program',
  LetDeclaration = 'LetDeclaration',
  Variable = 'Variable',
  Abstraction = 'Abstraction',
  Application = 'Application',
  Comment = 'Comment',
  Error = 'Error',
}

/**
 * Base AST node interface
 */
export interface BaseNode {
  type: NodeType;
  range: SourceRange;
}

/**
 * Variable reference: x
 */
export interface VariableNode extends BaseNode {
  type: NodeType.Variable;
  name: string;
}

/**
 * Lambda abstraction: \x. M
 */
export interface AbstractionNode extends BaseNode {
  type: NodeType.Abstraction;
  parameter: string;
  parameterRange: SourceRange;
  body: ExpressionNode;
}

/**
 * Application: M N
 */
export interface ApplicationNode extends BaseNode {
  type: NodeType.Application;
  left: ExpressionNode;
  right: ExpressionNode;
}

/**
 * Error node for error-tolerant parsing
 */
export interface ErrorNode extends BaseNode {
  type: NodeType.Error;
  message: string;
  partial?: ExpressionNode; // Partially parsed expression
}

/**
 * Expression node union type
 */
export type ExpressionNode =
  | VariableNode
  | AbstractionNode
  | ApplicationNode
  | ErrorNode;

/**
 * Let declaration: let name := expression
 */
export interface LetDeclarationNode extends BaseNode {
  type: NodeType.LetDeclaration;
  name: string;
  nameRange: SourceRange;
  expression: ExpressionNode;
}

/**
 * Comment node
 */
export interface CommentNode extends BaseNode {
  type: NodeType.Comment;
  text: string;
}

/**
 * Top-level statement
 */
export type StatementNode = LetDeclarationNode | CommentNode | ErrorNode;

/**
 * Program (root) node
 */
export interface ProgramNode extends BaseNode {
  type: NodeType.Program;
  statements: StatementNode[];
}

/**
 * Diagnostic severity levels
 */
export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

/**
 * Diagnostic message
 */
export interface Diagnostic {
  range: SourceRange;
  message: string;
  severity: DiagnosticSeverity;
}

/**
 * Parse result with AST and diagnostics
 */
export interface ParseResult {
  program: ProgramNode;
  diagnostics: Diagnostic[];
}
