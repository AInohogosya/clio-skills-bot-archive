/**
 * Unai-compatible response router.
 *
 * Adapted from PixelNest256/Unai (MIT License):
 * https://github.com/PixelNest256/Unai
 * Copyright (c) PixelNest256
 *
 * This TypeScript runtime preserves Unai's ordered `match() → respond()`
 * dispatch model while avoiding dynamic execution of uploaded Python skills.
 */

import { createHash } from "node:crypto";

export type UnaiResult = {
  response: string;
  skill: string | null;
  tokens: number;
  elapsedMs: number;
  tps: number;
  matchedSkillIds: string[];
  selectionReason: string;
  mode: "unai";
  execution: "local" | "external" | "fallback";
  cacheHit: boolean;
  externalNotice?: string;
};

type SkillResponse = { content: string; cacheHit?: boolean };

export type UiLanguage = "en" | "ja" | "zh";

type Trilingual = Record<UiLanguage, string>;
function pick<T>(lang: UiLanguage, strings: Record<UiLanguage, T>): T {
  return strings[lang];
}

const KANA_PATTERN = /[ぁ-んァ-ヶ]/;
const HAN_PATTERN = /[一-鿿々]/;
// Simplified/Traditional Chinese cues that never appear in modern Japanese text.
const CHINESE_HINT_PATTERN =
  /[们这说么吗呢吧哪啦嘛喽呗啥咋咱讠钅纟饣汉读车东马门鸟]|什么|怎么|这么|那么|这个|那个|我们|你们|他们|她们|这里|那里|现在|今天|明天|为什么|可以|应该|不是|就是|但是|因为|所以|如果|或者|没有|已经|知道|觉得|一下|翻译|你好|您好|谢谢|再见|晚安|请问|帮忙|帮我|搜索|查找|计算|笑话|骰子|色子|密码|时间戳|罗马数字|十六进制|二进制|十进制|八进制|颜色|换算|随机|字数统计|字符数|多少|百分之/;
const TRADITIONAL_CHINESE_HINT_PATTERN =
  /[們這說麼嗎漢讀關對裡點專發為義無書語讀學體國]|什麼|怎麼|這個|那個|我們|你們|他們|她們|這裡|那裡|現在|為什麼|翻譯|謝謝|再見|請問|幫忙|幫我|搜尋|時間戳|羅馬數字|顏色|換算|隨機數/;

function detectLanguage(text: string): UiLanguage {
  if (KANA_PATTERN.test(text)) return "ja";
  if (
    CHINESE_HINT_PATTERN.test(text) ||
    TRADITIONAL_CHINESE_HINT_PATTERN.test(text)
  )
    return "zh";
  if (HAN_PATTERN.test(text)) return "ja";
  return "en";
}

type Skill = {
  id: string;
  execution: "local" | "external";
  match: (text: string) => boolean;
  respond: (text: string, lang: UiLanguage) => Promise<SkillResponse | null>;
  externalNotice?: Trilingual;
};

function noSkillMessage(lang: UiLanguage) {
  return pick(lang, {
    en: "No matching local skill was found. To search, type `search: what you want to know`.",
    ja: "対応するローカルスキルが見つかりませんでした。検索したい場合は「検索: 調べたい内容」と入力してください。",
    zh: "未找到匹配的本地技能。如需搜索，请输入「搜索: 要查询的内容」。",
  });
}
const EXTERNAL_TIMEOUT_MS = 900;
const TRANSLATION_TIMEOUT_MS = 4_500;
const MANAGED_TRANSLATION_TIMEOUT_MS = 6_000;
const EXTERNAL_CACHE_TTL_MS = 5 * 60 * 1000;
const externalCache = new Map<
  string,
  { data: Record<string, unknown>; expiresAt: number }
>();
const EXTERNAL_CACHE_MAX_ENTRIES = 512;
const inFlightFetches = new Map<
  string,
  Promise<{ data: Record<string, unknown> | null; cacheHit: boolean }>
>();

function storeExternalCache(
  key: string,
  data: Record<string, unknown>,
  ttlMilliseconds: number
) {
  if (externalCache.size >= EXTERNAL_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [entryKey, entry] of externalCache) {
      if (entry.expiresAt <= now) externalCache.delete(entryKey);
    }
    while (externalCache.size >= EXTERNAL_CACHE_MAX_ENTRIES) {
      const oldestKey = externalCache.keys().next().value;
      if (oldestKey === undefined) break;
      externalCache.delete(oldestKey);
    }
  }
  externalCache.set(key, { data, expiresAt: Date.now() + ttlMilliseconds });
}

const greetingRules: Array<[string[], string[]]> = [
  [
    [
      "hello",
      "hi",
      "hey",
      "yoo",
      "こんにちは",
      "おはよう",
      "こんばんは",
      "やあ",
      "どうも",
      "はじめまして",
      "初めまして",
      "もしもし",
      "ごきげんよう",
      "おつかれ",
      "お疲れ",
      "你好",
      "您好",
      "嗨",
      "哈喽",
    ],
    [
      "Hello! Is there anything I can help you with?",
      "Hey! How are you?",
      "Hello!",
    ],
  ],
  [
    ["good morning", "早上好", "早啊"],
    ["Good morning! Have a great day today.", "Good morning!"],
  ],
  [["good evening", "晚上好"], ["Good evening! How was your day?"]],
  [
    [
      "thank",
      "thanks",
      "thx",
      "ty",
      "ありがとう",
      "有難う",
      "サンキュー",
      "感謝",
      "助かる",
      "谢谢",
      "多谢",
      "感谢",
    ],
    ["You're welcome!", "Glad to help!"],
  ],
  [
    [
      "how are you",
      "how do you do",
      "元気",
      "調子どう",
      "調子は",
      "你好吗",
      "最近怎么样",
    ],
    ["I'm doing well! How about you?"],
  ],
  [
    [
      "bye",
      "goodbye",
      "さようなら",
      "またね",
      "バイバイ",
      "おやすみ",
      "失礼します",
      "再见",
      "拜拜",
      "回头见",
    ],
    ["See you later! Have a great day!", "Goodbye! Come back anytime."],
  ],
  [["what's up", "whats up"], ["Not much, just here to help!"]],
  [
    [
      "who are you",
      "what are you",
      "あなたは誰",
      "君は誰",
      "自己紹介",
      "你是谁",
      "你叫什么",
    ],
    ["I'm Unai, your Non-AI assistant!"],
  ],
  [
    [
      "what can you do",
      "what are your capabilities",
      "何ができる",
      "できること",
      "使い方",
      "你能做什么",
      "你会做什么",
      "怎么用",
    ],
    [
      "I can help you with basic questions, greetings, and small talk. See more by typing /help",
    ],
  ],
];

const jokesByLanguage: Record<UiLanguage, string[]> = {
  en: [
    "Why do programmers wear glasses?\n→ Because they can't C#.",
    "Why don't scientists trust door knobs?\n→ Because they're always twisting things.",
    'A mathematician walks into a bank to rob it.\n"Nobody move, this is an optimization problem!"',
    "Why do skeletons have so few friends?\n→ Because they're always telling bone-chilling stories.",
    'A programmer\'s wife said, "Go to the store and get a carton of milk. If they have eggs, get six."\nThe programmer came back with 6 cartons of milk.',
    "Why doesn't the sun go to school?\n→ Because it already has a million degrees.",
    'I asked a quantum computer, "How are you doing?"\n"Good and bad at the same time."',
  ],
  ja: [
    "プログラマーが眼鏡をかけるのはなぜ？\n→ C#（シー・シャープ）が見えないから。",
    "数学者が銀行に入って言った。\n「動くな！これは最適化問題だ！」",
    "太陽が学校へ行かないのはなぜ？\n→ もう百万度も知っているから。",
  ],
  zh: [
    "程序员为什么戴眼镜？\n→ 因为他们看不清C#。",
    "数学家走进银行，大喊：\n「都不许动，这是一道最优解问题！」",
    "太阳为什么不上学？\n→ 因为它已经有一百万度了。",
  ],
};

