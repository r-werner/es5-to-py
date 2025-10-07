# ES5-to-Python Transpiler

Convert a defined subset of ES5 JavaScript to executable Python code.

## 🎯 Overview

This is a **technology demonstration** transpiler that converts a carefully-defined subset of ES5 JavaScript into semantically-equivalent Python 3.8+ code. It handles core language features while explicitly failing fast on unsupported constructs.

## ✨ Features

- **Semantic Correctness**: Preserves JavaScript semantics including truthiness, loose/strict equality, type coercion, and operator precedence
- **Runtime Library**: Bridges semantic gaps (e.g., `undefined` vs `null`, `typeof`, arithmetic coercion)
- **Clear Error Messages**: Fails fast with actionable error codes and source location pointers
- **Production-Ready**: 71+ unit tests, golden test suite, type-safe TypeScript implementation

## 📋 Requirements

- **Node.js**: 18 LTS or higher
- **Python**: 3.8 or higher (walrus operator support required)

## 🚀 Installation

```bash
npm install
npm run build
```

## 💻 Usage

```bash
# Basic transpilation (output to stdout)
es5-to-py input.js

# Write to file
es5-to-py input.js -o output.py

# Transpile and execute immediately
es5-to-py input.js --run

# Show AST and debug information
es5-to-py input.js --verbose

# Get help
es5-to-py --help
```

## 📦 Supported ES5 Subset

### ✅ Supported Features

**Core Language**:
- Function declarations (nested, with hoisting)
- Variables: `var` with hoisting and proper initialization
- Literals: string, number, boolean, `null`, regex (`/.../flags`)
- Arrays `[]` and objects `{}` (identifier and string-literal keys only)
- Member access: `obj.prop` and `obj['prop']`
- Property access: `.length` for arrays and strings
- `new Date()` constructor

**Operators**:
- Arithmetic: `+`, `-`, `*`, `/`, `%` (with ToNumber coercion)
- Comparison: `<`, `<=`, `>`, `>=`
- Equality: `===`, `!==` (strict), `==`, `!=` (loose, primitives only)
- Logical: `&&`, `||` (returns operands, not booleans)
- Unary: `!`, `-`, `+`, `typeof`, `delete`
- Assignment: `=`, `+=`, `-=`, `*=`, `/=`, `%=`
- Update: `++`, `--` (in for-update clause)
- Ternary: `condition ? ifTrue : ifFalse`

**Statements**:
- Variable declarations: `var x = 5;`
- Assignments: `x = 10;`, `x += 5;`
- Control flow: `if`/`else`, `while`, `for` (C-style), `for-in`
- Switch/case with strict equality and fall-through detection
- `break`, `continue`, `return`, `throw`
- Expression statements

**Standard Library**:
- `Math.*`: sqrt, pow, abs, floor, ceil, round, random, min, max, etc.
- String methods: charAt, charCodeAt, substring, indexOf, toUpperCase, toLowerCase, replace (single), split
- Array methods: push, pop
- `console.log()`
- `Date.now()`
- Regex: literals `/.../flags` with `.test()` and limited `String.replace()` support; flags `i`, `m`, `s` supported

### ❌ Not Supported

The following features are **intentionally not supported** and will produce clear error messages:

- `this`, prototypes, classes
- `let`, `const`
- Closures (captured variables are read-only)
- `try`/`catch`/`finally`
- Operators: `new` (except `Date`), `in`, `instanceof`
- Bitwise operators
- Most array/object methods (map, filter, reduce, forEach, etc.)
- Computed object keys
- Destructuring
- Spread operator
- Template literals
- Arrow functions
- Async/await, Promises
- Getters/setters

## 🔧 JavaScript-to-Python Semantic Mappings

### Critical Differences

1. **`undefined` vs `null`**:
   - JavaScript `undefined` → Python `JSUndefined` (sentinel object)
   - JavaScript `null` → Python `None`
   - Uninitialized variables: `var x;` → `x = JSUndefined`

2. **Truthiness**:
   - Falsy values: `''`, `0`, `None`, `JSUndefined`, `NaN`
   - Truthy values: `[]`, `{}`, non-empty strings, non-zero numbers

3. **Arithmetic Operators**:
   - `+` handles both number addition AND string concatenation (via `js_add()`)
   - `-`, `*`, `/`, `%` perform ToNumber coercion (via `js_sub()`, `js_mul()`, `js_div()`, `js_mod()`)
   - `%` uses JavaScript remainder semantics (dividend sign), not Python modulo
   - **Augmented assignments** (`+=`, `-=`, `*=`, `/=`, `%=`) use the same runtime helpers:
     - `x += y` → `x = js_add(x, y)` (handles both string concat and numeric addition)
     - `x -= y` → `x = js_sub(x, y)` (ToNumber coercion on both operands)
     - `x *= y` → `x = js_mul(x, y)` (ToNumber coercion on both operands)
     - Similar for `/=` and `%=`

