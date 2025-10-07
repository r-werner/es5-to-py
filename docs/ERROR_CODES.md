# Error Code Reference

This document lists all error codes produced by the ES5-to-Python transpiler, along with descriptions and suggested workarounds.

## Error Code Format

All errors include:
- **Error Code**: Unique identifier (e.g., `E_UNSUPPORTED_NODE`)
- **Message**: Human-readable description
- **Location**: Source file, line, and column number
- **Context**: Source code snippet showing the problematic code

## Error Codes

### General Errors

#### `E_UNSUPPORTED_NODE`
**Description**: AST node type is not implemented in the transpiler.

**Example**:
```javascript
try {
  doSomething();
} catch (e) {
  console.log(e);
}
```

**Workaround**: This feature is not supported. Check the README for the list of supported ES5 features. Remove or refactor code to use supported constructs.

---

#### `E_UNSUPPORTED_FEATURE`
**Description**: Feature is explicitly outside the supported ES5 subset.

**Example**:
```javascript
let x = 5;  // 'let' not supported
const y = 10;  // 'const' not supported
```

**Workaround**: Use `var` instead of `let` or `const`.

---

### Function and Parameter Errors

#### `E_PARAM_DESTRUCTURE`
**Description**: Destructuring parameters are not supported.

**Example**:
```javascript
function greet({ name, age }) {
  return "Hello " + name;
}
```

**Workaround**: Use simple identifier parameters and manually extract properties:
```javascript
function greet(person) {
  var name = person.name;
  var age = person.age;
  return "Hello " + name;
}
```

---

### Assignment and Expression Errors

#### `E_MEMBER_AUGASSIGN`
**Description**: Augmented assignment to member expressions not yet implemented (requires single-evaluation).

**Example**:
```javascript
obj.count += 5;  // Not supported
arr[i] *= 2;     // Not supported
```

**Workaround**: Use explicit assignment:
```javascript
obj.count = obj.count + 5;
arr[i] = arr[i] * 2;
```

**Note**: This will be implemented in a future spec with proper single-evaluation semantics.

---

### Object and Array Errors

#### `E_COMPUTED_KEY`
**Description**: Computed object keys are not supported.

**Example**:
```javascript
var key = "name";
var obj = { [key]: "John" };  // Not supported
```

**Workaround**: Use explicit property assignment:
```javascript
var key = "name";
var obj = {};
obj[key] = "John";
```

---

## Future Error Codes

The following error codes will be added in future spec implementations:

### Control Flow (S4)

- `E_BREAK_OUTSIDE`: Break statement outside loop/switch
- `E_CONTINUE_OUTSIDE`: Continue statement outside loop
- `E_CONTINUE_IN_SWITCH`: Continue statement inside switch (not allowed in JavaScript)

### Loops (S5)

- `E_SEQUENCE_EXPR_CONTEXT`: SequenceExpression outside for-init/update
- `E_UPDATE_EXPR_CONTEXT`: UpdateExpression outside for-update clause

### Switch (S6)

- `E_SWITCH_FALLTHROUGH`: Fall-through between non-empty cases without explicit break

### Type Operators (S8)

- `E_TYPEOF_UNDECLARED`: typeof on undeclared identifier (special handling required)
- `E_DELETE_IDENTIFIER`: Delete on identifier (not supported)
- `E_LOOSE_EQ_OBJECT`: Loose equality (==) with objects/arrays (ambiguous semantics)

### Regex (S8)

- `E_REGEX_GLOBAL_CONTEXT`: Regex 'g' flag in unsupported context
- `E_REGEX_UNICODE`: Regex 'u' flag not supported (Python regex differences)
- `E_REGEX_STICKY`: Regex 'y' flag not supported

### Advanced Features

- `E_FUNCTION_IN_BLOCK`: Function declaration inside block scope (hoisting ambiguity)
- `E_CLOSURE_MUTABLE`: Closure captures mutable variable (not supported)
- `E_HOISTING`: Function called before definition (hoisting not implemented)

## Getting Help

If you encounter an error:

1. **Check the error code** in this document
2. **Read the workaround** suggestion
3. **Consult the README** for the list of supported features
4. **Check the specs** in `docs/specs/` for detailed implementation status

## Reporting Issues

If you believe an error message is unclear or incorrect:

1. Note the error code and message
2. Include the source code that triggered the error
3. Include the expected behavior
4. Open an issue at the project repository

## Error Handling Best Practices

When writing JavaScript code for transpilation:

1. **Stick to the supported subset** - Review the README's supported features list
2. **Test incrementally** - Transpile small pieces of code first
3. **Use `--verbose` flag** - See the AST to understand what the transpiler sees
4. **Read error messages carefully** - They include source location and context

## Example Error Output

```
Error: Unsupported node type: TryStatement at 3:0

Error Code: E_UNSUPPORTED_NODE

Location: test.js:3:0

3 | try {
  | ^

try/catch/finally blocks are not supported. Consider refactoring to use
explicit error checking instead.
```

## Version History

- **v0.1.0** (2025-10-06): Initial error codes for S0-S3, S9
- Future versions will add error codes for S4-S8 as those specs are implemented
