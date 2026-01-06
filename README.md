# Lambkin

Lambda Calculus evaluator and Language Server Protocol (LSP) implementation.

## Overview

Lambkin is an educational project demonstrating:
- Error-tolerant parsing (producing ASTs even for invalid/incomplete code)
- Language Server Protocol implementation
- VS Code extension development

## Syntax

### Grammar

The set of lambda terms (Λ) is defined inductively:
- **Variable**: `x ∈ Λ` (where x is a valid identifier)
- **Abstraction**: `(λx.M) ∈ Λ` (where x is a variable and M ∈ Λ)
- **Application**: `(M N) ∈ Λ` (where M, N ∈ Λ)

### Notation & Precedence

- **Application is left-associative**: `M N P` implies `((M N) P)`
- **Abstraction is greedy** (extends to the right): `λx.M N` implies `λx.(M N)`
- **Lambda symbol**: Use `\` to represent λ

### Meta-Language

- `let <NAME> := <EXPRESSION>` defines a macro (textual substitution)
- Lines starting with `--` are comments

## Example

```lambkin
-- Church Booleans
let true  := \x. \y. x
let false := \x. \y. y

let and := \p. \q. p q p
let or  := \p. \q. p p q
let not := \p. p false true

-- Church Numerals
let 0 := \f. \x. x
let 1 := \f. \x. f x
let succ := \n. \f. \x. f (n f x)
```

## Project Structure

```
lambkin/
├── packages/
│   ├── parser/     # Error-tolerant parser and AST
│   ├── server/     # Language Server (LSP)
│   └── extension/  # VS Code extension
├── examples.lambkin
├── Makefile
└── pnpm-workspace.yaml
```

## Features

### VS Code Extension

- **Syntax Highlighting**: Keywords, parameters, comments
- **Autocomplete**: Macro names and parameters in scope
- **Diagnostics**: Syntax errors and undefined references
- **Go to Definition**: Jump to macro/parameter declarations
- **Find References**: Find all uses of a symbol
- **Document Highlighting**: Highlight all occurrences of symbol under cursor
- **Formatting**: Basic indentation for multiline expressions

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm

### Installation

```bash
# Install dependencies
make install

# Build all packages
make build
```

### Development

```bash
# Watch mode (rebuild on changes)
make watch

# Run tests
make test

# Package VS Code extension
make package
```

### Using with VS Code

1. Build the project: `make build`
2. Open VS Code in the repository root
3. Press F5 to launch a new Extension Development Host
4. Open a `.lambkin` file to activate the extension

## Future Extensions

- String and integer types
- WebAssembly code generation

## License

MIT
