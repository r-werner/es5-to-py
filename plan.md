## **ES5 Subset → Python Transpiler: Refined Plan (Scope-Correct and Implementation-Ready)**

This document is a scope-correct, implementation-ready blueprint for a technology demo transpiler that converts a small, ES5-like subset into executable Python. No code is included here; this is the foundation for the next phase’s detailed design.

### **1. Scope: What’s In, What’s Out (ES5 subset for the demo)**

- **File structure:** Source files contain zero or more `function` declarations. For the demo, top-level statements other than functions are out of scope.
- **Functions:** `function name(params) { body }` with basic parameters (no defaults, no destructuring). Nested function declarations inside functions are allowed and should generate nested Python `def`.
- **Statements (inside function bodies):**
  - Variable declarations: `var a`, `var a = expr`, multiple declarators with commas
  - Assignments: `=`, `+=`, `-=`, `*=`, `/=`, `%=` to variables, member, or indexed targets
  - Expression statements
  - Conditionals: `if (...) { ... }`, `else if (...) { ... }`, `else { ... }`
  - Switch: `switch (expr) { case E: ... default: ... }` (requires `break` semantics)
  - Loops: `while (...) { ... }`, C-style `for(init; test; update) { ... }`, `for (x in expr) { ... }`
  - `break` (loops and switch)
  - `continue` (loops only)
  - `return` (with/without expression)
  - `throw expr`
- **Expressions:**
  - Ternary `cond ? a : b`
  - Logical `&&`, `||`
  - Comparison `<`, `<=`, `>`, `>=`, `==`, `===`, `!=`, `!==`
  - Arithmetic `+`, `-`, `*`, `/`, `%`
  - Member and index access: `obj.prop`, `obj[expr]`, and call expressions
  - Unary: `!`, `-`, `+`, `typeof`, `delete`
  - Literals: string, number, boolean, `null`, regex literal `/.../flags`
  - Arrays `[ ... ]`, objects `{ key: value, ... }` (property keys restricted to identifiers for the demo)
  - Constructor calls: `new Date(...)` supported; other constructors are out of scope

Out of scope (fail fast with explicit errors): `this`, prototypes, classes, `let`/`const`, closures beyond lexical nesting, `try/catch/finally`, labels, `with`, `for..of`, dynamic object literal keys (string-literal or computed keys), JSON serialisation semantics, module systems, `new` for unknown constructors, `continue` inside `switch`.

### **2. Parsing and Source AST**

- The transpiler operates on an ESTree-compatible AST of ES5-like source. Use the `acorn` parser configured for ES5: `ecmaVersion: 5`, `sourceType: 'script'`, plus `locations: true` and `ranges: true` for accurate diagnostics and code mapping during tests.
- For tests, parse code snippets with `acorn.parse` to produce the AST that feeds the transformation stage. Comments are not semantically used beyond optional validation.
- AST input is the source of truth; no source-to-source string hacks.

### **3. Target: Python AST and Code Generation**

- Build a Python AST using `@kriss-u/py-ast` node builders and unparse it to Python code. This decouples transformation from formatting and guarantees syntactically valid output.
- A small runtime library (`js_compat.py`) bridges semantic gaps (truthiness, loose equality, typeof, delete, for-in, Date, regex, console log).

### **4. Core Transformations (source → target)**

