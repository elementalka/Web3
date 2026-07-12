import { Dices, Gem, Orbit, RadioTower, Waves, type LucideIcon } from "lucide-react";
import type { GameId } from "./lib/api";

export type Locale = "ru" | "en";

export interface GameMeta {
  id: GameId;
  name: string;
  eyebrow: Record<Locale, string>;
  description: Record<Locale, string>;
  accent: "cyan" | "amber" | "lime" | "violet" | "coral";
  icon: LucideIcon;
  rtp: string;
  volatility: Record<Locale, string>;
}

export const gameCatalog: GameMeta[] = [
  {
    id: "dice",
    name: "Dice",
    eyebrow: { ru: "Точный прогноз", en: "Precision roll" },
    description: { ru: "Выберите шанс и сторону броска.", en: "Choose the probability and roll side." },
    accent: "cyan",
    icon: Dices,
    rtp: "97.5%",
    volatility: { ru: "Гибкая", en: "Flexible" }
  },
  {
    id: "mines",
    name: "Mines",
    eyebrow: { ru: "Стратегия cashout", en: "Cashout strategy" },
    description: { ru: "Открывайте кристаллы, избегая мин.", en: "Reveal crystals while avoiding mines." },
    accent: "amber",
    icon: Gem,
    rtp: "96.5%",
    volatility: { ru: "Средняя", en: "Medium" }
  },
  {
    id: "plinko",
    name: "Plinko",
    eyebrow: { ru: "Физика вероятностей", en: "Probability physics" },
    description: { ru: "Восемь рядов, девять результатов.", en: "Eight rows and nine possible outcomes." },
    accent: "lime",
    icon: Waves,
    rtp: "96%",
    volatility: { ru: "3 режима", en: "3 modes" }
  },
  {
    id: "orbit",
    name: "ORBIT",
    eyebrow: { ru: "Аркадный импульс", en: "Arcade impulse" },
    description: { ru: "Выберите орбиту и запустите ядро.", en: "Select an orbit and ignite the core." },
    accent: "violet",
    icon: Orbit,
    rtp: "96%",
    volatility: { ru: "Высокая", en: "High" }
  },
  {
    id: "signal",
    name: "SIGNAL",
    eyebrow: { ru: "Радарный раунд", en: "Radar round" },
    description: { ru: "Поймайте один из пяти сигналов.", en: "Lock onto one of five signals." },
    accent: "coral",
    icon: RadioTower,
    rtp: "96%",
    volatility: { ru: "Высокая", en: "High" }
  }
];

export const signals = ["Alpha", "Nova", "Echo", "Ghost", "Pulse"] as const;

export function gameName(id: GameId): string {
  return gameCatalog.find((game) => game.id === id)?.name ?? id;
}

export function formatMoney(value: number, compact = false): string {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2
  }).format(Number.isFinite(value) ? value : 0)} USDC`;
}

export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
