export class ImportManager {
    constructor() {
        this.stdlibImports = new Set();
        this.runtimeImports = new Set();
    }
    addStdlib(name) {
        this.stdlibImports.add(name);
    }
    addRuntime(name) {
        // name: 'JSUndefined', 'js_truthy', 'console_log', etc.
        this.runtimeImports.add(name);
    }
    generateImports() {
        const imports = [];
        // Stdlib imports with aliases (sorted for determinism)
        const stdlibAliases = {
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
//# sourceMappingURL=import-manager.js.map