- **Program/Blocks:** Source Program becomes a Python `Module`. Each function becomes a `FunctionDef` with a stable name mapping policy (snake_case optional for the demo).
- **Variables and hoisting:** Two-pass per function: collect all `var` names (incl. those declared inside nested blocks) and emit `name = None` initializers at function top. Assignments become Python `Assign` or `AugAssign`.
- **Expressions:**
  - Arithmetic/logic/comparison map to Python equivalents. Use runtime helpers for: `==`/`!=` (loose equality) and truthiness contexts. `===`/`!==` map to `==`/`!=` directly.
  - Ternary becomes Python conditional expression.
  - Member/index: `obj[prop]` vs `obj.prop`. Object literals become dictionaries; prefer subscript access when the base is a dict or unknown. Strings/arrays use Python indexing/slicing.
  - Calls: direct mapping. Special cases handled by lookup tables (Math, String methods). `console.log` optionally maps to `print` via runtime shim.
  - Unary: `!` → `not` or wrapped via `js_truthy`; prefix `-`/`+` pass through; `typeof x` → `js_typeof(x)`; `delete` on properties/indices → `del` or `js_delete(...)` helper.
  - Regex literal `/p/flags` → `re.compile("p", flags)` via helper that maps JS flags to Python flags; unsupported flags error out.
- **Statements:**
  - If/ElseIf/Else: direct mapping; condition wrapped in `js_truthy` where needed to preserve JS truthiness.
  - While: direct mapping.
  - For (C-style): desugar to `init; while (test) { body; update; }`.
  - For-in: JS enumerates keys; Python lists enumerate values. Use `js_for_in_keys(expr)` to yield keys (dict keys, list indices, string indices) and iterate in Python.
  - Switch: transform to an internal `while True` block with nested `if/elif/else` and synthesize `break` statements so `break;` inside a case exits the switch. `continue` inside switch is unsupported (error) to avoid changing loop semantics.
  - Break: direct mapping in loops; in switch, it exits the synthesized loop used to implement switch.
  - Continue: direct mapping in loops; error if used outside loops or inside switch.
  - Return: direct mapping.
  - Throw: raise `JSException(value)` (custom runtime) to allow throwing arbitrary values.

### **5. Standard Library and Built-ins Mapping**

- **Math:** Map `Math.*` and constants to Python `math`, `random`, or built-ins; maintain an import manager to inject `import math`/`import random` as needed (see table below; rounding .5 behavior differences are noted).
- **String.prototype:** Map commonly used methods; ensure `replace` uses count=1 to mimic JS single-replacement default; `length` → `len(str)`.
- **Date:** Provide `JSDate` shim that mirrors core constructor overloads and selected instance methods; rewrite `new Date(...)` and method calls to that shim and import it.
- **Regex:** Convert regex literal tokens via a helper that translates flags and returns compiled regex objects (`re`). Unsupported flags produce a clear error.
- **Equality/Truthiness:** Route `==`/`!=` to `js_loose_eq`/`js_loose_neq`; wrap boolean contexts (if/while/logical short-circuit) with `js_truthy` to preserve JS behavior.
- **typeof/delete:** Implement `js_typeof` (JS semantics) and `js_delete` (dict key deletion, list element deletion with JS-like return value).
- **Objects/Arrays:** Object literals to Python `dict`; array literals to `list`. For property access with dot syntax, prefer subscripting when the base is a dict. Optionally ship a tiny `JSObject` wrapper to enable attribute-style access for convenience in the demo.

#### Math mapping table (subset)

| JavaScript | Python | Notes |
| :---- | :---- | :---- |
| Math.abs(x) | abs(x) | Built-in |
| Math.sqrt(x) | math.sqrt(x) | import math |
| Math.pow(x,y) | x ** y or math.pow(x,y) | ** preferred |
| Math.floor(x) | math.floor(x) | import math |
| Math.ceil(x) | math.ceil(x) | import math |
| Math.round(x) | round(x) | .5 ties differ; consider shim |
| Math.random() | random.random() | import random |
| Math.max(...) | max(...) | Built-in |
| Math.min(...) | min(...) | Built-in |
| Math.log(x) | math.log(x) | import math |
| Math.log10(x) | math.log10(x) | import math |
| Math.log2(x) | math.log2(x) | import math |
| Math.PI | math.pi | import math |
| Math.E | math.e | import math |

#### String mapping table (subset)

