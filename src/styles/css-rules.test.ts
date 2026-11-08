import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for P13-02: outside src/styles/ (tokens and base layer), CSS has no colour literals and no
// bare label, input, select, or heading selectors. A selector is bare when it has no class, id, or attribute
// part, so `.home h1` is scoped and allowed but `h1` and `input:focus` are not.

const srcDir = join(__dirname, "..");
const stylesDir = __dirname;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

const featureCss = cssFiles(srcDir).filter((file) => !file.startsWith(stylesDir + sep));

// Named, system, and context colours. `transparent` stays allowed (the native video surface needs it).
const NAMED_COLOURS = new Set(
  (
    "currentcolor canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext " +
    "highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext " +
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray " +
    "darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue " +
    "firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew " +
    "hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
    "lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue " +
    "mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple " +
    "rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue " +
    "slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen"
  ).split(" "),
);

interface Rule {
  prelude: string;
  body: string;
}

// Collects every `prelude { body }` block at any depth, with comments removed.
function rules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Rule[] = [];
  const stack: { prelude: string; start: number }[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      stack.push({ prelude: text.slice(last, i).split(/[;}]/).pop()!.trim(), start: i + 1 });
      last = i + 1;
    } else if (ch === "}") {
      const open = stack.pop();
      if (open) found.push({ prelude: open.prelude, body: text.slice(open.start, i) });
      last = i + 1;
    } else if (ch === ";") {
      last = i + 1;
    }
  }
  return found;
}

function declarationValues(body: string): string[] {
  // Only this rule's own declarations: text before a nested `{` is that block's prelude, not a value.
  const values: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "{") {
      depth += 1;
      current = "";
    } else if (ch === "}") {
      depth -= 1;
      current = "";
    } else if (depth === 0 && ch === ";") {
      values.push(current.slice(current.indexOf(":") + 1));
      current = "";
    } else if (depth === 0) {
      current += ch;
    }
  }
  if (current.includes(":")) values.push(current.slice(current.indexOf(":") + 1));
  return values.filter((value) => value.trim() !== "");
}

function colourLiterals(value: string): string[] {
  const stripped = value.replace(/var\(--[\w-]+/g, "var(").replace(/url\([^)]*\)/g, "").replace(/"[^"]*"/g, "");
  const hits: string[] = [];
  for (const match of stripped.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) hits.push(match[0]);
  for (const match of stripped.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/g)) hits.push(match[0]);
  for (const match of stripped.matchAll(/\b[a-z]+\b/g)) if (NAMED_COLOURS.has(match[0])) hits.push(match[0]);
  return hits;
}

const BARE_TARGETS = /^(label|input|select|h[1-6])$/;

function bareSelectors(prelude: string): string[] {
  if (prelude.startsWith("@")) return [];
  const selectors: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of prelude) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      selectors.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  selectors.push(current);
  return selectors
    .map((selector) => selector.trim())
    .filter((selector) => {
      if (/[.#[]/.test(selector)) return false;
      // Look inside :where(), :is(), :not(), and :has() so `:where(h1)` still counts as bare.
      const flattened = selector.replace(/:(?:where|is|not|has|matches)\(/g, " ").replace(/\)/g, " ");
      const parts = flattened.replace(/::?[\w-]+(\([^)]*\))?/g, " ").split(/[\s>+~,]+/);
      return parts.some((part) => BARE_TARGETS.test(part));
    });
}

describe("feature CSS (everything outside src/styles/)", () => {
  it("finds the feature stylesheet", () => {
    expect(featureCss.map((file) => relative(srcDir, file))).toContain("styles.css");
  });

  for (const file of featureCss) {
    const name = relative(srcDir, file);
    const parsed = rules(readFileSync(file, "utf8"));

    it(`${name} has no colour literals`, () => {
      const hits = parsed.flatMap((rule) => declarationValues(rule.body).flatMap(colourLiterals));
      expect(hits).toEqual([]);
    });

    it(`${name} has no bare label, input, select, or heading selectors`, () => {
      expect(parsed.flatMap((rule) => bareSelectors(rule.prelude))).toEqual([]);
    });
  }

  it("detects what it should (self-check)", () => {
    expect(colourLiterals("1px solid #fff")).toEqual(["#fff"]);
    expect(colourLiterals("rgba(0,0,0,.5)")).toEqual(["rgba("]);
    expect(colourLiterals("white")).toEqual(["white"]);
    expect(colourLiterals("var(--text-1) transparent")).toEqual([]);
    const nested = rules("@layer a { .x { color: #fff; } .y { margin: 0; } }").flatMap((rule) => declarationValues(rule.body).flatMap(colourLiterals));
    expect(nested).toEqual(["#fff"]);
    expect(bareSelectors("h1")).toEqual(["h1"]);
    expect(bareSelectors("input:focus, select")).toEqual(["input:focus", "select"]);
    expect(bareSelectors(".home h1")).toEqual([]);
    expect(bareSelectors(":where(h1)")).toEqual([":where(h1)"]);
    expect(colourLiterals("light-dark(#fff, #000)").length).toBeGreaterThan(0);
    expect(colourLiterals("currentColor")).toEqual([]);
    expect(bareSelectors("@media (max-width: 600px)")).toEqual([]);
  });
});

describe("fonts", () => {
  const fontDir = join(srcDir, "assets", "fonts");

  it("self-hosts both faces as woff2 with the OFL text", () => {
    expect(existsSync(join(fontDir, "AtkinsonHyperlegibleNext-Variable.woff2"))).toBe(true);
    expect(existsSync(join(fontDir, "AtkinsonHyperlegibleMono-Variable.woff2"))).toBe(true);
    expect(readFileSync(join(fontDir, "OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("loads no font or stylesheet from a remote origin", () => {
    const sources = [...cssFiles(srcDir), join(srcDir, "..", "index.html")].map((file) => readFileSync(file, "utf8"));
    for (const source of sources) expect(source).not.toMatch(/https?:\/\/[^\s"')]*(font|gstatic|typekit|bunny)/i);
    for (const source of sources) expect(source).not.toMatch(/@import\s+url\(\s*["']?https?:/i);
  });
});
