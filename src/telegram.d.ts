import type { TelegramUser } from "./types.ts";
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { user?: TelegramUser; start_param?: string };
        ready(): void;
        expand(): void;
        setHeaderColor(c: string): void;
        setBackgroundColor(c: string): void;
        HapticFeedback?: { impactOccurred(s: string): void };
        BackButton: {
          show(): void;
          hide(): void;
          onClick(f: () => void): void;
          offClick(f: () => void): void;
        };
        openTelegramLink(url: string): void;
      };
    };
  }
}
