import type { FastifyInstance } from "fastify";
import type { Store } from "../store";
import { addAnalytics } from "../services/audit";
import { TelegramBotService, type TelegramUpdate } from "../services/telegramBot";

export async function registerTelegramRoutes(app: FastifyInstance, store: Store): Promise<void> {
  app.post("/api/telegram/webhook", async (request, reply) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers["x-telegram-bot-api-secret-token"] !== secret) {
      reply.status(403).send({ ok: false });
      return;
    }

    const update = request.body as TelegramUpdate;
    const message = update.message;
    if (!message) {
      return { ok: true };
    }

    const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
    const bot = new TelegramBotService();
    const text = message.text?.trim().toLowerCase();

    addAnalytics(store.state, "telegram_update_received", {
      command: text,
      chatType: message.chat.type,
      hasWebAppData: Boolean(message.web_app_data)
    }, message.from ? `tg-${message.from.id}` : undefined);
    store.save();

    if (message.web_app_data) {
      await bot.sendText(message.chat.id, "Data received from Mini App.");
      return { ok: true };
    }

    if (!webAppUrl) {
      await bot.sendText(message.chat.id, "Mini App URL is not configured yet.");
      return { ok: true };
    }

    if (!text || text === "/start" || text.startsWith("/start ") || text === "/app") {
      await bot.sendLaunchMessage(message.chat.id, webAppUrl);
      return { ok: true };
    }

    if (text === "/fair") {
      await bot.sendText(message.chat.id, "Open the Mini App and check Provably Fair for the active server seed hash and bet proof.");
      return { ok: true };
    }

    if (text === "/support") {
      await bot.sendText(message.chat.id, "Open Wallet -> Support in the Mini App.");
      return { ok: true };
    }

    await bot.sendLaunchMessage(message.chat.id, webAppUrl);
    return { ok: true };
  });
}
