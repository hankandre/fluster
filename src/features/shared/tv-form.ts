// True in the 10-foot form: the TV shell sets <html data-form="tv">
// (src/styles/tokens.css). Read at call time, never cached.
export function isTvForm(): boolean {
  return document.documentElement.dataset.form === "tv";
}
