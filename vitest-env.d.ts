// Vite's import.meta.glob, which Vitest gives the tests to load the recorded
// fixtures. Only the eager form is used.
interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], options: { eager: true; import?: string; query?: string }): Record<string, T>;
}
