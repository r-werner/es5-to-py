# Working with py-ast: A Practical Guide

**Author**: Implementation learnings from S2: Core Expressions I
**Date**: 2025-10-05
**py-ast version**: 1.9.0

---

## Overview

`py-ast` is a TypeScript/JavaScript library that provides Python AST parsing and unparsing capabilities. This guide documents practical learnings from implementing the ES5-to-Python transpiler, focusing on **programmatic AST construction** rather than just parsing.

## Installation

```bash
npm install py-ast@1.9.0
```

## Key Concepts

### 1. Two Main Use Cases

`py-ast` supports two primary workflows:

**A. Parsing Python → AST → Unparsing Python** (documented use case)
```typescript
import { parse, unparse } from 'py-ast';

const pythonCode = 'x + y';
const ast = parse(pythonCode);
const output = unparse(ast); // "x + y"
```

**B. Building AST Programmatically → Unparsing Python** (our use case)
```typescript
import { unparse } from 'py-ast';

// Build AST manually
const ast = {
  nodeType: 'BinOp',
  left: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  op: { nodeType: 'Add' },
  right: { nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } }
};

const output = unparse(ast); // "x + y"
```

### 2. The AST Structure

Python AST nodes are **plain JavaScript objects** with a `nodeType` field. No special classes required!

```typescript
// All you need is the right object shape
const constant = { nodeType: 'Constant', value: 42 };
const name = { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } };
```

---

## Building Python AST Nodes

### Basic Literals

```typescript
// Numbers
{ nodeType: 'Constant', value: 42 }
{ nodeType: 'Constant', value: 3.14 }

// Strings
{ nodeType: 'Constant', value: "hello" }

// Booleans (Python True/False)
{ nodeType: 'Constant', value: true }  // → True
{ nodeType: 'Constant', value: false } // → False

// None (null)
{ nodeType: 'Constant', value: null }  // → None
```

### Names (Variables)

Names require a **context** indicating how the variable is used:

```typescript
// Load context (reading a variable)
{
  nodeType: 'Name',
  id: 'myVar',
  ctx: { nodeType: 'Load' }
}

// Store context (writing a variable)
{
  nodeType: 'Name',
  id: 'myVar',
  ctx: { nodeType: 'Store' }
}

// Del context (deleting a variable)
{
  nodeType: 'Name',
  id: 'myVar',
  ctx: { nodeType: 'Del' }
}
```

**Common mistake**: Forgetting the `ctx` wrapper object!
```typescript
// ❌ WRONG
ctx: 'Load'

// ✅ CORRECT
ctx: { nodeType: 'Load' }
```

### Lists and Dicts

```typescript
// List: [1, 2, 3]
{
  nodeType: 'List',
  elts: [
    { nodeType: 'Constant', value: 1 },
    { nodeType: 'Constant', value: 2 },
    { nodeType: 'Constant', value: 3 }
  ],
  ctx: { nodeType: 'Load' }
}

// Dict: {"a": 1, "b": 2}
{
  nodeType: 'Dict',
  keys: [
    { nodeType: 'Constant', value: "a" },
    { nodeType: 'Constant', value: "b" }
  ],
  values: [
    { nodeType: 'Constant', value: 1 },
    { nodeType: 'Constant', value: 2 }
  ]
}
```

### Function Calls

```typescript
// func(arg1, arg2)
{
  nodeType: 'Call',
  func: { nodeType: 'Name', id: 'func', ctx: { nodeType: 'Load' } },
  args: [
    { nodeType: 'Name', id: 'arg1', ctx: { nodeType: 'Load' } },
    { nodeType: 'Name', id: 'arg2', ctx: { nodeType: 'Load' } }
  ],
  keywords: []  // Empty array for no keyword arguments
}

// With keyword arguments: func(x, y=10)
{
  nodeType: 'Call',
  func: { nodeType: 'Name', id: 'func', ctx: { nodeType: 'Load' } },
  args: [
    { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } }
  ],
  keywords: [
    {
      arg: 'y',
      value: { nodeType: 'Constant', value: 10 }
    }
  ]
}
```

