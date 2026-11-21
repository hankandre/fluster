import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// T2-08 item 5: every endpoint the core calls, whether the pinned Jellyscale answers it, and the Jellyscale issue
// for each gap. The data is recorded by `tsx tests/integration/record-jellyscale-fixtures.ts --endpoints` into
// fixtures/jellyscale/<12 hex>/endpoints.json and kept by hand in endpoint-issues.json beside it. endpoint-issues.json
// maps "METHOD /path/{template}" (as endpoints.json names the route) to a positive issue number or "not yet filed".
// There is one `it` per route, so the report is the list.
const coreRoot = join(__dirname, "../..");
const fixturesRoot = join(coreRoot, "tests/fixtures/jellyscale");
const composePath = join(coreRoot, "../../tests/integration/docker-compose.yml");

interface Route {
  method: string;
  path: string;
  declared?: string | null;
  http?: number | string | null;
}
interface Inventory {
  pin?: string;
  recorded?: string;
  routes?: Route[];
}

function pinSha(): string {
  const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(composePath, "utf8"))?.[1];
  if (!sha) throw new Error("docker-compose.yml has no x-jellyscale-commit of 40 hex characters");
  return sha;
}

function pinFolders(): string[] {
  if (!existsSync(fixturesRoot)) return [];
  return readdirSync(fixturesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

// Eager globs, so a missing folder gives an empty list and the structural tests fail, not the import.
const inventories = import.meta.glob("../../tests/fixtures/jellyscale/*/endpoints.json", { eager: true, import: "default" }) as Record<string, Inventory>;
const issueFiles = import.meta.glob("../../tests/fixtures/jellyscale/*/endpoint-issues.json", { eager: true, import: "default" }) as Record<string, Record<string, unknown>>;
const inventory: Inventory | undefined = Object.values(inventories)[0];
const issues: Record<string, unknown> = Object.values(issueFiles)[0] ?? {};
const routes: Route[] = inventory?.routes ?? [];

// A path template with every parameter reduced to {} so names (itemId, seriesId) do not matter.
const shape = (path: string): string => path.replace(/\$\{[^}]*\}|\{[^}]*\}/g, "{}");
const keyOf = (method: string, path: string): string => `${method} ${shape(path)}`;
// A recorded path from the golden: PascalCase segments are routes, anything else is an id.
const goldenShape = (path: string): string => "/" + path.split("/").filter(Boolean).map((segment) => (/^[A-Z]/.test(segment) ? segment : "{}")).join("/");

