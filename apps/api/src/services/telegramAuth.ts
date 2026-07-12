import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function validateTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): TelegramUserPayload {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) {
    throw new Error("Telegram initData hash is missing");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const received = Buffer.from(receivedHash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");
  if (received.length !== calculated.length || !timingSafeEqual(received, calculated)) {
    throw new Error("Telegram initData signature is invalid");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new Error("Telegram auth_date is missing");
  }

  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) {
    throw new Error("Telegram initData is expired");
  }

  const user = params.get("user");
  if (!user) {
    throw new Error("Telegram user payload is missing");
  }

  return JSON.parse(user) as TelegramUserPayload;
}
