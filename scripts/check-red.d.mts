export interface RedResult {
  task: string;
  expect: "red" | "green";
  red: number[];
  green: number[];
  gates: { item: number; kind: string; why: string }[];
  blobs: Record<string, string>;
  problems: string[];
}
export function parseSpecGates(spec: string): Record<number, string>;
export function compareGates(manifest: { items?: unknown }, specGates: Record<number, string>): string[];
export function checkRed(input: { id: string; repo: string; expect: "red" | "green" }): { result: RedResult; status: number };
