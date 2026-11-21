import type { QueryPair } from "../ports/transport";

// Turns a params object into the ordered string pairs the Transport port carries: insertion order,
// undefined dropped, `String(value)`. An array or object value is a compile error.
export function toQuery(params: Record<string, string | number | boolean | undefined>): QueryPair[] {
  const pairs: QueryPair[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    pairs.push([name, String(value)]);
  }
  return pairs;
}