function levenshtein(a: string, b: string, maxDistance: number): number {
  const aLength = a.length;
  const bLength = b.length;
  if (aLength - bLength > maxDistance || bLength - aLength > maxDistance)
    return maxDistance + 1;
  if (bLength === 0) return aLength;
  let previous = new Uint16Array(bLength + 1);
  let current = new Uint16Array(bLength + 1);
  for (let j = 0; j <= bLength; j += 1) previous[j] = j;
  for (let i = 1; i <= aLength; i += 1) {
    current[0] = i;
    const codeA = a.charCodeAt(i - 1);
    let rowMinimum = i;
    for (let j = 1; j <= bLength; j += 1) {
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (codeA === b.charCodeAt(j - 1) ? 0 : 1)
      );
      current[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[bLength];
}

function normalizeText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[、。！？!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type KeywordMatcher = {
  normalized: string;
  threshold: number;
  shortWord: RegExp | null;
};
const keywordMatcherCache = new Map<string, KeywordMatcher>();

function getKeywordMatcher(keyword: string): KeywordMatcher {
  let matcher = keywordMatcherCache.get(keyword);
  if (matcher === undefined) {
    const normalized = normalizeText(keyword);
    const isShortWord = /^[a-z]+$/.test(normalized) && normalized.length <= 3;
    matcher = {
      normalized,
      threshold: Math.max(1, Math.floor(normalized.length / 4)),
      shortWord: isShortWord ? new RegExp(`(^|\\s)${normalized}($|\\s)`) : null,
    };
    keywordMatcherCache.set(keyword, matcher);
  }
  return matcher;
}

function matchesKeyword(normalizedText: string, keyword: string) {
  const matcher = getKeywordMatcher(keyword);
  if (matcher.shortWord !== null) return matcher.shortWord.test(normalizedText);
  return (
    normalizedText.includes(matcher.normalized) ||
    levenshtein(normalizedText, matcher.normalized, matcher.threshold) <=
      matcher.threshold
  );
}

function matchesGreeting(text: string) {
  const normalized = normalizeText(text);
  return greetingRules.some(([keywords]) =>
    keywords.some(keyword => matchesKeyword(normalized, keyword))
  );
}

function responseForGreeting(text: string, lang: UiLanguage): SkillResponse {
  const normalized = normalizeText(text);
  if (lang === "ja") {
    if (/ありがとう|有難う|サンキュー|感謝|助かる/.test(text))
      return { content: "どういたしまして。いつでも声をかけてください。" };
    if (/またね|バイバイ|さようなら|おやすみ|失礼します/.test(text))
      return { content: "またお手伝いできることがあれば、いつでもどうぞ。" };
    if (/何ができる|できること|使い方/.test(text))
      return {
        content:
          "あいさつ、計算、明示した検索・概要取得に対応しています。詳しくは `/help` で確認できます。",
      };
    return {
      content:
        "こんにちは。Clioです。計算、検索、概要の取得などをお手伝いします。",
    };
  }
  if (lang === "zh") {
    if (/谢谢|多谢|感谢/.test(text))
      return { content: "不客气！随时可以找我。" };
    if (/再见|拜拜|回头见|晚安/.test(text))
      return { content: "再见！期待下次再为你服务。" };
    if (/你能做什么|你会做什么|怎么用/.test(text))
      return {
        content:
          "我可以帮你打招呼聊天、计算、搜索和查询概念概要。更多功能请输入 `/help` 查看。",
      };
    if (/你是谁|你叫什么/.test(text))
      return { content: "我是 Unai，你的非 AI 助手！" };
    return {
      content: "你好！我是Clio，可以帮你计算、搜索和查询资料。",
    };
  }
  for (const [keywords, responses] of greetingRules) {
    for (const keyword of keywords) {
      if (matchesKeyword(normalized, keyword)) {
        return {
          content: responses[Math.floor(Math.random() * responses.length)],
        };
      }
    }
  }
  return { content: "Hello! Is there anything I can help you with?" };
}

const ARITH_NUMBER = "(\\d+(?:\\.\\d+)?)";
const arithmeticPatterns: Array<[RegExp, string]> = [
  [
    new RegExp(
      `${ARITH_NUMBER}\\s*(?:と|に|を)?\\s*${ARITH_NUMBER}\\s*(?:を)?(?:足す|足した|加える|たす|の合計)`
    ),
    "+",
  ],
  [
    new RegExp(
      `${ARITH_NUMBER}\\s*(?:から|より)\\s*${ARITH_NUMBER}\\s*(?:を)?(?:引く|引いた|ひく|減らす)`
    ),
    "-",
  ],
  [
    new RegExp(
      `${ARITH_NUMBER}\\s*(?:を|と)?\\s*${ARITH_NUMBER}\\s*(?:で|を)?(?:掛ける|かける|掛けた|かけた|乗|倍)`
    ),
    "*",
  ],
  [
    new RegExp(
      `${ARITH_NUMBER}\\s*(?:を)?\\s*${ARITH_NUMBER}\\s*(?:で|を)?(?:割る|わる|割った|わった|除)`
    ),
    "/",
  ],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:plus|add)\\s*${ARITH_NUMBER}`), "+"],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:minus|subtract)\\s*${ARITH_NUMBER}`), "-"],
  [
    new RegExp(`${ARITH_NUMBER}\\s*(?:times|multiplied by)\\s*${ARITH_NUMBER}`),
    "*",
  ],
  [
    new RegExp(`${ARITH_NUMBER}\\s*(?:divided by|over)\\s*${ARITH_NUMBER}`),
    "/",
  ],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:加|加上)\\s*${ARITH_NUMBER}`), "+"],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:减去|减)\\s*${ARITH_NUMBER}`), "-"],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:乘以|乘上|乘)\\s*${ARITH_NUMBER}`), "*"],
  [new RegExp(`${ARITH_NUMBER}\\s*(?:除以)\\s*${ARITH_NUMBER}`), "/"],
];

function naturalArithmeticExpression(text: string) {
  const normalized = normalizeText(text);
  for (const [pattern, operator] of arithmeticPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1] && match[2]) return `${match[1]} ${operator} ${match[2]}`;
  }
  return null;
}

function expressionFromInput(text: string) {
  const natural = naturalArithmeticExpression(text);
  if (natural) return natural;
  const match = normalizeText(text).match(/[\d+\-*/^().\s]+/);
  return match?.[0].trim() || null;
}

function hasCalculatorTrigger(text: string) {
  if (isUnitConversionRequest(text)) return false;
  return (
    Boolean(expressionFromInput(text)) ||
    /calculate|solve|expand|factor|計算|計算して|計算したい|方程式|数式|式を解|解いて|答え|結果|算出|求め|计算|算出|等于多少|等于几/i.test(
      normalizeText(text)
    )
  );
}

const OPERATOR_PRECEDENCE: Record<string, number> = {
  "+": 2,
  "-": 2,
  "*": 3,
  "/": 3,
  "^": 4,
};

type ExpressionToken = number | string;

function tokenizeExpression(expression: string): ExpressionToken[] {
  const tokens: ExpressionToken[] = [];
  const length = expression.length;
  let index = 0;
  while (index < length) {
    const char = expression[index];
    if (char === " ") {
      index += 1;
      continue;
    }
    if ((char >= "0" && char <= "9") || char === ".") {
      let end = index;
      while (
        end < length &&
        ((expression[end] >= "0" && expression[end] <= "9") ||
          expression[end] === ".")
      )
        end += 1;
      tokens.push(Number(expression.slice(index, end)));
      index = end;
      continue;
    }
    if (
      char === "+" ||
      char === "-" ||
      char === "*" ||
      char === "/" ||
      char === "^" ||
      char === "(" ||
      char === ")"
    ) {
      tokens.push(char);
      index += 1;
      continue;
    }
    throw new Error("unexpected character");
  }
  return tokens;
}

function evaluateTokens(tokens: ExpressionToken[]): number {
  let position = 0;

  function applyOperator(
    operator: string,
    left: number,
    right: number
  ): number {
    switch (operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      default:
        return left ** right;
    }
  }

  function parsePrimary(): number {
    const token = tokens[position];
    if (token === "+") {
      position += 1;
      return parsePrimary();
    }
    if (token === "-") {
      position += 1;
      return -parsePrimary();
    }
    if (typeof token === "number") {
      position += 1;
      return token;
    }
    if (token === "(") {
      position += 1;
      const value = parseBinary(0);
      if (tokens[position] !== ")")
        throw new Error("missing closing parenthesis");
      position += 1;
      return value;
    }
    throw new Error("invalid expression");
  }

  function parseBinary(minPrecedence: number): number {
    let left = parsePrimary();
    for (;;) {
      const operator = tokens[position];
      const precedence =
        typeof operator === "string"
          ? OPERATOR_PRECEDENCE[operator]
          : undefined;
      if (precedence === undefined || precedence < minPrecedence) break;
      position += 1;
      const right = parseBinary(operator === "^" ? precedence : precedence + 1);
      left = applyOperator(operator as string, left, right);
    }
    return left;
  }

  const result = parseBinary(0);
  if (position !== tokens.length) throw new Error("invalid expression");
  return result;
}

function calculate(text: string, lang: UiLanguage): SkillResponse {
  const expression = expressionFromInput(text);
  if (!expression)
    return {
      content: pick(lang, {
        en: "Try: `3 + 4 * 2`, `20 divided by 4`.",
        ja: "例: `3 + 4 * 2`、`12と8を足す`、`20を4で割る` のように入力してください。",
        zh: "请输入如 `3 + 4 * 2`、`12 加上 8`、`20 除以 4`。",
      }),
    };
  if (!/^[\d+\-*/^().\s]+$/.test(expression))
    return {
      content: pick(lang, {
        en: "Calculation failed: unsupported expression",
        ja: "Calculation failed: unsupported expression",
        zh: "计算失败：不支持的表达式",
      }),
    };
  try {
    const value = evaluateTokens(tokenizeExpression(expression));
    if (!Number.isFinite(value)) throw new Error("invalid result");
    return {
      content: `\`\`\`\nExpression: ${expression}\nResult: ${value}\n\`\`\``,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "invalid expression";
    return {
      content:
        lang === "zh"
          ? `计算失败：${message}`
          : `Calculation failed: ${message}`,
    };
  }
}

const searchQueryPatterns = [
  /^(?:answer|search\s*answer|ddgs\s*chatbot)\s*[:：]?\s*(.+?)\s*\??$/i,
  /^(?:検索|調べ|探す|探して|リサーチ|ググる|ググって|ぐぐる|ぐぐって)(?:して|したい|て|たい)?\s*[:：]?\s*(.+?)\s*[。！？!?]?$/,
  /^(.+?)(?:について|を|の情報|の最新情報)?(?:検索|調べ|探す|探して|リサーチ|ググる|ググって|ぐぐる|ぐぐって)(?:る|て|たい|ほしい|てほしい|してください|下さい|てください|て下さい|お願いします)?\s*[。！？!?]?$/,
  /^(?:ネット|ウェブ|web|インターネット)(?:で|上で)?\s*(.+?)(?:について|を|の情報)?(?:検索|調べ|探す|探して|リサーチ)(?:る|て|たい|ほしい|てほしい|してください|下さい|てください|て下さい|お願いします)?\s*[。！？!?]?$/i,
  /^(.+?)(?:の)?(?:最新情報|ニュース)(?:を)?(?:検索|調べ|探す|探して|教えて|知りたい)(?:る|て|たい|ほしい|てほしい|してください|下さい|てください|て下さい|お願いします)?\s*[。！？!?]?$/,
  /^(?:please\s+)?(?:search|find|look\s*up|research|google|web\s*search|ddgs)\s*(?:for\s+|about\s+|on\s+)?[:：]?\s*(.+?)(?:\?|$)/i,
  /^(?:can you|could you|would you|please)\s+(?:search for|find|look up|research|google|web search|find information (?:about|on)|find out about)\s+(.+?)(?:\?|$)/i,
  /^(.+?)\s+(?:news|latest information|latest updates|recent updates)(?:\s+about|\s+on)?\s*(.+?)?\s*\??$/i,
  /^(?:搜索|搜寻|检索|查询|查一下|搜一下|帮我搜)(?:一下)?\s*[:：]?\s*(.+?)\s*[。？！?!]?$/,
  /^帮我(?:查|查查|搜索|搜一下)\s*[:：]?\s*(.+?)\s*[。？！?!]?$/,
];

const summaryQueryPatterns = [
  /what(?:'s| is)\s+(.+?)(?:\?|$)/i,
  /who is\s+(.+?)(?:\?|$)/i,
  /tell me about\s+(.+?)(?:\?|$)/i,
  /^(?:please\s+)?(?:explain|define|describe|summarize)\s+(.+?)(?:\?|$)/i,
  /^(?:can you|could you|would you)\s+(?:explain|define|describe|summarize|tell me about|give me an overview of|give an overview of)\s+(.+?)(?:\?|$)/i,
  /^(?:give me |give an )?(?:an )?overview of\s+(.+?)(?:\?|$)/i,
  /^what does\s+(.+?)\s+(?:mean|refer to)\s*\??$/i,
  /^(.+?)(?:とは(?:何)?|って何|ってどんなもの|ってどんなこと|の意味|の定義|の概要|の基本)\s*[。！？!?]?$/,
  /^(.+?)(?:について|を)(?:教えて|知りたい|説明して|解説して|詳しく教えて|わかりやすく説明して|わかりやすく教えて)(?:ください|下さい|ほしい|欲しい|お願いします)?\s*[。！？!?]?$/,
  /^(?!.*(?:怎么说|怎么讲|怎么读|翻译|翻譯))(?:什么是|什么叫)(.+?)[？?。！!]?$/,
  /^(?!.*(?:怎么说|怎么讲|怎么读|翻译|翻譯))(.+?)(?:是什么意思|是什么|是谁)[？?]?$/,
  /^(?!.*翻译)(?:介绍一下|介绍下|解释一下|说明一下|科普一下)[:：]?(.+?)[。？！?!]?$/,
];

function captureQuery(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.trim().match(pattern);
    if (match?.[1]?.trim())
      return match[1]
        .trim()
        .replace(/(?:について|を|の情報)$/, "")
        .trim();
  }
  return null;
}

function extractQuery(text: string) {
  return (
    captureQuery(text, searchQueryPatterns) ??
    captureQuery(text, summaryQueryPatterns) ??
    text.trim()
  );
}

function isChatbotAnswerRequest(text: string) {
  return /^(?:answer|search\s*answer|ddgs\s*chatbot)\s*[:：]?\s*\S/i.test(
    text.trim()
  );
}

function isExplicitSearchRequest(text: string) {
  return (
    !isChatbotAnswerRequest(text) &&
    captureQuery(text, searchQueryPatterns) !== null
  );
}

function isSummaryRequest(text: string) {
  return (
    captureQuery(text, summaryQueryPatterns) !== null ||
    /\bwikipedia\b|维基百科|維基百科/i.test(text)
  );
}

function hasExplicitExternalRequest(text: string) {
  return isExplicitSearchRequest(text) || isSummaryRequest(text);
}

async function fetchJson(
  url: string,
  timeoutMs = EXTERNAL_TIMEOUT_MS
): Promise<{ data: Record<string, unknown> | null; cacheHit: boolean }> {
  const cached = externalCache.get(url);
  if (cached && cached.expiresAt > Date.now())
    return { data: cached.data, cacheHit: true };
  const pending = inFlightFetches.get(url);
  if (pending) return pending;
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Clio-Unai-Compatible/1.0" },
        signal: controller.signal,
      });
      if (!response.ok) return { data: null, cacheHit: false };
      const data = (await response.json()) as Record<string, unknown>;
      storeExternalCache(url, data, EXTERNAL_CACHE_TTL_MS);
      return { data, cacheHit: false };
    } catch {
      return { data: null, cacheHit: false };
    } finally {
      clearTimeout(timer);
    }
  })();
  inFlightFetches.set(url, request);
  try {
    return await request;
  } finally {
    inFlightFetches.delete(url);
  }
}

type WikiLanguage = UiLanguage;

const wikiLanguageNames: Record<WikiLanguage, Record<UiLanguage, string>> = {
  ja: { ja: "日本語", en: "Japanese", zh: "日文" },
  en: { ja: "英語", en: "English", zh: "英文" },
  zh: { ja: "中国語", en: "Chinese", zh: "中文" },
};

