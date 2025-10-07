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
    if (this.scopes.length <= 1) {
      throw new Error('Cannot exit root scope');
    }
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

  isDeclared(originalName: string): boolean {
    // Check if identifier is declared in any scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(originalName)) {
        return true;
      }
    }
    return false;
  }
}
