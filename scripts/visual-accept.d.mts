export interface AcceptPlan { refuse: string[]; copy: string[]; delete: string[] }
export function planAccept(input: { results: unknown; captures: string[]; baselines: string[] }): AcceptPlan;
export function acceptRun(input: { artifactDir: string; baselineDir: string; dryRun: boolean }): AcceptPlan;