### Attribute Access

```typescript
// obj.attr
{
  nodeType: 'Attribute',
  value: { nodeType: 'Name', id: 'obj', ctx: { nodeType: 'Load' } },
  attr: 'attr',  // String, not an AST node!
  ctx: { nodeType: 'Load' }
}

// _js_math.inf
{
  nodeType: 'Attribute',
  value: { nodeType: 'Name', id: '_js_math', ctx: { nodeType: 'Load' } },
  attr: 'inf',
  ctx: { nodeType: 'Load' }
}
```

### Subscript (Dictionary/List Access)

```typescript
// obj['key']
{
  nodeType: 'Subscript',
  value: { nodeType: 'Name', id: 'obj', ctx: { nodeType: 'Load' } },
  slice: { nodeType: 'Constant', value: 'key' },
  ctx: { nodeType: 'Load' }
}

// arr[0]
{
  nodeType: 'Subscript',
  value: { nodeType: 'Name', id: 'arr', ctx: { nodeType: 'Load' } },
  slice: { nodeType: 'Constant', value: 0 },
  ctx: { nodeType: 'Load' }
}
```

### Comparisons

**IMPORTANT**: Python uses `Compare` nodes, not `BinOp`!

```typescript
// x < y
{
  nodeType: 'Compare',
  left: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  ops: [{ nodeType: 'Lt' }],  // Array of operators
  comparators: [{ nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } }]
}

// Comparison operators:
// Lt (<), LtE (<=), Gt (>), GtE (>=), Eq (==), NotEq (!=)
// Is (is), IsNot (is not), In (in), NotIn (not in)

// Chained comparisons: x < y <= z
{
  nodeType: 'Compare',
  left: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  ops: [{ nodeType: 'Lt' }, { nodeType: 'LtE' }],
  comparators: [
    { nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } },
    { nodeType: 'Name', id: 'z', ctx: { nodeType: 'Load' } }
  ]
}
```

### Binary Operations (Math)

```typescript
// x + y
{
  nodeType: 'BinOp',
  left: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  op: { nodeType: 'Add' },
  right: { nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } }
}

// Arithmetic operators:
// Add (+), Sub (-), Mult (*), Div (/), FloorDiv (//),
// Mod (%), Pow (**), LShift (<<), RShift (>>),
// BitOr (|), BitXor (^), BitAnd (&)
```

### Unary Operations

```typescript
// not x
{
  nodeType: 'UnaryOp',
  op: { nodeType: 'Not' },
  operand: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } }
}

// -x
{
  nodeType: 'UnaryOp',
  op: { nodeType: 'USub' },
  operand: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } }
}

// Unary operators:
// Not (not), UAdd (+), USub (-), Invert (~)
```

### Ternary (Conditional Expression)

```typescript
// x if condition else y
{
  nodeType: 'IfExp',
  test: { nodeType: 'Name', id: 'condition', ctx: { nodeType: 'Load' } },
  body: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  orelse: { nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } }
}
```

### Named Expressions (Walrus Operator)

**Requires Python 3.8+**

```typescript
// (x := 5)
{
  nodeType: 'NamedExpr',
  target: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Store' } },
  value: { nodeType: 'Constant', value: 5 }
}

// Pattern for logical operators: (b if js_truthy(__tmp := a) else __tmp)
{
  nodeType: 'IfExp',
  test: {
    nodeType: 'Call',
    func: { nodeType: 'Name', id: 'js_truthy', ctx: { nodeType: 'Load' } },
    args: [{
      nodeType: 'NamedExpr',
      target: { nodeType: 'Name', id: '__tmp', ctx: { nodeType: 'Store' } },
      value: { nodeType: 'Name', id: 'a', ctx: { nodeType: 'Load' } }
    }],
    keywords: []
  },
  body: { nodeType: 'Name', id: 'b', ctx: { nodeType: 'Load' } },
  orelse: { nodeType: 'Name', id: '__tmp', ctx: { nodeType: 'Load' } }
}
```

---

