// Types for fixture-recording.mjs, so the TypeScript recorders can import it under strict mode.
export function readCredentials(): Record<string, string>;
export const CLIENT: string;
export function callStatus(
  base: string,
  token: string | undefined,
  method: string,
  path: string,
  options?: { query?: Record<string, string | number | boolean>; body?: unknown },
): Promise<{ status: number; data: any }>;
export function makeScrubber(options: {
  tokens: string[];
  host: string;
  fakeUserIds: { real: string; fake: string }[];
  fakeServerId: { real: string; fake: string };
  knownIds: Map<string, string>;
  serverNames: string[];
}): (data: unknown) => unknown;
export function makeSaver(options: {
  outDir: string;
  folder: string;
  scrub: (data: unknown) => unknown;
  secrets: string[];
}): (file: string, data: unknown) => void;
