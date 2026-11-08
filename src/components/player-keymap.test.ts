import { describe, expect, it } from "vitest";
import { playerKeyAction, type PlayerKeyInput } from "./player-keymap";

function press(key: string, overrides: Partial<PlayerKeyInput> = {}): ReturnType<typeof playerKeyAction> {
  return playerKeyAction({
    key,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: document.body,
    ...overrides,
  });
}

function element(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe("playerKeyAction", () => {
  it("maps the player shortcuts", () => {
    expect(press(" ")).toEqual({ kind: "toggle-pause" });
    expect(press("k")).toEqual({ kind: "toggle-pause" });
    expect(press("K")).toEqual({ kind: "toggle-pause" });
    expect(press("ArrowLeft")).toEqual({ kind: "seek-by", seconds: -10 });
    expect(press("j")).toEqual({ kind: "seek-by", seconds: -10 });
    expect(press("ArrowRight")).toEqual({ kind: "seek-by", seconds: 10 });
    expect(press("l")).toEqual({ kind: "seek-by", seconds: 10 });
    expect(press("ArrowUp")).toEqual({ kind: "volume-by", amount: 5 });
    expect(press("ArrowDown")).toEqual({ kind: "volume-by", amount: -5 });
    expect(press("m")).toEqual({ kind: "toggle-mute" });
    expect(press("f")).toEqual({ kind: "toggle-fullscreen" });
    expect(press("c")).toEqual({ kind: "cycle-subtitles" });
    expect(press("Escape")).toEqual({ kind: "escape" });
    expect(press("x")).toBeUndefined();
  });

  it("leaves modified keys to the browser and the system", () => {
    expect(press("f", { ctrlKey: true })).toBeUndefined();
    expect(press("k", { metaKey: true })).toBeUndefined();
    expect(press("ArrowLeft", { altKey: true })).toBeUndefined();
  });

  it("repeats seeking and volume while held, but not toggles", () => {
    expect(press("ArrowRight", { repeat: true })).toEqual({ kind: "seek-by", seconds: 10 });
    expect(press("ArrowUp", { repeat: true })).toEqual({ kind: "volume-by", amount: 5 });
    expect(press(" ", { repeat: true })).toBeUndefined();
    expect(press("f", { repeat: true })).toBeUndefined();
  });

  it("never fires while typing", () => {
    for (const html of ['<input type="text">', '<input type="search">', "<textarea></textarea>", '<div contenteditable="true"></div>']) {
      const target = element(html);
      if (html.includes("contenteditable")) Object.defineProperty(target, "isContentEditable", { value: true });
      expect(press("k", { target })).toBeUndefined();
      expect(press(" ", { target })).toBeUndefined();
      expect(press("Escape", { target })).toBeUndefined();
    }
  });

  it("lets a focused select keep all its keys, Escape included", () => {
    const target = element("<select><option>a</option></select>");
    expect(press("ArrowDown", { target })).toBeUndefined();
    expect(press("k", { target })).toBeUndefined();
    expect(press("Escape", { target })).toBeUndefined();
  });

  it("lets a focused slider keep its arrow keys", () => {
    const target = element('<input type="range">');
    expect(press("ArrowLeft", { target })).toBeUndefined();
    expect(press("ArrowUp", { target })).toBeUndefined();
    expect(press("Home", { target })).toBeUndefined();
    expect(press(" ", { target })).toEqual({ kind: "toggle-pause" });
    expect(press("m", { target })).toEqual({ kind: "toggle-mute" });
  });

  it("lets a focused button or link activate with Space and Enter", () => {
    for (const html of ["<button>Play</button>", '<a href="#x">Back</a>', '<input type="checkbox">']) {
      const target = element(html);
      expect(press(" ", { target })).toBeUndefined();
      expect(press("Enter", { target })).toBeUndefined();
      expect(press("ArrowRight", { target })).toEqual({ kind: "seek-by", seconds: 10 });
      expect(press("k", { target })).toEqual({ kind: "toggle-pause" });
    }
  });
});
