export declare function sanitizeIdentifier(name: string): string;
export declare class IdentifierMapper {
    private scopes;
    enterScope(): void;
    exitScope(): void;
    declare(originalName: string): string;
    lookup(originalName: string): string;
}
//# sourceMappingURL=identifier-sanitizer.d.ts.map