type StdlibName = 'math' | 'random' | 're' | 'time';
export declare class ImportManager {
    private stdlibImports;
    private runtimeImports;
    addStdlib(name: StdlibName): void;
    addRuntime(name: string): void;
    generateImports(): string[];
    emitHeader(): string;
}
export {};
//# sourceMappingURL=import-manager.d.ts.map