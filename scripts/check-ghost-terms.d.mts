export const GHOST_TERMS: RegExp;
export const TAG_NAME: string;
export const CHECK_FILES: string[];
export function objectLines(text: string, id: string): [number, number] | undefined;
export function findGhostTerms(files: { path: string; text: string }[]): string[];
