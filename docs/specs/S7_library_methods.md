# S7: Library + Methods

**Status**: ✅ Complete (2025-10-07)
**Dependencies**: S0, S1, S2
**Estimated Effort**: 3-4 days
**Actual Effort**: < 1 day

---

## Critical Invariants (Repeated in Every Spec)

These invariants apply to **all** specs. Every feature must respect these rules:

1. **Python ≥ 3.8**: Walrus operator (`:=`) required; no fallback mode
2. **Strict equality**: Use `js_strict_eq()` for `===`; never Python `==` for object/array comparisons
3. **null vs undefined**: `None` is `null`; `JSUndefined` (singleton) is `undefined`; uninitialized vars → `JSUndefined`
4. **Member access**: Always via subscript (`obj['prop']`); exception: `.length` reads → `len()`
5. **Identifier sanitization**: `_js` suffix for reserved words; scope-aware remapping; property keys not sanitized
6. **Aliased stdlib imports**: `import math as _js_math`, `import random as _js_random`, `import re as _js_re` only
7. **Return semantics**: Bare `return` → `return JSUndefined` (NOT Python's implicit `None`)
8. **Temp naming**: `__js_tmp<n>` for temps, `__js_switch_disc_<id>` for switch discriminants

---

## Overview

This spec implements library mappings: Math methods, String methods, Date.now(), console.log(), and array methods (push/pop).

---

## Scope

### In Scope

**Math Library**:
- `Math.abs`, `Math.max`, `Math.min` → Python built-ins
- `Math.sqrt`, `Math.floor`, `Math.ceil`, etc. → `_js_math.*`
- `Math.pow(x,y)` → `x ** y`
- `Math.random()` → `_js_random.random()`
- `Math.PI` → `_js_math.pi`

**String Methods**:
- `.charAt(i)` → `str[i:i+1]` (out-of-range → empty string)
- `.charCodeAt(i)` → `js_char_code_at(str, i)` (out-of-range → NaN)
- `.substring(s,e)` → `js_substring(str, s, e)`
- `.toLowerCase()` → `str.lower()`
- `.toUpperCase()` → `str.upper()`
- `.indexOf`, `.slice`, `.split`, `.trim`, `.replace` (string arg)

**Date**:
- `Date.now()` → `js_date_now()` (milliseconds since epoch)

**Console**:
- `console.log(...)` → `console_log(...)`

**Array Methods** (minimal):
- `arr.push(x)` → `arr.append(x)` (single arg only, provably array receiver)
- `arr.pop()` → `js_array_pop(arr)` (returns JSUndefined for empty)

### Out of Scope

- Most array methods (map, filter, reduce, etc.)
- Object methods (Object.keys, etc.)
- Full Date constructor (deferred or simplified)

---

## Implementation Requirements

### 1. Runtime Helpers

**String Helpers**:
```python
def js_char_code_at(s, i):
    """charCodeAt: return NaN for out-of-range."""
    if 0 <= i < len(s):
        return ord(s[i])
    return float('nan')

def js_substring(s, start, end=None):
    """substring: clamp negatives to 0, swap if start > end."""
    if end is None:
        end = len(s)
    start = max(0, start)
    end = max(0, end)
    if start > end:
        start, end = end, start
    return s[start:end]

def js_array_pop(arr):
    """Array.pop: return JSUndefined for empty arrays."""
    if len(arr) > 0:
        return arr.pop()
    return JSUndefined

def js_date_now():
    """Date.now(): milliseconds since epoch."""
    import time as _js_time
    return int(_js_time.time() * 1000)

def console_log(*args):
    """JS-style console.log."""
    print(' '.join(str(arg) for arg in args))
```

---

### 2. CallExpression Detection

**Math Methods**:
```javascript
visitCallExpression(node) {
  // Detect Math.* calls
  if (node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'Math') {

    const method = node.callee.property.name;

    // Built-ins
    if (['abs', 'max', 'min'].includes(method)) {
      return pyAst.Call({
        func: pyAst.Name({ id: method, ctx: pyAst.Load() }),
        args: node.arguments.map(arg => this.visitNode(arg)),
        keywords: []
      });
    }

    // _js_math methods
    if (['sqrt', 'floor', 'ceil', 'log', 'log10', 'log2'].includes(method)) {
      this.importManager.addStdlib('math');
      return pyAst.Call({
        func: pyAst.Attribute({
          value: pyAst.Name({ id: '_js_math', ctx: pyAst.Load() }),
          attr: method,
          ctx: pyAst.Load()
        }),
        args: node.arguments.map(arg => this.visitNode(arg)),
        keywords: []
      });
    }

    // Math.pow → **
    if (method === 'pow') {
      return pyAst.BinOp({
        left: this.visitNode(node.arguments[0]),
        op: pyAst.Pow(),
        right: this.visitNode(node.arguments[1])
      });
    }

    // Math.random()
    if (method === 'random') {
      this.importManager.addStdlib('random');
      return pyAst.Call({
        func: pyAst.Attribute({
          value: pyAst.Name({ id: '_js_random', ctx: pyAst.Load() }),
          attr: 'random',
          ctx: pyAst.Load()
        }),
        args: [],
        keywords: []
      });
    }
  }

  // String methods (detect via member expression)
  if (node.callee.type === 'MemberExpression') {
    const method = node.callee.property.name;

    if (method === 'charAt') {
      const obj = this.visitNode(node.callee.object);
      const index = this.visitNode(node.arguments[0]);
      return pyAst.Subscript({
        value: obj,
        slice: pyAst.Slice({
          lower: index,
          upper: pyAst.BinOp({ left: index, op: pyAst.Add(), right: pyAst.Constant({ value: 1 }) }),
          step: null
        }),
        ctx: pyAst.Load()
      });
    }

    if (method === 'charCodeAt') {
      this.importManager.addRuntime('js_char_code_at');
      return pyAst.Call({
        func: pyAst.Name({ id: 'js_char_code_at', ctx: pyAst.Load() }),
        args: [this.visitNode(node.callee.object), this.visitNode(node.arguments[0])],
        keywords: []
      });
    }

    // More string methods...
  }

  // Date.now()
  if (node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'Date' &&
      node.callee.property.name === 'now') {
    this.importManager.addRuntime('js_date_now');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_date_now', ctx: pyAst.Load() }),
      args: [],
      keywords: []
    });
  }

  // console.log()
  if (node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'console' &&
      node.callee.property.name === 'log') {
    this.importManager.addRuntime('console_log');
    return pyAst.Call({
      func: pyAst.Name({ id: 'console_log', ctx: pyAst.Load() }),
      args: node.arguments.map(arg => this.visitNode(arg)),
      keywords: []
    });
  }

  // Array push/pop (with provability check)
  if (node.callee.type === 'MemberExpression') {
    const method = node.callee.property.name;

    if (method === 'push' && this.isProvablyArray(node.callee.object)) {
      if (node.arguments.length === 1) {
        return pyAst.Call({
          func: pyAst.Attribute({
            value: this.visitNode(node.callee.object),
            attr: 'append',
            ctx: pyAst.Load()
          }),
          args: [this.visitNode(node.arguments[0])],
          keywords: []
        });
      } else {
        throw new UnsupportedFeatureError(
          'array-push-multi',
          node,
          'Array.push() with multiple arguments not supported. Use multiple .push() calls.',
          'E_ARRAY_PUSH_MULTI_ARG'
        );
      }
    }

    if (method === 'pop' && this.isProvablyArray(node.callee.object)) {
      this.importManager.addRuntime('js_array_pop');
      return pyAst.Call({
        func: pyAst.Name({ id: 'js_array_pop', ctx: pyAst.Load() }),
        args: [this.visitNode(node.callee.object)],
        keywords: []
      });
    }
  }

  // Default: regular function call
  return pyAst.Call({
    func: this.visitNode(node.callee),
    args: node.arguments.map(arg => this.visitNode(arg)),
    keywords: []
  });
}
```

---

## Error Codes

- `E_ARRAY_PUSH_MULTI_ARG`: Multi-arg push not supported
- `E_ARRAY_METHOD_AMBIGUOUS`: Cannot determine if receiver is array

---

## Acceptance Tests

### Test: Math Methods
```javascript
Math.sqrt(16);  // → _js_math.sqrt(16)
Math.pow(2, 3);  // → 2 ** 3
Math.abs(-5);  // → abs(-5)
```

### Test: String Methods
```javascript
'abc'.charAt(10);  // → '' (empty string)
'abc'.charCodeAt(10);  // → NaN
'hello'.substring(7, 2);  // → 'llo' (swapped and clamped)
```

### Test: Date.now()
```javascript
Date.now();  // → js_date_now() (int milliseconds)
```

### Test: Console.log
```javascript
console.log('hello', 42);  // → console_log('hello', 42) → prints "hello 42"
```

### Test: Array Methods
```javascript
var arr = [];
arr.push(1);  // → arr.append(1)
arr.pop();  // → js_array_pop(arr)
```

---

## Done Criteria

- [x] Math library mappings with aliased imports
- [x] String method mappings with runtime helpers
- [x] Date.now() mapping
- [x] console.log() mapping
- [x] Array push (single-arg) and pop mappings
- [x] Import manager deterministic ordering
- [x] All acceptance tests pass (31/31 S7 tests + 201/201 total tests)

---

## Timeline

**Day 1**: Math and String methods
**Day 2**: Date, console, array methods
**Day 3**: Testing and import manager finalization
**Day 4**: Review and completion
