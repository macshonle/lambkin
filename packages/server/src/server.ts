#!/usr/bin/env node

import {
  createConnection,
  TextDocuments,
  Diagnostic as LspDiagnostic,
  DiagnosticSeverity as LspDiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Location,
  Range,
  Position,
  Hover,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentFormattingParams,
  TextEdit,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  parse,
  analyze,
  findDefinitionAt,
  findReferencesAt,
  getCompletions,
  getHoverInfo,
  ProgramNode,
  ParseResult,
  DiagnosticSeverity,
  NodeType,
  LetDeclarationNode,
} from '@lambkin/parser';

// Create connection using stdio
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Cached parse results
const parseCache = new Map<string, { version: number; result: ParseResult }>();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ['\\', '.'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      documentFormattingProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Lambkin Language Server initialized');
});

// Document change handler
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

/**
 * Parse and validate a document
 */
function validateDocument(document: TextDocument): void {
  const uri = document.uri;
  const text = document.getText();
  const version = document.version;

  // Parse the document
  const result = parse(text);

  // Cache the result
  parseCache.set(uri, { version, result });

  // Analyze for semantic errors
  const { diagnostics: semanticDiagnostics } = analyze(result.program);

  // Convert diagnostics to LSP format
  const diagnostics: LspDiagnostic[] = [];

  // Add parse diagnostics
  for (const diag of result.diagnostics) {
    diagnostics.push({
      range: {
        start: { line: diag.range.start.line - 1, character: diag.range.start.column },
        end: { line: diag.range.end.line - 1, character: diag.range.end.column },
      },
      message: diag.message,
      severity: mapSeverity(diag.severity),
      source: 'lambkin',
    });
  }

  // Add semantic diagnostics
  for (const diag of semanticDiagnostics) {
    diagnostics.push({
      range: {
        start: { line: diag.range.start.line - 1, character: diag.range.start.column },
        end: { line: diag.range.end.line - 1, character: diag.range.end.column },
      },
      message: diag.message,
      severity: mapSeverity(diag.severity),
      source: 'lambkin',
    });
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

function mapSeverity(severity: DiagnosticSeverity): LspDiagnosticSeverity {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return LspDiagnosticSeverity.Error;
    case DiagnosticSeverity.Warning:
      return LspDiagnosticSeverity.Warning;
    case DiagnosticSeverity.Information:
      return LspDiagnosticSeverity.Information;
    case DiagnosticSeverity.Hint:
      return LspDiagnosticSeverity.Hint;
  }
}

/**
 * Get cached parse result for a document
 */
function getParseResult(uri: string): ProgramNode | undefined {
  const cached = parseCache.get(uri);
  if (cached) {
    return cached.result.program;
  }

  // Try to parse on demand
  const document = documents.get(uri);
  if (document) {
    const result = parse(document.getText());
    parseCache.set(uri, { version: document.version, result });
    return result.program;
  }

  return undefined;
}

/**
 * Completion handler
 */
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const program = getParseResult(params.textDocument.uri);
  if (!program) return [];

  // Convert to 1-indexed for our parser
  const line = params.position.line + 1;
  const column = params.position.character;

  const completions = getCompletions(program, line, column);

  return completions.map((def) => ({
    label: def.name,
    kind: def.kind === 'macro' ? CompletionItemKind.Function : CompletionItemKind.Variable,
    detail: def.kind === 'macro' ? 'macro' : 'parameter',
  }));
});

/**
 * Hover handler
 */
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const program = getParseResult(params.textDocument.uri);
  if (!program) return null;

  const line = params.position.line + 1;
  const column = params.position.character;

  const info = getHoverInfo(program, line, column);
  if (!info) return null;

  let content: string;
  if (info.kind === 'macro') {
    // Find the macro definition to show its expression
    const def = findMacroDefinition(program, info.name);
    if (def) {
      content = `**macro** \`${info.name}\``;
    } else {
      content = `**macro** \`${info.name}\``;
    }
  } else {
    content = `**parameter** \`${info.name}\``;
  }

  return {
    contents: { kind: 'markdown', value: content },
  };
});

