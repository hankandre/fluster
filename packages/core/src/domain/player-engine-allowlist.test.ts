// T2-05 acceptance item 4: the command list is fixed. Adding a port member or an event kind fails this test
// until the allowlists below change, which needs a Product Owner ruling and docs/security.md (DOMAINS.md §6).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLAYER_ENGINE_METHODS, PLAYER_EVENT_KINDS } from "./player-engine";

// Six commands (initialize, launch, pause, seek, select track, stop) and the one event subscription.
const ALLOWED_MEMBERS = ["initialize", "subscribe", "launch", "setPaused", "seek", "selectTrack", "stop"];
const ALLOWED_EVENT_KINDS = ["loaded", "first-frame", "state", "tracks-changed", "ended", "error"];

const here = dirname(fileURLToPath(import.meta.url));
const portSource = readFileSync(join(here, "player-engine.ts"), "utf8");

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// The text of `export interface PlayerEngine … { … }`, header and body, up to its matching brace.
function portBlock(source: string): { header: string; body: string } {
  const code = withoutComments(source);
  const start = code.indexOf("export interface PlayerEngine");
  if (start < 0) throw new Error("player-engine.ts has no `export interface PlayerEngine`");
  const open = code.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "{") depth += 1;
    if (code[index] === "}") depth -= 1;
    if (depth === 0) return { header: code.slice(start, open), body: code.slice(open + 1, index) };
  }
  throw new Error("the PlayerEngine block never closes");
}

// One name per member: a line that starts a member at the block's top level. Lines inside a member's
// parameter list or type (open brackets) are skipped.
function memberNames(body: string): string[] {
  const names: string[] = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    const match = /^\s*(readonly\s+)?(\w+)\s*[(:?<]/.exec(line);
    if (depth === 0 && match) names.push(match[2]);
    for (const char of line) {
      if (char === "(" || char === "{" || char === "[") depth += 1;
      if (char === ")" || char === "}" || char === "]") depth -= 1;
    }
  }
  return names;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe("the PlayerEngine member allowlist", () => {
  it("is the only PlayerEngine declaration, with no extends and no index signature", () => {
    const declarations = withoutComments(portSource).match(/\b(interface|type|class)\s+PlayerEngine\b/g) ?? [];
    expect(declarations).toHaveLength(1);
    const { header, body } = portBlock(portSource);
    expect(header).not.toMatch(/\bextends\b/);
    expect(body).not.toMatch(/^\s*(readonly\s+)?\[/m);
  });

  it("has exactly the allowed members", () => {
    const names = memberNames(portBlock(portSource).body);
    expect(names).toHaveLength(new Set(names).size);
    expect(sorted(names)).toEqual(sorted(ALLOWED_MEMBERS));
  });

  it("matches PLAYER_ENGINE_METHODS", () => {
    expect(PLAYER_ENGINE_METHODS).toHaveLength(ALLOWED_MEMBERS.length);
    expect(sorted(PLAYER_ENGINE_METHODS)).toEqual(sorted(ALLOWED_MEMBERS));
  });

  it("catches an added member, so the check cannot pass vacuously", () => {
    const { body } = portBlock(portSource);
    const widened = `${body}\n  setVolume(volume: number): Promise<void>;\n`;
    expect(sorted(memberNames(widened))).not.toEqual(sorted(ALLOWED_MEMBERS));
    expect(memberNames(widened)).toContain("setVolume");
  });
});

describe("the PlayerEvent kind allowlist", () => {
  it("has exactly the allowed event kinds, in the union and in PLAYER_EVENT_KINDS", () => {
    const code = withoutComments(portSource);
    const start = code.indexOf("export type PlayerEvent ");
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = code.slice(start + 1);
    const ends = [rest.indexOf("\nexport "), rest.indexOf("\n\n")].filter((index) => index >= 0);
    const union = rest.slice(0, ends.length > 0 ? Math.min(...ends) : undefined);
    const kinds = [...union.matchAll(/kind:\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(kinds).toHaveLength(new Set(kinds).size);
    expect(sorted(kinds)).toEqual(sorted(ALLOWED_EVENT_KINDS));
    expect(PLAYER_EVENT_KINDS).toHaveLength(ALLOWED_EVENT_KINDS.length);
    expect(sorted(PLAYER_EVENT_KINDS)).toEqual(sorted(ALLOWED_EVENT_KINDS));
  });
});
