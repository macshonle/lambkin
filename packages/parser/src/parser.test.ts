import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parse } from './parser';
import { NodeType, DiagnosticSeverity } from './types';

describe('Parser', () => {
  describe('let declarations', () => {
    it('parses simple let declaration', () => {
      const result = parse('let x := y');
      assert.strictEqual(result.program.statements.length, 1);
      const stmt = result.program.statements[0];
      assert.strictEqual(stmt.type, NodeType.LetDeclaration);
      if (stmt.type === NodeType.LetDeclaration) {
        assert.strictEqual(stmt.name, 'x');
      }
      assert.strictEqual(result.diagnostics.length, 0);
    });

    it('parses let with lambda', () => {
      const result = parse('let id := \\x. x');
      assert.strictEqual(result.diagnostics.length, 0);
      const stmt = result.program.statements[0];
      assert.strictEqual(stmt.type, NodeType.LetDeclaration);
      if (stmt.type === NodeType.LetDeclaration) {
        assert.strictEqual(stmt.name, 'id');
        assert.strictEqual(stmt.expression.type, NodeType.Abstraction);
      }
    });
  });

  describe('lambda abstractions', () => {
    it('parses simple lambda', () => {
      const result = parse('let f := \\x. x');
      const stmt = result.program.statements[0];
      if (stmt.type === NodeType.LetDeclaration) {
        const expr = stmt.expression;
        assert.strictEqual(expr.type, NodeType.Abstraction);
        if (expr.type === NodeType.Abstraction) {
          assert.strictEqual(expr.parameter, 'x');
          assert.strictEqual(expr.body.type, NodeType.Variable);
        }
      }
    });

    it('parses nested lambdas', () => {
      const result = parse('let k := \\x. \\y. x');
      assert.strictEqual(result.diagnostics.length, 0);
    });
  });

  describe('applications', () => {
    it('parses left-associative application', () => {
      const result = parse('let app := f x y');
      const stmt = result.program.statements[0];
      if (stmt.type === NodeType.LetDeclaration) {
        // f x y should be ((f x) y)
        assert.strictEqual(stmt.expression.type, NodeType.Application);
        if (stmt.expression.type === NodeType.Application) {
          assert.strictEqual(stmt.expression.left.type, NodeType.Application);
        }
      }
    });
  });

  describe('parentheses', () => {
    it('parses parenthesized expressions', () => {
      const result = parse('let x := (y)');
      assert.strictEqual(result.diagnostics.length, 0);
    });

    it('parses nested parentheses', () => {
      const result = parse('let x := ((y))');
      assert.strictEqual(result.diagnostics.length, 0);
    });
  });

  describe('comments', () => {
    it('parses comments', () => {
      const result = parse('-- this is a comment\nlet x := y');
      assert.strictEqual(result.diagnostics.length, 0);
      assert.strictEqual(result.program.statements.length, 2);
      assert.strictEqual(result.program.statements[0].type, NodeType.Comment);
    });
  });

  describe('error recovery', () => {
    it('handles missing expression after :=', () => {
      const result = parse('let x :=');
      assert.ok(result.diagnostics.length > 0);
      assert.strictEqual(
        result.diagnostics.some(d => d.severity === DiagnosticSeverity.Error),
        true
      );
    });

    it('handles missing parameter in lambda', () => {
      const result = parse('let f := \\. x');
      assert.ok(result.diagnostics.length > 0);
    });

    it('handles unclosed parenthesis', () => {
      const result = parse('let x := (y');
      assert.ok(result.diagnostics.length > 0);
    });
  });

  describe('identifiers', () => {
    it('parses numeric identifiers', () => {
      const result = parse('let 0 := \\f. \\x. x');
      assert.strictEqual(result.diagnostics.length, 0);
    });

    it('parses operator identifiers', () => {
      const result = parse('let + := \\m. \\n. m n');
      assert.strictEqual(result.diagnostics.length, 0);
    });
  });
});