function wikipediaLanguageChain(text: string): WikiLanguage[] {
  const preferred = detectLanguage(text);
  const rest = (["en", "ja", "zh"] as const).filter(
    language => language !== preferred
  );
  return [preferred, ...rest];
}

function cleanSnippet(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

type WikiLookup = SkillResponse & { language: WikiLanguage };

async function wikipediaSummaryIn(
  language: WikiLanguage,
  query: string
): Promise<WikiLookup | null> {
  const { data, cacheHit } = await fetchJson(
    `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
  );
  const title = typeof data?.title === "string" ? data.title : "";
  const extract = typeof data?.extract === "string" ? data.extract : "";
  if (!title || !extract) return null;
  const sentences =
    language === "en"
      ? extract.split(".").slice(0, 2).filter(Boolean).join(".")
      : extract
          .split(/[。！？\n]/)
          .slice(0, 2)
          .filter(Boolean)
          .join("。");
  return {
    content: `【${title}】\n${sentences}`,
    cacheHit,
    language,
  };
}

async function wikipediaSearchIn(
  language: WikiLanguage,
  query: string,
  uiLang: UiLanguage
): Promise<WikiLookup | null> {
  const searchUrl = `https://${language}.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=1&srsearch=${encodeURIComponent(query)}&origin=*`;
  const { data, cacheHit } = await fetchJson(searchUrl);
  const queryData = data?.query;
  const entries =
    queryData &&
    typeof queryData === "object" &&
    "search" in queryData &&
    Array.isArray(queryData.search)
      ? queryData.search
      : [];
  const first = entries.find(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object"
  );
  const title = typeof first?.title === "string" ? first.title : "";
  const snippet =
    typeof first?.snippet === "string" ? cleanSnippet(first.snippet) : "";
  if (!title || !snippet) return null;
  return {
    content: `【${title}】\n${pick(uiLang, {
      en: "Wikipedia search: ",
      ja: "Wikipedia検索: ",
      zh: "维基百科搜索：",
    })}${snippet}`,
    cacheHit,
    language,
  };
}

function withLanguageNotice(
  lookup: WikiLookup,
  preferred: WikiLanguage
): SkillResponse {
  if (lookup.language === preferred)
    return { content: lookup.content, cacheHit: lookup.cacheHit };
  const actual = lookup.language;
  let notice: string;
  if (preferred === "ja") {
    notice = `\n\n※ ${wikiLanguageNames[preferred].ja}版Wikipediaに該当する記事が見つからなかったため、${wikiLanguageNames[actual].ja}版の概要を表示しています。`;
  } else if (preferred === "zh") {
    notice = `\n\n※ 未找到${wikiLanguageNames[preferred].zh}维基百科的对应词条，改为显示${wikiLanguageNames[actual].zh}维基百科的摘要。`;
  } else {
    notice = `\n\nNote: No matching article was found on ${wikiLanguageNames[preferred].en} Wikipedia; showing the ${wikiLanguageNames[actual].en} Wikipedia summary.`;
  }
  return { content: `${lookup.content}${notice}`, cacheHit: lookup.cacheHit };
}

async function wikipediaSummary(
  text: string,
  lang: UiLanguage
): Promise<SkillResponse | null> {
  const query = extractQuery(text);
  if (!query) return null;
  for (const language of wikipediaLanguageChain(text)) {
    const direct = await wikipediaSummaryIn(language, query);
    if (direct) return withLanguageNotice(direct, lang);
    const searched = await wikipediaSearchIn(language, query, lang);
    if (searched) return withLanguageNotice(searched, lang);
  }
  return {
    content: pick(lang, {
      en: "No Wikipedia summary found.",
      ja: "Wikipediaの要約が見つかりませんでした。",
      zh: "未找到维基百科摘要。",
    }),
  };
}

function externalFailureResponse(
  lang: UiLanguage,
  skillId: string
): SkillResponse {
  return { content: pick(lang, {
    en: `No external information was available. The ${skillId} skill did not produce a result.`,
    ja: `外部情報を取得できませんでした。スキル「${skillId}」は結果を返せませんでした。`,
    zh: `未能获取外部信息，技能「${skillId}」未产生结果。`,
  }) };
}

async function wikipediaSearchFallback(
  text: string,
  query: string,
  lang: UiLanguage
): Promise<SkillResponse | null> {
  for (const language of wikipediaLanguageChain(text)) {
    const hit = await wikipediaSearchIn(language, query, lang);
    if (hit) return withLanguageNotice(hit, lang);
  }
  return null;
}

async function duckDuckGoSummary(
  text: string,
  lang: UiLanguage,
  shortAnswer = false
): Promise<SkillResponse | null> {
  const query = extractQuery(text);
  if (!query) return null;
  const { data, cacheHit } = await fetchJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    350
  );
  const title = typeof data?.Heading === "string" ? data.Heading : query;
  const abstract =
    typeof data?.AbstractText === "string" ? data.AbstractText : "";
  if (!abstract) {
    const wikipediaFallback = await wikipediaSearchFallback(text, query, lang);
    if (wikipediaFallback) return wikipediaFallback;
    return {
      content: shortAnswer
        ? pick(lang, {
            en: "No relevant answer found.",
            ja: "関連する回答が見つかりませんでした。",
            zh: "未找到相关答案。",
          })
        : pick(lang, {
            en: "No search results found.",
            ja: "検索結果が見つかりませんでした。",
            zh: "未找到搜索结果。",
          }),
      cacheHit,
    };
  }
  const sentences = abstract.split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    content: shortAnswer
      ? (sentences[0] ??
        pick(lang, {
          en: "No relevant answer found.",
          ja: "関連する回答が見つかりませんでした。",
          zh: "未找到相关答案。",
        }))
      : `【${title}】\n${sentences.slice(0, 3).join(" ")}`,
    cacheHit,
  };
}

const translationLanguages: Record<string, string> = {
  英語: "en",
  english: "en",
  en: "en",
  日本語: "ja",
  japanese: "ja",
  ja: "ja",
  中国語: "zh",
  chinese: "zh",
  mandarin: "zh",
  zh: "zh",
  繁体字中国語: "zh-TW",
  韓国語: "ko",
  korean: "ko",
  ko: "ko",
  フランス語: "fr",
  french: "fr",
  fr: "fr",
  スペイン語: "es",
  spanish: "es",
  es: "es",
  ドイツ語: "de",
  german: "de",
  de: "de",
  イタリア語: "it",
  italian: "it",
  it: "it",
  ポルトガル語: "pt",
  portuguese: "pt",
  pt: "pt",
  ロシア語: "ru",
  russian: "ru",
  ru: "ru",
  アラビア語: "ar",
  arabic: "ar",
  ar: "ar",
  ヒンディー語: "hi",
  hindi: "hi",
  hi: "hi",
  インドネシア語: "id",
  indonesian: "id",
  id: "id",
  ベトナム語: "vi",
  vietnamese: "vi",
  vi: "vi",
  タイ語: "th",
  thai: "th",
  th: "th",
  トルコ語: "tr",
  turkish: "tr",
  tr: "tr",
  オランダ語: "nl",
  dutch: "nl",
  nl: "nl",
  ポーランド語: "pl",
  polish: "pl",
  pl: "pl",
  ウクライナ語: "uk",
  ukrainian: "uk",
  uk: "uk",
  スウェーデン語: "sv",
  swedish: "sv",
  sv: "sv",
  ベンガル語: "bn",
  bengali: "bn",
  bn: "bn",
  マレー語: "ms",
  malay: "ms",
  ms: "ms",
  フィリピン語: "tl",
  filipino: "tl",
  tagalog: "tl",
  tl: "tl",
  英语: "en",
  英文: "en",
  日语: "ja",
  日文: "ja",
  中文: "zh",
  汉语: "zh",
  漢語: "zh",
  华语: "zh",
  華語: "zh",
  普通话: "zh",
  简体中文: "zh",
  簡體中文: "zh",
  繁体中文: "zh-TW",
  繁體中文: "zh-TW",
  韩语: "ko",
  朝鲜语: "ko",
  法语: "fr",
  西班牙语: "es",
  德语: "de",
  意大利语: "it",
  葡萄牙语: "pt",
  俄语: "ru",
  阿拉伯语: "ar",
  印地语: "hi",
  印尼语: "id",
  越南语: "vi",
  泰语: "th",
  土耳其语: "tr",
  荷兰语: "nl",
  波兰语: "pl",
  乌克兰语: "uk",
  瑞典语: "sv",
  孟加拉语: "bn",
  马来语: "ms",
  菲律宾语: "tl",
};
const translationLanguagePattern =
  "英語|日本語|中国語|繁体字中国語|韓国語|フランス語|スペイン語|ドイツ語|イタリア語|ポルトガル語|ロシア語|アラビア語|ヒンディー語|インドネシア語|ベトナム語|タイ語|トルコ語|オランダ語|ポーランド語|ウクライナ語|スウェーデン語|ベンガル語|マレー語|フィリピン語|英语|英文|日语|日文|中文|汉语|韩语|朝鲜语|法语|西班牙语|德语|意大利语|葡萄牙语|俄语|阿拉伯语|印地语|印尼语|越南语|泰语|土耳其语|荷兰语|波兰语|乌克兰语|瑞典语|孟加拉语|马来语|菲律宾语";
const translationJapanesePattern =
  /^(?:(英語|日本語|韓国語|フランス語|スペイン語)に)?(?:翻訳|訳して|訳してほしい|英訳|和訳)\s*[:：]?\s*(.+)$/i;
const translationEnglishPattern =
  /^(?:translate|translation)\s*[:：]?\s*(.+?)(?:\s+(?:to|into)\s+(english|japanese|korean|french|spanish|en|ja|ko|fr|es))?\s*$/i;
const translationSourcePrefixedPattern = new RegExp(
  `^(${translationLanguagePattern})(?:の|で)\s*(.+?)(?:を|は)\s*(${translationLanguagePattern})(?:に|へ|で)?(?:して|にして|にすると|に訳して|へ訳して|に翻訳して|にしてほしい|にしてください|に訳すと)?\s*[。！？!?]?$`,
  "i"
);
const translationNaturalJapanesePattern = new RegExp(
  `^(.+?)(?:を|は)\s*(${translationLanguagePattern})(?:に|へ|で)?(?:して|にして|にすると|にしたら|に訳して|へ訳して|に翻訳して|にしてほしい|にしてください|に訳すと|では何|で何て言う|でなんて言う)?\s*[。！？!?]?$`,
  "i"
);
const translationNaturalJapaneseAltPattern = new RegExp(
  `^(.+?)(?:の|を)?\s*(${translationLanguagePattern})(?:は|で)?(?:何|なん|何て言う|なんて言う|どう言う|どういう|では何)?\s*[？?。！!]?$`,
  "i"
);
const translationTargetFirstPattern = new RegExp(
  `^(${translationLanguagePattern})(?:で|に)?\s*(.+?)(?:は|を)?(?:何て言う|なんて言う|どう言う|どういう|にして|にすると)\s*[？?。！!]?$`,
  "i"
);
const localWordTranslations: Record<string, Record<string, string>> = {
  apple: {
    ja: "りんご",
    en: "apple",
    zh: "苹果",
    ko: "사과",
    fr: "pomme",
    es: "manzana",
    de: "Apfel",
    it: "mela",
    pt: "maçã",
    ru: "яблоко",
    ar: "تفاحة",
    hi: "सेब",
    id: "apel",
    vi: "táo",
    th: "แอปเปิล",
    tr: "elma",
    nl: "appel",
    pl: "jabłko",
    uk: "яблуко",
    sv: "äpple",
    bn: "আপেল",
    ms: "epal",
    tl: "mansanas",
  },
  water: {
    ja: "水",
    en: "water",
    zh: "水",
    ko: "물",
    fr: "eau",
    es: "agua",
    de: "Wasser",
    it: "acqua",
    pt: "água",
    ru: "вода",
    ar: "ماء",
    hi: "पानी",
    id: "air",
    vi: "nước",
    th: "น้ำ",
    tr: "su",
    nl: "water",
    pl: "woda",
    uk: "вода",
    sv: "vatten",
    bn: "পানি",
    ms: "air",
    tl: "tubig",
  },
};

