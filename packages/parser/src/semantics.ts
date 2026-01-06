import {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  LetDeclarationNode,
  VariableNode,
  AbstractionNode,
  ApplicationNode,
  NodeType,
  Diagnostic,
  DiagnosticSeverity,
  SourceRange,
} from './types';

/**
 * Symbol definition (macro or parameter binding)
 */
export interface SymbolDefinition {
  name: string;
  range: SourceRange;
  kind: 'macro' | 'parameter';
  /** For macros, the index in the program statements */
  declarationIndex?: number;
  /** For parameters, the enclosing abstraction */
  abstraction?: AbstractionNode;
}

/**
 * Reference to a symbol
 */
export interface SymbolReference {
  name: string;
  range: SourceRange;
  definition?: SymbolDefinition;
}

/**
 * Scope for tracking variable bindings
 */
interface Scope {
  bindings: Map<string, SymbolDefinition>;
  parent: Scope | null;
}

/**
 * Semantic analysis result
 */
export interface SemanticAnalysis {
  /** All macro definitions */
  macros: Map<string, SymbolDefinition>;
  /** All symbol references (variables) */
  references: SymbolReference[];
  /** Semantic diagnostics */
  diagnostics: Diagnostic[];
}

/**
 * Analyze a program for semantic information
 */
export function analyze(program: ProgramNode): SemanticAnalysis {
  const macros = new Map<string, SymbolDefinition>();
  const references: SymbolReference[] = [];
  const diagnostics: Diagnostic[] = [];

  // First pass: collect all macro definitions
  program.statements.forEach((stmt, index) => {
    if (stmt.type === NodeType.LetDeclaration) {
      const letDecl = stmt as LetDeclarationNode;

      // Check for duplicate macro definitions
      if (macros.has(letDecl.name)) {
        diagnostics.push({
          range: letDecl.nameRange,
          message: `Macro '${letDecl.name}' is already defined`,
          severity: DiagnosticSeverity.Warning,
        });
      }

      macros.set(letDecl.name, {
        name: letDecl.name,
        range: letDecl.nameRange,
        kind: 'macro',
        declarationIndex: index,
      });
    }
  });

  // Second pass: analyze expressions and resolve references
  program.statements.forEach((stmt, index) => {
    if (stmt.type === NodeType.LetDeclaration) {
      const letDecl = stmt as LetDeclarationNode;

      // Create a scope with only macros defined before this one
      const availableMacros = new Map<string, SymbolDefinition>();
      for (const [name, def] of macros) {
        if (def.declarationIndex !== undefined && def.declarationIndex < index) {
          availableMacros.set(name, def);
        }
      }

      const scope: Scope = {
        bindings: availableMacros,
        parent: null,
      };

      analyzeExpression(letDecl.expression, scope, references, diagnostics);
    }
  });

  return { macros, references, diagnostics };
}

/**
 * Analyze an expression for references
 */
function analyzeExpression(
  expr: ExpressionNode,
  scope: Scope,
  references: SymbolReference[],
  diagnostics: Diagnostic[]
): void {
  switch (expr.type) {
    case NodeType.Variable: {
      const varNode = expr as VariableNode;
      const definition = lookupSymbol(scope, varNode.name);

      references.push({
        name: varNode.name,
        range: varNode.range,
        definition,
      });

      if (!definition) {
        diagnostics.push({
          range: varNode.range,
          message: `Unknown identifier '${varNode.name}'`,
          severity: DiagnosticSeverity.Error,
        });
      }
      break;
    }

    case NodeType.Abstraction: {
      const absNode = expr as AbstractionNode;

      // Create new scope with parameter binding
      const paramDef: SymbolDefinition = {
        name: absNode.parameter,
        range: absNode.parameterRange,
        kind: 'parameter',
        abstraction: absNode,
      };

      const innerScope: Scope = {
        bindings: new Map([[absNode.parameter, paramDef]]),
        parent: scope,
      };

      analyzeExpression(absNode.body, innerScope, references, diagnostics);
      break;
    }

    case NodeType.Application: {
      const appNode = expr as ApplicationNode;
      analyzeExpression(appNode.left, scope, references, diagnostics);
      analyzeExpression(appNode.right, scope, references, diagnostics);
      break;
    }

    case NodeType.Error:
      // Check if there's a partial expression to analyze
      if (expr.partial) {
        analyzeExpression(expr.partial, scope, references, diagnostics);
      }
      break;
  }
}

