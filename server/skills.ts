import nerdamer from "nerdamer";
import { datePlannerReply, jsonToolkitReply, unitConverterReply } from "./localSkills";

/** The built-in skill order mirrors Unai: specific patterns are checked before the catch-all search chat. */
export const UNAI_SKILL_ORDER = [
  "greeting",
  "wikipedia",
  "ddgs",
  "date_planner",
  "calc",
  "unit_converter",
  "json_toolkit",
  "joke",
  "valves_test",
  "ddgs_chatbot",
] as const;

export type UnaiSkillId = (typeof UNAI_SKILL_ORDER)[number];

export type SkillCandidate = {
  id: UnaiSkillId;
  name: string;
  response: string;
  tokens: number;
  elapsedMs: number;
  source?: string;
};

export type RunSkillsInput = {
  message: string;
  enabledSkillIds: UnaiSkillId[];
  priority: UnaiSkillId[];
  valves?: SkillValves;
  executionMode?: "auto" | "review";
};

export type SkillValves = {
  maxResults: number;
  excludeQuestions: boolean;
  excludeQueryMatch: boolean;
  minSentenceLength: number;
};

export const defaultSkillValves: SkillValves = {
  maxResults: 8,
  excludeQuestions: true,
  excludeQueryMatch: true,
  minSentenceLength: 40,
};

const EXTERNAL_CACHE_TTL_MS = 5 * 60 * 1000;
const EXTERNAL_TIMEOUT_MS = 1800;
/** Server-side performance budgets; browser transport time is not included. */
export const SPEED_TARGETS = {
  staticAutoResponseMs: 50,
  firstExternalResponseMs: 2000,
  cachedExternalResponseMs: 50,
} as const;
type CacheEntry = { expiresAt: number; value: unknown };
const externalCache = new Map<string, CacheEntry>();
const inFlightExternalRequests = new Map<string, Promise<unknown>>();

/** Shares in-flight lookups and serves recent public results without waiting for the network. */
async function getCachedExternal<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = externalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) externalCache.delete(key);

  const current = inFlightExternalRequests.get(key) as Promise<T> | undefined;
  if (current) return current;

  const pending = loader()
    .then((value) => {
      externalCache.set(key, { expiresAt: Date.now() + EXTERNAL_CACHE_TTL_MS, value });
      return value;
    })
    .finally(() => inFlightExternalRequests.delete(key));
  inFlightExternalRequests.set(key, pending);
  return pending;
}

/** Test hook that keeps cache timing deterministic without exposing cache controls to the API. */
export function clearExternalSkillCache() {
  externalCache.clear();
  inFlightExternalRequests.clear();
}

const skillNames: Record<UnaiSkillId, string> = {
  greeting: "Greeting",
  wikipedia: "Wikipedia",
  ddgs: "DDGS Search",
  date_planner: "Date Planner",
  calc: "Calculator",
  unit_converter: "Unit Converter",
  json_toolkit: "JSON Toolkit",
  joke: "Joke",
  valves_test: "Valves Test",
  ddgs_chatbot: "DDGS Chatbot",
};

const greetingRules: Array<{ patterns: RegExp; responses: string[] }> = [
  { patterns: /\b(hello|hi|hey|yoo)\b|こんにちは|こんばんは|おはよう/i, responses: ["こんにちは。Clioです。今日は何を手伝いましょう？", "こんにちは。必要なスキルを呼び出せます。"] },
  { patterns: /thank|thanks|ありがとう|助かった/i, responses: ["どういたしまして。", "こちらこそ。次に進めたいことがあれば、続けて入力してください。"] },
  { patterns: /how are you|元気|調子どう/i, responses: ["元気です。パターンに合うスキルを探す準備ができています。"] },
  { patterns: /bye|goodbye|さようなら|またね/i, responses: ["またいつでもどうぞ。", "おつかれさまでした。また必要なときに呼んでください。"] },
  { patterns: /who are you|what are you|あなたは誰|何ができる/i, responses: ["私はClio Skills Botです。挨拶、計算、Wikipedia、検索、ジョーク、設定確認、検索チャットをパターンで呼び分けます。"] },
];

const jokes = [
  "プログラマーが眼鏡をかける理由は？\n→ C# が見えないからです。",
  "量子コンピュータに調子を聞いたら、こう答えました。\n→ 「良くも悪くもあります」。",
  "プログラマーの配偶者が『牛乳を1本買って。卵があったら6本ね』と言いました。\n→ プログラマーは牛乳を6本持って帰りました。",
];

/** Stable selection keeps tests and conversation branches reproducible while retaining variety across messages. */
function pick<T>(items: T[], seed: string): T {
  const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[total % items.length];
}

