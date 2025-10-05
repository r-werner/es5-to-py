# S1: Pipeline Skeleton

**Status**: ✅ Complete (2025-10-05)
**Dependencies**: S0
**Estimated Effort**: 2-3 days
**Actual Effort**: 1 day

---

## Critical Invariants (Repeated in Every Spec)

These invariants apply to **all** specs. Every feature must respect these rules:

1. **Python ≥ 3.8**: Walrus operator (`:=`) required; no fallback mode
2. **Strict equality**: Use `js_strict_eq()` for `===`; never Python `==` for object/array comparisons
3. **null vs undefined**: `None` is `null`; `JSUndefined` (singleton) is `undefined`; uninitialized vars → `JSUndefined`
4. **Member access**: Always via subscript (`obj['prop']`); exception: `.length` reads → `len()`
5. **Identifier sanitization**: `_js` suffix for reserved words; scope-aware remapping; property keys not sanitized
6. **Aliased stdlib imports**: `import math as _js_math`, `import random as _js_random`, `import re as _js_re`, `import time as _js_time` only
7. **Return semantics**: Bare `return` → `return JSUndefined` (NOT Python's implicit `None`)
8. **Temp naming**: `__js_tmp<n>` for temps, `__js_switch_disc_<id>` for switch discriminants

---

## Overview

This spec establishes the transpiler pipeline infrastructure: parser, transformer, generator, and import manager. It creates the skeleton that all subsequent specs will build upon.

**Goal**: Create end-to-end pipeline that can parse JS, transform to Python AST, and generate Python code. Demonstrate with minimal "no-op" test (input: `42` → output: `42`).

---

## Scope

### In Scope

**Core Infrastructure**:
1. Parser wrapper (`src/parser.js`) using `acorn` with ES5 configuration
2. Transformer scaffold (`src/transformer.js`) with visitor pattern
3. Generator (`src/generator.js`) using `@kriss-u/py-ast` to unparse Python AST
4. Import manager (`src/import-manager.js`) with aliased stdlib imports
5. Error handling infrastructure (`src/errors.js`)
6. Identifier sanitizer (`src/identifier-sanitizer.js`)
7. Minimal CLI (`src/cli.js`)
8. End-to-end "no-op" test for literals

**Acorn Configuration**:
- `ecmaVersion: 5` (ES5 syntax only)
- `sourceType: 'script'` (NOT 'module')
- `locations: true` (for error messages with line/column)
- `ranges: true` (for source mapping)
- `allowReturnOutsideFunction: false`
- `allowReserved: true` (ES5 context)

**Walrus Operator Support**:
- Verify `@kriss-u/py-ast` can unparse walrus operator (`:=` / NamedExpr node)
- Document usage in generated code

### Out of Scope (Deferred to Later Specs)

- Actual AST transformations (S2-S8)
- Runtime library extensions beyond S0 (S3-S8)
- Full CLI features (S9)
- Test harness (S9)

---

## Implementation Requirements

### 1. Project Setup (Phase 1.1)

**Technology Stack**:
- **Language**: TypeScript (strict mode recommended)
- **Test Framework**: Vitest
- **Parser**: acorn (ES5 mode)
- **Python AST Builder**: @kriss-u/py-ast

**Dependencies**:
```json
{
  "dependencies": {
    "acorn": "^8.x.x",
    "@kriss-u/py-ast": "^x.x.x"
  },
  "devDependencies": {
    "typescript": "^5.x.x",
    "vitest": "^1.x.x",
    "@types/node": "^20.x.x"
  }
}
```

**Actions**:
- [ ] Create project structure: `src/`, `tests/`, `runtime/`
- [ ] Initialize `package.json` with pinned versions
- [ ] Configure TypeScript with `tsconfig.json` (strict mode, ESNext target)
- [ ] Configure Vitest with `vitest.config.ts`
- [ ] Document Node.js version requirement (≥ 18 LTS)
- [ ] Document Python version requirement (≥ 3.8)
- [ ] Verify walrus operator support in `@kriss-u/py-ast`

**TypeScript Configuration** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Vitest Configuration** (`vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.test.ts', '**/dist/**']
    }
  }
});
```

---

### 2. Parser Wrapper (`src/parser.ts`)

**Implementation**:
```typescript
import * as acorn from 'acorn';
import type { Node } from 'acorn';

export function parseJS(source: string): Node {
  return acorn.parse(source, {
    ecmaVersion: 5,           // ES5 syntax only
    sourceType: 'script',     // NOT 'module'
    locations: true,          // line/column for errors
    ranges: true,             // source ranges
    allowReturnOutsideFunction: false,
    allowReserved: true       // ES5 allows reserved words in some contexts
  });
}
```

**Acorn Node Structure Verification**:
- Verify `node.regex.pattern` and `node.regex.flags` for regex literals
- Verify `SequenceExpression.expressions` structure
- Document node shapes in comments

---

### 3. Error Infrastructure (`src/errors.ts`)

**Implementation**:
```typescript
import type { Node } from 'acorn';

export class UnsupportedNodeError extends Error {
  public readonly node: Node;
  public readonly code = 'E_UNSUPPORTED_NODE';

  constructor(node: Node, message: string) {
    const loc = node.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : '';
    super(`${message}${loc}`);
    this.name = 'UnsupportedNodeError';
    this.node = node;
  }
}

export class UnsupportedFeatureError extends Error {
  public readonly feature: string;
  public readonly node?: Node;
  public readonly code: string;

  constructor(feature: string, node: Node | undefined, message: string, code: string) {
    const loc = node?.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : '';
    super(`${message}${loc}`);
    this.name = 'UnsupportedFeatureError';
    this.feature = feature;
    this.node = node;
    this.code = code || 'E_UNSUPPORTED_FEATURE';
  }
}
```

**Error Message Requirements**:
- Include node type and source location
- Explain why it failed (out of scope, unsupported)
- Suggest what to change (workaround or alternative)
- Include error code for programmatic filtering

---

### 4. Identifier Sanitizer (`src/identifier-sanitizer.ts`)

**Purpose**: Prevent collisions with Python reserved words

**Implementation**:
```typescript
const PYTHON_KEYWORDS = new Set([
  'class', 'from', 'import', 'def', 'return', 'if', 'else', 'elif',
  'while', 'for', 'in', 'is', 'not', 'and', 'or', 'async', 'await',
  'with', 'try', 'except', 'finally', 'raise', 'assert', 'lambda',
  'yield', 'global', 'nonlocal', 'del', 'pass', 'break', 'continue'
]);

const PYTHON_LITERALS = new Set(['None', 'True', 'False']);

export function sanitizeIdentifier(name: string): string {
  if (PYTHON_KEYWORDS.has(name) || PYTHON_LITERALS.has(name)) {
    return `${name}_js`;
  }
  return name;
}

export class IdentifierMapper {
  private scopes: Map<string, string>[] = [new Map()];

  enterScope(): void {
    this.scopes.push(new Map());
  }

  exitScope(): void {
    this.scopes.pop();
  }

  declare(originalName: string): string {
    const sanitized = sanitizeIdentifier(originalName);
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.set(originalName, sanitized);
    return sanitized;
  }

  lookup(originalName: string): string {
    // Search from innermost to outermost scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(originalName)) {
        return this.scopes[i].get(originalName)!;
      }
    }
    return sanitizeIdentifier(originalName); // Fallback
  }
}
```

**Scope-Aware Remapping**:
- Two-pass per scope: collect declarations, then transform
- Track ALL identifier declarations (vars, functions, params)
- Remap ALL references consistently
- Property keys NOT sanitized (use subscript access)

---

### 5. Transformer Scaffold (`src/transformer.ts`)

**Implementation**:
```typescript
import type { Node } from 'acorn';
import { IdentifierMapper } from './identifier-sanitizer';
import { UnsupportedNodeError } from './errors';

export class Transformer {
  private identifierMapper = new IdentifierMapper();
  private tempCounter = 0;

  allocateTemp(): string {
    return `__js_tmp${++this.tempCounter}`;
  }

  transform(jsAst: Node): any {
    // Entry point for transformation
    return this.visitNode(jsAst);
  }

  visitNode(node: Node): any {
    const method = `visit${node.type}` as keyof this;
    if (this[method] && typeof this[method] === 'function') {
      return (this[method] as any)(node);
    }
    throw new UnsupportedNodeError(node, `Unsupported node type: ${node.type}`);
  }

  // Visitor methods added by other specs
  visitProgram(node: Node): any {
    // Implemented in S3
    throw new UnsupportedNodeError(node, 'Program transformation not yet implemented');
  }

  visitLiteral(node: Node): any {
    // Implemented in S2
    throw new UnsupportedNodeError(node, 'Literal transformation not yet implemented');
  }

  // ... other visitors added in later specs
}
```

**Visitor Pattern**:
- Each AST node type has a `visit<NodeType>` method
- Throw `UnsupportedNodeError` for unimplemented nodes
- Use `identifierMapper` for scope-aware identifier remapping
- Use `allocateTemp()` for temporary variables

---

### 6. Generator (`src/generator.ts`)

**Implementation**:
```typescript
import * as pyAst from '@kriss-u/py-ast';

export function generatePython(pythonAst: any): string {
  // Use @kriss-u/py-ast to unparse Python AST to source code
  return pyAst.unparse(pythonAst);
}
```

**Requirements**:
- Use `@kriss-u/py-ast` unparser
- Verify walrus operator (NamedExpr) support
- Document any unparsing edge cases

---

### 7. Import Manager (`src/import-manager.ts`)

**Implementation**:
```typescript
type StdlibName = 'math' | 'random' | 're' | 'time';

export class ImportManager {
  private stdlibImports = new Set<StdlibName>();
  private runtimeImports = new Set<string>();

  addStdlib(name: StdlibName): void {
    this.stdlibImports.add(name);
  }

  addRuntime(name: string): void {
    // name: 'JSUndefined', 'js_truthy', 'console_log', etc.
    this.runtimeImports.add(name);
  }

  generateImports(): string[] {
    const imports: string[] = [];

    // Stdlib imports with aliases (sorted for determinism)
    const stdlibAliases: Record<StdlibName, string> = {
      math: '_js_math',
      random: '_js_random',
      re: '_js_re',
      time: '_js_time'
    };

    for (const lib of Array.from(this.stdlibImports).sort()) {
      imports.push(`import ${lib} as ${stdlibAliases[lib]}`);
    }

    // Runtime imports (sorted for determinism)
    if (this.runtimeImports.size > 0) {
      const runtimeList = Array.from(this.runtimeImports).sort().join(', ');
      imports.push(`from js_compat import ${runtimeList}`);
    }

    return imports.join('\n');
  }
}
```

**Aliased Stdlib Imports**:
- `import math as _js_math`
- `import random as _js_random`
- `import re as _js_re`
- `import time as _js_time`

**Deterministic Order**:
1. Stdlib imports (sorted alphabetically)
2. Runtime imports (sorted alphabetically)

**No Unused Imports**:
- Only import when features are actually used
- Track usage during transformation

---

### 8. Minimal CLI (`src/cli.ts`)

**Implementation**:
```typescript
#!/usr/bin/env node

import * as fs from 'fs';
import { parseJS } from './parser';
import { Transformer } from './transformer';
import { generatePython } from './generator';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: es5-to-py <input.js>');
    process.exit(1);
  }

  const inputFile = args[0];
  const source = fs.readFileSync(inputFile, 'utf8');

  try {
    const jsAst = parseJS(source);
    const transformer = new Transformer();
    const pythonAst = transformer.transform(jsAst);
    const pythonCode = generatePython(pythonAst);

    console.log(pythonCode);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`Code: ${error.code}`);
    }
    process.exit(1);
  }
}

main();
```

**CLI Features (Full version in S9)**:
- Read input file
- Parse → Transform → Generate
- Output to stdout
- Error handling with exit codes

---

## Error Codes

This spec introduces these error codes:

- `E_UNSUPPORTED_NODE`: AST node type not implemented
- `E_UNSUPPORTED_FEATURE`: Feature outside ES5 subset

---

## Acceptance Tests

### Test File: `tests/pipeline/test_skeleton.test.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { parseJS } from '../../src/parser';
import { Transformer } from '../../src/transformer';
import { generatePython } from '../../src/generator';

describe('Pipeline Skeleton', () => {
  test('Parser produces ESTree AST', () => {
    const ast = parseJS('42');
    expect(ast.type).toBe('Program');
    expect(ast.body[0].type).toBe('ExpressionStatement');
  });

  test('Acorn configuration is correct', () => {
    const source = 'var x = 5;';
    const ast = parseJS(source);
    expect(ast.sourceType).toBe('script');
    expect(ast.loc).toBeDefined();
  });

  test('Error infrastructure works', () => {
    const { UnsupportedNodeError } = await import('../../src/errors');
    const node = { type: 'Unknown', loc: { start: { line: 1, column: 0 } } } as any;
    const error = new UnsupportedNodeError(node, 'Test error');
    expect(error.message).toContain('Test error');
    expect(error.message).toContain('1:0');
  });

  test('Identifier sanitization works', () => {
    const { sanitizeIdentifier } = await import('../../src/identifier-sanitizer');
    expect(sanitizeIdentifier('class')).toBe('class_js');
    expect(sanitizeIdentifier('from')).toBe('from_js');
    expect(sanitizeIdentifier('None')).toBe('None_js');
    expect(sanitizeIdentifier('myVar')).toBe('myVar');
  });

  test('Import manager generates correct imports', () => {
    const { ImportManager } = await import('../../src/import-manager');
    const mgr = new ImportManager();
    mgr.addStdlib('math');
    mgr.addRuntime('JSUndefined');
    mgr.addRuntime('js_truthy');

    const imports = mgr.generateImports();
    expect(imports).toContain('import math as _js_math');
    expect(imports).toContain('from js_compat import JSUndefined, js_truthy');
  });

  test('Temp allocator generates unique names', () => {
    const transformer = new Transformer();
    expect(transformer.allocateTemp()).toBe('__js_tmp1');
    expect(transformer.allocateTemp()).toBe('__js_tmp2');
  });
});
```

### Integration Test: End-to-End No-Op

**Input** (`test.js`):
```javascript
42
```

**Expected Behavior**:
- Parser produces valid ESTree AST
- Transformer visits Program and ExpressionStatement nodes
- Minimal literal transformation (deferred to S2)
- Generator produces Python output

**Note**: Full literal transformation tested in S2. This test verifies pipeline plumbing only.

---

## Done Criteria

- [x] TypeScript configuration (`tsconfig.json`) with strict mode
- [x] Vitest configuration (`vitest.config.ts`)
- [x] `src/parser.ts` implemented with correct Acorn configuration
- [x] `src/errors.ts` with UnsupportedNodeError and UnsupportedFeatureError
- [x] `src/identifier-sanitizer.ts` with sanitization and scope-aware mapping
- [x] `src/transformer.ts` scaffold with visitor pattern
- [x] `src/generator.ts` using `py-ast` unparser (v1.9.0)
- [x] `src/import-manager.ts` with aliased stdlib imports
- [x] `src/cli.ts` minimal CLI
- [x] Walrus operator support verified in `py-ast`
- [x] All acceptance tests pass (10/10 tests with `vitest`)
- [x] End-to-end pipeline test (parse → transform → generate)

---

## Dependencies for Next Specs

After completing S1, the following specs can begin:
- **S2** (Expressions I): Uses transformer scaffold to implement expression visitors
- **S3** (Assignment + Functions): Uses transformer for function and assignment transformations
- **S7** (Library + Methods): Uses import manager for library mappings

---

## Notes for Implementers

1. **Acorn Configuration**: The configuration is critical for ES5 compliance. Do not change `ecmaVersion` or `sourceType`.

2. **Identifier Sanitization**: The two-pass approach is essential. First pass: collect all declarations and build mapping. Second pass: transform AST using the mapping.

3. **Import Manager**: Always use aliased imports for stdlib. Never mix aliased and non-aliased imports.

4. **Error Messages**: Include node type, location, explanation, and suggestion. Users should understand what to change.

5. **Walrus Operator**: Python 3.8+ is mandatory. No fallback mode. Document this clearly.

6. **Temp Naming**: Use `__js_tmp<n>` prefix for all temporary variables. Document convention to avoid user code collisions.

---

## Timeline

**Day 1**:
- [ ] Project setup and dependencies
- [ ] Parser wrapper with Acorn configuration
- [ ] Error infrastructure

**Day 2**:
- [ ] Identifier sanitizer with scope-aware mapping
- [ ] Transformer scaffold with visitor pattern
- [ ] Generator using `@kriss-u/py-ast`

**Day 3**:
- [ ] Import manager with aliased stdlib imports
- [ ] Minimal CLI
- [ ] Acceptance tests and integration test
- [ ] Review and mark S1 complete
