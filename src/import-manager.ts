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

    return imports;
  }
}
