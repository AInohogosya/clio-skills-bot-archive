type LinearCategory = "length" | "mass" | "volume" | "speed" | "data";
type LinearUnit = { category: LinearCategory; factor: number; label: string };

const linearUnits: Record<string, LinearUnit> = {
  mm: { category: "length", factor: 0.001, label: "mm" }, cm: { category: "length", factor: 0.01, label: "cm" }, m: { category: "length", factor: 1, label: "m" }, km: { category: "length", factor: 1000, label: "km" }, mi: { category: "length", factor: 1609.344, label: "mi" }, yd: { category: "length", factor: 0.9144, label: "yd" }, ft: { category: "length", factor: 0.3048, label: "ft" }, in: { category: "length", factor: 0.0254, label: "in" },
  mg: { category: "mass", factor: 0.000001, label: "mg" }, g: { category: "mass", factor: 0.001, label: "g" }, kg: { category: "mass", factor: 1, label: "kg" }, lb: { category: "mass", factor: 0.45359237, label: "lb" }, oz: { category: "mass", factor: 0.028349523125, label: "oz" },
  ml: { category: "volume", factor: 0.001, label: "mL" }, l: { category: "volume", factor: 1, label: "L" }, gal: { category: "volume", factor: 3.785411784, label: "gal" }, cup: { category: "volume", factor: 0.2365882365, label: "cup" },
  "m/s": { category: "speed", factor: 1, label: "m/s" }, "km/h": { category: "speed", factor: 1 / 3.6, label: "km/h" }, mph: { category: "speed", factor: 0.44704, label: "mph" },
  b: { category: "data", factor: 1, label: "B" }, kb: { category: "data", factor: 1000, label: "KB" }, mb: { category: "data", factor: 1000 ** 2, label: "MB" }, gb: { category: "data", factor: 1000 ** 3, label: "GB" }, tb: { category: "data", factor: 1000 ** 4, label: "TB" }, kib: { category: "data", factor: 1024, label: "KiB" }, mib: { category: "data", factor: 1024 ** 2, label: "MiB" }, gib: { category: "data", factor: 1024 ** 3, label: "GiB" },
};

const unitAliases: Record<string, string> = {
  キロメートル: "km", メートル: "m", センチメートル: "cm", ミリメートル: "mm", マイル: "mi", フィート: "ft", インチ: "in",
  キログラム: "kg", グラム: "g", ミリグラム: "mg", ポンド: "lb", オンス: "oz",
  リットル: "l", ミリリットル: "ml", ガロン: "gal", カップ: "cup",
  バイト: "b", キロバイト: "kb", メガバイト: "mb", ギガバイト: "gb", テラバイト: "tb",
  摂氏: "c", 華氏: "f", ケルビン: "k",
};

function normalizeUnit(value: string): string {
  const trimmed = value.trim();
  return unitAliases[trimmed] ?? trimmed.toLowerCase().replace(/[°\s]/g, "");
}

function conciseNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("結果が有限の数になりませんでした。");
  return new Intl.NumberFormat("ja-JP", { maximumSignificantDigits: 10 }).format(value);
}

/** Deterministic unit conversion with explicit categories and absolute-zero validation. */
export function unitConverterReply(input: string): string {
  const match = input.match(/(-?\d+(?:\.\d+)?)\s*([^\s]+)\s*(?:to|→|を|から)\s*([^\s]+?)(?:に|へ)?(?:\s|$)/i);
  if (!match) return "単位換算の例: `2.5 km to mi`、`100 cm を m に`、`32 F to C`。長さ・重量・体積・速度・データ容量・温度に対応しています。";
  const value = Number(match[1]);
  const source = normalizeUnit(match[2]);
  const target = normalizeUnit(match[3]);
  if (!Number.isFinite(value)) return "数値を読み取れませんでした。小数には `.` を使ってください。";

  if (["c", "f", "k"].includes(source) || ["c", "f", "k"].includes(target)) {
    if (!["c", "f", "k"].includes(source) || !["c", "f", "k"].includes(target)) return "温度は温度どうしで換算してください。例: `32 F to C`。";
    const kelvin = source === "c" ? value + 273.15 : source === "f" ? (value - 32) * 5 / 9 + 273.15 : value;
    if (kelvin < 0) return "絶対零度より低い温度は扱えません。";
    const result = target === "c" ? kelvin - 273.15 : target === "f" ? (kelvin - 273.15) * 9 / 5 + 32 : kelvin;
    return `Unit conversion\n\n${conciseNumber(value)} ${source.toUpperCase()} = **${conciseNumber(result)} ${target.toUpperCase()}**`;
  }

  const from = linearUnits[source];
  const to = linearUnits[target];
  if (!from || !to) return "対応していない単位です。例: km, m, kg, lb, L, mL, mph, GB。";
  if (from.category !== to.category) return "異なる種類の単位は換算できません。長さ・重量・体積・速度・データ容量は同じ種類の単位どうしで指定してください。";
  return `Unit conversion\n\n${conciseNumber(value)} ${from.label} = **${conciseNumber(value * from.factor / to.factor)} ${to.label}**\n\nCategory: ${from.category}`;
}

