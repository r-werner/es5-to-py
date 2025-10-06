# ES5-to-Python Transpiler

A technology demonstration transpiler that converts a defined subset of ES5 JavaScript into executable Python code. This project showcases how JavaScript semantics can be faithfully reproduced in Python through careful AST transformation and runtime compatibility layers.

## Overview

This transpiler handles core ES5 language features while explicitly failing fast on unsupported constructs with clear error messages. It's designed as a learning tool and demonstration of compiler engineering principles, not for production JavaScript-to-Python migration.

**Current Status**: Milestone S3 complete (4/9 milestones, 44% complete)

## Features

### ✅ Currently Supported (S0-S3)

- **Literals**: String, number, boolean, null, regex patterns
- **Variables**: `var` declarations with proper `undefined` handling
- **Functions**: Function declarations with parameters (call-after-definition)
- **Operators**:
  - Arithmetic: `+`, `-`, `*`, `/`, `%`, unary `+`, unary `-`
  - Comparison: `<`, `<=`, `>`, `>=`, `==`, `===`, `!=`, `!==`
  - Logical: `&&`, `||`, `!`
  - Assignment: `=`, `+=`, `-=`, `*=`, `/=`, `%=`
- **Expressions**: Ternary (`? :`), member access, array literals, object literals
- **Type Coercion**: Full JavaScript ToNumber semantics
- **Runtime Compatibility**: `undefined`, `NaN`, `Infinity`, truthiness, strict equality

### 🚧 In Development (S4-S9)

- Control flow: `if`/`else`, `while`, `for`, `for-in`, `switch`, `break`, `continue`
- Built-in methods: Math, String, Array operations
- Type operators: `typeof`, `delete`
- Date handling, regex operations
- Enhanced CLI and test harness

### ❌ Out of Scope

- `this`, prototypes, classes, `let`/`const`
- Closures with mutable captured variables
- `try`/`catch`/`finally`
- Module systems (ES6/CommonJS)
- Advanced ES6+ features

See [CLAUDE.md](CLAUDE.md) for the complete feature matrix.

## Quick Start

### Prerequisites