/**
 * Look up a symbol in scope chain
 */
function lookupSymbol(scope: Scope | null, name: string): SymbolDefinition | undefined {
  while (scope) {
    const def = scope.bindings.get(name);
    if (def) return def;
    scope = scope.parent;
  }
  return undefined;
}

/**
 * Find definition at a given position
 */
export function findDefinitionAt(
  program: ProgramNode,
  line: number,
  column: number
): SymbolDefinition | undefined {
  const { macros, references } = analyze(program);

  // Check if position is on a reference
  for (const ref of references) {
    if (isPositionInRange(line, column, ref.range)) {
      return ref.definition;
    }
  }

  // Check if position is on a macro name in declaration
  for (const stmt of program.statements) {
    if (stmt.type === NodeType.LetDeclaration) {
      const letDecl = stmt as LetDeclarationNode;
      if (isPositionInRange(line, column, letDecl.nameRange)) {
        return macros.get(letDecl.name);
      }
    }
  }

  return undefined;
}

/**
 * Find all references to a symbol
 */
export function findReferences(
  program: ProgramNode,
  symbolName: string
): SymbolReference[] {
  const { references } = analyze(program);
  return references.filter(ref => ref.name === symbolName);
}

/**
 * Find all references at a position (includes definition and all uses)
 */
export function findReferencesAt(
  program: ProgramNode,
  line: number,
  column: number
): SourceRange[] {
  const { macros, references } = analyze(program);
  const ranges: SourceRange[] = [];

  // Find what symbol is at this position
  let targetName: string | undefined;

  // Check references
  for (const ref of references) {
    if (isPositionInRange(line, column, ref.range)) {
      targetName = ref.name;
      break;
    }
  }

  // Check macro declarations
  if (!targetName) {
    for (const stmt of program.statements) {
      if (stmt.type === NodeType.LetDeclaration) {
        const letDecl = stmt as LetDeclarationNode;
        if (isPositionInRange(line, column, letDecl.nameRange)) {
          targetName = letDecl.name;
          break;
        }
      }
    }
  }

  // Check parameter declarations
  if (!targetName) {
    const param = findParameterAt(program, line, column);
    if (param) {
      targetName = param.name;
      // For parameters, only find references within the same abstraction
      return findParameterReferences(param.abstraction!, param.name);
    }
  }

  if (!targetName) return [];

  // Collect all ranges for this name
  // Include definition
  const macroDef = macros.get(targetName);
  if (macroDef) {
    ranges.push(macroDef.range);
  }

  // Include all references
  for (const ref of references) {
    if (ref.name === targetName) {
      ranges.push(ref.range);
    }
  }

  return ranges;
}

/**
 * Find parameter at position
 */
function findParameterAt(
  program: ProgramNode,
  line: number,
  column: number
): { name: string; abstraction: AbstractionNode } | undefined {
  for (const stmt of program.statements) {
    if (stmt.type === NodeType.LetDeclaration) {
      const result = findParameterInExpression(
        (stmt as LetDeclarationNode).expression,
        line,
        column
      );
      if (result) return result;
    }
  }
  return undefined;
}

function findParameterInExpression(
  expr: ExpressionNode,
  line: number,
  column: number
): { name: string; abstraction: AbstractionNode } | undefined {
  switch (expr.type) {
    case NodeType.Abstraction: {
      const absNode = expr as AbstractionNode;
      if (isPositionInRange(line, column, absNode.parameterRange)) {
        return { name: absNode.parameter, abstraction: absNode };
      }
      return findParameterInExpression(absNode.body, line, column);
    }
    case NodeType.Application: {
      const appNode = expr as ApplicationNode;
      return (
        findParameterInExpression(appNode.left, line, column) ||
        findParameterInExpression(appNode.right, line, column)
      );
    }
    default:
      return undefined;
  }
}