4. **Logical Operators**:
   - `a && b` returns `b` if `a` is truthy, else `a` (not a boolean!)
   - `a || b` returns `a` if `a` is truthy, else `b`
   - Implemented with Python walrus operator for single-evaluation

5. **Strict Equality**:
   - `===` and `!==` use identity checks for objects/arrays
   - Primitives compared by value

## 📚 Examples

### Basic Variables and Functions

**JavaScript**:
```javascript
var x = 5;
var y = 10;

function add(a, b) {
  return a + b;
}

var result = add(x, y);
```

**Python** (generated):
```python
from runtime.js_compat import js_add

x = 5
y = 10

def add(a, b):
    return js_add(a, b)

result = js_add(x, y)
```

### Uninitialized Variables

**JavaScript**:
```javascript
var x;
var y = 5;
```

**Python** (generated):
```python
from runtime.js_compat import JSUndefined

x = JSUndefined
y = 5
```

### Augmented Assignment

**JavaScript**:
```javascript
var x = 10;
x += 5;
x *= 2;
```

**Python** (generated):
```python
from runtime.js_compat import js_add, js_mul

x = 10
x = js_add(x, 5)
x = js_mul(x, 2)
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run golden tests (output comparison)
npm run test:golden

# Run tests in watch mode
npm test:watch
```

## ⚠️ Known Limitations

1. **Python ≥ 3.8 required**: Walrus operator (`:=`) is mandatory for logical operator semantics
2. **Member access**: Always uses subscript notation (`obj['prop']`) to avoid attribute shadowing
3. **Closures**: Nested functions work, but captured variables are read-only (modifications not propagated)
4. **Regex differences**: JavaScript regex flags `g`, `y`, `u` not fully supported; Python `re` module limitations
5. **Loose equality on objects**: `==` with objects/arrays throws error (use `===` instead)
6. **Switch fall-through**: Consecutive empty cases allowed; non-empty cases require explicit `break`

## 📖 Error Codes

| Code | Description | Workaround |
|------|-------------|------------|
| `E_UNSUPPORTED_NODE` | AST node type not implemented | Check supported subset |
| `E_UNSUPPORTED_FEATURE` | Feature outside ES5 subset | Use alternative approach |
| `E_PARAM_DESTRUCTURE` | Destructuring parameters not supported | Use simple identifiers |

See `docs/ERROR_CODES.md` for complete list.

## 🗺️ Project Status

This transpiler is implemented in phases:

- ✅ **S0**: Foundations + Runtime Core
- ✅ **S1**: Pipeline Skeleton
- ✅ **S2**: Core Expressions I
- ✅ **S3**: Assignment + Functions
- ✅ **S4**: Control Flow (if/else, while, break/continue)
- ✅ **S5**: For Loops + Update Expressions
- ✅ **S6**: Switch + For-in
- ✅ **S7**: Library + Methods
- ✅ **S8**: Regex + Type Operators + Loose Equality
- ✅ **S9**: CLI/Test Harness/Docs

**Current progress: 9/9 specs complete (100%)** 🎉

## 📂 Project Structure

```
es5-to-py/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── parser.ts           # JavaScript parser (acorn wrapper)
│   ├── transformer.ts      # AST transformer (JS → Python)
│   ├── generator.ts        # Python code generator (py-ast wrapper)
│   ├── import-manager.ts   # Import statement manager
│   ├── identifier-mapper.ts # Identifier sanitization
│   ├── py-ast-builders.ts  # Python AST node builders
│   └── errors.ts           # Error classes
├── runtime/
│   └── js_compat.py        # Python runtime library
├── tests/
│   ├── s2/, s3/            # Spec-specific unit tests
│   ├── golden/             # Golden output tests
│   └── pipeline/           # Integration tests
└── docs/
    └── specs/              # Implementation specs
```

## 🤝 Contributing

This is a technology demonstration project. See `docs/specs/INDEX.md` for implementation roadmap and `CLAUDE.md` for development guidelines.

## 📄 License

MIT

## 🙏 Acknowledgments

- Built with [acorn](https://github.com/acornjs/acorn) (JavaScript parser)
- Python AST generation via [@kriss-u/py-ast](https://github.com/Kriss-Kross33/py-ast)
- Inspired by real-world JavaScript-to-Python migration challenges