- **Node.js** ≥ 16 (for TypeScript transpiler)
- **Python** ≥ 3.8 (for runtime and execution)
- **npm** (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd es5-to-py

# Install dependencies
npm install
```

### Build

```bash
# Compile TypeScript to JavaScript
npm run build
```

### Usage

**Basic transpilation:**
```bash
node dist/cli.js input.js
```

**Example:**
```bash
# Create a sample JavaScript file
cat > example.js << 'EOF'
var x = 5;
var y = 10;

function add(a, b) {
  return a + b;
}

var result = x + y;
EOF

# Transpile to Python
node dist/cli.js example.js > example.py

# Run the generated Python
python3 example.py
```

**Output:**
```python
from runtime.js_compat import js_add
x = 5
y = 10
def add(a, b):
    return js_add(a, b)
result = js_add(x, y)
```

## Project Structure

```
es5-to-py/
├── src/                          # TypeScript source (transpiler)
│   ├── cli.ts                    # Command-line interface
│   ├── parser.ts                 # Acorn wrapper (ES5 → ESTree AST)
│   ├── transformer.ts            # ESTree → Python AST transformation
│   ├── generator.ts              # Python AST → source code
│   ├── import-manager.ts         # Tracks and generates import statements
│   ├── identifier-sanitizer.ts   # Scope-aware identifier mapping
│   ├── py-ast-builders.ts        # Python AST node constructors
│   └── errors.ts                 # Error types and handling
│
├── runtime/                      # Python runtime library
│   └── js_compat.py              # JavaScript semantic compatibility layer
│       ├── JSUndefined           # Sentinel for JS undefined
│       ├── js_truthy()           # JavaScript truthiness
│       ├── js_strict_eq()        # Strict equality (===)
│       ├── js_to_number()        # ToNumber coercion
│       ├── js_add/sub/mul/...    # Arithmetic with JS semantics
│       └── More runtime helpers...
│
├── tests/                        # Test suites
│   ├── runtime/                  # Python runtime tests (pytest)
│   ├── pipeline/                 # Infrastructure tests (vitest)
│   ├── s2/                       # S2: Expressions tests
│   └── s3/                       # S3: Assignments/Functions tests
│
├── docs/                         # Documentation
│   └── specs/                    # Milestone specifications
│       ├── INDEX.md              # Roadmap and dependency graph
│       ├── S0_foundations.md     # Runtime core
│       ├── S1_pipeline.md        # Transpiler skeleton
│       ├── S2_expressions_i.md   # Literals, operators, expressions
│       ├── S3_assignment_functions.md  # Variables, assignments, functions
│       └── S4-S9_*.md            # Future milestones
│
├── CLAUDE.md                     # AI assistant guidance (high-level)
├── IMPLEMENTATION.md             # Detailed implementation notes
└── plan.md                       # Complete transformation rules
```

## Architecture

The transpiler uses a **three-stage pipeline**:

```
JavaScript Source
       ↓
   [1. Parse]     ← Acorn (ES5 mode) → ESTree AST
       ↓
  [2. Transform]  ← Visitor pattern → Python AST (py-ast format)
       ↓
  [3. Generate]   ← py-ast unparse → Python Source
```

### Key Design Decisions

1. **Explicit over Implicit**: Fail fast with clear errors rather than silently producing incorrect code
2. **Semantic Fidelity**: Use runtime helpers to match JavaScript behavior exactly
3. **Subscript-First**: Always use `obj['prop']` for member access to avoid Python attribute shadowing
4. **Identity-Based Equality**: `===` uses Python `is` for `null`/`undefined`, custom function for others
5. **No Hoisting**: Functions must be called after definition (simplified scoping model)

### Critical Correctness Requirements

These invariants apply across **all** transformations:

| Requirement | JS | Python |
|-------------|-------|--------|
| **null vs undefined** | `null` / `undefined` | `None` / `JSUndefined` |
| **Uninitialized vars** | `var x;` → `undefined` | `x = JSUndefined` |
| **Bare return** | `return;` → `undefined` | `return JSUndefined` |
| **Member access** | `obj.prop` | `obj['prop']` |
| **Strict equality** | `a === b` | `js_strict_eq(a, b)` |
| **Arithmetic** | `'5' + 2` → `'52'` | `js_add('5', 2)` → `'52'` |
| **Boolean toString** | `'x' + true` → `'xtrue'` | `js_add('x', True)` → `'xtrue'` |
| **Logical operators** | `a && b` (returns `b` or `a`) | `(b if js_truthy(...) else a)` |

## Development

### Running Tests

```bash
# Run all TypeScript tests (vitest)
npm test

# Run specific test file
npm test -- test_functions

# Run Python runtime tests (pytest - if installed)
python3 -m pytest tests/runtime/ -v
```

**Current Test Coverage**: 80/80 tests passing (100%)

### Development Workflow

1. **Read the spec**: Start with `docs/specs/INDEX.md` to understand the roadmap
2. **Pick a milestone**: Each spec (S0-S9) is self-contained
3. **Implement visitors**: Add transformation logic in `src/transformer.ts`
4. **Add runtime helpers**: Extend `runtime/js_compat.py` as needed
5. **Write tests**: Add tests in `tests/<milestone>/`
6. **Update docs**: Mark spec complete in `docs/specs/INDEX.md`

### Code Style

- **TypeScript**: Use the existing visitor pattern in `transformer.ts`
- **Python**: Type hints required, docstrings for all public functions
- **DRY**: Use helper methods like `runtimeCall()`, `jsTruthyCall()`
- **Errors**: Clear messages with error codes (e.g., `E_UNSUPPORTED_NODE`)

### Adding a New Transformation

Example: Adding support for `while` loops (S4)

```typescript
// In src/transformer.ts
visitWhileStatement(node: any): any {
  const test = this.jsTruthyCall(this.visitNode(node.test));
  const body = this.visitBlockStatement(node.body);

  return PyAST.While(test, body, []);
}
```

Register in `getVisitor()`:
```typescript
case 'WhileStatement': return this.visitWhileStatement;
```

## Roadmap

| Milestone | Status | Description | Estimated Effort |
|-----------|--------|-------------|------------------|
| S0: Foundations | ✅ Complete | Runtime core, JSUndefined, js_truthy | 1-2 days |
| S1: Pipeline | ✅ Complete | Parser, transformer scaffold, CLI | 2-3 days |
| S2: Expressions I | ✅ Complete | Literals, operators, ternary | 3-4 days |
| S3: Assignments + Functions | ✅ Complete | Variables, assignments, functions | 3-4 days |
| S4: Control Flow I | 🚧 Next | if/else, while, break/continue | 2-3 days |
| S5: For + Sequence | ⏳ Planned | C-style for loops, ++/-- | 3-4 days |
| S6: Switch + For-in | ⏳ Planned | Switch statements, for-in loops | 3-4 days |
| S7: Library + Methods | ⏳ Planned | Math, String, Array methods | 3-4 days |
| S8: Regex + Type Ops | ⏳ Planned | Regex, typeof, delete | 3-4 days |
| S9: CLI/Tests/Docs | ⏳ Planned | Enhanced CLI, golden tests | 4-5 days |

**Total Estimated Effort**: 28-35 days (single developer, sequential)

See [docs/specs/INDEX.md](docs/specs/INDEX.md) for the complete dependency graph.

## Examples

### Arithmetic with Type Coercion

**JavaScript:**
```javascript
var x = '5' + 3;    // String concatenation
var y = '5' - 3;    // Numeric subtraction
var z = '5' * 2;    // Numeric multiplication
var w = null + 10;  // null → 0
```

**Generated Python:**
```python
from runtime.js_compat import js_add, js_sub, js_mul
x = js_add('5', 3)      # '53'
y = js_sub('5', 3)      # 2
z = js_mul('5', 2)      # 10
w = js_add(None, 10)    # 10
```

### Function Declarations

**JavaScript:**
```javascript
function greet(name) {
  return 'Hello, ' + name;
}

var message = greet('World');
```

**Generated Python:**
```python
from runtime.js_compat import js_add
def greet(name):
    return js_add('Hello, ', name)

message = greet('World')  # 'Hello, World'
```

### Logical Operators (Return Operands)

**JavaScript:**
```javascript
var x = 'foo' && 'bar';  // Returns 'bar'
var y = null || 5;       // Returns 5
```

**Generated Python:**
```python
from runtime.js_compat import js_truthy
x = ('bar' if js_truthy((__js_tmp1 := 'foo')) else __js_tmp1)  # 'bar'
y = (__js_tmp2 if js_truthy((__js_tmp2 := None)) else 5)        # 5
```

## Testing

### Test Categories

1. **Runtime Tests** (`tests/runtime/`): Python unit tests for `js_compat.py`
2. **Pipeline Tests** (`tests/pipeline/`): Infrastructure and basic transformation tests
3. **Milestone Tests** (`tests/s2/`, `tests/s3/`): Feature-specific acceptance tests
4. **Negative Tests**: Verify unsupported features fail with clear errors

### Writing Tests

**TypeScript (vitest):**
```typescript
test('Function with parameters', () => {
  const { python } = transpile('function add(a, b) { return a + b; }');
  expect(python).toContain('def add(a, b):');
  expect(python).toContain('return js_add(a, b)');
});
```

**Python (pytest):**
```python
def test_boolean_string_concat(self):
    """Booleans concatenate as 'true'/'false' in JS"""
    assert js_add('x', True) == 'xtrue'
    assert js_add('x', False) == 'xfalse'
```

## Troubleshooting

### Common Issues

**"Unsupported node type: CallExpression"**
- CallExpression is deferred to S7. Workaround: inline the expression or wait for S7.

**"E_VAR_DESTRUCTURE: Destructuring in variable declarations is not supported"**
- Use simple variable names: `var x = value;` not `var {x} = obj;`

**"Module 'runtime.js_compat' not found"**
- Ensure `runtime/` directory is in Python's path when running transpiled code
- Run from project root or add to `PYTHONPATH`

### Debugging

1. **View the AST**: Use `console.log(jsAst)` in `cli.ts` after parsing
2. **Check Python AST**: Log `pythonAst` before unparsing
3. **Runtime issues**: Add print statements in `runtime/js_compat.py`
4. **Enable verbose mode**: (S9 feature, coming soon)

## Contributing

This is a technology demonstration project. Contributions are welcome for:

- Implementing milestone specs (S4-S9)
- Improving test coverage
- Fixing bugs in existing features
- Enhancing error messages
- Documentation improvements

**Development Guidelines:**

1. Read the relevant spec in `docs/specs/` before starting
2. Follow the existing code style and patterns
3. Add tests for all new features
4. Update `docs/specs/INDEX.md` when completing milestones
5. Ensure all tests pass before submitting changes

## References

- **JavaScript Spec**: ES5 (ECMAScript 5.1) - https://262.ecma-international.org/5.1/
- **Parser**: Acorn - https://github.com/acornjs/acorn
- **Python AST**: py-ast - https://github.com/orsinium-labs/py-ast
- **ESTree Spec**: https://github.com/estree/estree

## License

[Add your license here]

## Acknowledgments

This project demonstrates compiler engineering techniques and JavaScript-to-Python semantic mapping. It's inspired by real transpilers like Babel and TypeScript, adapted for educational purposes.

---

**Questions?** Check the [docs/specs/](docs/specs/) directory for detailed specifications, or see [CLAUDE.md](CLAUDE.md) for architectural guidance.