// (b) Path literals the core passes to this.get / post / delete / report, across line breaks and a generic <...>.
export function parseGatewayCalls(source: string): string[] {
  const found: string[] = [];
  const call = /this\.(get|post|delete|report)\s*(?:<[^()]*?>)?\s*\(\s*(["'`])(\/[^"'`]*)\2/g;
  for (const match of source.matchAll(call)) {
    found.push(keyOf(match[1] === "get" ? "GET" : match[1] === "delete" ? "DELETE" : "POST", match[3]));
  }
  return found;
}

function transportRoutes(source: string): string[] {
  return [...source.matchAll(/["`}](\/[A-Z][A-Za-z]*(?:\/[A-Z][A-Za-z]*)*)["`]/g)].map((match) => keyOf("POST", match[1]));
}

// (a) Every distinct request the wire golden records.
function goldenRoutes(): string[] {
  const golden = JSON.parse(readFileSync(join(coreRoot, "tests/fixtures/gateway-requests.json"), "utf8")) as {
    scenarios: { requests: { method: string; path: string }[] }[];
  };
  return golden.scenarios.flatMap((scenario) => scenario.requests.map((request) => keyOf(request.method, goldenShape(request.path))));
}

// (c) The media routes the core builds or rebuilds, which a player fetches with the header (ARCHITECTURE.md section 3).
const MEDIA_ROUTES = [
  keyOf("GET", "/Videos/{itemId}/stream"),
  keyOf("GET", "/Items/{itemId}/Images/{type}"),
  keyOf("GET", "/Videos/{itemId}/master.m3u8"),
  keyOf("GET", "/Videos/{itemId}/{sourceId}/Subtitles/{index}/{file}"),
];

function coreRoutes() {
  const gateway = parseGatewayCalls(readFileSync(join(__dirname, "gateway.ts"), "utf8"));
  const transport = transportRoutes(readFileSync(join(coreRoot, "src/adapters/fetch-transport.ts"), "utf8"));
  const golden = goldenRoutes();
  return { gateway, transport, golden, union: [...new Set([...golden, ...gateway, ...transport, ...MEDIA_ROUTES])].sort() };
}

const isAnswered = (route: Route): boolean =>
  (route.declared === "implemented" || route.declared === "alias") && typeof route.http === "number" && route.http >= 200 && route.http < 300;
const labelOf = (route: Route): string => {
  if (isAnswered(route)) return "answered";
  if (route.declared === "stub") return "stub";
  if (route.declared === "implemented" || route.declared === "alias") return "not reached";
  return route.http === "not reached" ? "not reached" : "missing";
};
const issueOf = (route: Route): unknown => issues[keyOf(route.method, route.path)];
const isIssue = (value: unknown): boolean => value === "not yet filed" || (typeof value === "number" && Number.isInteger(value) && value > 0);
const issueText = (value: unknown): string => (typeof value === "number" ? `Jellyscale #${value}` : value === "not yet filed" ? "not yet filed" : "no issue named");

describe("T2-08 item 5: the endpoint inventory", () => {
  it("keeps one pin folder holding endpoints.json for the pinned commit", () => {
    expect(pinFolders()).toEqual([pinSha().slice(0, 12)]);
    expect(inventory?.pin).toBe(pinSha());
    expect(inventory?.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(routes.length).toBeGreaterThan(0);
  });

  it("records every route with a method, a path template, what Jellyscale declares and the HTTP status it gave", () => {
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(["GET", "POST", "DELETE"], `${route.method} ${route.path}`).toContain(route.method);
      expect(route.path.startsWith("/"), route.path).toBe(true);
      expect(route.path, route.path).not.toMatch(/[?#]|[0-9a-f]{32}/);
      expect("declared" in route && "http" in route, `${route.method} ${route.path}`).toBe(true);
    }
  });

  it("lists every endpoint the core calls", () => {
    const recorded = new Set(routes.map((route) => keyOf(route.method, route.path)));
    const missing = coreRoutes().union.filter((key) => !recorded.has(key));
    expect(missing).toEqual([]);
  });

  it("finds no call in gateway.ts or fetch-transport.ts that the wire golden and the media routes miss", () => {
    const { gateway, transport, golden } = coreRoutes();
    const known = new Set([...golden, ...MEDIA_ROUTES]);
    expect([...gateway, ...transport].filter((key) => !known.has(key))).toEqual([]);
  });

  it("gives every gap an entry in endpoint-issues.json", () => {
    expect(routes.length).toBeGreaterThan(0);
    const gaps = routes.filter((route) => !isAnswered(route)).map((route) => keyOf(route.method, route.path));
    expect(gaps.filter((key) => !(key in issues))).toEqual([]);
  });

  it("holds only a positive issue number or \"not yet filed\" in endpoint-issues.json", () => {
    expect(Object.keys(issues).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(issues)) expect(isIssue(value), key).toBe(true);
  });

  it("holds no issue entry for a route Jellyscale answers", () => {
    expect(routes.length).toBeGreaterThan(0);
    const stale = routes.filter((route) => isAnswered(route) && issueOf(route) !== undefined).map((route) => keyOf(route.method, route.path));
    expect(stale).toEqual([]);
  });

  describe("routes", () => {
    // One case per route, titled from the data, for example "GET /Shows/NextUp: stub, Jellyscale #101".
    it.each(routes.map((route) => [`${route.method} ${route.path}: ${labelOf(route)}, ${isAnswered(route) ? "answered" : issueText(issueOf(route))}`, route] as const))(
      "%s",
      (_title, route) => {
        if (!isAnswered(route)) expect(isIssue(issueOf(route)), "a gap names its issue number or says not yet filed").toBe(true);
      },
    );
  });

  describe("the gateway source parser", () => {
    it("reads a call whose path is on the next line after a generic", () => {
      const source = ['await this.get<MediaSegmentsResponse>(', '  `/MediaSegments/${encodeURIComponent(itemId)}`,', "  {},", ");"].join("\n");
      expect(parseGatewayCalls(source)).toEqual(["GET /MediaSegments/{}"]);
    });

    it("reads post, delete and report calls and ignores a path held in a variable", () => {
      const source = [
        'await this.post("/Users/Configuration", next, {});',
        'await this.delete<void>(\n  "/Videos/ActiveEncodings",\n  {});',
        'return this.report("/Sessions/Playing", plan);',
        "await this.get(url, config);",
      ].join("\n");
      expect(parseGatewayCalls(source)).toEqual(["POST /Users/Configuration", "DELETE /Videos/ActiveEncodings", "POST /Sessions/Playing"]);
    });

    it("finds the multi-line MediaSegments call in the real gateway", () => {
      expect(coreRoutes().gateway).toContain("GET /MediaSegments/{}");
    });
  });
});
