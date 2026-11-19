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

  it("maps Home, End, and the digits to a share of the file, and a and i to the sheets", () => {
    expect(press("Home")).toEqual({ kind: "seek-to", fraction: 0 });
    expect(press("End")).toEqual({ kind: "seek-to", fraction: 1 });
    expect(press("0")).toEqual({ kind: "seek-to", fraction: 0 });
    expect(press("3")).toEqual({ kind: "seek-to", fraction: 0.3 });
    expect(press("9")).toEqual({ kind: "seek-to", fraction: 0.9 });
    expect(press("a")).toEqual({ kind: "open-tracks" });
    expect(press("A")).toEqual({ kind: "open-tracks" });
    expect(press("i")).toEqual({ kind: "toggle-info" });
    expect(press("I")).toEqual({ kind: "toggle-info" });
  });

  it("never repeats the new actions and ignores them with a modifier", () => {
    for (const key of ["Home", "End", "5", "a", "i"]) {
      expect(press(key, { repeat: true })).toBeUndefined();
      expect(press(key, { ctrlKey: true })).toBeUndefined();
      expect(press(key, { metaKey: true })).toBeUndefined();
      expect(press(key, { altKey: true })).toBeUndefined();
    }
  });

  it("acts on digits and i from a slider, but not from a text field", () => {
    const slider = element('<input type="range">');
    expect(press("5", { target: slider })).toEqual({ kind: "seek-to", fraction: 0.5 });
    expect(press("i", { target: slider })).toEqual({ kind: "toggle-info" });
    expect(press("End", { target: slider })).toBeUndefined();
    const field = element('<input type="text">');
    for (const key of ["5", "a", "i", "Home", "End"]) expect(press(key, { target: field })).toBeUndefined();
  });

  it("lets a focused list option keep its own keys and yield the rest", () => {
    const host = document.createElement("div");
    host.innerHTML = '<ul role="listbox"><li role="option" tabindex="0">English</li></ul>';
    const target = host.querySelector("li") as HTMLElement;
    for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "]) expect(press(key, { target })).toBeUndefined();
    expect(press("c", { target })).toEqual({ kind: "cycle-subtitles" });
    expect(press("m", { target })).toEqual({ kind: "toggle-mute" });
    expect(press("ArrowLeft", { target })).toEqual({ kind: "seek-by", seconds: -10 });
    expect(press("ArrowRight", { target })).toEqual({ kind: "seek-by", seconds: 10 });
    expect(press("Escape", { target })).toEqual({ kind: "escape" });
  });

  it("maps s to skip, n to play-next, and Enter to ok", () => {
    expect(press("s")).toEqual({ kind: "skip" });
    expect(press("S")).toEqual({ kind: "skip" });
    expect(press("n")).toEqual({ kind: "play-next" });
    expect(press("N")).toEqual({ kind: "play-next" });
    expect(press("Enter")).toEqual({ kind: "ok" });
  });

  it("gives Enter to the focused control, except a slider", () => {
    expect(press("Enter", { target: element("<button>Go</button>") })).toBeUndefined();
    expect(press("Enter", { target: element('<a href="#x">Go</a>') })).toBeUndefined();
    expect(press("Enter", { target: element('<ul role="listbox"><li role="option" id="o">A</li></ul>').firstElementChild })).toBeUndefined();
    expect(press("Enter", { target: element('<input type="text">') })).toBeUndefined();
    expect(press("Enter", { target: element('<input type="range">') })).toEqual({ kind: "ok" });
  });

  it("does not repeat skip, play-next, or ok, and ignores modified keys", () => {
    expect(press("s", { repeat: true })).toBeUndefined();
    expect(press("n", { repeat: true })).toBeUndefined();
    expect(press("Enter", { repeat: true })).toBeUndefined();
    expect(press("s", { ctrlKey: true })).toBeUndefined();
    expect(press("n", { metaKey: true })).toBeUndefined();
  });
});

