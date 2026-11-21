export interface FlowCommit {
  sha: string;
  added: string[];
  changed: string[];
  trailers: string[];
}
export interface FrozenInput {
  commits: FlowCommit[];
  tip: string;
  task?: string;
  read(rev: string, path: string): string | null;
  blob(rev: string, path: string): string | null;
  acceptanceCount(id: string): number | null;
}
export interface FrozenResult {
  problems: string[];
  manifests: { task: string; freeze: string; files: string[] }[];
  changes: { path: string; commit: string; reason: string }[];
  frozen: { path: string; blob: string }[];
  missingManifest: boolean;
}
export const MANIFEST_PATH: RegExp;
export const GATE_KINDS: readonly string[];
export const PRD_FILE: string;
export const LOG_FILE: string;
export function validateManifest(manifest: unknown, id: string, acceptanceCount: number): string[];
export function shapeOf(prd: unknown): unknown;
export function findFrozenProblems(input: FrozenInput): FrozenResult;
export function findTaskListProblems(input: { commits: FlowCommit[]; base: string; tip: string; shapeAt(rev: string): string }): { problems: string[]; changed: boolean };
export function readRange(input: { repo: string; base: string }): FrozenInput & { base: string; shapeAt(rev: string): string };
export function checkFlow(input: { repo: string; base: string; task?: string }): {
  ok: boolean;
  commits: number;
  manifests: FrozenResult["manifests"];
  changes: FrozenResult["changes"];
  frozen: FrozenResult["frozen"];
  taskListChanged: boolean;
  missingManifest: boolean;
  problems: string[];
};
