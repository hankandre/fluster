// True in the 10-foot form: the TV shell sets <html data-form="tv">
// (src/styles/tokens.css). Read at call time, never cached.
export function isTvForm(): boolean {
  return document.documentElement.dataset.form === "tv";
}

// Browser development flag: `?form=tv` turns the TV form on. Anything else leaves the attribute alone, so the
// TV shell or a test that set it first keeps it. Nothing is stored.
export function applyFormFlag(search: string, root: HTMLElement): void {
  if (new URLSearchParams(search).get("form") === "tv") root.dataset.form = "tv";
}
