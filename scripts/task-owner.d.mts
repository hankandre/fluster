export interface OwnerFiles {
  prd: string;
  backlog: string;
}
export function applyOps(
  files: OwnerFiles,
  ops: unknown,
  options: { date: string; readApproval(path: string): string | null },
): { prd: string; backlog: string; summary: string[] };
