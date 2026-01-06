import { Lexer } from './lexer';
import {
  Token,
  TokenType,
  NodeType,
  ProgramNode,
  StatementNode,
  ExpressionNode,
  LetDeclarationNode,
  CommentNode,
  VariableNode,
  AbstractionNode,
  ApplicationNode,
  ErrorNode,
  Diagnostic,
  DiagnosticSeverity,
  ParseResult,
  SourceRange,
  SourceLocation,
} from './types';

/**
 * Error-tolerant parser for Lambda Calculus
 * Produces AST even for incomplete/invalid code
 */
export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;
  private diagnostics: Diagnostic[] = [];
  private allTokens: Token[] = []; // Include comments for reference

  constructor(private source: string) {}

  /**
   * Parse the source code into an AST
   */
  parse(): ParseResult {
    const lexer = new Lexer(this.source);
    this.allTokens = lexer.tokenize();
    this.tokens = this.allTokens.filter(
      t => t.type !== TokenType.Whitespace && t.type !== TokenType.Newline
    );
    this.current = 0;
    this.diagnostics = [];

    const statements = this.parseProgram();

    const startLoc: SourceLocation = { line: 1, column: 0, offset: 0 };
    const endLoc = this.tokens.length > 0
      ? this.tokens[this.tokens.length - 1].range.end
      : startLoc;

    const program: ProgramNode = {
      type: NodeType.Program,
      statements,
      range: { start: startLoc, end: endLoc },
    };

    return { program, diagnostics: this.diagnostics };
  }

  private parseProgram(): StatementNode[] {
    const statements: StatementNode[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    return statements;
  }

  private parseStatement(): StatementNode | null {
    // Skip comments but record them
    if (this.check(TokenType.Comment)) {
      const comment = this.advance();
      return {
        type: NodeType.Comment,
        text: comment.value,
        range: comment.range,
      } as CommentNode;
    }

    // Let declaration
    if (this.check(TokenType.Let)) {
      return this.parseLetDeclaration();
    }

    // Error recovery: skip unknown tokens
    if (!this.isAtEnd()) {
      const token = this.advance();
      if (token.type !== TokenType.EOF) {
        this.addDiagnostic(
          token.range,
          `Unexpected token '${token.value}'`,
          DiagnosticSeverity.Error
        );
        return {
          type: NodeType.Error,
          message: `Unexpected token '${token.value}'`,
          range: token.range,
        } as ErrorNode;
      }
    }

    return null;
  }

  private parseLetDeclaration(): LetDeclarationNode | ErrorNode {
    const letToken = this.advance(); // consume 'let'
    const startRange = letToken.range;

    // Expect identifier
    if (!this.check(TokenType.Identifier)) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected identifier after "let"', DiagnosticSeverity.Error);
      return this.makeErrorNode('Expected identifier after "let"', startRange);
    }

    const nameToken = this.advance();
    const nameRange = nameToken.range;

    // Expect :=
    if (!this.check(TokenType.Assign)) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected ":=" after identifier', DiagnosticSeverity.Error);
      return this.makeErrorNode('Expected ":=" after identifier', {
        start: startRange.start,
        end: nameRange.end,
      });
    }

    this.advance(); // consume ':='

    // Parse expression
    const expression = this.parseExpression();
    if (!expression) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected expression after ":="', DiagnosticSeverity.Error);
      return this.makeErrorNode('Expected expression after ":="', {
        start: startRange.start,
        end: this.previousRange().end,
      });
    }

    return {
      type: NodeType.LetDeclaration,
      name: nameToken.value,
      nameRange,
      expression,
      range: { start: startRange.start, end: expression.range.end },
    };
  }

  /**
   * Parse an expression (application chain)
   * Application is left-associative: M N P = ((M N) P)
   */
  private parseExpression(): ExpressionNode | null {
    let left = this.parseAtom();
    if (!left) return null;

    // Parse application chain (left-associative)
    while (true) {
      const right = this.parseAtom();
      if (!right) break;

      left = {
        type: NodeType.Application,
        left,
        right,
        range: { start: left.range.start, end: right.range.end },
      } as ApplicationNode;
    }

    return left;
  }

  /**
   * Parse an atomic expression (variable, abstraction, or parenthesized expression)
   */
  private parseAtom(): ExpressionNode | null {
    // Lambda abstraction: \x. M
    if (this.check(TokenType.Lambda)) {
      return this.parseAbstraction();
    }

    // Parenthesized expression: (M)
    if (this.check(TokenType.LParen)) {
      return this.parseParenthesized();
    }

    // Variable: x
    if (this.check(TokenType.Identifier)) {
      const token = this.advance();
      return {
        type: NodeType.Variable,
        name: token.value,
        range: token.range,
      } as VariableNode;
    }

    // Not an atom - could be end of expression or error
    return null;
  }

  /**
   * Parse lambda abstraction: \x. M
   * Abstraction extends as far right as possible: \x.M N = \x.(M N)
   */
  private parseAbstraction(): AbstractionNode | ErrorNode {
    const lambdaToken = this.advance(); // consume '\'
    const startRange = lambdaToken.range;

    // Expect parameter (identifier)
    if (!this.check(TokenType.Identifier)) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected parameter after "\\"', DiagnosticSeverity.Error);
      // Try to recover by parsing the body anyway
      const body = this.parseExpression();
      return this.makeErrorNode('Expected parameter after "\\"', {
        start: startRange.start,
        end: body ? body.range.end : startRange.end,
      }, body ?? undefined);
    }

    const paramToken = this.advance();
    const parameterRange = paramToken.range;

    // Expect dot
    if (!this.check(TokenType.Dot)) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected "." after parameter', DiagnosticSeverity.Error);
      // Try to recover by parsing the body anyway
      const body = this.parseExpression();
      if (body) {
        return {
          type: NodeType.Abstraction,
          parameter: paramToken.value,
          parameterRange,
          body,
          range: { start: startRange.start, end: body.range.end },
        };
      }
      return this.makeErrorNode('Expected "." after parameter', {
        start: startRange.start,
        end: parameterRange.end,
      });
    }

    this.advance(); // consume '.'

    // Parse body (expression extends as far right as possible)
    const body = this.parseExpression();
    if (!body) {
      const range = this.currentRange();
      this.addDiagnostic(range, 'Expected expression in lambda body', DiagnosticSeverity.Error);
      return this.makeErrorNode('Expected expression in lambda body', {
        start: startRange.start,
        end: this.previousRange().end,
      });
    }

    return {
      type: NodeType.Abstraction,
      parameter: paramToken.value,
      parameterRange,
      body,
      range: { start: startRange.start, end: body.range.end },
    };
  }

  /**
   * Parse parenthesized expression: (M)
   */
  private parseParenthesized(): ExpressionNode {
    const openParen = this.advance(); // consume '('
    const startRange = openParen.range;

    const expr = this.parseExpression();
    if (!expr) {
      this.addDiagnostic(startRange, 'Expected expression after "("', DiagnosticSeverity.Error);
      // Check for closing paren anyway
      if (this.check(TokenType.RParen)) {
        const closeParen = this.advance();
        return this.makeErrorNode('Empty parentheses', {
          start: startRange.start,
          end: closeParen.range.end,
        });
      }
      return this.makeErrorNode('Expected expression after "("', startRange);
    }

    if (!this.check(TokenType.RParen)) {
      this.addDiagnostic(
        { start: expr.range.end, end: expr.range.end },
        'Expected closing ")"',
        DiagnosticSeverity.Error
      );
      // Return what we have with extended range
      return {
        ...expr,
        range: { start: startRange.start, end: expr.range.end },
      };
    }

    const closeParen = this.advance(); // consume ')'

    // Preserve the expression but update range to include parens
    return {
      ...expr,
      range: { start: startRange.start, end: closeParen.range.end },
    };
  }

  // Helper methods

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current] || {
      type: TokenType.EOF,
      value: '',
      range: this.previousRange(),
    };
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.tokens[this.current - 1];
  }

  private currentRange(): SourceRange {
    return this.peek().range;
  }

  private previousRange(): SourceRange {
    if (this.current > 0) {
      return this.tokens[this.current - 1].range;
    }
    return { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
  }

  private makeErrorNode(message: string, range: SourceRange, partial?: ExpressionNode): ErrorNode {
    return {
      type: NodeType.Error,
      message,
      range,
      partial,
    };
  }

  private addDiagnostic(range: SourceRange, message: string, severity: DiagnosticSeverity): void {
    this.diagnostics.push({ range, message, severity });
  }
}

/**
 * Convenience function to parse source
 */
export function parse(source: string): ParseResult {
  const parser = new Parser(source);
  return parser.parse();
}
