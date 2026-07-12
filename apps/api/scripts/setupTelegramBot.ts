import "dotenv/config";
import { TelegramBotService } from "../src/services/telegramBot";

function requireHttpsUrl(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("https://")) {
    throw new Error(`${name} must be a public HTTPS URL`);
  }
  return value.replace(/\/$/, "");
}

async function main() {
  const webAppUrl = requireHttpsUrl(process.env.TELEGRAM_WEBAPP_URL, "TELEGRAM_WEBAPP_URL");
  const webhookBase = requireHttpsUrl(process.env.TELEGRAM_WEBHOOK_URL, "TELEGRAM_WEBHOOK_URL");

  if (!webAppUrl) {
    throw new Error("Set TELEGRAM_WEBAPP_URL in apps/api/.env before configuring the bot");
  }

  const bot = new TelegramBotService();
  const me = await bot.getMe();
  await bot.setMenuButton(webAppUrl, "Open Casino");
  await bot.setCommands();
  await bot.setDescriptions();

  const webhookUrl = webhookBase ? `${webhookBase}/api/telegram/webhook` : undefined;
  if (webhookUrl) {
    await bot.setWebhook(webhookUrl, process.env.TELEGRAM_WEBHOOK_SECRET);
  }

  console.log(JSON.stringify({
    ok: true,
    bot: `@${me.username}`,
    menuButton: "Open Casino",
    webAppUrl,
    webhookConfigured: Boolean(webhookUrl),
    directStartAppLink: `https://t.me/${me.username}?startapp=play`
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