function languageCode(value?: string) {
  return translationLanguages[normalizeText(value ?? "")] ?? null;
}
function detectTranslationSource(content: string, hint?: string | null) {
  if (hint && languageCode(hint)) return languageCode(hint)!;
  if (/[ぁ-んァ-ン]/.test(content)) return "ja";
  if (/[가-힣]/.test(content)) return "ko";
  if (/[؀-ۿ]/.test(content)) return "ar";
  if (/[ऀ-ॿ]/.test(content)) return "hi";
  if (/[ก-๙]/.test(content)) return "th";
  if (/[а-яё]/i.test(content)) return "ru";
  if (/[一-龯]/.test(content)) return "zh";
  return "en";
}

function translationRequest(text: string) {
  const value = text.trim();
  const japanese = value.match(translationJapanesePattern);
  const english = value.match(translationEnglishPattern);
  const sourcePrefixed = value.match(translationSourcePrefixedPattern);
  const naturalJapanese =
    value.match(translationNaturalJapanesePattern) ??
    value.match(translationNaturalJapaneseAltPattern);
  const targetFirst = value.match(translationTargetFirstPattern);
  const chineseMarked = value.match(
    /^(?:请)?(?:把|将)(.+?)(?:翻译|翻譯)(?:成|为|為)\s*(英语|英文|日语|日文|中文|汉语|韩语|朝鲜语|法语|西班牙语|德语|意大利语|葡萄牙语|俄语|阿拉伯语|印地语|印尼语|越南语|泰语|土耳其语|荷兰语|波兰语|乌克兰语|瑞典语|孟加拉语|马来语|菲律宾语|简体中文|繁体中文)\s*[。？！?!]?$/i
  );
  const chineseAsk = value.match(
    /^(.+?)(?:用|的)(英语|英文|日语|日文|中文|汉语|韩语|朝鲜语|法语|西班牙语|德语|意大利语|葡萄牙语|俄语|阿拉伯语|印地语|印尼语|越南语|泰语|土耳其语|荷兰语|波兰语|乌克兰语|瑞典语|孟加拉语|马来语|菲律宾语)(?:怎么说|怎么讲|怎么写)[？?]*$/
  );
  const chinesePlain = value.match(/^翻[译譯][:：]\s*(.+?)\s*[。？！?!]?$/);
  const englishNatural =
    value.match(
      /^(?:how do you say|what is)\s+(.+?)\s+in\s+([a-z-]+)\s*\??$/i
    ) ??
    value.match(/^(.+?)\s+in\s+([a-z-]+)\s*\??$/i) ??
    (value
      .match(/^([a-z-]+)\s+for\s+(.+?)\s*\??$/i)
      ?.slice(0, 3)
      .reverse() as RegExpMatchArray | null);
  const englishFrom = value.match(
    /^translate\s+(.+?)\s+from\s+([a-z-]+)\s+(?:to|into)\s+([a-z-]+)\s*\??$/i
  );
  const content = (
    sourcePrefixed?.[2] ??
    japanese?.[2] ??
    englishFrom?.[1] ??
    english?.[1] ??
    chineseMarked?.[1] ??
    chineseAsk?.[1] ??
    chinesePlain?.[1] ??
    naturalJapanese?.[1] ??
    targetFirst?.[2] ??
    englishNatural?.[1] ??
    ""
  )
    .trim()
    .replace(/^['"「『]|['"」』]$/g, "");
  if (!content) return null;
  let target = languageCode(
    sourcePrefixed?.[3] ??
      japanese?.[1] ??
      englishFrom?.[3] ??
      english?.[2] ??
      chineseMarked?.[2] ??
      chineseAsk?.[2] ??
      naturalJapanese?.[2] ??
      targetFirst?.[1] ??
      englishNatural?.[2]
  );
  if (/^英訳/.test(value)) target = "en";
  if (/^和訳/.test(value)) target = "ja";
  const source = detectTranslationSource(
    content,
    sourcePrefixed?.[1] ?? englishFrom?.[2]
  );
  return {
    content,
    source,
    target: target ?? (source === "en" ? "ja" : "en"),
  };
}

function isTranslationRequest(text: string) {
  return Boolean(translationRequest(text));
}

type PhrasePair = { pattern: RegExp; replacement: string };

const jaEnPhrasePairs: PhrasePair[] = [
  ["こんにちは", "Hello"],
  ["おはよう", "Good morning"],
  ["こんばんは", "Good evening"],
  ["ありがとう", "Thank you"],
  ["さようなら", "Goodbye"],
  ["りんご", "apple"],
  ["みかん", "orange"],
  ["水", "water"],
  ["本", "book"],
  ["猫", "cat"],
  ["犬", "dog"],
  ["はい", "Yes"],
  ["いいえ", "No"],
].map(([from, to]) => ({ pattern: new RegExp(from, "g"), replacement: to }));

const enJaPhrasePairs: PhrasePair[] = [
  ["hello", "こんにちは"],
  ["good morning", "おはようございます"],
  ["good evening", "こんばんは"],
  ["thank you", "ありがとう"],
  ["thanks", "ありがとう"],
  ["goodbye", "さようなら"],
  ["apple", "りんご"],
  ["orange", "みかん"],
  ["water", "水"],
  ["book", "本"],
  ["cat", "猫"],
  ["dog", "犬"],
  ["yes", "はい"],
  ["no", "いいえ"],
].map(([from, to]) => ({ pattern: new RegExp(from, "ig"), replacement: to }));

const localWordTranslationRecords = Object.values(localWordTranslations);
const localWordRecordByNormalizedWord = new Map<
  string,
  Record<string, string>
>();
for (const translations of localWordTranslationRecords) {
  for (const word of Object.values(translations)) {
    const key = normalizeText(word);
    if (!localWordRecordByNormalizedWord.has(key))
      localWordRecordByNormalizedWord.set(key, translations);
  }
}

function offlineTranslation(content: string, source: string, target: string) {
  const normalized = normalizeText(content).replace(
    /[「」『』"'？！!?。]/g,
    ""
  );
  const record = localWordRecordByNormalizedWord.get(normalized);
  if (record) return record[target] ?? null;
  const pairs =
    source === "ja" && target === "en"
      ? jaEnPhrasePairs
      : source === "en" && target === "ja"
        ? enJaPhrasePairs
        : [];
  for (const { pattern, replacement } of pairs) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) return content.replace(pattern, replacement);
  }
  return null;
}

async function managedDeepLTranslation(request: {
  content: string;
  source: string;
  target: string;
}): Promise<SkillResponse | null> {
  const authKey = process.env.DEEPL_AUTH_KEY?.trim();
  if (!authKey) return null;
  const endpoint = authKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const cacheKey = `deepl:${request.source}:${request.target}:${request.content}`;
  const cached = externalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const translated =
      typeof cached.data.translated_text === "string"
        ? cached.data.translated_text
        : "";
    return translated
      ? {
          content: `【${request.source} → ${request.target}】\n${translated}`,
          cacheHit: true,
        }
      : null;
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    MANAGED_TRANSLATION_TIMEOUT_MS
  );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${authKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Clio-Unai-Compatible/1.0",
      },
      body: JSON.stringify({
        text: [request.content],
        source_lang: request.source.toUpperCase(),
        target_lang: request.target.toUpperCase(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      translations?: Array<{ text?: string }>;
    };
    const translated = data.translations?.[0]?.text?.trim() ?? "";
    if (!translated) return null;
    storeExternalCache(
      cacheKey,
      { translated_text: translated },
      EXTERNAL_CACHE_TTL_MS
    );
    return {
      content: `【${request.source} → ${request.target}】\n${translated}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function translate(
  text: string,
  lang: UiLanguage
): Promise<SkillResponse> {
  const request = translationRequest(text);
  if (!request)
    return {
      content: pick(lang, {
        en: "Try: `translate: Hello to Japanese`, `英語に翻訳: こんにちは`.",
        ja: "例: `英語に翻訳: こんにちは`、`translate: Hello to Japanese` のように入力してください。",
        zh: "请输入如 `把Hello翻译成中文`、`translate: Hello to Japanese`。",
      }),
    };
  const managed = await managedDeepLTranslation(request);
  if (managed) return managed;
  const url = `https://simplytranslate.org/api/translate/?engine=google&from=${request.source}&to=${request.target}&text=${encodeURIComponent(request.content)}`;
  const { data, cacheHit } = await fetchJson(url, TRANSLATION_TIMEOUT_MS);
  const translated =
    typeof data?.translated_text === "string"
      ? data.translated_text.trim()
      : "";
  if (translated)
    return {
      content: `【${request.source} → ${request.target}】\n${translated}`,
      cacheHit,
    };
  const local = offlineTranslation(
    request.content,
    request.source,
    request.target
  );
  return local
    ? {
        content: `${pick(lang, {
          en: `【${request.source} → ${request.target}】\n${local}`,
          ja: `【${request.source} → ${request.target}】\n${local}\n\n*基本表現はローカル語句で応答しました。*`,
          zh: `【${request.source} → ${request.target}】\n${local}\n\n*基础表达来自本地词库。*`,
        })}`,
        cacheHit,
      }
    : {
        content: pick(lang, {
          en: "Could not retrieve the translation. Please try again shortly.",
          ja: "翻訳を取得できませんでした。短時間を置いて再試行してください。",
          zh: "暂时无法获取翻译，请稍后重试。",
        }),
        cacheHit,
      };
}

const unitFactors: Record<
  string,
  { group: string; factor: number; label: string }
> = {
  mm: { group: "length", factor: 0.001, label: "mm" },
  cm: { group: "length", factor: 0.01, label: "cm" },
  m: { group: "length", factor: 1, label: "m" },
  km: { group: "length", factor: 1000, label: "km" },
  in: { group: "length", factor: 0.0254, label: "in" },
  ft: { group: "length", factor: 0.3048, label: "ft" },
  g: { group: "mass", factor: 0.001, label: "g" },
  kg: { group: "mass", factor: 1, label: "kg" },
  lb: { group: "mass", factor: 0.45359237, label: "lb" },
  ml: { group: "volume", factor: 0.001, label: "mL" },
  l: { group: "volume", factor: 1, label: "L" },
};
function isUnitConversionRequest(text: string) {
  return (
    /(?:単位変換|変換して|convert)\b/i.test(text) ||
    /(?:单位转换|单位换算|换算)/.test(text) ||
    /\d+(?:\.\d+)?\s*(?:mm|cm|km|kg|lb|ml|l|m|in|ft)\s*(?:to|を)\s*(?:mm|cm|km|kg|lb|ml|l|m|in|ft)/i.test(
      text
    )
  );
}
function convertUnit(text: string, lang: UiLanguage): SkillResponse {
  const match = normalizeText(text).match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|km|kg|lb|ml|l|m|in|ft)\s*(?:to|を|换成|换算成|转为|转换为|→)\s*(mm|cm|km|kg|lb|ml|l|m|in|ft)/i
  );
  if (!match)
    return {
      content: pick(lang, {
        en: "Try: `10 km to m`, `2.5kg to lb`.",
        ja: "例: `10 km を m に変換`、`2.5kg to lb` のように入力してください。",
        zh: "请输入如 `10 km 换算成 m`、`2.5kg to lb`。",
      }),
    };
  const from = unitFactors[match[2].toLowerCase()];
  const to = unitFactors[match[3].toLowerCase()];
  if (!from || !to || from.group !== to.group)
    return {
      content: pick(lang, {
        en: "Please use units of the same type. Length, mass, and volume are supported.",
        ja: "同じ種類の単位を指定してください。長さ・重さ・容量に対応しています。",
        zh: "请指定相同类型的单位。支持长度、重量和容量。",
      }),
    };
  const result = (Number(match[1]) * from.factor) / to.factor;
  return {
    content: `\`\`\`\n${match[1]} ${from.label} = ${Number(result.toPrecision(12))} ${to.label}\n\`\`\``,
  };
}

function utilityValue(text: string) {
  return text.replace(/^.*?[:：]\s*/, "").trim();
}
function isTextStatsRequest(text: string) {
  return /(?:文字数|文字数を数|単語数|word count|text stats|テキスト集計|字数统计|字符数|文本统计|统计字数)/i.test(
    text
  );
}
function textStats(text: string, lang: UiLanguage): SkillResponse {
  const value = utilityValue(text);
  if (!value || value === text.trim())
    return {
      content: pick(lang, {
        en: "Specify the text like `word count: some text`.",
        ja: "例: `文字数: こんにちは、Clio！` のようにテキストを指定してください。",
        zh: "请像 `字数统计: 你好，Clio！` 这样指定文本。",
      }),
    };
  const labels = pick(lang, {
    en: { chars: "Characters", words: "Words", lines: "Lines" },
    ja: { chars: "文字数", words: "単語数", lines: "行数" },
    zh: { chars: "字符数", words: "词数", lines: "行数" },
  });
  return {
    content: `\`\`\`\n${labels.chars}: ${Array.from(value).length}\n${labels.words}: ${value.split(/\s+/).filter(Boolean).length}\n${labels.lines}: ${value.split(/\r?\n/).length}\n\`\`\``,
  };
}

function isJsonFormatRequest(text: string) {
  return /(?:json\s*(?:を)?(?:整形|フォーマット|format|validate)|整形json|(?:格式化|美化|校验)\s*json|json\s*(?:格式化|美化|校验))/i.test(
    text
  );
}
function formatJson(text: string, lang: UiLanguage): SkillResponse {
  try {
    return {
      content: `\`\`\`json\n${JSON.stringify(JSON.parse(utilityValue(text)), null, 2)}\n\`\`\``,
    };
  } catch {
    return {
      content: pick(lang, {
        en: "Failed to parse JSON. Provide valid JSON using double quotes.",
        ja: "JSONを解析できませんでした。ダブルクォートを使った有効なJSONを指定してください。",
        zh: "无法解析 JSON。请提供使用双引号的有效 JSON。",
      }),
    };
  }
}

function isUuidRequest(text: string) {
  return (
    /(?:uuid|guid|一意id|ユニークid|識別子|唯一id|唯一标识符).*(?:生成|作成|generate|create|创建)|^(?:uuid|guid)(?:を)?$/i.test(
      text
    ) || /^(?:生成|作成|创建|generate|create)\s*(?:uuid|guid)$/i.test(text)
  );
}
function createUuid(): SkillResponse {
  return { content: `\`\`\`\n${crypto.randomUUID()}\n\`\`\`` };
}

function formatNumber(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function secureRandomInt(minInclusive: number, maxInclusive: number): number {
  const range = maxInclusive - minInclusive + 1;
  if (range <= 1) return minInclusive;
  const limit = Math.floor(4_294_967_296 / range) * range;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value < limit) return minInclusive + (value % range);
  }
}