function findMacroDefinition(program: ProgramNode, name: string): LetDeclarationNode | undefined {
  for (const stmt of program.statements) {
    if (stmt.type === NodeType.LetDeclaration) {
      const letDecl = stmt as LetDeclarationNode;
      if (letDecl.name === name) {
        return letDecl;
      }
    }
  }
  return undefined;
}

/**
 * Go to definition handler
 */
connection.onDefinition((params: TextDocumentPositionParams): Location | null => {
  const program = getParseResult(params.textDocument.uri);
  if (!program) return null;

  const line = params.position.line + 1;
  const column = params.position.character;

  const def = findDefinitionAt(program, line, column);
  if (!def) return null;

  return {
    uri: params.textDocument.uri,
    range: {
      start: { line: def.range.start.line - 1, character: def.range.start.column },
      end: { line: def.range.end.line - 1, character: def.range.end.column },
    },
  };
});

/**
 * Find references handler
 */
connection.onReferences((params): Location[] => {
  const program = getParseResult(params.textDocument.uri);
  if (!program) return [];

  const line = params.position.line + 1;
  const column = params.position.character;

  const ranges = findReferencesAt(program, line, column);

  return ranges.map((range) => ({
    uri: params.textDocument.uri,
    range: {
      start: { line: range.start.line - 1, character: range.start.column },
      end: { line: range.end.line - 1, character: range.end.column },
    },
  }));
});

/**
 * Document highlight handler (highlight all occurrences of symbol under cursor)
 */
connection.onDocumentHighlight((params: TextDocumentPositionParams): DocumentHighlight[] => {
  const program = getParseResult(params.textDocument.uri);
  if (!program) return [];

  const line = params.position.line + 1;
  const column = params.position.character;

  const ranges = findReferencesAt(program, line, column);

  return ranges.map((range) => ({
    range: {
      start: { line: range.start.line - 1, character: range.start.column },
      end: { line: range.end.line - 1, character: range.end.column },
    },
    kind: DocumentHighlightKind.Read,
  }));
});

/**
 * Document formatting handler
 */
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const formatted = formatDocument(text, params.options.tabSize);

  // Return a single edit replacing the entire document
  return [
    {
      range: {
        start: { line: 0, character: 0 },
        end: { line: document.lineCount, character: 0 },
      },
      newText: formatted,
    },
  ];
});

/**
 * Format a lambkin document
 * Formatting is relaxed - main concern is indentation in multiline parentheses
 */
function formatDocument(text: string, tabSize: number = 2): string {
  const lines = text.split('\n');
  const result: string[] = [];
  const indent = ' '.repeat(tabSize);

  let parenDepth = 0;
  let inMultilineExpr = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Preserve comment lines as-is (just trim trailing whitespace)
    if (line.trimStart().startsWith('--')) {
      result.push(line.trimEnd());
      continue;
    }

    // Preserve empty lines
    if (line.trim() === '') {
      result.push('');
      continue;
    }

    // Count parens to determine if we're in a multiline expression
    const prevDepth = parenDepth;

    // Check for closing parens at start of line to adjust indent
    const trimmed = line.trimStart();
    const leadingClosingParens = trimmed.match(/^\)+/)?.[0]?.length || 0;

    // Calculate effective depth for this line
    let lineIndentDepth = parenDepth - leadingClosingParens;
    if (lineIndentDepth < 0) lineIndentDepth = 0;

    // Count parens in this line
    for (const ch of line) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
    }

    // Handle let declarations
    if (trimmed.startsWith('let ')) {
      // Let declarations start at column 0
      result.push(trimmed.trimEnd());
    } else if (inMultilineExpr || prevDepth > 0) {
      // Continuation line - add indent based on paren depth
      result.push(indent.repeat(lineIndentDepth) + trimmed.trimEnd());
    } else {
      // Normal line
      result.push(trimmed.trimEnd());
    }

    // Track if we're in a multiline expression
    inMultilineExpr = parenDepth > 0;
  }

  return result.join('\n');
}

// Listen for document changes
documents.listen(connection);

// Start the connection
connection.listen();
