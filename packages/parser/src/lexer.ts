import { Token, TokenType, SourceLocation, SourceRange } from './types';

/**
 * Lexer for Lambda Calculus
 * Converts source code into tokens
 */
export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 0;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 0;

    while (!this.isAtEnd()) {
      const token = this.scanToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    this.tokens.push(this.makeToken(TokenType.EOF, ''));
    return this.tokens;
  }

  /**
   * Get all non-trivia tokens (for parsing)
   */
  getSignificantTokens(): Token[] {
    return this.tokens.filter(
      t => t.type !== TokenType.Whitespace &&
           t.type !== TokenType.Newline &&
           t.type !== TokenType.Comment
    );
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.pos];
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1];
  }

  private advance(): string {
    const ch = this.source[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 0;
    } else {
      this.column++;
    }
    return ch;
  }

  private currentLocation(): SourceLocation {
    return { line: this.line, column: this.column, offset: this.pos };
  }

  private makeToken(type: TokenType, value: string, startLoc?: SourceLocation): Token {
    const start = startLoc || {
      line: this.line,
      column: this.column - value.length,
      offset: this.pos - value.length
    };
    const end = this.currentLocation();
    return { type, value, range: { start, end } };
  }

  private scanToken(): Token | null {
    const startLoc = this.currentLocation();
    const ch = this.advance();

    // Whitespace (excluding newlines)
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let value = ch;
      while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r')) {
        value += this.advance();
      }
      return this.makeToken(TokenType.Whitespace, value, startLoc);
    }

    // Newline
    if (ch === '\n') {
      return this.makeToken(TokenType.Newline, ch, startLoc);
    }

    // Comment
    if (ch === '-' && this.peek() === '-') {
      let value = ch;
      value += this.advance(); // consume second '-'
      while (!this.isAtEnd() && this.peek() !== '\n') {
        value += this.advance();
      }
      return this.makeToken(TokenType.Comment, value, startLoc);
    }

    // Lambda symbol
    if (ch === '\\' || ch === 'λ') {
      return this.makeToken(TokenType.Lambda, ch, startLoc);
    }

    // Dot
    if (ch === '.') {
      return this.makeToken(TokenType.Dot, ch, startLoc);
    }

    // Assignment
    if (ch === ':' && this.peek() === '=') {
      this.advance(); // consume '='
      return this.makeToken(TokenType.Assign, ':=', startLoc);
    }

    // Parentheses
    if (ch === '(') {
      return this.makeToken(TokenType.LParen, ch, startLoc);
    }
    if (ch === ')') {
      return this.makeToken(TokenType.RParen, ch, startLoc);
    }

    // Identifier or keyword
    // Identifiers can contain letters, digits, and some symbols like +, *, _, -
    // But cannot start with - (that's a comment) or : (that's assignment)
    if (this.isIdentifierStart(ch)) {
      let value = ch;
      while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
        value += this.advance();
      }

      // Check for keywords
      if (value === 'let') {
        return this.makeToken(TokenType.Let, value, startLoc);
      }

      return this.makeToken(TokenType.Identifier, value, startLoc);
    }

    // Error: unrecognized character
    return this.makeToken(TokenType.Error, ch, startLoc);
  }

  private isIdentifierStart(ch: string): boolean {
    // Identifiers can start with letters, digits, +, *, _, but not - or :
    return /[a-zA-Z0-9_+*]/.test(ch);
  }

  private isIdentifierPart(ch: string): boolean {
    // Identifiers can contain letters, digits, _, +, *, -, but not at start for -
    // Stop at whitespace, parens, dots, backslash, newlines
    if (/[\s().\\λ:]/.test(ch)) return false;
    return /[a-zA-Z0-9_+*\-']/.test(ch);
  }
}

/**
 * Convenience function to tokenize source
 */
export function tokenize(source: string): Token[] {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}
