export interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    web_app_data?: {
      data: string;
      button_text: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
  };
}

export class TelegramBotService {
  private readonly apiBase: string;

  constructor(private readonly token = process.env.TELEGRAM_BOT_TOKEN) {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }
    this.apiBase = `https://api.telegram.org/bot${token}`;
  }

  getMe(): Promise<TelegramBotInfo> {
    return this.call<TelegramBotInfo>("getMe", {});
  }

  setMenuButton(webAppUrl: string, text = "Open Casino"): Promise<boolean> {
    return this.call<boolean>("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text,
        web_app: { url: webAppUrl }
      }
    });
  }

  setCommands(): Promise<boolean> {
    return this.call<boolean>("setMyCommands", {
      commands: [
        { command: "start", description: "Open the casino app" },
        { command: "app", description: "Launch Mini App" },
        { command: "fair", description: "Provably fair proof" },
        { command: "support", description: "Support" }
      ]
    });
  }

  setDescriptions(): Promise<boolean[]> {
    return Promise.all([
      this.call<boolean>("setMyShortDescription", {
        short_description: "Provably fair Web3 casino Mini App"
      }),
      this.call<boolean>("setMyDescription", {
        description: "Open the Mini App to play Dice, Mines, Plinko, ORBIT and SIGNAL with provably fair proofs and bankroll limits."
      })
    ]);
  }

  setWebhook(webhookUrl: string, secretToken?: string): Promise<boolean> {
    const payload: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ["message"]
    };
    if (secretToken) {
      payload.secret_token = secretToken;
    }
    return this.call<boolean>("setWebhook", payload);
  }

  sendLaunchMessage(chatId: number, webAppUrl: string): Promise<unknown> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: "Web3 Casino is ready.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open Web3 Casino",
              web_app: { url: webAppUrl }
            }
          ]
        ]
      }
    });
  }

  sendText(chatId: number, text: string): Promise<unknown> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text
    });
  }

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as TelegramApiResult<T>;
    if (!response.ok || !data.ok) {
      throw new Error(data.description ?? `Telegram Bot API ${method} failed`);
    }
    return data.result as T;
  }
}