/**
 * Find all references to a parameter within an abstraction
 */
function findParameterReferences(
  abstraction: AbstractionNode,
  paramName: string
): SourceRange[] {
  const ranges: SourceRange[] = [abstraction.parameterRange];
  collectParameterReferences(abstraction.body, paramName, ranges, 0);
  return ranges;
}

function collectParameterReferences(
  expr: ExpressionNode,
  paramName: string,
  ranges: SourceRange[],
  shadowDepth: number
): void {
  switch (expr.type) {
    case NodeType.Variable: {
      const varNode = expr as VariableNode;
      if (varNode.name === paramName && shadowDepth === 0) {
        ranges.push(varNode.range);
      }
      break;
    }
    case NodeType.Abstraction: {
      const absNode = expr as AbstractionNode;
      // Check if this abstraction shadows the parameter
      const newDepth = absNode.parameter === paramName ? shadowDepth + 1 : shadowDepth;
      collectParameterReferences(absNode.body, paramName, ranges, newDepth);
      break;
    }
    case NodeType.Application: {
      const appNode = expr as ApplicationNode;
      collectParameterReferences(appNode.left, paramName, ranges, shadowDepth);
      collectParameterReferences(appNode.right, paramName, ranges, shadowDepth);
      break;
    }
  }
}

/**
 * Check if a position is within a range
 */
export function isPositionInRange(line: number, column: number, range: SourceRange): boolean {
  if (line < range.start.line || line > range.end.line) return false;
  if (line === range.start.line && column < range.start.column) return false;
  if (line === range.end.line && column >= range.end.column) return false;
  return true;
}

/**
 * Get completions at a position
 */
export function getCompletions(
  program: ProgramNode,
  line: number,
  column: number
): SymbolDefinition[] {
  const { macros } = analyze(program);
  const completions: SymbolDefinition[] = [];

  // Add all macros
  for (const def of macros.values()) {
    completions.push(def);
  }

  // Find enclosing abstractions and add their parameters
  const params = findEnclosingParameters(program, line, column);
  completions.push(...params);

  return completions;
}

/**
 * Find parameters from enclosing abstractions
 */
function findEnclosingParameters(
  program: ProgramNode,
  line: number,
  column: number
): SymbolDefinition[] {
  const params: SymbolDefinition[] = [];

  for (const stmt of program.statements) {
    if (stmt.type === NodeType.LetDeclaration) {
      const letDecl = stmt as LetDeclarationNode;
      if (isPositionInRange(line, column, letDecl.range)) {
        collectEnclosingParams(letDecl.expression, line, column, params);
      }
    }
  }

  return params;
}

function collectEnclosingParams(
  expr: ExpressionNode,
  line: number,
  column: number,
  params: SymbolDefinition[]
): void {
  if (!isPositionInRange(line, column, expr.range)) return;

  switch (expr.type) {
    case NodeType.Abstraction: {
      const absNode = expr as AbstractionNode;
      params.push({
        name: absNode.parameter,
        range: absNode.parameterRange,
        kind: 'parameter',
        abstraction: absNode,
      });
      collectEnclosingParams(absNode.body, line, column, params);
      break;
    }
    case NodeType.Application: {
      const appNode = expr as ApplicationNode;
      collectEnclosingParams(appNode.left, line, column, params);
      collectEnclosingParams(appNode.right, line, column, params);
      break;
    }
  }
}

/**
 * Get hover information at a position
 */
export function getHoverInfo(
  program: ProgramNode,
  line: number,
  column: number
): { name: string; kind: 'macro' | 'parameter'; range: SourceRange } | undefined {
  const def = findDefinitionAt(program, line, column);
  if (def) {
    return { name: def.name, kind: def.kind, range: def.range };
  }

  // Check if on a parameter
  const param = findParameterAt(program, line, column);
  if (param) {
    return {
      name: param.name,
      kind: 'parameter',
      range: param.abstraction.parameterRange,
    };
  }

  return undefined;
}
