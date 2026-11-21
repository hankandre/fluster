export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export interface Task {
  id: string;
  status: string;
  title: string;
  owner?: string | null;
  passes?: boolean;
  evidence?: string | null;
  human?: boolean;
  depends_on?: string[];
  [key: string]: unknown;
}
export interface Phase {
  id: string;
  tasks: Task[];
  [key: string]: unknown;
}
export interface Prd {
  status_values?: string[];
  phases: Phase[];
  [key: string]: unknown;
}
export interface SetOptions {
  status: string;
  owner?: string;
  evidence?: string;
}
export const TASK_FILE: string;
export const MAX_FILE_BYTES: number;
export const MAX_EVIDENCE_CHARS: number;
export const EVIDENCE_REFERENCE: RegExp;
export function nextTask(prd: Prd): ({ phase: string } & Task) | null;
export function findTask(prd: Prd, id: string): { phase: string } & Task;
export function listLines(prd: Prd, filters?: { status?: string; phase?: string }): string[];
export function parseSetArgs(argv: string[]): { id: string; status: string; owner?: string; evidenceFile?: string };
export function applySet(text: string, id: string, opts: SetOptions): string;
export function checkTaskFile(byteLength: number, prd: Prd): string[];