type CalendarDate = { year: number; month: number; day: number; utc: number };
const DATE_PATTERN = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/g;

function parseCalendarDate(value: string): CalendarDate | null {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, utc };
}

function fromUtc(utc: number): CalendarDate {
  const date = new Date(utc);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), utc };
}

function formatCalendarDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function todayInJapan(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return parseCalendarDate(`${fields.year}-${fields.month}-${fields.day}`)!;
}

/** Calendar operations use date-only UTC arithmetic while interpreting "today" in Japan time. */
export function datePlannerReply(input: string): string {
  const dates = Array.from(input.matchAll(DATE_PATTERN)).map((match) => parseCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)).filter((date): date is CalendarDate => Boolean(date));
  if (/(weekday|曜日)/i.test(input) && dates[0]) {
    const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "long" }).format(new Date(dates[0].utc));
    return `Date Planner\n\n${formatCalendarDate(dates[0])} は **${weekday}** です。`;
  }
  if (/(between|日数|差|間)/i.test(input) && dates.length >= 2) {
    const days = Math.round((dates[1].utc - dates[0].utc) / 86_400_000);
    return `Date Planner\n\n${formatCalendarDate(dates[0])} から ${formatCalendarDate(dates[1])} までは **${Math.abs(days)}日**です。${days < 0 ? "（日付の順序を逆に指定しています）" : ""}`;
  }
  const after = input.match(/(\d+)\s*(?:days?\s*after|日後)/i);
  if (after && dates[0]) {
    const next = fromUtc(dates[0].utc + Number(after[1]) * 86_400_000);
    return `Date Planner\n\n${formatCalendarDate(dates[0])} の **${after[1]}日後**は ${formatCalendarDate(next)} です。`;
  }
  if (/(until|まであと|期限|締切)/i.test(input) && dates[0]) {
    const days = Math.round((dates[0].utc - todayInJapan().utc) / 86_400_000);
    return `Date Planner\n\n${formatCalendarDate(dates[0])} までは **${days}日**です（日本時間基準）。`;
  }
  return "日付スキルの例: `2026-04-10まであと何日`、`日数: 2026-04-01 から 2026-04-10`、`2026-04-01から30日後`、`曜日: 2026-04-10`。";
}

/** Uses JSON.parse/stringify only; no evaluation or user-provided code is executed. */
export function jsonToolkitReply(input: string): string {
  const start = input.search(/[\[{]/);
  if (start < 0) return "JSON Toolkitの例: `JSON整形: {\"name\":\"Clio\"}`、`JSON検証: [1,2]`、`JSON圧縮: {\"ok\":true}`、`JSONキー: {\"name\":\"Clio\"}`。";
  const raw = input.slice(start).replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const action = /minify|圧縮/i.test(input) ? "minify" : /validate|検証/i.test(input) ? "validate" : /keys?|キー/i.test(input) ? "keys" : "format";
  try {
    const value: unknown = JSON.parse(raw);
    if (action === "validate") return `JSON validation\n\n**Valid JSON**\nType: ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`;
    if (action === "keys") {
      if (!value || Array.isArray(value) || typeof value !== "object") return "JSON keys\n\nトップレベルがオブジェクトではないため、キー一覧はありません。";
      const keys = Object.keys(value as Record<string, unknown>);
      return `JSON keys\n\n${keys.length ? keys.map((key) => `• ${key}`).join("\n") : "（キーはありません）"}`;
    }
    return `JSON ${action === "minify" ? "minified" : "formatted"}\n\n${action === "minify" ? JSON.stringify(value) : JSON.stringify(value, null, 2)}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "JSONを解析できませんでした。";
    return `JSON validation failed\n\n${reason}\n\n二重引用符、カンマ、括弧の対応を確認してください。`;
  }
}
