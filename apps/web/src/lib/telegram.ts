export interface TelegramWebApp {
  initData: string;
  version?: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "success" | "warning" | "error") => void;
  };
}

let didBoot = false;

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function bootTelegram(): TelegramWebApp | undefined {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return undefined;
  if (didBoot) return webApp;

  webApp.ready();
  webApp.expand();
  if (webApp.isVersionAtLeast?.("6.1")) {
    webApp.setHeaderColor("#07090d");
    webApp.setBackgroundColor("#07090d");
  }
  didBoot = true;
  return webApp;
}