| JavaScript | Python | Notes |
| :---- | :---- | :---- |
| str.length | len(str) | property → built-in |
| str.charAt(i) | str[i] |  |
| str.charCodeAt(i) | ord(str[i]) |  |
| str.concat(a,...) | str + a + ... |  |
| str.indexOf(sub, start) | str.find(sub, start) | -1 semantics |
| str.lastIndexOf(sub) | str.rfind(sub) |  |
| str.slice(s,e) | str[s:e] |  |
| str.substring(s,e) | str[min(s,e):max(s,e)] | approximation |
| str.toLowerCase() | str.lower() |  |
| str.toUpperCase() | str.upper() |  |
| str.split(sep) | str.split(sep) |  |
| str.trim() | str.strip() |  |
| str.replace(a,b) | str.replace(a,b,1) | single replacement |

### **6. Runtime Library (`js_compat.py`) – Minimal but Sufficient**

Ship a small, well-scoped runtime:
- `js_truthy(x)`, `js_loose_eq(a,b)`, `js_loose_neq(a,b)` (subset sufficient for demo)
- `js_typeof(x)`, `js_delete(base, keyOrIndex)`
- `js_for_in_keys(x)` (dict keys, list indices, string indices)
- `compile_js_regex(pattern, flags)` and a flags map
- `class JSException(Exception)` to allow throwing any payload
- `class JSDate` with constructor overloads and selected methods
- Optional: `console_log(*args)` mapped from `console.log`

### **7. Error Handling Philosophy**

- Fail fast outside the declared scope: throw `UnsupportedNodeError`/`UnsupportedFeatureError` with actionable messages (node type, source location).
- Where semantics are ambiguous for the demo, prefer a small runtime helper over brittle inline code.

### **8. Implementation Plan (Phased)**

- **Phase 1: Skeleton + Core Expressions/Statements**
  - Project setup; end-to-end demo with literals/identifiers/expressions; basic assign/var/return; import manager scaffold; minimal runtime (`js_truthy`, `JSException`).
- **Phase 2: Control Flow + Hoisting + Switch**
  - If/ElseIf/Else, While; For (desugared); Break and Continue; two-pass var hoisting; Switch using `while True` wrapper and correct `break` behavior (reject `continue` in switch).
- **Phase 3: Library Mappings**
  - Math and String method mappings; `console.log` shim (optional); member/index normalization; import manager finalized.
- **Phase 4: Runtime Gaps**
  - JSDate, typeof/delete, regex literals and flags, `js_loose_eq` (narrow but correct subset), `js_for_in_keys`.
- **Phase 5: Tests + Playground**
  - Golden tests derived from the subset; execution parity checks (JS vs Python) for small snippets; simple CLI or web playground that shows source, transpiled code, and output.

### **9. Acceptance Criteria for the Demo**

- Compiles and runs representative snippets covering: arithmetic/logic, var hoisting, if/while/for, switch with break, for-in over dict/list/string, Math/String subset, regex literal use, Date basics, null/undefined equality idioms, typeof/delete, loop `continue`.
- Clear, deterministic errors for unsupported features.
- Readable Python output; imports added only when needed; runtime kept minimal.

### **10. Key Risks and Mitigations**

- **Loose equality complexity:** Restrict to common primitives first; document unsupported exotic coercions. Mitigate with tests and incremental broadening.
- **Switch fall-through and `continue`:** For the demo, require explicit `break`; reject `continue` in switch to avoid mis-semantics with the internal wrapper.
- **Member vs subscript ambiguity:** Prefer dict subscripting for object literals and unknowns; allow optional `JSObject` wrapper if needed.
- **Regex flags gaps:** Map `i`, `m`, `s` reliably; error on unsupported flags.

### **11. Next Phase Deliverables**

- Detailed visitor-by-node plan (transform rules, edge cases) and runtime API spec with exact behavior.
- Finalized test matrix mapped to the subset and acceptance criteria above.