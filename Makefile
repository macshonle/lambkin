# Makefile for Lambkin - Lambda Calculus LSP
# Compatible with MacOS (Bash 3.2.57) and Linux

.PHONY: all install build clean watch test lint package help

# Default target
all: install build

# Install dependencies
install:
	pnpm install

# Build all packages
build:
	pnpm run build

# Clean all build artifacts
clean:
	pnpm run clean
	rm -rf node_modules
	rm -rf packages/*/node_modules
	rm -rf packages/*/dist

# Watch for changes and rebuild
watch:
	pnpm run watch

# Run tests
test:
	pnpm run test

# Run linting
lint:
	pnpm run lint

# Package VS Code extension
package: build
	pnpm run package

# Development: install and build
dev: install build

# Help
help:
	@echo "Lambkin - Lambda Calculus LSP"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all       - Install dependencies and build (default)"
	@echo "  install   - Install dependencies with pnpm"
	@echo "  build     - Build all packages"
	@echo "  clean     - Remove all build artifacts and node_modules"
	@echo "  watch     - Watch for changes and rebuild"
	@echo "  test      - Run tests"
	@echo "  lint      - Run linting"
	@echo "  package   - Package VS Code extension"
	@echo "  dev       - Install and build for development"
	@echo "  help      - Show this help message"
