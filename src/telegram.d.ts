import type { TelegramUser } from "./types.ts";
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        platform?: string;
        colorScheme?: "light" | "dark";
        initDataUnsafe: { user?: TelegramUser; start_param?: string };
        ready(): void;
        expand(): void;
        isFullscreen?: boolean;
        isVersionAtLeast?(version: string): boolean;
        requestFullscreen?(): void;
        setHeaderColor(c: string): void;
        setBackgroundColor(c: string): void;
        setBottomBarColor?(c: string): void;
        onEvent?(event: "themeChanged", handler: () => void): void;
        offEvent?(event: "themeChanged", handler: () => void): void;
        HapticFeedback?: { impactOccurred(s: string): void };
        BackButton: {
          show(): void;
          hide(): void;
          onClick(f: () => void): void;
          offClick(f: () => void): void;
        };
        openTelegramLink(url: string): void;
        shareMessage?(id: string, callback: (sent: boolean) => void): void;
      };
    };
  }
}
