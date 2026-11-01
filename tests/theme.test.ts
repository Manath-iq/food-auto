import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeTheme,
  observeColorScheme,
  resolveColorScheme,
  syncTelegramChrome,
  type ColorScheme,
  type TelegramAppearance,
} from "../src/theme.ts";

function appearance() {
  let nativeListener: (() => void) | undefined;
  let systemListener: (() => void) | undefined;
  const tg: TelegramAppearance = {
    initData: "telegram-session",
    colorScheme: "light",
    onEvent(event, handler) {
      assert.equal(event, "themeChanged");
      nativeListener = handler;
    },
    offEvent(event, handler) {
      assert.equal(event, "themeChanged");
      assert.equal(handler, nativeListener);
      nativeListener = undefined;
    },
  };
  const system = {
    matches: true,
    addEventListener(_event: "change", listener: () => void) {
      systemListener = listener;
    },
    removeEventListener(_event: "change", listener: () => void) {
      assert.equal(listener, systemListener);
      systemListener = undefined;
    },
  };
  return {
    tg,
    system,
    nativeChange: () => nativeListener?.(),
    systemChange: () => systemListener?.(),
  };
}

test("Telegram theme takes priority over the device and browser SDK defaults are ignored", () => {
  assert.equal(
    resolveColorScheme({ initData: "session", colorScheme: "light" }, true),
    "light",
  );
  assert.equal(
    resolveColorScheme({ platform: "ios", colorScheme: "dark" }, false),
    "dark",
  );
  assert.equal(
    resolveColorScheme(
      { initData: "", platform: "unknown", colorScheme: "light" },
      true,
    ),
    "dark",
  );
  assert.equal(resolveColorScheme(undefined, false), "light");
  assert.equal(
    resolveColorScheme({ initData: "session", colorScheme: "invalid" }, true),
    "dark",
  );
});

test("a Telegram themeChanged event updates the palette without restarting and listeners are removed", () => {
  const source = appearance();
  const schemes: ColorScheme[] = [];
  const stop = observeColorScheme(source.tg, source.system, (scheme) =>
    schemes.push(scheme),
  );
  source.tg.colorScheme = "dark";
  source.nativeChange();
  source.tg.colorScheme = "light";
  source.nativeChange();
  source.system.matches = false;
  source.systemChange();
  assert.deepEqual(schemes, ["light", "dark", "light", "light"]);
  stop();
  source.nativeChange();
  source.systemChange();
  assert.equal(schemes.length, 4);
});

test("ordinary browsers follow live device theme changes", () => {
  const source = appearance();
  source.tg.initData = "";
  source.tg.platform = "unknown";
  const schemes: ColorScheme[] = [];
  const stop = observeColorScheme(source.tg, source.system, (scheme) =>
    schemes.push(scheme),
  );
  source.system.matches = false;
  source.systemChange();
  assert.deepEqual(schemes, ["dark", "light"]);
  stop();
});

test("an explicit design preview remains stable when the device or Telegram theme changes", () => {
  const source = appearance();
  const schemes: ColorScheme[] = [];
  const stop = observeColorScheme(
    source.tg,
    source.system,
    (scheme) => schemes.push(scheme),
    "dark",
  );
  source.system.matches = false;
  source.systemChange();
  source.nativeChange();
  assert.deepEqual(schemes, ["dark", "dark", "dark"]);
  stop();
});

test("native header, background and bottom bar use the active palette", () => {
  const calls: string[] = [];
  const tg = {
    platform: "ios",
    isVersionAtLeast: () => true,
    setHeaderColor: (color: string) => calls.push(`header:${color}`),
    setBackgroundColor: (color: string) => calls.push(`background:${color}`),
    setBottomBarColor: (color: string) => calls.push(`bottom:${color}`),
  };
  syncTelegramChrome(tg, "#f6f7f2");
  syncTelegramChrome(tg, "#191d1c");
  assert.deepEqual(calls, [
    "header:#f6f7f2",
    "background:#f6f7f2",
    "bottom:#f6f7f2",
    "header:#191d1c",
    "background:#191d1c",
    "bottom:#191d1c",
  ]);
});

test("older Telegram clients use supported APIs and native errors do not block theme updates", () => {
  const calls: string[] = [];
  const tg = {
    initData: "session",
    isVersionAtLeast: (version: string) => version === "6.1",
    setHeaderColor: (color: string) => {
      calls.push(color);
      throw new Error("unsupported");
    },
    setBackgroundColor: (color: string) => calls.push(color),
    setBottomBarColor: () => assert.fail("Not supported before Telegram 7.10"),
  };
  assert.doesNotThrow(() => syncTelegramChrome(tg, "#f6f7f2"));
  assert.deepEqual(calls, ["bg_color", "#f6f7f2"]);
  syncTelegramChrome({ ...tg, isVersionAtLeast: () => false }, "#191d1c");
  syncTelegramChrome({ ...tg, initData: "" }, "#191d1c");
  assert.equal(calls.length, 2);
});

test("theme initialization updates document, browser chrome and Telegram chrome on every native change", (t) => {
  const source = appearance();
  const root = { dataset: { theme: "" } };
  const chrome: string[] = [];
  const events: string[] = [];
  const meta: string[] = [];
  source.tg.setBackgroundColor = (color) => chrome.push(color);
  const browser = {
    getComputedStyle: () => ({
      getPropertyValue: () =>
        root.dataset.theme === "light" ? "#f6f7f2" : "#191d1c",
    }),
    document: {
      documentElement: root,
      querySelector: () => ({
        setAttribute: (_key: string, value: string) => meta.push(value),
      }),
    },
    window: {
      Telegram: { WebApp: source.tg },
      matchMedia: () => source.system,
      dispatchEvent: (event: Event) => {
        events.push(event.type);
        return true;
      },
    },
  };
  for (const [name, value] of Object.entries(browser)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const stop = initializeTheme();
  assert.equal(root.dataset.theme, "light");
  source.tg.colorScheme = "dark";
  source.nativeChange();
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(chrome, ["#f6f7f2", "#191d1c"]);
  assert.deepEqual(meta, chrome);
  assert.deepEqual(events, ["kitchen-theme-changed", "kitchen-theme-changed"]);
  stop();
});
