export type ColorScheme = "light" | "dark";

export type TelegramAppearance = {
  initData?: string;
  platform?: string;
  colorScheme?: string;
  onEvent?(event: "themeChanged", handler: () => void): void;
  offEvent?(event: "themeChanged", handler: () => void): void;
  isVersionAtLeast?(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
};

type SystemAppearance = {
  readonly matches: boolean;
  addEventListener(event: "change", listener: () => void): void;
  removeEventListener(event: "change", listener: () => void): void;
};

function isTelegram(tg?: TelegramAppearance): boolean {
  return Boolean(tg?.initData || (tg?.platform && tg.platform !== "unknown"));
}

export function resolveColorScheme(
  tg: TelegramAppearance | undefined,
  systemDark: boolean,
): ColorScheme {
  if (
    isTelegram(tg) &&
    (tg?.colorScheme === "light" || tg?.colorScheme === "dark")
  ) {
    return tg.colorScheme;
  }
  return systemDark ? "dark" : "light";
}

export function observeColorScheme(
  tg: TelegramAppearance | undefined,
  system: SystemAppearance,
  onChange: (scheme: ColorScheme) => void,
  preview?: ColorScheme,
): () => void {
  const sync = () =>
    onChange(preview ?? resolveColorScheme(tg, system.matches));
  system.addEventListener("change", sync);
  tg?.onEvent?.("themeChanged", sync);
  sync();
  return () => {
    system.removeEventListener("change", sync);
    tg?.offEvent?.("themeChanged", sync);
  };
}

export function syncTelegramChrome(
  tg: TelegramAppearance | undefined,
  background: string,
): void {
  if (!isTelegram(tg) || !background) return;
  const supports = (version: string) => tg?.isVersionAtLeast?.(version) ?? true;
  // Unsupported native methods must not prevent the CSS theme from updating.
  const safely = (action: () => void) => {
    try {
      action();
    } catch {}
  };
  if (supports("6.1")) {
    safely(() =>
      tg?.setHeaderColor?.(supports("6.9") ? background : "bg_color"),
    );
    safely(() => tg?.setBackgroundColor?.(background));
  }
  if (supports("7.10")) safely(() => tg?.setBottomBarColor?.(background));
}

export function initializeTheme(preview?: ColorScheme): () => void {
  const root = document.documentElement;
  const tg = window.Telegram?.WebApp;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  return observeColorScheme(
    tg,
    system,
    (scheme) => {
      root.dataset.theme = scheme;
      const background = getComputedStyle(root).getPropertyValue("--bg").trim();
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", background);
      syncTelegramChrome(tg, background);
      window.dispatchEvent(new Event("kitchen-theme-changed"));
    },
    preview,
  );
}
