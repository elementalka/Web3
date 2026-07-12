import "dotenv/config";
import { TelegramBotService } from "../src/services/telegramBot";

async function main() {
  const bot = new TelegramBotService();
  const me = await bot.getMe();
  console.log(JSON.stringify({
    ok: true,
    bot: `@${me.username}`,
    id: me.id,
    firstName: me.first_name,
    telegramWebAppConfigured: Boolean(process.env.TELEGRAM_WEBAPP_URL),
    telegramWebhookConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL)
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