## Helper Pattern: Builder Functions

**Recommended**: Create helper functions to avoid repetitive object creation:

```typescript
// src/py-ast-builders.ts
export const PyAST = {
  Constant(value: any) {
    return { nodeType: 'Constant', value };
  },

  Name(id: string, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Name', id, ctx: { nodeType: ctx } };
  },

  Call(func: any, args: any[], keywords: any[]) {
    return { nodeType: 'Call', func, args, keywords };
  },

  Compare(left: any, ops: string[], comparators: any[]) {
    return {
      nodeType: 'Compare',
      left,
      ops: ops.map(op => ({ nodeType: op })),
      comparators
    };
  },

  BinOp(left: any, op: string, right: any) {
    return { nodeType: 'BinOp', left, op: { nodeType: op }, right };
  },

  UnaryOp(op: string, operand: any) {
    return { nodeType: 'UnaryOp', op: { nodeType: op }, operand };
  },

  IfExp(test: any, body: any, orelse: any) {
    return { nodeType: 'IfExp', test, body, orelse };
  },

  NamedExpr(target: any, value: any) {
    return { nodeType: 'NamedExpr', target, value };
  },

  List(elts: any[], ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'List', elts, ctx: { nodeType: ctx } };
  },

  Dict(keys: any[], values: any[]) {
    return { nodeType: 'Dict', keys, values };
  },

  Attribute(value: any, attr: string, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Attribute', value, attr, ctx: { nodeType: ctx } };
  },

  Subscript(value: any, slice: any, ctx: 'Load' | 'Store' | 'Del') {
    return { nodeType: 'Subscript', value, slice, ctx: { nodeType: ctx } };
  }
};
```

**Usage**:
```typescript
import { PyAST } from './py-ast-builders.js';
import { unparse } from 'py-ast';

// x < y
const ast = PyAST.Compare(
  PyAST.Name('x', 'Load'),
  ['Lt'],
  [PyAST.Name('y', 'Load')]
);

console.log(unparse(ast)); // "x < y"
```

---

## Common Pitfalls

### 1. Context Objects

**❌ WRONG**: Using strings directly
```typescript
ctx: 'Load'
```

**✅ CORRECT**: Wrapping in object
```typescript
ctx: { nodeType: 'Load' }
```

### 2. Comparison vs BinOp

**❌ WRONG**: Using BinOp for comparisons
```typescript
// This won't work correctly
{
  nodeType: 'BinOp',
  left: x,
  op: { nodeType: 'Lt' },
  right: y
}
```

**✅ CORRECT**: Using Compare for comparisons
```typescript
{
  nodeType: 'Compare',
  left: x,
  ops: [{ nodeType: 'Lt' }],
  comparators: [y]
}
```

### 3. Operators Must Be Objects

**❌ WRONG**: Using strings for operators
```typescript
op: 'Add'
```

**✅ CORRECT**: Wrapping in object
```typescript
op: { nodeType: 'Add' }
```

### 4. Attribute Names Are Strings

**❌ WRONG**: Using AST nodes for attribute names
```typescript
{
  nodeType: 'Attribute',
  value: obj,
  attr: { nodeType: 'Constant', value: 'prop' },  // WRONG!
  ctx: { nodeType: 'Load' }
}
```

**✅ CORRECT**: Using plain strings
```typescript
{
  nodeType: 'Attribute',
  value: obj,
  attr: 'prop',  // String literal
  ctx: { nodeType: 'Load' }
}
```

### 5. Empty Keywords Array

**❌ WRONG**: Omitting keywords
```typescript
{
  nodeType: 'Call',
  func: myFunc,
  args: [arg1, arg2]
  // Missing keywords!
}
```

**✅ CORRECT**: Including empty array
```typescript
{
  nodeType: 'Call',
  func: myFunc,
  args: [arg1, arg2],
  keywords: []  // Required, even if empty
}
```

---

## String Quoting in Output

`py-ast` uses **double quotes** by default in unparsed output:

```typescript
const ast = PyAST.Constant("hello");
console.log(unparse(ast)); // "hello" (with double quotes)
```

