/** Resolve Python path; download portable CPython on Linux if needed. */
export declare function ensurePython(): Promise<string | null>;
/** Clear cached miss so a later bootstrap can retry. */
export declare function resetPythonCache(): void;