export function matchSkill(id: UnaiSkillId, text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (id === "greeting") return greetingRules.some((rule) => rule.patterns.test(value));
  if (id === "wikipedia") return /what is|what's|who is|tell me about|とは|って何|を教えて/i.test(value);
  if (id === "ddgs") return /search|find|look up|ddgs|what is|what's|who is|tell me about|検索|調べて|探して/i.test(value);
  if (id === "date_planner") return /\b(date|days?|deadline|due|weekday)\b|\d{4}[/-]\d{1,2}[/-]\d{1,2}|日付|日数|期限|締切|曜日|\d+日後|何日後|まであと|今日から/i.test(value);
  if (id === "calc") return /calculate|solve|expand|factor|calc|計算|計算して|解いて|\d\s*[+\-*/^]/i.test(value);
  if (id === "unit_converter") return /\b(convert|conversion|unit)\b|単位|換算|変換|\d+(?:\.\d+)?\s*(?:km|cm|mm|mi|ft|in|kg|g|lb|oz|ml|l|gal|mph|kb|mb|gb|c|f|k)\s*(?:to|→|を)/i.test(value);
  if (id === "json_toolkit") return /\bjson\b|JSON(?:整形|検証|圧縮|キー)|(?:整形|検証|圧縮|keys?)\s*[:：]\s*[{\[]/i.test(value);
  if (id === "joke") return /joke|laugh|funny|hilarious|joking|ジョーク|笑わせ|面白い話/i.test(value);
  if (id === "valves_test") return /valves_test|skill settings|settings check|設定確認|スキル設定/i.test(value);
  return true;
}

function cleanQuery(input: string): string {
  return input
    .replace(/^(search|find|look up|ddgs|what is|what's|who is|tell me about|検索|調べて|探して)\s*(for)?\s*/i, "")
    .replace(/(とは|って何|を教えてください|を教えて)\s*[？?]?$/i, "")
    .replace(/[？?]$/, "")
    .trim();
}

/** A tiny recursive-descent parser supports arithmetic without exposing eval or Function. */
class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: string[]) {}

  parse(): number {
    const result = this.addSubtract();
    if (this.index !== this.tokens.length) throw new Error("式に解釈できない部分があります。");
    return result;
  }

  private addSubtract(): number {
    let value = this.multiplyDivide();
    while (["+", "-"].includes(this.peek())) {
      const operator = this.next();
      const right = this.multiplyDivide();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private multiplyDivide(): number {
    let value = this.power();
    while (["*", "/"].includes(this.peek())) {
      const operator = this.next();
      const right = this.power();
      if (operator === "/" && right === 0) throw new Error("0では割れません。");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private power(): number {
    let value = this.unary();
    if (this.peek() === "^") {
      this.next();
      value **= this.power();
    }
    return value;
  }

  private unary(): number {
    if (this.peek() === "+") {
      this.next();
      return this.unary();
    }
    if (this.peek() === "-") {
      this.next();
      return -this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const token = this.next();
    if (token === "(") {
      const value = this.addSubtract();
      if (this.next() !== ")") throw new Error("括弧が対応していません。");
      return value;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("数値を読み取れませんでした。");
    return value;
  }

  private peek(): string {
    return this.tokens[this.index] ?? "";
  }

  private next(): string {
    return this.tokens[this.index++] ?? "";
  }
}

export function calculate(expression: string): number {
  const normalized = expression.replace(/\s+/g, "").replaceAll("**", "^");
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+\-*/^]/g) ?? [];
  if (!tokens.length || tokens.join("") !== normalized) throw new Error("数字と + - * / ^ ( ) のみを使ってください。");
  return new ExpressionParser(tokens).parse();
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
}

type Quadratic = { a: number; b: number; c: number };

function parseQuadratic(expression: string): Quadratic | null {
  const normalized = expression.replace(/\s+/g, "").replaceAll("**", "^");
  const match = normalized.match(/^x\^2(?:([+-])(\d*)x)?(?:([+-])(\d+))?$/i);
  if (!match) return null;
  const bMagnitude = match[2] === "" ? 1 : Number(match[2] ?? 0);
  const cMagnitude = Number(match[4] ?? 0);
  return { a: 1, b: match[1] === "-" ? -bMagnitude : match[1] === "+" ? bMagnitude : 0, c: match[3] === "-" ? -cMagnitude : match[3] === "+" ? cMagnitude : 0 };
}

function signed(value: number, variable = ""): string {
  if (value === 0) return "";
  const coefficient = Math.abs(value) === 1 && variable ? "" : String(Math.abs(value));
  return `${value > 0 ? " + " : " - "}${coefficient}${variable}`;
}

function expandBinomial(expression: string): string | null {
  const match = expression.replace(/\s+/g, "").match(/^\(x([+-]\d+)\)\^2$/i);
  if (!match) return null;
  const offset = Number(match[1]);
  return `Expanded: x^2${signed(2 * offset, "x")}${signed(offset * offset)}`;
}

function factorQuadratic(expression: string): string | null {
  const quadratic = parseQuadratic(expression);
  if (!quadratic) return null;
  for (let left = -Math.abs(quadratic.c) - 1; left <= Math.abs(quadratic.c) + 1; left += 1) {
    if (left === 0 && quadratic.c !== 0) continue;
    const right = quadratic.c === 0 ? quadratic.b - left : quadratic.c / left;
    if (Number.isInteger(right) && left + right === quadratic.b) {
      const first = left >= 0 ? `(x + ${left})` : `(x - ${Math.abs(left)})`;
      const second = right >= 0 ? `(x + ${right})` : `(x - ${Math.abs(right)})`;
      return `Factorized: ${first}${second}`;
    }
  }
  return null;
}

function solveQuadratic(expression: string): string | null {
  const quadratic = parseQuadratic(expression);
  if (!quadratic) return null;
  const discriminant = quadratic.b ** 2 - 4 * quadratic.a * quadratic.c;
  if (discriminant < 0) return "Solutions: no real solutions";
  const root = Math.sqrt(discriminant);
  const first = (-quadratic.b + root) / (2 * quadratic.a);
  const second = (-quadratic.b - root) / (2 * quadratic.a);
  const ordered = [first, second].sort((left, right) => left - right);
  return `Solutions: x = [${numberText(ordered[0])}, ${numberText(ordered[1])}]`;
}

function calculateReply(input: string): string {
  const algebra = input.match(/^(solve|expand|factor)\s*[:\s]\s*(.+)$/i);
  if (algebra) {
    const [, command, expression] = algebra;
    if (!/^[0-9a-zA-Z+\-*/^().,=\s]+$/.test(expression)) {
      return `${command} failed: 数字、変数、四則演算、括弧、等号だけを使ってください。`;
    }
    try {
      const action = command.toLowerCase();
      if (action === "expand") return `Expanded: ${nerdamer(expression).expand().toString()}`;
      if (action === "factor") return `Factorized: ${nerdamer.factor(expression).toString()}`;
      const variable = expression.match(/[a-zA-Z]+/)?.[0] ?? "x";
      const equation = expression.includes("=") ? expression : `${expression}=0`;
      return `Solutions: ${nerdamer.solve(equation, variable).toString()}`;
    } catch {
      return `${command} failed: その形式は解釈できませんでした。例: solve: x^2 - 4、expand: (x+2)^3、factor: x^2 - 9`;
    }
  }
  const expression = input.match(/[\d.\s()+\-*/^]+/)?.[0]?.trim();
  if (!expression) return "計算例: `24 * (7 + 3)` または `calc: 2^8`。\n\n`solve: x^2 - 4`、`expand: (x+1)^2` のような形式も受け取れます。";
  try {
    return `Expression: ${expression}\nResult: ${numberText(calculate(expression))}`;
  } catch (error) {
    return `Calculation failed: ${error instanceof Error ? error.message : "式を解釈できませんでした。"}`;
  }
}

async function wikipediaSummary(query: string): Promise<{ text: string; source?: string }> {
  const requestedLanguage = /[ぁ-んァ-ン一-龯]/.test(query) ? "ja" : "en";
  const languages = requestedLanguage === "ja" ? ["ja", "en"] : ["en", "ja"];
  return getCachedExternal(`wiki:${requestedLanguage}:${query.toLowerCase()}`, async () => {
    for (const language of languages) {
      try {
        const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const response = await fetch(url, { headers: { "User-Agent": "Clio-Skills-Bot/1.0" }, signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
        if (!response.ok) continue;
        const data = (await response.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
        if (!data.extract) continue;
        const sentences = data.extract.split(/(?<=[。.!?])\s*/).filter(Boolean).slice(0, 2).join(" ");
        return { text: `【${data.title ?? query}】\n${sentences}`, source: data.content_urls?.desktop?.page };
      } catch {
        // Try the alternate language before returning a stable fallback.
      }
    }
    return { text: `「${query}」のWikipedia要約を取得できませんでした。別の表記で試してください。` };
  });
}

async function duckDuckGoResult(query: string): Promise<{ title: string; body: string; source?: string } | null> {
  return getCachedExternal(`ddg:${query.toLowerCase()}`, async () => {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(url, { headers: { "User-Agent": "Clio-Skills-Bot/1.0" }, signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
      if (response.ok) {
        const data = (await response.json()) as { Heading?: string; AbstractText?: string; AbstractURL?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string }> };
        const related = data.RelatedTopics?.find((topic) => topic.Text);
        const body = data.AbstractText || related?.Text;
        if (body) return { title: data.Heading || query, body, source: data.AbstractURL || related?.FirstURL };
      }
    } catch {
      // Wikipedia is fetched in parallel by callers and acts as the fast fallback.
    }
    return null;
  });
}

async function duckDuckGoSummary(query: string): Promise<{ text: string; source?: string }> {
  const wiki = wikipediaSummary(query).then((result) => ({ kind: "wiki" as const, result }));
  const ddg = duckDuckGoResult(query).then((result) => result ? ({ kind: "ddg" as const, result }) : new Promise<never>(() => undefined));
  const first = await Promise.race([wiki, ddg]);
  if (first.kind === "ddg") return { text: `【${first.result.title}】\n${first.result.body.split(/(?<=[.!?])\s*/).slice(0, 3).join(" ")}`, source: first.result.source };
  return first.result;
}

async function searchChatReply(query: string, valves: SkillValves): Promise<{ text: string; source?: string }> {
  const wiki = wikipediaSummary(query).then((result) => ({ kind: "wiki" as const, result }));
  const ddg = duckDuckGoResult(query).then((result) => result ? ({ kind: "ddg" as const, result }) : new Promise<never>(() => undefined));
  const first = await Promise.race([wiki, ddg]);
  if (first.kind === "wiki") return { text: `【Search Chat】\n${first.result.text.replace(/^【.*?】\n/, "")}`, source: first.result.source };
  const sentence = first.result.body.split(/(?<=[.!?])\s*/).find((item) => {
    const normalized = item.trim();
    if (!normalized) return false;
    if (valves.excludeQuestions && normalized.endsWith("?")) return false;
    if (valves.excludeQueryMatch && normalized.toLowerCase().includes(query.toLowerCase())) return false;
    return valves.minSentenceLength <= 0 || normalized.length >= valves.minSentenceLength;
  });
  return sentence ? { text: `【Search Chat】\n${sentence}`, source: first.result.source } : { text: "No relevant answer found.", source: first.result.source };
}

async function respond(id: UnaiSkillId, input: string, valves: SkillValves): Promise<{ text: string; source?: string }> {
  if (id === "greeting") {
    const rule = greetingRules.find((item) => item.patterns.test(input));
    return { text: pick(rule?.responses ?? ["こんにちは。"], input) };
  }
  if (id === "date_planner") return { text: datePlannerReply(input) };
  if (id === "calc") return { text: calculateReply(input) };
  if (id === "unit_converter") return { text: unitConverterReply(input) };
  if (id === "json_toolkit") return { text: jsonToolkitReply(input) };
  if (id === "joke") return { text: pick(jokes, input) };
  if (id === "valves_test") return { text: `Skill settings\n\nmax_results: ${valves.maxResults}\nexclude_questions: ${valves.excludeQuestions}\nexclude_query_match: ${valves.excludeQueryMatch}\nmin_sentence_length: ${valves.minSentenceLength}\n\nこの値はDDGS Chatbotの検索結果選別に使われる、現在保存中の設定です。` };

  const query = cleanQuery(input);
  if (!query) return { text: "調べたいキーワードを続けて入力してください。" };
  if (id === "wikipedia") return wikipediaSummary(query);
  if (id === "ddgs") return duckDuckGoSummary(query);
  return searchChatReply(query, valves);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 2));
}

/** Runs all matched skills concurrently, keeping candidate order identical to the user-controlled priority order. */
export async function runSkills(input: RunSkillsInput): Promise<{ matchedSkills: UnaiSkillId[]; candidates: SkillCandidate[] }> {
  const validPriority = input.priority.filter((id): id is UnaiSkillId => UNAI_SKILL_ORDER.includes(id));
  const order = [...validPriority, ...UNAI_SKILL_ORDER.filter((id) => !validPriority.includes(id))];
  const enabled = new Set(input.enabledSkillIds.filter((id): id is UnaiSkillId => UNAI_SKILL_ORDER.includes(id)));
  const matchedSkills = order.filter((id) => enabled.has(id) && matchSkill(id, input.message));
  const valves = { ...defaultSkillValves, ...input.valves };
  const executionIds = input.executionMode === "auto" ? matchedSkills.slice(0, 1) : matchedSkills;
  const candidates = await Promise.all(executionIds.map(async (id) => {
    const startedAt = performance.now();
    const result = await respond(id, input.message, valves);
    return { id, name: skillNames[id], response: result.text, source: result.source, tokens: estimateTokens(result.text), elapsedMs: Math.round(performance.now() - startedAt) };
  }));
  return { matchedSkills, candidates };
}
