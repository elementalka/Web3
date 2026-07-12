export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "success" | "warning" | "error") => void;
  };
}

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
  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor("#07090d");
  webApp.setBackgroundColor("#07090d");
  return webApp;
}
