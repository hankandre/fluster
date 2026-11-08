// Builds test-results/visual/index.html, a contact sheet linking every capture.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "test-results", "visual");
const sizes = readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory()).sort();

const sections = sizes.map((size) => {
  const files = readdirSync(join(dir, size)).filter((file) => file.endsWith(".png")).sort();
  const figures = files.map((file) => {
    const name = file.replace(/\.png$/, "");
    return `<figure><a href="${size}/${file}"><img loading="lazy" src="${size}/${file}" alt="${name}"></a><figcaption>${name}</figcaption></figure>`;
  });
  return `<h2>${size} (${files.length})</h2><div class="grid">${figures.join("")}</div>`;
});

const html = `<!doctype html>
<meta charset="utf-8">
<title>Fluster visual captures</title>
<style>
  body { margin: 24px; background: #111; color: #ddd; font: 14px/1.4 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  figure { margin: 0; }
  img { width: 100%; height: 180px; object-fit: cover; object-position: top; border: 1px solid #333; }
  figcaption { margin-top: 4px; }
  a { color: inherit; }
</style>
<h1>Fluster visual captures</h1>
${sections.join("\n")}
`;
writeFileSync(join(dir, "index.html"), html);
console.log(`wrote ${join(dir, "index.html")}`);