describe("playerKeyAction in the TV form", () => {
  it("lets a focused scrolling region keep its scroll keys and yield the rest", () => {
    const target = element('<div role="group" tabindex="0" data-key-scroll=""></div>');
    for (const tv of [false, true]) {
      for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
        expect(press(key, { target, tv })).toBeUndefined();
      }
    }
    expect(press("m", { target })).toEqual({ kind: "toggle-mute" });
    expect(press("Escape", { target })).toEqual({ kind: "escape" });
  });

  it("wakes the chrome on an arrow from the player region and never changes the volume", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(press(key, { tv: true })).toEqual({ kind: "wake" });
    }
  });

  it("leaves arrows to a focused button, slider, or list", () => {
    for (const html of ["<button>Go</button>", '<input type="range">', '<ul role="listbox"><li role="option">A</li></ul>']) {
      const target = html.startsWith("<ul") ? element(html).firstElementChild : element(html);
      expect(press("ArrowRight", { tv: true, target })).toBeUndefined();
      expect(press("ArrowUp", { tv: true, target })).toBeUndefined();
    }
  });

  it("keeps the other keys and the desktop table", () => {
    expect(press("k", { tv: true })).toEqual({ kind: "toggle-pause" });
    expect(press("Enter", { tv: true })).toEqual({ kind: "ok" });
    expect(press("ArrowUp")).toEqual({ kind: "volume-by", amount: 5 });
  });

  describe("settings key and sheet regions", () => {
    it("maps o to the Settings sheet, upper case too, and not with modifiers or repeat", () => {
      expect(press("o")).toEqual({ kind: "toggle-settings" });
      expect(press("O")).toEqual({ kind: "toggle-settings" });
      expect(press("o", { ctrlKey: true })).toBeUndefined();
      expect(press("o", { metaKey: true })).toBeUndefined();
      expect(press("o", { altKey: true })).toBeUndefined();
      expect(press("o", { repeat: true })).toBeUndefined();
    });

    it("leaves o to a text field and lets a control-row button act", () => {
      expect(press("o", { target: element('<input type="text">') })).toBeUndefined();
      expect(press("o", { target: element("<button>Settings</button>") })).toEqual({ kind: "toggle-settings" });
    });

    it("lets an open typeahead list own every printable key", () => {
      const list = element('<ul role="listbox" data-typeahead=""><li role="option">Ten</li></ul>');
      const option = list.querySelector("li") as HTMLElement;
      for (const key of ["o", "a", "i", "5", "n"]) expect(press(key, { target: option })).toBeUndefined();
      expect(press("ArrowDown", { target: option })).toBeUndefined();
      // A plain listbox owns only its navigation keys.
      const plain = element('<ul role="listbox"><li role="option">Ten</li></ul>');
      expect(press("o", { target: plain.querySelector("li") as HTMLElement })).toEqual({ kind: "toggle-settings" });
    });

    it("lets a rows region own the keys that move between rows, and seek on desktop", () => {
      const region = element('<div data-key-rows=""><h2 tabindex="-1">Playback</h2><button>Row</button></div>');
      const heading = region.querySelector("h2") as HTMLElement;
      const button = region.querySelector("button") as HTMLElement;
      for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "]) {
        expect(press(key, { target: heading })).toBeUndefined();
        expect(press(key, { target: button })).toBeUndefined();
      }
      expect(press("ArrowLeft", { target: heading })).toEqual({ kind: "seek-by", seconds: -10 });
      expect(press("Escape", { target: button })).toEqual({ kind: "escape" });
    });

    it("does not wake the TV chrome from a rows region", () => {
      const heading = element('<div data-key-rows=""><h2 tabindex="-1">Playback</h2></div>').querySelector("h2") as HTMLElement;
      expect(press("ArrowDown", { tv: true, target: heading })).toBeUndefined();
      expect(press("ArrowDown", { tv: true, target: document.body })).toEqual({ kind: "wake" });
    });
  });
});
