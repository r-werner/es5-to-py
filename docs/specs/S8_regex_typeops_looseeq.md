# S8: Regex + Type Ops + Loose Eq

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

This spec implements regex literals, typeof operator, delete operator, and loose equality.

---

## Scope

### In Scope

**Regex Literals**:
- `/.../flags` → `compile_js_regex(pattern, flags)`
- Flags: `i` (ignorecase), `m` (multiline), `s` (dotall) supported
- Error on `g` (global) except in `String.replace()` inline literal context
- Error on `y` (sticky), `u` (unicode)

**Regex Methods**:
- `regex.test(str)` → `bool(regex.search(str))`
- `str.replace(/pattern/, repl)` → `regex.sub(repl, str, count=1)`
- `str.replace(/pattern/g, repl)` → `regex.sub(repl, str, count=0)` (inline literal only)

**typeof Operator**:
- `typeof x` → `js_typeof(x)`
- Special case: `typeof undeclaredVar` → `'undefined'` (no error)

**delete Operator**:
- `delete obj.prop` → `js_delete(obj, 'prop')` (dict key removal)
- `delete arr[i]` → `arr[i] = JSUndefined` (array hole creation)
- `delete identifier` → ERROR

**Loose Equality**:
- `==`/`!=` → `js_loose_eq()`/`js_loose_neq()`
- Primitives + null/undefined only
- Error on objects/arrays (E_LOOSE_EQ_OBJECT)

### Out of Scope

- Full regex features (match, exec)
- ToPrimitive coercion for objects

---

## Implementation Requirements

### 1. Runtime Helpers

**Regex**:
```python
import re as _js_re

def compile_js_regex(pattern, flags_str):
    """
    Compile JS regex to Python re pattern.

    - Strip 'g' flag (Python has no global flag; handled by count in .sub())
    - Map flags: i → IGNORECASE, m → MULTILINE, s → DOTALL
    - Error on y (sticky), u (unicode)
    """
    flags_str = flags_str.replace('g', '')  # Strip 'g'

    if 'y' in flags_str:
        raise ValueError("Regex sticky flag 'y' is not supported.")
    if 'u' in flags_str:
        raise ValueError("Regex unicode flag 'u' is not supported.")

    flags = 0
    if 'i' in flags_str:
        flags |= _js_re.IGNORECASE
    if 'm' in flags_str:
        flags |= _js_re.MULTILINE
    if 's' in flags_str:
        flags |= _js_re.DOTALL

    return _js_re.compile(pattern, flags)
```

**typeof**:
```python
def js_typeof(x):
    """JavaScript typeof operator."""
    if x is JSUndefined:
        return 'undefined'
    if x is None:
        return 'object'
    if isinstance(x, bool):
        return 'boolean'
    if isinstance(x, (int, float)):
        return 'number'
    if isinstance(x, str):
        return 'string'
    if isinstance(x, (list, dict)):
        return 'object'
    if callable(x):
        return 'function'
    return 'object'
```

**delete**:
```python
def js_delete(base, key):
    """JavaScript delete operator."""
    if isinstance(base, dict):
        if key in base:
            del base[key]
        return True
    if isinstance(base, list):
        # Don't use del (shifts elements); assign JSUndefined
        try:
            idx = int(key) if isinstance(key, str) else key
            if 0 <= idx < len(base):
                base[idx] = JSUndefined
        except (ValueError, TypeError):
            pass
        return True
    return True  # Non-deletable properties
```

**Loose Equality**:
```python
def js_loose_eq(a, b):
    """
    JavaScript loose equality (==).

    Supported:
    - null == undefined → True
    - Same type → value equality
    - Number and string → coerce string to number
    - Boolean → coerce to number

    NOT supported (error):
    - Object/array comparisons (ToPrimitive too complex)
    """
    import math as _js_math

    # Reject objects/arrays
    if isinstance(a, (list, dict)) or isinstance(b, (list, dict)):
        raise TypeError("Loose equality with objects/arrays is not supported. Use strict equality (===).")

    # NaN handling
    if isinstance(a, float) and _js_math.isnan(a):
        return False
    if isinstance(b, float) and _js_math.isnan(b):
        return False

    # null == undefined
    if (a is None and b is JSUndefined) or (a is JSUndefined and b is None):
        return True

    # Same type
    if type(a) == type(b):
        return a == b

    # Number and string
    if isinstance(a, (int, float)) and isinstance(b, str):
        return a == js_to_number(b)
    if isinstance(a, str) and isinstance(b, (int, float)):
        return js_to_number(a) == b

    # Boolean coercion
    if isinstance(a, bool):
        return js_to_number(a) == js_loose_eq(1 if a else 0, b)
    if isinstance(b, bool):
        return js_loose_eq(a, 1 if b else 0)

    return False

def js_loose_neq(a, b):
    return not js_loose_eq(a, b)
```

---

### 2. Literal Transformation