type ColorParse =
  | { ok: true; r: number; g: number; b: number; label: string }
  | { ok: false };

const namedColors: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  黒: [0, 0, 0],
  white: [255, 255, 255],
  白: [255, 255, 255],
  red: [255, 0, 0],
  赤: [255, 0, 0],
  green: [0, 128, 0],
  緑: [0, 128, 0],
  blue: [0, 0, 255],
  青: [0, 0, 255],
  yellow: [255, 255, 0],
  黄: [255, 255, 0],
  orange: [255, 165, 0],
  オレンジ: [255, 165, 0],
  pink: [255, 192, 203],
  ピンク: [255, 192, 203],
  purple: [128, 0, 128],
  紫: [128, 0, 128],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  グレー: [128, 128, 128],
  红: [255, 0, 0],
  红色: [255, 0, 0],
  蓝: [0, 0, 255],
  蓝色: [0, 0, 255],
  绿: [0, 128, 0],
  绿色: [0, 128, 0],
  黄色: [255, 255, 0],
  黑: [0, 0, 0],
  黑色: [0, 0, 0],
  白色: [255, 255, 255],
  橙: [255, 165, 0],
  橙色: [255, 165, 0],
  粉: [255, 192, 203],
  粉色: [255, 192, 203],
  灰: [128, 128, 128],
  灰色: [128, 128, 128],
};

function expandHex(hex: string): [number, number, number] | null {
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map(ch => ch + ch)
          .join("")
      : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hp < 1) [rn, gn, bn] = [c, x, 0];
  else if (hp < 2) [rn, gn, bn] = [x, c, 0];
  else if (hp < 3) [rn, gn, bn] = [0, c, x];
  else if (hp < 4) [rn, gn, bn] = [0, x, c];
  else if (hp < 5) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  const m = ln - c / 2;
  return [
    Math.round((rn + m) * 255),
    Math.round((gn + m) * 255),
    Math.round((bn + m) * 255),
  ];
}

function parseColorText(text: string): ColorParse {
  const hexMatch = text.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (hexMatch) {
    const rgb = expandHex(hexMatch[1].toLowerCase());
    if (rgb)
      return {
        ok: true,
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
        label: `#${hexMatch[1].toLowerCase()}`,
      };
    return { ok: false };
  }
  const rgbMatch = text.match(
    /\brgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,)?[^)]*\)/i
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if ([r, g, b].some(v => v > 255)) return { ok: false };
    return { ok: true, r, g, b, label: rgbMatch[0] };
  }
  const hslMatch = text.match(
    /\bhsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%(?:\s*,)?[^)]*\)/i
  );
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    if (h > 360 || s > 100 || l > 100) return { ok: false };
    const [r, g, b] = hslToRgb(h, s, l);
    return { ok: true, r, g, b, label: hslMatch[0] };
  }
  const hasColorContext = /色|カラー|color|コード|code|颜色|色号/i.test(text);
  if (!hasColorContext) return { ok: false };
  for (const [name, rgb] of Object.entries(namedColors)) {
    if (/[^\x00-\x7F]/.test(name)) {
      if (text.includes(name))
        return { ok: true, r: rgb[0], g: rgb[1], b: rgb[2], label: name };
    } else if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
      return { ok: true, r: rgb[0], g: rgb[1], b: rgb[2], label: name };
    }
  }
  return { ok: false };
}

function isColorRequest(text: string) {
  if (isJsonFormatRequest(text)) return false;
  if (isTranslationRequest(text)) return false;
  return (
    /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.test(text) ||
    /\brgba?\(/i.test(text) ||
    /\bhsla?\(/i.test(text) ||
    parseColorText(text).ok
  );
}

function colorConvert(text: string, lang: UiLanguage): SkillResponse {
  const parsed = parseColorText(text);
  if (!parsed.ok)
    return {
      content: pick(lang, {
        en: "Could not parse the color code. Try `#ff0000`, `rgb(255, 0, 0)`, or `red color code`.",
        ja: "色コードを解析できませんでした。例: `#ff0000`、`rgb(255, 0, 0)`、`赤のカラーコード`",
        zh: "无法解析颜色代码。示例：`#ff0000`、`rgb(255, 0, 0)`、`红色的颜色代码`",
      }),
    };
  const { r, g, b } = parsed;
  const hsl = rgbToHsl(r, g, b);
  const hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
  return {
    content: `\`\`\`\nHEX: ${hex}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\n\`\`\``,
  };
}

type PercentCalculation =
  | { kind: "of"; percent: number; total: number }
  | { kind: "ratio"; part: number; total: number };

function percentCalculation(text: string): PercentCalculation | null {
  const normalized = normalizeText(text);
  let match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:%|％|パーセント)\s*(?:of\s+)?(\d+(?:\.\d+)?)/
  );
  if (match)
    return { kind: "of", percent: Number(match[1]), total: Number(match[2]) };
  match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(?:の|を|的)?\s*(\d+(?:\.\d+)?)\s*(?:%|％|パーセント)/
  );
  if (match)
    return { kind: "of", percent: Number(match[2]), total: Number(match[1]) };
  match = normalized.match(
    /(\d+(?:\.\d+)?)\s*は\s*(\d+(?:\.\d+)?)\s*の?\s*何\s*(?:%|％|パーセント)/
  );
  if (match)
    return { kind: "ratio", part: Number(match[1]), total: Number(match[2]) };
  match = normalized.match(
    /(\d+(?:\.\d+)?)\s*是\s*(\d+(?:\.\d+)?)\s*的?\s*百?分之?/
  );
  if (match)
    return { kind: "ratio", part: Number(match[1]), total: Number(match[2]) };
  match = normalized.match(
    /(\d+(?:\.\d+)?)\s*に対する\s*(\d+(?:\.\d+)?)\s*(?:は|の)?何\s*(?:%|％|パーセント)?/
  );
  if (match && /割合|%|％|パーセント/.test(normalized))
    return { kind: "ratio", total: Number(match[1]), part: Number(match[2]) };
  match = normalized.match(
    /what\s+percent(?:age)?\s+is\s+(\d+(?:\.\d+)?)\s+of\s+(\d+(?:\.\d+)?)/
  );
  if (match)
    return { kind: "ratio", part: Number(match[1]), total: Number(match[2]) };
  return null;
}

function isPercentRequest(text: string) {
  return percentCalculation(text) !== null;
}

function calculatePercent(text: string, lang: UiLanguage): SkillResponse {
  const request = percentCalculation(text);
  if (!request)
    return {
      content: pick(lang, {
        en: "Try: `20% of 150`, `what percent is 30 of 150?`.",
        ja: "例: `20% of 150`、`150の20%は？`、`what percent is 30 of 150?` のように入力してください。",
        zh: "请输入如 `150的20%是多少`、`30是150的百分之几`。",
      }),
    };
  if (request.kind === "of") {
    const result = formatNumber((request.total * request.percent) / 100);
    return {
      content: `\`\`\`\n${request.percent}% of ${request.total} = ${result}\n\`\`\`\n${pick(
        lang,
        {
          en: `${request.percent}% of ${request.total} is ${result}.`,
          ja: `${request.total} の ${request.percent}% は ${result} です。`,
          zh: `${request.total} 的 ${request.percent}% 是 ${result}。`,
        }
      )}`,
    };
  }
  if (request.total === 0)
    return {
      content: pick(lang, {
        en: "Cannot calculate a percentage with a total of 0. Choose another number.",
        ja: "0 では割合を計算できません。別の数値を指定してください。",
        zh: "总数为 0 时无法计算百分比。请指定其他数值。",
      }),
    };
  const result = formatNumber((request.part / request.total) * 100);
  return {
    content: `\`\`\`\n${request.part} / ${request.total} = ${result}%\n\`\`\`\n${pick(
      lang,
      {
        en: `${request.part} out of ${request.total} is about ${result}%.`,
        ja: `${request.total} に対する ${request.part} の割合は約 ${result}% です。`,
        zh: `${request.total} 中 ${request.part} 所占的比例约为 ${result}%。`,
      }
    )}`,
  };
}

const baseTargetKeywords: Array<[string, number]> = [
  ["十六進", 16],
  ["16進", 16],
  ["hexadecimal", 16],
  ["十進", 10],
  ["10進", 10],
  ["decimal", 10],
  ["八進", 8],
  ["8進", 8],
  ["octal", 8],
  ["二進", 2],
  ["2進", 2],
  ["binary", 2],
  ["十六进制", 16],
  ["十六進制", 16],
  ["16进制", 16],
  ["十进制", 10],
  ["十進制", 10],
  ["10进制", 10],
  ["八进制", 8],
  ["八進制", 8],
  ["8进制", 8],
  ["二进制", 2],
  ["二進制", 2],
  ["2进制", 2],
];

function baseKeywordAt(
  normalized: string
): { index: number; keyword: string; base: number } | null {
  let best: { index: number; keyword: string; base: number } | null = null;
  for (const [keyword, base] of baseTargetKeywords) {
    const index = normalized.indexOf(keyword);
    if (
      index >= 0 &&
      (best === null ||
        index < best.index ||
        (index === best.index && keyword.length > best.keyword.length))
    )
      best = { index, keyword, base };
  }
  return best;
}

type BaseConvertRequest =
  | { kind: "literal"; digits: string; base: number }
  | { kind: "convert"; digits: string; base: number }
  | { kind: "help" };

