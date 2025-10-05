# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ES5-to-Python transpiler: Converts a defined subset of ES5 JavaScript into executable Python code. This is a technology demo that handles core language features while explicitly failing fast on unsupported constructs.

## Architecture

The transpiler uses a three-stage pipeline:

1. **Parse**: Use `acorn` parser (ES5 mode) to generate ESTree-compatible AST from JavaScript source
2. **Transform**: Convert JavaScript AST to Python AST using `@kriss-u/py-ast` node builders
3. **Generate**: Unparse Python AST to source code

### Key Components

- **Visitor/Transformer**: Maps ESTree nodes to Python AST nodes; implements two-pass var hoisting and control flow transformations
- **Import Manager**: Tracks and injects required imports (`math`, `random`, `re`) based on feature usage
- **Runtime Library (`js_compat.py`)**: Bridges semantic gaps between JavaScript and Python (truthiness, loose equality, typeof, delete, for-in, Date, regex)

## Supported ES5 Subset

**In scope:**
- Function declarations (including nested functions)
- Statements: `var`, assignments (`=`, `+=`, etc.), `if`/`else`, `while`, `for` (C-style and for-in), `switch`/`case`, `return`, `throw`, `break`
- Expressions: ternary, logical (`&&`, `||`), comparison (`<`, `<=`, `>`, `>=`, `==`, `===`, `!=`, `!==`), arithmetic, member/index access, calls, unary (`!`, `-`, `+`, `typeof`, `delete`)
- Literals: string, number, boolean, `null`, regex (`/.../flags`)
- Arrays `[]`, objects `{}` (identifier keys only)
- Constructor: `new Date()` only

**Out of scope (fail fast with errors):**
- `this`, prototypes, classes, `let`/`const`
- Closures beyond lexical nesting
- `try`/`catch`/`finally`, labels, `continue`, `with`, `for..of`
- Dynamic object literal keys
- Module systems
- `new` for unknown constructors

## Transformation Details

### Variable Hoisting
Two-pass per function: collect all `var` names (including nested blocks) and emit `name = None` initializers at function top.

### Control Flow
- **For-loops**: C-style `for(init; test; update)` desugars to `init; while (test) { body; update; }`
- **For-in**: Use `js_for_in_keys(expr)` runtime helper to enumerate dict keys, list indices, or string indices
- **Switch**: Transform to `while True` block with nested `if/elif/else`; `break` exits the loop

### Built-in Mappings

**Math**: Map `Math.*` to Python `math` module or built-ins (e.g., `Math.abs(x)` → `abs(x)`, `Math.sqrt(x)` → `math.sqrt(x)`, `Math.pow(x,y)` → `x ** y`)

**String**: Map methods to Python equivalents (e.g., `str.length` → `len(str)`, `str.toLowerCase()` → `str.lower()`, `str.replace(a,b)` → `str.replace(a,b,1)`)

**Date**: `new Date(...)` → `JSDate(...)` runtime shim with core constructor overloads and methods

**Regex**: Literal `/.../flags` → `re.compile("...", flags)` via helper that maps JS flags to Python

### Runtime Helpers (`js_compat.py`)

Must provide:
- `js_truthy(x)`: JS truthiness semantics
- `js_loose_eq(a,b)`, `js_loose_neq(a,b)`: Loose equality (`==`/`!=`)
- `js_typeof(x)`: JS typeof operator
- `js_delete(base, keyOrIndex)`: Delete dict key or list element
- `js_for_in_keys(x)`: Enumerate dict keys, list indices, string indices
- `compile_js_regex(pattern, flags)`: Convert JS regex to Python `re`
- `class JSException(Exception)`: Throw arbitrary values
- `class JSDate`: Date constructor and methods
- Optional: `console_log(*args)` for `console.log` mapping

## Error Handling

Fail fast with `UnsupportedNodeError` or `UnsupportedFeatureError` for any construct outside the defined subset. Include node type and source location in error messages.

## Implementation Phases

1. **Skeleton + Core**: Basic expressions, literals, identifiers, assignments, return statements
2. **Control Flow**: If/else, while, for (desugared), break, var hoisting, switch
3. **Library Mappings**: Math, String methods, member/index access normalization
4. **Runtime Gaps**: JSDate, typeof/delete, regex, loose equality, for-in
5. **Tests + Playground**: Golden tests, execution parity checks, CLI/web demo

## Development Notes

- Use `acorn.parse` with `{ ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true }`
- Build Python AST with `@kriss-u/py-ast` to guarantee syntactic validity
- Prefer dict subscripting for object literals; may use optional `JSObject` wrapper for attribute-style access
- Switch fall-through: require explicit `break`; treat consecutive empty cases as aliases
- See `plan.md` for complete transformation rules and edge cases