**Regex Literal**:
```javascript
visitLiteral(node) {
  if (node.regex) {
    const { pattern, flags } = node.regex;

    // Validate 'g' flag context
    if (flags.includes('g')) {
      if (!this.isInlineReplaceContext(node)) {
        throw new UnsupportedFeatureError(
          'regex-global',
          node,
          "Regex global flag 'g' is only supported in String.prototype.replace with inline literals. Use Python's re.findall() or re.finditer() for global matching.",
          'E_REGEX_GLOBAL_CONTEXT'
        );
      }
    }

    this.importManager.addRuntime('compile_js_regex');

    return pyAst.Call({
      func: pyAst.Name({ id: 'compile_js_regex', ctx: pyAst.Load() }),
      args: [
        pyAst.Constant({ value: pattern }),
        pyAst.Constant({ value: flags })
      ],
      keywords: []
    });
  }

  // ... other literals ...
}
```

---

### 3. Operators

**typeof**:
```javascript
visitUnaryExpression(node) {
  if (node.operator === 'typeof') {
    // Special case: typeof undeclaredVar → 'undefined'
    if (node.argument.type === 'Identifier' && !this.isDeclared(node.argument.name)) {
      return pyAst.Constant({ value: 'undefined' });
    }

    this.importManager.addRuntime('js_typeof');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_typeof', ctx: pyAst.Load() }),
      args: [this.visitNode(node.argument)],
      keywords: []
    });
  }

  // ... other unary ops ...
}
```

**delete**:
```javascript
visitUnaryExpression(node) {
  if (node.operator === 'delete') {
    if (node.argument.type === 'Identifier') {
      throw new UnsupportedFeatureError(
        'delete-identifier',
        node,
        'Delete on identifiers is not supported (non-configurable binding).',
        'E_DELETE_IDENTIFIER'
      );
    }

    if (node.argument.type === 'MemberExpression') {
      this.importManager.addRuntime('js_delete');

      const obj = this.visitNode(node.argument.object);
      let key;
      if (node.argument.computed) {
        key = this.visitNode(node.argument.property);
      } else {
        key = pyAst.Constant({ value: node.argument.property.name });
      }

      return pyAst.Call({
        func: pyAst.Name({ id: 'js_delete', ctx: pyAst.Load() }),
        args: [obj, key],
        keywords: []
      });
    }
  }

  // ... other unary ops ...
}
```

**Loose Equality**:
```javascript
visitBinaryExpression(node) {
  // ... existing code for ===, !==, etc. ...

  if (node.operator === '==') {
    this.importManager.addRuntime('js_loose_eq');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_loose_eq', ctx: pyAst.Load() }),
      args: [this.visitNode(node.left), this.visitNode(node.right)],
      keywords: []
    });
  }

  if (node.operator === '!=') {
    this.importManager.addRuntime('js_loose_neq');
    return pyAst.Call({
      func: pyAst.Name({ id: 'js_loose_neq', ctx: pyAst.Load() }),
      args: [this.visitNode(node.left), this.visitNode(node.right)],
      keywords: []
    });
  }

  // ...
}
```

---

## Error Codes

- `E_REGEX_GLOBAL_CONTEXT`: 'g' flag in unsupported context
- `E_DELETE_IDENTIFIER`: Delete on identifier
- `E_LOOSE_EQ_OBJECT`: Loose equality with objects/arrays

---

## Acceptance Tests

### Test: Regex Compilation
```javascript
/hello/i;  // → compile_js_regex('hello', 'i')
/\d+/;  // → compile_js_regex('\\d+', '')
```

### Test: Regex 'g' Flag
```javascript
'aaa'.replace(/a/g, 'b');  // → ALLOWED (inline literal)
var r = /a/g; 'aaa'.replace(r, 'b');  // → ERROR E_REGEX_GLOBAL_CONTEXT
```

### Test: typeof
```javascript
typeof null;  // → 'object'
typeof undefined;  // → 'undefined'
typeof undeclaredVar;  // → 'undefined' (no error)
```

### Test: delete
```javascript
delete obj.prop;  // → js_delete(obj, 'prop')
delete arr[1];  // → arr[1] = JSUndefined
delete identifier;  // → ERROR E_DELETE_IDENTIFIER
```

### Test: Loose Equality
```javascript
null == undefined;  // → True
5 == '5';  // → True
{} == {};  // → ERROR E_LOOSE_EQ_OBJECT
```

---

## Done Criteria

- [ ] `compile_js_regex()` runtime helper
- [ ] Regex literal transformation with 'g' flag validation
- [ ] `js_typeof()` with undeclared identifier special case
- [ ] `js_delete()` for dicts and arrays
- [ ] `js_loose_eq()` with object/array guardrails
- [ ] All acceptance tests pass

---

## Timeline

**Day 1**: Regex literals and compilation
**Day 2**: typeof and delete operators
**Day 3**: Loose equality
**Day 4**: Testing and completion