function baseConvertRequest(text: string): BaseConvertRequest | null {
  const normalized = normalizeText(text);
  const hasBaseContext =
    baseKeywordAt(normalized) !== null ||
    /\b0[xbo][0-9a-f]|\bhex\b|hexadecimal|\bbinary\b|\bbin\b|\boctal\b|\boct\b|\bdec(?:imal)?\b/i.test(
      normalized
    );
  if (!hasBaseContext) return null;
  const prefixed =
    normalized.match(/\b0([xb])([0-9a-f]{1,32})\b/) ??
    normalized.match(/\b0(o)([0-7]{1,32})\b/);
  if (prefixed) {
    const base = prefixed[1] === "x" ? 16 : prefixed[1] === "b" ? 2 : 8;
    return { kind: "literal", digits: prefixed[2], base };
  }
  const sourceKw = baseKeywordAt(normalized);
  if (sourceKw) {
    const cleaned = normalized.replace(/转换为|轉換為|转成|換成|换成/g, " ");
    const cleanedKw = baseKeywordAt(cleaned)!;
    const afterSource = cleaned
      .slice(cleanedKw.index + cleanedKw.keyword.length)
      .match(/^\s*(?:数)?の?\s*([0-9a-f]{1,32})\b/);
    if (afterSource)
      return { kind: "literal", digits: afterSource[1], base: cleanedKw.base };
    const beforeSource = cleaned
      .slice(Math.max(0, cleanedKw.index - 40), cleanedKw.index)
      .match(/([0-9a-f]{1,32})\s*(?:を|から|的)?\s*$/);
    if (beforeSource && /変換|转换|轉換|转成|换成|to|→|->/.test(normalized))
      return { kind: "convert", digits: beforeSource[1], base: 10 };
    return { kind: "help" };
  }
  if (/変換|转换|轉換|convert/i.test(normalized)) {
    const direction = normalized.match(
      /(\d{1,15})(?:\s*(?:を|から|の|的|to|→|->|=|as|转换为|转成|换成))*\s*/
    );
    if (direction && direction.index !== undefined) {
      const rest = normalized.slice(direction.index + direction[0].length);
      const target = baseKeywordAt(rest);
      if (target)
        return { kind: "convert", digits: direction[1], base: target.base };
    }
    return { kind: "help" };
  }
  return null;
}

function isBaseConvertRequest(text: string) {
  return baseConvertRequest(text) !== null;
}

const zhBaseNames: Record<number, string> = {
  2: "二",
  8: "八",
  10: "十",
  16: "十六",
};

function convertNumberBase(text: string, lang: UiLanguage): SkillResponse {
  const request = baseConvertRequest(text);
  if (!request || request.kind === "help")
    return {
      content: pick(lang, {
        en: "Try: `255 to hex`, `0xff to decimal`, `binary 1011 to decimal`.",
        ja: "例: `255 を 16進数に変換`、`0xff to decimal`、`2進数の1011を10進に変換` のように入力してください。",
        zh: "请输入如 `255 转换为 十六进制`、`0xff to decimal`、`二进制的1011转换为十进制`。",
      }),
    };
  const invalidMessage =
    lang === "zh"
      ? `请输入有效的${zhBaseNames[request.base] ?? request.base}进制数字。`
      : lang === "ja"
        ? `${request.base}進数として有効な数字を指定してください。`
        : `Enter a valid base-${request.base} number.`;
  if (request.base !== 16 && !/^\d+$/.test(request.digits))
    return { content: invalidMessage };
  const stripped = request.digits.toLowerCase().replace(/^0+/, "");
  const canonical = stripped.length > 0 ? stripped : "0";
  const value = parseInt(canonical, request.base);
  if (!Number.isFinite(value) || value.toString(request.base) !== canonical)
    return { content: invalidMessage };
  return {
    content: `\`\`\`\nDec: ${value}\nHex: 0x${value.toString(16)}\nOct: 0o${value.toString(8)}\nBin: 0b${value.toString(2)}\n\`\`\``,
  };
}

const STRICT_ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

function romanToInt(token: string): number {
  let total = 0;
  for (let i = 0; i < token.length; i += 1) {
    const current = ROMAN_VALUES[token[i]];
    const next = ROMAN_VALUES[token[i + 1]];
    total += next !== undefined && current < next ? -current : current;
  }
  return total;
}

function intToRoman(value: number): string {
  const table: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [amount, symbol] of table) {
    while (remaining >= amount) {
      out += symbol;
      remaining -= amount;
    }
  }
  return out;
}

type RomanRequest =
  | { kind: "toRoman"; value: number }
  | { kind: "toInt"; token: string }
  | { kind: "range" }
  | { kind: "help" };

function strictRomanToken(text: string): string | null {
  for (const word of text.split(/[^A-Za-z]+/)) {
    if (
      word.length >= 2 &&
      /^[IVXLCDM]+$/.test(word) &&
      STRICT_ROMAN.test(word)
    )
      return word;
  }
  return null;
}

function romanRequest(text: string): RomanRequest {
  const hasKeyword =
    /ローマ数字|ローマすうじ|罗马数字|羅馬數字|\broman\s*(?:numeral|number)s?\b/i.test(
      text
    );
  const normalized = normalizeText(text);
  const arabic = normalized.match(/\d{1,6}/);
  const token = strictRomanToken(text);
  if (hasKeyword && arabic) {
    const value = Number(arabic[0]);
    return value >= 1 && value <= 3999
      ? { kind: "toRoman", value }
      : { kind: "range" };
  }
  if (token) return { kind: "toInt", token };
  return { kind: "help" };
}

function isRomanRequest(text: string) {
  return (
    /ローマ数字|ローマすうじ|罗马数字|羅馬數字|\broman\s*(?:numeral|number)s?\b/i.test(
      text
    ) || strictRomanToken(text) !== null
  );
}

function convertRoman(text: string, lang: UiLanguage): SkillResponse {
  const request = romanRequest(text);
  if (request.kind === "toRoman")
    return {
      content: pick(lang, {
        en: `${request.value} in Roman numerals is **${intToRoman(request.value)}** (supports 1–3999).`,
        ja: `${request.value} をローマ数字にすると **${intToRoman(request.value)}** です。（1〜3999に対応）`,
        zh: `${request.value} 的罗马数字是 **${intToRoman(request.value)}**。（支持1～3999）`,
      }),
    };
  if (request.kind === "toInt") {
    const value = romanToInt(request.token);
    if (value < 1 || value > 3999)
      return {
        content: pick(lang, {
          en: "Please provide a Roman numeral in the range 1–3999.",
          ja: "1〜3999 の範囲のローマ数字を指定してください。",
          zh: "请指定 1～3999 范围内的罗马数字。",
        }),
      };
    return {
      content: pick(lang, {
        en: `**${request.token}** is ${value} (supports 1–3999).`,
        ja: `**${request.token}** は ${value} です。（1〜3999に対応）`,
        zh: `**${request.token}** 是 ${value}。（支持1～3999）`,
      }),
    };
  }
  if (request.kind === "range")
    return {
      content: pick(lang, {
        en: "Roman numerals support integers from 1 to 3999. Other values cannot be represented.",
        ja: "ローマ数字は 1〜3999 の整数に対応しています。それ以外の数値は表現できません。",
        zh: "罗马数字支持 1～3999 的整数，其他数值无法表示。",
      }),
    };
  return {
    content: pick(lang, {
      en: "Try: `roman numeral for 49`, `MCMXCIV = ?`, `2024 to roman numerals`.",
      ja: "例: `2024 を ローマ数字に変換`、`MCMXCIV は 何？`、`roman numeral for 49` のように入力してください。",
      zh: "请输入如 `2024 转换为 罗马数字`、`MCMXCIV 是多少`。",
    }),
  };
}

type TimestampRequest =
  | { kind: "now" }
  | { kind: "toDate"; value: number }
  | { kind: "toUnix"; parts: string[] };

function timestampRequest(text: string): TimestampRequest | null {
  const normalized = normalizeText(text);
  if (/進数?|进制|進制|hexadecimal|\bbinary\b|\boctal\b|基数/.test(normalized))
    return null;
  const keyword =
    /\bunix\b|\bepoch\b|エポック|タイムスタンプ|unixtime|时间戳|時間戳/i.test(
      normalized
    );
  const bigNumber = normalized.match(/(?<!\d)(\d{9,13})(?!\d)/);
  const dateParts = normalized.match(
    /(\d{4})[年/\-.](\d{1,2})[月/\-.](\d{1,2})日?(?:\s+(\d{1,2})[:：時](\d{1,2})分?(?::(\d{2}))?)?/
  );
  const wantsDate =
    /日付|date|いつ|読み取|わかりやすく|日期|什么时候|哪一天/.test(normalized);
  if (
    bigNumber &&
    (keyword || wantsDate || /変換|转换|轉換/.test(normalized))
  ) {
    const raw = Number(bigNumber[1]);
    return {
      kind: "toDate",
      value: bigNumber[1].length >= 13 ? Math.floor(raw / 1000) : raw,
    };
  }
  if (
    dateParts &&
    (keyword || /変換|转换|轉換|取得|教えて|知りたい/.test(normalized))
  )
    return { kind: "toUnix", parts: dateParts.slice(1) };
  if (keyword) return { kind: "now" };
  return null;
}

function isTimestampRequest(text: string) {
  return timestampRequest(text) !== null;
}

function formatTimestampBlock(epochSeconds: number): string | null {
  if (!Number.isFinite(epochSeconds)) return null;
  const utc = new Date(epochSeconds * 1000);
  if (Number.isNaN(utc.getTime())) return null;
  const jst = new Date(epochSeconds * 1000 + 9 * 60 * 60 * 1000);
  return `Unix: ${epochSeconds}\nISO (UTC): ${utc.toISOString()}\nJST (+9): ${jst.toISOString().slice(0, 10)} ${jst.toISOString().slice(11, 19)}`;
}

