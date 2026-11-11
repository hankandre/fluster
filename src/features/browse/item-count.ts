// "1 item", "248 items", "1,248 items".
export function itemCountLabel(count: number): string {
  return `${new Intl.NumberFormat().format(count)} ${count === 1 ? "item" : "items"}`;
}
