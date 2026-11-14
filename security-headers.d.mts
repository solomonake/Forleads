export declare const CSP_ENFORCE: boolean;
export declare const CSP_REPORT_PATH: string;
export declare function cspDirectives(options?: { dev?: boolean }): Record<string, string[]>;
export declare function serializeCsp(directives: Record<string, string[]>): string;
export declare function securityHeaders(options?: {
  dev?: boolean;
  enforce?: boolean;
}): { key: string; value: string }[];