function handleTimestamp(text: string, lang: UiLanguage): SkillResponse {
  const request = timestampRequest(text);
  if (!request)
    return {
      content: pick(lang, {
        en: "Try: `current unix timestamp`, `1700000000 to date`, `unix timestamp for 2025-01-01`.",
        ja: "例: `現在のタイムスタンプ`、`1700000000 を 日付に変換`、`2025-01-01 の unix タイムスタンプ` のように入力してください。",
        zh: "请输入如 `当前时间戳`、`1700000000 转换为日期`、`2025-01-01 的 unix 时间戳`。",
      }),
    };
  if (request.kind === "now") {
    const block = formatTimestampBlock(Math.floor(Date.now() / 1000));
    return block
      ? { content: `\`\`\`\n${block}\n\`\`\`` }
      : {
          content: pick(lang, {
            en: "Failed to get the current time.",
            ja: "現在時刻を取得できませんでした。",
            zh: "无法获取当前时间。",
          }),
        };
  }
  if (request.kind === "toDate") {
    const block = formatTimestampBlock(request.value);
    return block
      ? { content: `\`\`\`\n${block}\n\`\`\`` }
      : {
          content: pick(lang, {
            en: "Unsupported timestamp. Provide a 9–13 digit number.",
            ja: "対応していないタイムスタンプです。9〜13桁の数値を指定してください。",
            zh: "不支持的时间戳。请提供 9～13 位数字。",
          }),
        };
  }
  const [year, month, day, hour = "0", minute = "0", second = "0"] =
    request.parts;
  const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(
    Number
  );
  if (![y, mo, d, h, mi, s].every(Number.isFinite))
    return {
      content: pick(lang, {
        en: "Provide a valid date. Example: `2025-01-31 23:59` (interpreted as UTC)",
        ja: "有効な日付を指定してください。例: `2025-01-31 23:59`（UTCとして解釈します）",
        zh: "请提供有效日期。示例：`2025-01-31 23:59`（按 UTC 解释）",
      }),
    };
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const valid =
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === mo - 1 &&
    utc.getUTCDate() === d &&
    utc.getUTCHours() === h &&
    utc.getUTCMinutes() === mi &&
    utc.getUTCSeconds() === s;
  if (!valid)
    return {
      content: pick(lang, {
        en: "Provide a valid date. Example: `2025-01-31 23:59` (interpreted as UTC)",
        ja: "有効な日付を指定してください。例: `2025-01-31 23:59`（UTCとして解釈します）",
        zh: "请提供有效日期。示例：`2025-01-31 23:59`（按 UTC 解释）",
      }),
    };
  const block = formatTimestampBlock(Math.floor(utc.getTime() / 1000));
  return block
    ? { content: `\`\`\`\n${block}\n\`\`\`` }
    : {
        content: pick(lang, {
          en: "Failed to parse the date.",
          ja: "日付を解析できませんでした。",
          zh: "无法解析该日期。",
        }),
      };
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type DiceRequest =
  | { kind: "coin"; count: number }
  | { kind: "dice"; count: number; faces: number }
  | { kind: "range"; min: number; max: number };

function diceRequest(text: string): DiceRequest | null {
  const normalized = normalizeText(text);
  if (/コイン|coin|硬貨|硬币|掷硬币|抛硬币/.test(normalized)) {
    const rawCount = Number(
      normalized.match(/(\d{1,2})\s*(?:回|つ|個|个|次|times)/)?.[1] ?? 1
    );
    const count = Number.isFinite(rawCount) && rawCount >= 1 ? rawCount : 1;
    return { kind: "coin", count: clampInt(count, 1, 20) };
  }
  let parsed: { count: number; faces: number } | null = null;
  const countThenFaces =
    normalized.match(/\b(\d{1,2})\s*d\s*(\d{1,4})\b/) ??
    normalized.match(/(\d{1,2})(?:個|个|つの)\s*(?:の)?\s*(\d{1,4})面/);
  if (countThenFaces)
    parsed = {
      count: Number(countThenFaces[1]),
      faces: Number(countThenFaces[2]),
    };
  else {
    const faceCount = normalized.match(
      /(\d{1,4})面(?:ダイス|サイコロ|さいころ|骰子|色子|骰)?/
    );
    if (
      faceCount &&
      /ダイス|サイコロ|さいころ|dice|骰子|色子|骰/i.test(normalized)
    ) {
      const repeat = normalized.match(
        /面(?:ダイス|サイコロ|さいころ)(?:を)?\s*(\d{1,2})\s*個/
      );
      parsed = {
        count: repeat ? Number(repeat[1]) : 1,
        faces: Number(faceCount[1]),
      };
    } else if (/ダイス|サイコロ|さいころ|dice|骰子|色子|骰/i.test(normalized))
      parsed = { count: 1, faces: 6 };
  }
  if (parsed) {
    if (!Number.isFinite(parsed.count) || !Number.isFinite(parsed.faces))
      return null;
    return {
      kind: "dice",
      count: clampInt(parsed.count, 1, 20),
      faces: clampInt(parsed.faces, 2, 1000),
    };
  }
  const range = normalized.match(
    /(-?\d{1,9})\s*(?:から|〜|~|to|到)\s*(-?\d{1,9})/
  );
  if (range && /ランダム|乱数|random|整数|随机数|隨機數/.test(normalized)) {
    let min = Number(range[1]);
    let max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min > max) [min, max] = [max, min];
    return { kind: "range", min, max };
  }
  return null;
}

function isDiceRequest(text: string) {
  return diceRequest(text) !== null;
}

function rollDice(text: string, lang: UiLanguage): SkillResponse {
  const request = diceRequest(text);
  if (!request)
    return {
      content: pick(lang, {
        en: "Try: `roll 2d6`, `flip a coin`, `random integer from 1 to 100`.",
        ja: "例: `6面ダイスを2個振って`、`コインを投げて`、`1から100までの乱数`",
        zh: "示例：`掷2个6面骰子`、`抛硬币`、`1到100的随机数`",
      }),
    };
  if (request.kind === "coin") {
    const [headsLabel, tailsLabel] = pick(lang, {
      en: ["Heads", "Tails"],
      ja: ["表（Heads）", "裏（Tails）"],
      zh: ["正面", "反面"],
    });
    const flips = Array.from({ length: request.count }, () =>
      secureRandomInt(0, 1) === 0 ? headsLabel : tailsLabel
    );
    if (flips.length === 1) return { content: `🪙 ${flips[0]}` };
    const heads = flips.filter(face => face === headsLabel).length;
    const tally = pick(lang, {
      en: `Tally: Heads ${heads} · Tails ${flips.length - heads}`,
      ja: `集計: 表 ${heads}回 ・ 裏 ${flips.length - heads}回`,
      zh: `统计：正面 ${heads} 次 · 反面 ${flips.length - heads} 次`,
    });
    return {
      content: `🪙 ${flips.join("・")}\n${tally}`,
    };
  }
  if (request.kind === "dice") {
    const rolls = Array.from({ length: request.count }, () =>
      secureRandomInt(1, request.faces)
    );
    if (rolls.length === 1)
      return {
        content: pick(lang, {
          en: `🎲 ${rolls[0]} (1–${request.faces})`,
          ja: `🎲 ${rolls[0]}（1〜${request.faces}面ダイス）`,
          zh: `🎲 ${rolls[0]}（${request.faces}面骰子）`,
        }),
      };
    const total = rolls.reduce((sum, value) => sum + value, 0);
    return {
      content: `🎲 [${rolls.join(", ")}]\n${pick(lang, {
        en: `Total: ${total}`,
        ja: `合計: ${total}`,
        zh: `总计: ${total}`,
      })}`,
    };
  }
  const value = secureRandomInt(request.min, request.max);
  return {
    content: pick(lang, {
      en: `Integer picked from ${request.min}–${request.max}: **${value}**`,
      ja: `${request.min}〜${request.max} の範囲で選んだ整数: **${value}**`,
      zh: `在 ${request.min}～${request.max} 范围内选出的整数: **${value}**`,
    }),
  };
}

const PASSWORD_LOWER = "abcdefghijklmnopqrstuvwxyz";
const PASSWORD_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PASSWORD_DIGITS = "0123456789";
const PASSWORD_SYMBOLS = "!@#$%^&*-_=+?";

function passwordRequest(text: string) {
  const normalized = normalizeText(text);
  if (!/(パスワード|password|pwd|密码|密碼)/i.test(normalized)) return null;
  const hasIntent =
    /(生成|作成|作る|つくる|つくり|作って|ください|创建|给我|来一个|generate|create|make|new)/i.test(
      normalized
    ) ||
    /^(?:新しい|新)?(?:パスワード|password|pwd|密码|密碼)[\s!.！。]*$/i.test(
      normalized
    );
  if (!hasIntent) return null;
  const lengthMatch = normalized.match(
    /(\d{1,3})\s*(?:文字|けた|桁|chars?|characters?|位|个字符|字符)/
  );
  const length = clampInt(lengthMatch ? Number(lengthMatch[1]) : 16, 8, 128);
  const symbols =
    !/記号なし|no symbols?|without symbols?|英数字のみ|alphanumeric|无符号|不含符号|不要符号/i.test(
      normalized
    );
  return { length, symbols };
}

function isPasswordRequest(text: string) {
  return passwordRequest(text) !== null;
}

function generatePassword(text: string, lang: UiLanguage): SkillResponse {
  const request = passwordRequest(text);
  if (!request)
    return {
      content: pick(lang, {
        en: "Try: `generate password 24 chars`, `new password no symbols` (8–128 characters).",
        ja: "例: `パスワード生成 24文字`、`新しいパスワード 記号なし` のように入力してください（8〜128文字）。",
        zh: "示例：`生成密码 24位`、`新密码 无符号`（8～128位）。",
      }),
    };
  const groups = [PASSWORD_LOWER, PASSWORD_UPPER, PASSWORD_DIGITS];
  if (request.symbols) groups.push(PASSWORD_SYMBOLS);
  const pool = groups.join("");
  const chars = groups.map(
    group => group[secureRandomInt(0, group.length - 1)]
  );
  while (chars.length < request.length)
    chars.push(pool[secureRandomInt(0, pool.length - 1)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(0, i);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return {
    content: `\`\`\`\n${chars.join("")}\n\`\`\`\n${pick(lang, {
      en: `Length ${chars.length} · symbols ${request.symbols ? "included" : "excluded"} · cryptographically secure random`,
      ja: `長さ ${chars.length} ・ 記号${request.symbols ? "あり" : "なし"} ・ 暗号学的乱数を使用`,
      zh: `长度 ${chars.length} · ${request.symbols ? "包含符号" : "不含符号"} · 使用加密安全随机数`,
    })}`,
  };
}

function decodeBase64Strict(input: string): string | null {
  const cleaned = input
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!cleaned || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64");
  if (decoded.toString("base64") !== padded) return null;
  const text = decoded.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(decoded)) return null;
  return text;
}

function base64Intent(text: string): "encode" | "decode" | "auto" {
  if (/デコード|decode|復号|元に戻す|もとに戻す|逆変換|解码|解碼/i.test(text))
    return "decode";
  if (/エンコード|encode|符号化|编码|編碼/i.test(text)) return "encode";
  return "auto";
}

function base64Payload(text: string) {
  const colon = text.match(/[:：]\s*([\s\S]+)$/);
  if (colon) return colon[1].trim();
  return text
    .replace(/base64/gi, " ")
    .replace(
      /エンコード|デコード|符号化|復号|encode|decode|生成|作成|して|変換|の|を|教えて|编码|編碼|解码|解碼|转换|转换|请|帮我/g,
      " "
    )
    .trim();
}

function isBase64Request(text: string) {
  return /\bbase64\b/i.test(normalizeText(text));
}

function handleBase64(text: string, lang: UiLanguage): SkillResponse {
  const payload = base64Payload(text);
  if (!payload)
    return {
      content: pick(lang, {
        en: "Try: `base64 encode: Hello`, `base64 decode: aGVsbG8=`.",
        ja: "例: `base64エンコード: こんにちは`、`base64 デコード: aGVsbG8=` のように入力してください。",
        zh: "示例：`base64编码: 你好`、`base64 解码: aGVsbG8=`。",
      }),
    };
  const intent = base64Intent(text);
  if (intent === "decode" || intent === "auto") {
    const decoded = decodeBase64Strict(payload);
    if (decoded !== null)
      return {
        content: `${pick(lang, {
          en: "【Base64 Decoded】",
          ja: "【Base64 デコード】",
          zh: "【Base64 解码】",
        })}\n\`\`\`\n${decoded}\n\`\`\``,
      };
    if (intent === "decode")
      return {
        content: pick(lang, {
          en: "Could not decode as Base64. Provide an encoded string. Example: `base64 decode: aGVsbG8=`",
          ja: "Base64としてデコードできませんでした。エンコード済みの文字列を指定してください。例: `base64 デコード: aGVsbG8=`",
          zh: "无法按 Base64 解码。请提供已编码的字符串。示例：`base64 解码: aGVsbG8=`",
        }),
      };
  }
  return {
    content: `${pick(lang, {
      en: "【Base64 Encoded】",
      ja: "【Base64 エンコード】",
      zh: "【Base64 编码】",
    })}\n\`\`\`\n${Buffer.from(payload, "utf8").toString("base64")}\n\`\`\``,
  };
}

const HASH_ALGORITHM_PATTERN = /sha[-_ ]?(512|256|224|1)|md5/i;

function hashAlgorithm(text: string): string {
  const match = text.match(HASH_ALGORITHM_PATTERN);
  if (!match) return "sha256";
  return match[0].toLowerCase().replace(/[-_ ]/g, "");
}

function hashPayload(text: string) {
  const colon = text.match(/[:：]\s*([\s\S]+)$/);
  if (colon) return colon[1].trim();
  return text
    .replace(HASH_ALGORITHM_PATTERN, " ")
    .replace(
      /ハッシュ|hash値?|ダイジェスト|digest|値|の|を|計算|求め|めて|教えて|して|哈希|散列|计算|求|请|帮我/g,
      " "
    )
    .trim();
}

function isHashRequest(text: string) {
  return (
    HASH_ALGORITHM_PATTERN.test(text) ||
    /ハッシュ|ダイジェスト|\bhash\b|\bdigest\b|哈希|散列/i.test(
      normalizeText(text)
    )
  );
}

function generateHash(text: string, lang: UiLanguage): SkillResponse {
  const algorithm = hashAlgorithm(text);
  const payload = hashPayload(text);
  if (!payload)
    return {
      content: pick(lang, {
        en: "Specify the text to hash. Example: `sha256: hello`, `md5: text`",
        ja: "ハッシュ対象のテキストを指定してください。例: `sha256: hello`、`md5: text`",
        zh: "请指定要哈希的文本。示例：`sha256: hello`、`md5: text`",
      }),
    };
  const digest = createHash(algorithm).update(payload, "utf8").digest("hex");
  const warning =
    algorithm === "md5" || algorithm === "sha1"
      ? pick(lang, {
          en: `\nNote: ${algorithm.toUpperCase()} is not recommended for security purposes. Use SHA-256 or stronger.`,
          ja: `\n※ ${algorithm.toUpperCase()}はセキュリティ用途には推奨されません。SHA-256以上をご利用ください。`,
          zh: `\n※ 出于安全目的不建议使用 ${algorithm.toUpperCase()}，请改用 SHA-256 或更强算法。`,
        })
      : "";
  return {
    content: `\`\`\`\n${algorithm.toUpperCase()}\n${digest}\n\`\`\`${warning}`,
  };
}

const SLUGIFY_KEYWORD = /\bslug(?:ify|ified)?\b|スラッグ/i;

function slugifyPayload(text: string) {
  const colon = text.match(/[:：]\s*([\s\S]+)$/);
  if (colon) return colon[1].trim();
  return text
    .replace(SLUGIFY_KEYWORD, " ")
    .replace(
      /生成|作成|作る|make|create|generate|please|url用|用|に|を|して|教えて/g,
      " "
    )
    .trim();
}

function isSlugifyRequest(text: string) {
  return SLUGIFY_KEYWORD.test(text);
}

function slugify(text: string, lang: UiLanguage): SkillResponse {
  const payload = slugifyPayload(text);
  if (!payload)
    return {
      content: pick(lang, {
        en: "Specify the text to slugify. Example: `slugify: Hello World!`",
        ja: "スラッグ化するテキストを指定してください。例: `slugify: Hello World!`",
        zh: "请指定需要转换为 URL Slug 的文本。示例：`slugify: Hello World!`",
      }),
    };
  const decomposed = payload
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = decomposed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug)
    return {
      content: pick(lang, {
        en: "Provide text containing letters or numbers. Text without them cannot be turned into a slug. Example: `slugify: Clio Skills Bot`",
        ja: "英数字を含むテキストを指定してください。日本語のみの入力はスラッグにできません。例: `slugify: Clio Skills Bot`",
        zh: "请提供包含英数字的文本。纯中文无法生成 Slug。示例：`slugify: Clio Skills Bot`",
      }),
    };
  const strippedNote = /[^\x00-\x7F]/.test(payload)
    ? pick(lang, {
        en: "\nNote: Non-alphanumeric characters are removed.",
        ja: "\n※ 英数字以外（日本語など）はハイフン区切りで除去されます。",
        zh: "\n※ 非英数字（如中文）会被移除。",
      })
    : "";
  return {
    content: `\`${slug}\`\n${pick(lang, {
      en: "URL slug generated.",
      ja: "URLスラッグを生成しました。",
      zh: "已生成 URL Slug。",
    })}${strippedNote}`,
  };
}