**Important for testing**: Don't expect single quotes in assertions!

```typescript
// ❌ Will fail
expect(unparse(ast)).toBe("'hello'");

// ✅ Will pass
expect(unparse(ast)).toBe('"hello"');
```

---

## Testing AST Construction

### Quick Testing Pattern

Use `parse()` to verify your manually-built AST matches Python's structure:

```typescript
import { parse, unparse } from 'py-ast';

// Build your AST manually
const myAST = {
  nodeType: 'Compare',
  left: { nodeType: 'Name', id: 'x', ctx: { nodeType: 'Load' } },
  ops: [{ nodeType: 'Lt' }],
  comparators: [{ nodeType: 'Name', id: 'y', ctx: { nodeType: 'Load' } }]
};

// Parse equivalent Python to check structure
const referenceAST = parse('x < y');
console.log(JSON.stringify(referenceAST.body[0].value, null, 2));

// Verify unparsing works
console.log(unparse({ nodeType: 'Module', body: [{ nodeType: 'Expr', value: myAST }] }));
```

### Debugging AST Issues

```typescript
import { parse } from 'py-ast';

// Parse the Python code you want to generate
const pythonCode = 'not js_truthy(x)';
const ast = parse(pythonCode);

// Inspect the structure
console.log(JSON.stringify(ast, null, 2));

// Copy the structure to build it programmatically
```

---

## Module-Level AST

For complete Python programs, wrap expressions in Module and Expr nodes:

```typescript
// Single expression: x + y
const expr = PyAST.BinOp(
  PyAST.Name('x', 'Load'),
  'Add',
  PyAST.Name('y', 'Load')
);

// Wrap in Module for unparsing
const module = {
  nodeType: 'Module',
  body: [
    {
      nodeType: 'Expr',
      value: expr
    }
  ]
};

console.log(unparse(module)); // "x + y"
```

---

## Performance Tips

1. **Reuse builders**: Create builder functions once, reuse many times
2. **Avoid deep cloning**: AST nodes are plain objects; structural sharing is safe
3. **Batch unparsing**: Unparse once at the end rather than after each node

---

## Version Compatibility

This guide is based on **py-ast 1.9.0**. The API for programmatic AST construction is stable, but check release notes if upgrading.

**Python Version Targets**:
- Walrus operator (`:=`): Requires Python 3.8+
- Most other features: Python 3.6+

---

## Additional Resources

- **py-ast npm package**: https://www.npmjs.com/package/py-ast
- **Python AST documentation**: https://docs.python.org/3/library/ast.html
- **ESTree spec** (for comparison): https://github.com/estree/estree

---

## Real-World Example: Transpiling `a && b`

```typescript
import { PyAST } from './py-ast-builders.js';
import { unparse } from 'py-ast';

// JavaScript: a && b
// Python: (b if js_truthy(__tmp := a) else __tmp)

function transpileLogicalAnd(leftAST: any, rightAST: any): any {
  const temp = '__js_tmp1';

  const walrus = PyAST.NamedExpr(
    PyAST.Name(temp, 'Store'),
    leftAST
  );

  return PyAST.IfExp(
    PyAST.Call(
      PyAST.Name('js_truthy', 'Load'),
      [walrus],
      []
    ),
    rightAST,
    PyAST.Name(temp, 'Load')
  );
}

// Test it
const result = transpileLogicalAnd(
  PyAST.Name('a', 'Load'),
  PyAST.Name('b', 'Load')
);

console.log(unparse(result));
// Output: b if js_truthy(__js_tmp1 := a) else __js_tmp1
```

---

## Summary

**Key Takeaways**:
1. Python AST nodes are **plain JavaScript objects**
2. Always wrap context and operators in `{ nodeType: '...' }`
3. Use `Compare` for comparisons, `BinOp` for arithmetic
4. Create **builder helpers** to reduce boilerplate
5. Test by parsing reference Python and inspecting structure
6. Expect **double quotes** in unparsed output

Happy transpiling! 🐍✨
