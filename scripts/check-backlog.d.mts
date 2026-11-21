export const BACKLOG_FILE: string;
export const REQUIRED_FIELDS: readonly string[];
export const SIZES: readonly string[];
export const TASK_ID: RegExp;
export function validateBacklog(text: string): string[];