const unaiSkills: Skill[] = [
  {
    id: "greeting",
    execution: "local",
    match: text =>
      !isTranslationRequest(text) &&
      !isBase64Request(text) &&
      !isHashRequest(text) &&
      !isSlugifyRequest(text) &&
      !isTextStatsRequest(text) &&
      matchesGreeting(text),
    respond: async (text, lang) => responseForGreeting(text, lang),
  },
  {
    id: "wikipedia",
    execution: "external",
    match: isSummaryRequest,
    respond: wikipediaSummary,
  },
  {
    id: "ddgs",
    execution: "external",
    match: isExplicitSearchRequest,
    respond: (text, lang) => duckDuckGoSummary(text, lang),
  },
  {
    id: "color",
    execution: "local",
    match: isColorRequest,
    respond: async (text, lang) => colorConvert(text, lang),
  },
  {
    id: "percent",
    execution: "local",
    match: isPercentRequest,
    respond: async (text, lang) => calculatePercent(text, lang),
  },
  {
    id: "base_convert",
    execution: "local",
    match: isBaseConvertRequest,
    respond: async (text, lang) => convertNumberBase(text, lang),
  },
  {
    id: "roman",
    execution: "local",
    match: isRomanRequest,
    respond: async (text, lang) => convertRoman(text, lang),
  },
  {
    id: "timestamp",
    execution: "local",
    match: isTimestampRequest,
    respond: async (text, lang) => handleTimestamp(text, lang),
  },
  {
    id: "dice",
    execution: "local",
    match: isDiceRequest,
    respond: async (text, lang) => rollDice(text, lang),
  },
  {
    id: "password",
    execution: "local",
    match: isPasswordRequest,
    respond: async (text, lang) => generatePassword(text, lang),
  },
  {
    id: "base64",
    execution: "local",
    match: isBase64Request,
    respond: async (text, lang) => handleBase64(text, lang),
  },
  {
    id: "hash",
    execution: "local",
    match: isHashRequest,
    respond: async (text, lang) => generateHash(text, lang),
  },
  {
    id: "slugify",
    execution: "local",
    match: isSlugifyRequest,
    respond: async (text, lang) => slugify(text, lang),
  },
  {
    id: "calc",
    execution: "local",
    match: hasCalculatorTrigger,
    respond: async (text, lang) => calculate(text, lang),
  },
  {
    id: "joke",
    execution: "local",
    match: text =>
      /joke|laugh|funny|hilarious|joking|冗談|ジョーク|ギャグ|面白い話|笑える話|笑わせて|ネタ|笑话|講笑話|搞笑|讲个笑话|逗我笑/i.test(
        text
      ),
    respond: async (_text, lang) => {
      const list = jokesByLanguage[lang];
      return { content: list[Math.floor(Math.random() * list.length)] };
    },
  },
  {
    id: "ddgs_chatbot",
    execution: "external",
    match: isChatbotAnswerRequest,
    respond: (text, lang) => duckDuckGoSummary(text, lang, true),
  },
  {
    id: "translate",
    execution: "external",
    match: isTranslationRequest,
    respond: translate,
    externalNotice: {
      en: "The text to translate will be sent to an external translation API.",
      ja: "翻訳するテキストが外部翻訳APIへ送信されます。",
      zh: "待翻译的文本将被发送至外部翻译API。",
    },
  },
  {
    id: "unit_convert",
    execution: "local",
    match: isUnitConversionRequest,
    respond: async (text, lang) => convertUnit(text, lang),
  },
  {
    id: "text_stats",
    execution: "local",
    match: isTextStatsRequest,
    respond: async (text, lang) => textStats(text, lang),
  },
  {
    id: "json_format",
    execution: "local",
    match: isJsonFormatRequest,
    respond: async (text, lang) => formatJson(text, lang),
  },
  {
    id: "uuid",
    execution: "local",
    match: isUuidRequest,
    respond: async () => createUuid(),
  },
];

function helpResponse(lang: UiLanguage, target?: string) {
  if (target) {
    const skill = unaiSkills.find(item => item.id === target);
    if (skill)
      return pick(lang, {
        en: `Unai compatible skill: ${skill.id}\nSend a matching request and Clio will route it automatically.`,
        ja: `Unai互換スキル: ${skill.id}\n一致する依頼を送ると、Clioが自動でルーティングします。`,
        zh: `Unai 兼容技能：${skill.id}\n发送匹配的请求后，Clio 会自动路由执行。`,
      });
    return pick(lang, {
      en: `Skill '${target}' not found.`,
      ja: `スキル '${target}' が見つかりません。`,
      zh: `未找到技能「${target}」。`,
    });
  }
  const list = unaiSkills.map(skill => `  ${skill.id}`).join("\n");
  return pick(lang, {
    en: `Unai-compatible Skills:\n${list}\n\nSlash Commands:\n  /help\n  /help <skill_id>`,
    ja: `Unai互換スキル:\n${list}\n\nスラッシュコマンド:\n  /help\n  /help <skill_id>`,
    zh: `Unai 兼容技能：\n${list}\n\n斜杠命令：\n  /help\n  /help <技能ID>`,
  });
}

export async function processUnaiInput(
  userInput: string,
  options: { disabledSkillIds?: string[] } = {}
): Promise<UnaiResult> {
  const startedAt = performance.now();
  const input = userInput.trim();
  if (input.startsWith("/help")) {
    const target = input.split(/\s+/)[1];
    const response = helpResponse(detectLanguage(input), target);
    const elapsedMs = performance.now() - startedAt;
    return {
      response,
      skill: "help",
      tokens: response.split(/\s+/).filter(Boolean).length,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      tps: 0,
      matchedSkillIds: ["help"],
      selectionReason: pick(detectLanguage(input), {
        en: "Processed a Unai-compatible slash command",
        ja: "Unai互換のスラッシュコマンドを処理しました",
        zh: "已处理 Unai 兼容的斜杠命令",
      }),
      mode: "unai",
      execution: "local",
      cacheHit: false,
    };
  }
  const lang = detectLanguage(input);
  const disabledSkillIds = options.disabledSkillIds;
  const enabledSkills = disabledSkillIds
    ? unaiSkills.filter(skill => !disabledSkillIds.includes(skill.id))
    : unaiSkills;
  for (let index = 0; index < enabledSkills.length; index += 1) {
    const skill = enabledSkills[index];
    try {
      if (!skill.match(input)) continue;
      const result = await skill.respond(input, lang);
      if (result === null) continue;
      if (
        skill.execution === "external" &&
        !hasExplicitExternalRequest(input) &&
        /No (?:search results|relevant answer|Wikipedia summary) found\./.test(
          result.content
        )
      ) {
        continue;
      }
      const elapsedMs = performance.now() - startedAt;
      const tokens = result.content.split(/\s+/).filter(Boolean).length;
      return {
        response: result.content,
        skill: skill.id,
        tokens,
        elapsedMs: Math.round(elapsedMs * 10) / 10,
        tps:
          elapsedMs > 0
            ? Math.round((tokens / (elapsedMs / 1000)) * 10) / 10
            : 0,
        matchedSkillIds: [skill.id],
        selectionReason:
          lang === "en"
            ? `Matched "${skill.id}" (Unai priority ${index + 1})`
            : lang === "zh"
              ? `第 ${index + 1} 优先位的「${skill.id}」与输入匹配`
              : `Unai優先順位 ${index + 1} 番目の「${skill.id}」が入力に一致しました`,
        mode: "unai",
        execution: skill.execution,
        cacheHit: Boolean(result.cacheHit),
        externalNotice:
          skill.execution === "external"
            ? skill.externalNotice
              ? skill.externalNotice[lang]
              : pick(lang, {
                  en: "This request will be sent to a public information API.",
                  ja: "この依頼は公開情報APIへ送信されます。",
                  zh: "此请求将发送至公开信息API。",
                })
            : undefined,
      };
    } catch {
      if (skill.execution === "external" && hasExplicitExternalRequest(input)) {
        const failure = externalFailureResponse(lang, skill.id);
        return {
          response: failure.content,
          skill: skill.id,
          tokens: 0,
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          tps: 0,
          matchedSkillIds: [skill.id],
          selectionReason:
            lang === "en"
              ? `Matched "${skill.id}", but execution failed`
              : lang === "zh"
                ? `已匹配「${skill.id}」，但执行失败`
                : `「${skill.id}」に一致しましたが、実行に失敗しました`,
          mode: "unai",
          execution: "fallback",
          cacheHit: false,
        };
      }
      continue;
    }
  }
  const elapsedMs = performance.now() - startedAt;
  return {
    response: noSkillMessage(lang),
    skill: null,
    tokens: 0,
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    tps: 0,
    matchedSkillIds: [],
    selectionReason: pick(lang, {
      en: "No matching Unai skill was found",
      ja: "一致するUnaiスキルがありませんでした",
      zh: "没有匹配的 Unai 技能",
    }),
    mode: "unai",
    execution: "fallback",
    cacheHit: false,
  };
}

export const unaiPriority = unaiSkills.map(skill => skill.id);
