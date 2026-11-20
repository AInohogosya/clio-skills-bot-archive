import { and, desc, eq, inArray } from "drizzle-orm";
import type { Request, Response } from "express";
import {
  catalogSyncs,
  catalogSyncSchedule,
  skillCatalog,
  skillConversations,
  skillFavorites,
  skillMessages,
  skillUsage,
  type CatalogSkillInput,
} from "../drizzle/schema";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

const REPOSITORY_TREE = "https://github.com/PixelNest256/Unai/tree/main/skills";
const REPOSITORY_RAW =
  "https://raw.githubusercontent.com/PixelNest256/Unai/main/skills";

const CATALOG_CACHE_TTL_MS = 30 * 1000;
let catalogCache: { items: CatalogSkillInput[]; expiresAt: number } | null =
  null;

type UnaiMeta = {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  valves?: Array<{
    key?: string;
    label?: string;
    type?: string;
    description?: string;
    default?: string;
  }>;
};

const defaultInputs: Record<string, CatalogSkillInput["inputs"]> = {
  calc: [
    {
      key: "expression",
      label: "数式または依頼",
      required: true,
      description: "例: solve x^2 - 4 = 0",
    },
  ],
  wikipedia: [
    {
      key: "query",
      label: "トピック",
      required: true,
      description: "調べたい英語または固有名詞",
    },
  ],
  ddgs: [
    {
      key: "query",
      label: "検索クエリ",
      required: true,
      description: "具体的な検索キーワードまたは質問",
    },
  ],
  ddgs_chatbot: [
    {
      key: "question",
      label: "最初の質問",
      required: true,
      description: "対話的に調べたいテーマ",
    },
  ],
  greeting: [
    {
      key: "text",
      label: "メッセージ",
      required: true,
      description: "あいさつまたは短い会話",
    },
  ],
};

// 同梱カタログは unaiRuntime.ts の実行可能スキル（unaiPriority）と常に一致させる。
// DB未同期・DB未接続でも、実際に使える全スキルがスキル一覧に表示される。
const clioRuntimeSkills: CatalogSkillInput[] = [
  {
    sourceId: "greeting",
    name: "Greeting",
    category: "Conversation",
    description:
      "あいさつや短い会話を検出し、すぐに自然な応答を返す基本スキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["あいさつ", "hello", "会話", "small talk"],
    useCases: ["会話フローの開始", "軽い雑談への即時応答"],
    inputs: [
      {
        key: "text",
        label: "メッセージ",
        required: true,
        description: "ユーザーからのあいさつまたは短文",
      },
    ],
    steps: [
      "メッセージを入力する",
      "あいさつとして一致するかを判定する",
      "短い応答を返す",
    ],
    sourceUrl: `${REPOSITORY_TREE}/greeting`,
    status: "ready",
    helpText: "例: こんにちは / おはよう / Hello",
  },
  {
    sourceId: "wikipedia",
    name: "Wikipedia Summary",
    category: "Research",
    description:
      "Wikipediaの要約APIを使い、トピックの概要を短く取得するリサーチスキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["wikipedia", "要約", "調査", "概要", "research"],
    useCases: ["人物・用語の概要確認", "調査の出発点づくり"],
    inputs: [
      {
        key: "query",
        label: "トピック",
        required: true,
        description: "調べたいトピックまたは固有名詞",
      },
    ],
    steps: [
      "調べたいトピックを入力する",
      "Wikipedia Summary APIから要約を取得する",
      "要点と参照先を確認する",
    ],
    sourceUrl: `${REPOSITORY_TREE}/wikipedia`,
    status: "ready",
    helpText: "例: Ada Lovelaceの概要を教えて / what is TypeScript?",
  },
  {
    sourceId: "ddgs",
    name: "Web Search Summary",
    category: "Research",
    description:
      "DuckDuckGoの検索結果を起点に、最初の関連結果を短くまとめる検索スキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["検索", "web", "DuckDuckGo", "調査", "news"],
    useCases: ["Web上の一次探索", "テーマの概要をすばやく把握"],
    inputs: [
      {
        key: "query",
        label: "検索クエリ",
        required: true,
        description: "具体的な検索キーワードまたは質問",
      },
    ],
    steps: [
      "知りたい内容を具体的に入力する",
      "検索結果の関連性を確認する",
      "最初の結果の要約を読む",
    ],
    sourceUrl: `${REPOSITORY_TREE}/ddgs`,
    status: "ready",
    helpText: "例: 検索: TypeScript の最新情報 / search: Rust release",
  },
  {
    sourceId: "calc",
    name: "Calculator",
    category: "Utility",
    description:
      "数式を安全に評価し、展開・因数分解・方程式の解法にも対応する計算スキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["計算", "数式", "math", "solve", "factor"],
    useCases: ["式の計算", "代数式の展開・因数分解", "方程式の解法"],
    inputs: [
      {
        key: "expression",
        label: "数式または依頼",
        required: true,
        description: "例: solve x^2 - 4 = 0",
      },
    ],
    steps: [
      "数式または操作を入力する",
      "安全なAST解析を行う",
      "計算結果を確認する",
    ],
    sourceUrl: `${REPOSITORY_TREE}/calc`,
    status: "ready",
    helpText: "例: solve x^2 - 4 = 0 / 12と8を足す",
  },
  {
    sourceId: "joke",
    name: "Joke",
    category: "Conversation",
    description:
      "あらかじめ用意されたジョークから、会話の雰囲気を和らげる一言を返すスキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["ジョーク", "joke", "雑談", "fun"],
    useCases: ["軽い雑談", "会話の切り替え"],
    inputs: [],
    steps: ["ジョークをリクエストする", "ランダムな応答を受け取る"],
    sourceUrl: `${REPOSITORY_TREE}/joke`,
    status: "ready",
    helpText: "例: ジョークを言って / tell me a joke",
  },
  {
    sourceId: "ddgs_chatbot",
    name: "Search Conversation",
    category: "Research",
    description:
      "DuckDuckGoを使った会話型の検索を開始し、調査を対話的に深掘りするスキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["会話検索", "chat", "DuckDuckGo", "質問", "調査"],
    useCases: ["検索を対話的に絞り込む", "追加質問を交えた情報探索"],
    inputs: [
      {
        key: "question",
        label: "最初の質問",
        required: true,
        description: "対話的に調べたいテーマ",
      },
    ],
    steps: [
      "最初の質問を送る",
      "結果に対する補足質問を続ける",
      "必要な情報へ到達したら記録する",
    ],
    sourceUrl: `${REPOSITORY_TREE}/ddgs_chatbot`,
    status: "ready",
    helpText: "例: answer: Reactとは？ / answer: What is Deno?",
  },
  {
    sourceId: "translate",
    name: "Translate",
    category: "Language",
    description:
      "日本語・英語などの短いテキストを翻訳するスキルです。翻訳文は外部翻訳APIへ送信されます。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["翻訳", "translate", "英訳", "和訳", "language"],
    useCases: ["短文の英訳・和訳", "用語の意味を別言語で確認"],
    inputs: [
      {
        key: "text",
        label: "翻訳したいテキスト",
        required: true,
        description: "例: 英語に翻訳: こんにちは",
      },
    ],
    steps: [
      "翻訳先と言語を指定する",
      "外部翻訳APIで翻訳する",
      "翻訳結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: 英語に翻訳: こんにちは / translate: Hello to Japanese",
  },
  {
    sourceId: "unit_convert",
    name: "Unit Converter",
    category: "Utility",
    description: "長さ・重さ・容量の単位をローカルで即時変換するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["単位", "変換", "convert", "km", "kg"],
    useCases: ["距離の変換", "重量・容量の変換"],
    inputs: [
      {
        key: "conversion",
        label: "変換する値",
        required: true,
        description: "例: 10 km を m に変換",
      },
    ],
    steps: [
      "値と変換先を入力する",
      "同種の単位か確認する",
      "変換結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "対応: mm/cm/m/km/in/ft、g/kg/lb、mL/L",
  },
  {
    sourceId: "text_stats",
    name: "Text Statistics",
    category: "Utility",
    description: "文字数、単語数、行数をローカルで集計するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["文字数", "単語数", "text stats", "word count"],
    useCases: ["文章量の確認", "入力テキストの簡易集計"],
    inputs: [
      {
        key: "text",
        label: "集計するテキスト",
        required: true,
        description: "例: 文字数: Clio Bot",
      },
    ],
    steps: [
      "テキストを入力する",
      "文字・単語・行を数える",
      "集計結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: 文字数: こんにちは、Clio！",
  },
  {
    sourceId: "json_format",
    name: "JSON Formatter",
    category: "Development",
    description: "JSONを検証して、読みやすく整形するローカルスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["JSON", "整形", "format", "validate"],
    useCases: ["JSONの可読性向上", "JSON構文の確認"],
    inputs: [
      {
        key: "json",
        label: "JSON",
        required: true,
        description: '例: JSONを整形: {"name":"Clio"}',
      },
    ],
    steps: ["JSONを入力する", "構文を検証する", "整形済みJSONを確認する"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: '例: JSONを整形: {"name":"Clio"}',
  },
  {
    sourceId: "uuid",
    name: "UUID Generator",
    category: "Utility",
    description: "UUID v4形式の一意識別子をローカル生成するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["UUID", "GUID", "識別子", "generate"],
    useCases: ["テストデータの識別子生成", "一意なIDの作成"],
    inputs: [],
    steps: ["UUID生成を依頼する", "生成された識別子をコピーする"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: UUIDを生成",
  },
  {
    sourceId: "color",
    name: "Color Converter",
    category: "Utility",
    description:
      "HEX・RGB・HSLのカラーコードをローカルで相互変換するスキルです。主要な色名にも対応しています。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["色", "カラー", "color", "hex", "rgb", "hsl", "カラーコード"],
    useCases: ["デザイン指定の色形式の確認", "HEX・RGB・HSLの相互変換"],
    inputs: [
      {
        key: "color",
        label: "カラーコードまたは色名",
        required: true,
        description: "例: #ff0000 / rgb(255, 0, 0) / 赤",
      },
    ],
    steps: [
      "カラーコードまたは色名を入力する",
      "ローカルで各形式へ変換する",
      "HEX・RGB・HSLの結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: #ff0000 を変換 / rgb(0, 128, 255) / 赤のカラーコード",
  },
  {
    sourceId: "percent",
    name: "Percentage Calculator",
    category: "Utility",
    description:
      "「20% of 150」「150の20%は？」などの割合計算をローカルで即時行うスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["パーセント", "割合", "percent", "percentage", "割引"],
    useCases: ["割引・税込価格の割合計算", "全体に対する割合の算出"],
    inputs: [
      {
        key: "expression",
        label: "割合の計算",
        required: true,
        description: "例: 20% of 150 / 150の20%は？",
      },
    ],
    steps: [
      "数値と割合を入力する",
      "ローカルで計算する",
      "結果と計算式を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: 20% of 150 / 150の20%は？ / what percent is 30 of 150?",
  },
  {
    sourceId: "base_convert",
    name: "Number Base Converter",
    category: "Development",
    description:
      "2進数・8進数・10進数・16進数をローカルで相互変換し、4種類の基数をまとめて表示するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["進数", "バイナリ", "hex", "binary", "基数", "radix"],
    useCases: ["ビット演算やマスク値の確認", "ソースコード内の数値表記の変換"],
    inputs: [
      {
        key: "value",
        label: "数値と変換先",
        required: true,
        description: "例: 255 を 16進数に変換 / 0xff to decimal",
      },
    ],
    steps: [
      "数値と基数を入力する",
      "ローカルで基数変換する",
      "Dec・Hex・Oct・Binの結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: 255 を 16進数に変換 / 0xff to decimal / 2進数の1011を10進に変換",
  },
  {
    sourceId: "roman",
    name: "Roman Numerals",
    category: "Utility",
    description:
      "数字とローマ数字（1〜3999）をローカルで相互変換するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ローマ数字", "roman", "numeral", "文字番号"],
    useCases: ["西暦年のローマ数字表記", "ローマ数字の読み取り"],
    inputs: [
      {
        key: "value",
        label: "数値またはローマ数字",
        required: true,
        description: "例: 2024 を ローマ数字に変換 / MCMXCIV は 何？",
      },
    ],
    steps: [
      "数値またはローマ数字を入力する",
      "ローカルで変換する",
      "結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: 2024 を ローマ数字に変換 / MCMXCIV は 何？ / roman numeral for 49",
  },
  {
    sourceId: "timestamp",
    name: "Unix Timestamp",
    category: "Utility",
    description:
      "Unixタイムスタンプと日時（UTC/JST）をローカルで相互変換し、現在のEpoch時間も取得するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["タイムスタンプ", "unix", "epoch", "エポック", "日時変換"],
    useCases: ["ログの時刻解読", "APIで使うUnix時間の取得"],
    inputs: [
      {
        key: "value",
        label: "タイムスタンプまたは日付",
        required: true,
        description: "例: 現在のタイムスタンプ / 1700000000 を 日付に変換",
      },
    ],
    steps: [
      "タイムスタンプまたは日付を入力する",
      "ローカルで変換する",
      "Unix・ISO (UTC)・JSTの結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: 現在のタイムスタンプ / 1700000000 を 日付に変換 / 2025-01-01 の unix タイムスタンプ",
  },
  {
    sourceId: "dice",
    name: "Dice & Random",
    category: "Conversation",
    description:
      "サイコロ・コイントス・範囲内のランダム整数を暗号学的乱数でローカル生成するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ダイス", "サイコロ", "dice", "コイン", "乱数", "random"],
    useCases: ["ボードゲームのダイスロール", "くじ引きやランダム選択"],
    inputs: [
      {
        key: "request",
        label: "ダイス・コイン・乱数の依頼",
        required: false,
        description:
          "例: 6面ダイスを2個振って / コインを投げて / 1から100までの乱数",
      },
    ],
    steps: [
      "依頼内容を入力する",
      "ローカルで乱数を生成する",
      "結果と合計を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: 6面ダイスを2個振って / 2d6 / コインを投げて / 1から100までの乱数",
  },
  {
    sourceId: "password",
    name: "Password Generator",
    category: "Development",
    description:
      "指定した長さと記号の有無で、暗号学的乱数による安全なパスワードをローカル生成するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["パスワード", "password", "生成", "セキュリティ", "乱数"],
    useCases: [
      "安全なアカウント用パスワードの作成",
      "英数字のみのパスワード生成",
    ],
    inputs: [
      {
        key: "options",
        label: "長さと記号の指定",
        required: false,
        description: "例: パスワード生成 24文字 / 新しいパスワード 記号なし",
      },
    ],
    steps: [
      "長さや記号の希望を入力する",
      "ローカルで暗号学的乱数を生成する",
      "生成されたパスワードをコピーする",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: パスワード生成 24文字 / 新しいパスワード 記号なし（8〜128文字）",
  },
  {
    sourceId: "base64",
    name: "Base64 Encoder",
    category: "Development",
    description:
      "テキストをBase64でローカルにエンコード・デコードするスキルです。UTF-8とURL-safe形式に対応しています。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["base64", "エンコード", "デコード", "encode", "decode"],
    useCases: ["APIトークンやデータURIの作成", "Base64文字列の復元"],
    inputs: [
      {
        key: "text",
        label: "対象テキスト",
        required: true,
        description:
          "例: base64エンコード: こんにちは / base64 デコード: aGVsbG8=",
      },
    ],
    steps: [
      "対象テキストを入力する",
      "エンコードかデコードを指定する",
      "ローカル変換結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: base64エンコード: こんにちは / base64 デコード: aGVsbG8=",
  },
  {
    sourceId: "hash",
    name: "Hash Generator",
    category: "Development",
    description:
      "SHA-256・SHA-512・SHA-1・MD5のハッシュ値をローカル計算するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ハッシュ", "hash", "sha256", "md5", "ダイジェスト"],
    useCases: ["ファイルや文字列の整合性確認", "学習用のハッシュ値比較"],
    inputs: [
      {
        key: "text",
        label: "アルゴリズムと対象テキスト",
        required: true,
        description: "例: sha256: hello / md5: text",
      },
    ],
    steps: [
      "アルゴリズムと対象を入力する",
      "ローカルでハッシュ計算する",
      "16進数のダイジェストを確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText:
      "例: sha256: hello / md5: text（MD5・SHA-1はセキュリティ用途非推奨）",
  },
  {
    sourceId: "slugify",
    name: "URL Slug Generator",
    category: "Development",
    description:
      "テキストをURL向けのスラッグ（kebab-case）へローカル変換するスキルです。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["スラッグ", "slugify", "slug", "url", "kebab"],
    useCases: ["記事URLのスラッグ作成", "ファイル名の正規化"],
    inputs: [
      {
        key: "text",
        label: "スラッグ化するテキスト",
        required: true,
        description: "例: slugify: Hello World!",
      },
    ],
    steps: [
      "テキストを入力する",
      "ローカルで正規化する",
      "生成されたスラッグを確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
    helpText: "例: slugify: Hello World! / スラッグ生成: Clio Skills Bot",
  },
];

function categorize(id: string): string {
  if (["wikipedia", "ddgs", "ddgs_chatbot"].includes(id)) return "Research";
  if (id === "calc") return "Utility";
  if (id.includes("valve") || id.includes("test")) return "Development";
  return "Conversation";
}

function useCasesFor(id: string, name: string): string[] {
  const named: Record<string, string[]> = {
    calc: ["式の計算", "代数式の展開・因数分解", "方程式の解法"],
    wikipedia: ["人物・用語の概要確認", "調査の出発点づくり"],
    ddgs: ["Web上の一次探索", "テーマの概要をすばやく把握"],
    ddgs_chatbot: ["検索を対話的に絞り込む", "追加質問を交えた情報探索"],
    greeting: ["会話フローの開始", "軽い雑談への即時応答"],
  };
  return named[id] ?? [`${name} の機能確認`, "Unai スキル環境での試行"];
}

function guideSteps(id: string, inputs: CatalogSkillInput["inputs"]): string[] {
  const labels = inputs.map(input => input.label).join("、");
  const opening = labels ? `${labels}を入力する` : "スキルを呼び出す";
  return [
    opening,
    `${id} が依頼に一致するかを判定する`,
    "応答内容と次の操作を確認する",
  ];
}

async function optionalRawFile(path: string): Promise<string> {
  const response = await fetch(`${REPOSITORY_RAW}/${path}`, {
    headers: { "User-Agent": "Clio-Skills-Bot" },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return "";
  if (!response.ok)
    throw new Error(`Unaiの定義を取得できませんでした (${response.status})`);
  return response.text();
}

export async function fetchUnaiSkills(): Promise<CatalogSkillInput[]> {
  const priorityText = await optionalRawFile("priority.json");
  if (!priorityText)
    throw new Error("Unaiのpriority.jsonが見つかりませんでした。");
  const priority = JSON.parse(priorityText) as {
    order?: string[];
    disabled?: string[];
  };
  const directories = Array.from(
    new Set([...(priority.order ?? []), ...(priority.disabled ?? [])])
  );

  const skills = await Promise.all(
    directories.map(async skillId => {
      const [metaText, helpText] = await Promise.all([
        optionalRawFile(`${skillId}/meta.json`),
        optionalRawFile(`${skillId}/help.txt`),
      ]);
      const meta = metaText ? (JSON.parse(metaText) as UnaiMeta) : {};
      const valveInputs = (meta.valves ?? []).map((valve, index) => ({
        key: valve.key || `input_${index + 1}`,
        label: valve.label || valve.key || `設定 ${index + 1}`,
        required: false,
        description: valve.description || "スキルの任意設定",
      }));
      const inputs =
        valveInputs.length > 0 ? valveInputs : (defaultInputs[skillId] ?? []);
      const name = meta.name || skillId;
      const description =
        meta.description ||
        helpText.split("\n").find(Boolean)?.trim() ||
        `${name} スキル`;
      const category = categorize(skillId);

      return {
        sourceId: skillId,
        name,
        category,
        description,
        author: meta.author || "PixelNest256",
        version: meta.version || "未記載",
        keywords: Array.from(
          new Set([
            skillId,
            name,
            category.toLowerCase(),
            ...description
              .split(/[\s、。,:]+/)
              .filter(word => word.length >= 3),
          ])
        ).slice(0, 12),
        useCases: useCasesFor(skillId, name),
        inputs,
        steps: helpText
          ? [
              "スキルを選択する",
              "help.txt の利用手順を確認する",
              "Unai 環境でリクエストを送る",
            ]
          : guideSteps(skillId, inputs),
        sourceUrl: `${REPOSITORY_TREE}/${skillId}`,
        status: skillId.includes("test") ? "setup" : ("ready" as const),
        helpText: helpText || null,
      } satisfies CatalogSkillInput;
    })
  );
  return skills;
}

export async function getCatalogSkills() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.items;
  }
  const merged = new Map<string, CatalogSkillInput>(
    clioRuntimeSkills.map(skill => [skill.sourceId, skill])
  );
  const db = await getDb();
  if (db) {
    const remoteSkills = await db
      .select()
      .from(skillCatalog)
      .orderBy(skillCatalog.category, skillCatalog.name);
    for (const skill of remoteSkills)
      merged.set(skill.sourceId, {
        ...skill,
        helpText: skill.helpText ?? null,
      });
  }
  const items = Array.from(merged.values()).sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
  catalogCache = { items, expiresAt: Date.now() + CATALOG_CACHE_TTL_MS };
  return items;
}

export async function getLatestSync() {
  const db = await getDb();
  if (!db) return null;
  return (
    (
      await db
        .select({
          status: catalogSyncs.status,
          syncedCount: catalogSyncs.syncedCount,
          createdAt: catalogSyncs.createdAt,
        })
        .from(catalogSyncs)
        .orderBy(desc(catalogSyncs.createdAt))
        .limit(1)
    )[0] ?? null
  );
}

export async function getCatalogSyncSchedule() {
  const db = await getDb();
  if (!db) return null;
  return (
    (
      await db
        .select()
        .from(catalogSyncSchedule)
        .where(eq(catalogSyncSchedule.key, "unai-catalog"))
        .limit(1)
    )[0] ?? null
  );
}

export async function getPublicCatalogSyncSchedule() {
  const schedule = await getCatalogSyncSchedule();
  if (!schedule) return null;
  return {
    enabled: schedule.enabled,
    nextExecutionAt: schedule.nextExecutionAt,
    configured: Boolean(schedule.scheduleCronTaskUid),
  };
}

export async function enableCatalogSyncSchedule(userSession: string) {
  const db = await getDb();
  if (!db)
    throw new Error("データベースに接続できません。定期同期を設定できません。");
  const current = await getCatalogSyncSchedule();
  const cron = current?.cron || "0 0 3 * * *";
  if (current?.scheduleCronTaskUid) {
    const updated = await updateHeartbeatJob(
      current.scheduleCronTaskUid,
      { enable: true, cron },
      userSession
    );
    await db
      .update(catalogSyncSchedule)
      .set({ enabled: true, nextExecutionAt: updated.nextExecutionAt ?? null })
      .where(eq(catalogSyncSchedule.key, "unai-catalog"));
    return { enabled: true, nextExecutionAt: updated.nextExecutionAt ?? null };
  }
  const job = await createHeartbeatJob(
    {
      name: "unai-catalog-sync",
      cron,
      path: "/api/scheduled/unai-catalog-sync",
      description: "Unai リポジトリのスキル定義を毎日同期します。",
    },
    userSession
  );
  await db
    .insert(catalogSyncSchedule)
    .values({
      key: "unai-catalog",
      scheduleCronTaskUid: job.taskUid,
      enabled: true,
      cron,
      nextExecutionAt: job.nextExecutionAt ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        scheduleCronTaskUid: job.taskUid,
        enabled: true,
        cron,
        nextExecutionAt: job.nextExecutionAt ?? null,
      },
    });
  return { enabled: true, nextExecutionAt: job.nextExecutionAt ?? null };
}

export async function setCatalogSyncScheduleEnabled(
  userSession: string,
  enabled: boolean
) {
  const db = await getDb();
  if (!db)
    throw new Error("データベースに接続できません。定期同期を更新できません。");
  const current = await getCatalogSyncSchedule();
  if (!current?.scheduleCronTaskUid)
    throw new Error("定期同期はまだ作成されていません。");
  const updated = await updateHeartbeatJob(
    current.scheduleCronTaskUid,
    { enable: enabled },
    userSession
  );
  await db
    .update(catalogSyncSchedule)
    .set({ enabled, nextExecutionAt: updated.nextExecutionAt ?? null })
    .where(eq(catalogSyncSchedule.key, "unai-catalog"));
  return { enabled, nextExecutionAt: updated.nextExecutionAt ?? null };
}

let catalogSyncInFlight: Promise<{ count: number; updatedAt: Date }> | null =
  null;

export function syncUnaiCatalog() {
  if (!catalogSyncInFlight) {
    catalogSyncInFlight = runCatalogSync().finally(() => {
      catalogSyncInFlight = null;
    });
  }
  return catalogSyncInFlight;
}

async function runCatalogSync() {
  const db = await getDb();
  if (!db)
    throw new Error("データベースに接続できません。同期状態を保存できません。");

  try {
    const remoteSkills = await fetchUnaiSkills();
    if (remoteSkills.length === 0)
      throw new Error("取得できるスキルが見つかりませんでした。");

    for (const skill of remoteSkills) {
      await db
        .insert(skillCatalog)
        .values(skill)
        .onDuplicateKeyUpdate({
          set: {
            name: skill.name,
            category: skill.category,
            description: skill.description,
            author: skill.author,
            version: skill.version,
            keywords: skill.keywords,
            useCases: skill.useCases,
            inputs: skill.inputs,
            steps: skill.steps,
            sourceUrl: skill.sourceUrl,
            status: skill.status,
            helpText: skill.helpText,
            updatedAt: new Date(),
          },
        });
    }
    await db
      .insert(catalogSyncs)
      .values({ status: "success", syncedCount: remoteSkills.length });
    catalogCache = null;
    return { count: remoteSkills.length, updatedAt: new Date() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明な同期エラー";
    await db
      .insert(catalogSyncs)
      .values({ status: "error", syncedCount: 0, errorText: message });
    throw new Error(message);
  }
}

export async function toggleFavorite(userId: number, sourceId: string) {
  const db = await getDb();
  if (!db) throw new Error("データベースに接続できません。");
  const existing = await db
    .select()
    .from(skillFavorites)
    .where(
      and(
        eq(skillFavorites.userId, userId),
        eq(skillFavorites.sourceId, sourceId)
      )
    )
    .limit(1);
  if (existing[0]) {
    await db
      .delete(skillFavorites)
      .where(eq(skillFavorites.id, existing[0].id));
    return { favorite: false };
  }
  await db.insert(skillFavorites).values({ userId, sourceId });
  return { favorite: true };
}

export async function getFavorites(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ skill: skillCatalog })
    .from(skillFavorites)
    .innerJoin(skillCatalog, eq(skillFavorites.sourceId, skillCatalog.sourceId))
    .where(eq(skillFavorites.userId, userId))
    .orderBy(desc(skillFavorites.createdAt));
}

export async function recordSkillUse(
  userId: number,
  payload: {
    sourceId: string;
    taskText: string;
    botResponse?: string;
    conversationId?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("データベースに接続できません。");
  let conversationId = payload.conversationId;
  if (conversationId) {
    const existing = await db
      .select()
      .from(skillConversations)
      .where(
        and(
          eq(skillConversations.id, conversationId),
          eq(skillConversations.userId, userId)
        )
      )
      .limit(1);
    if (!existing[0]) throw new Error("指定された会話は見つかりません。");
  } else {
    const title = payload.taskText.slice(0, 80) || "Clio との新しい相談";
    const result = await db
      .insert(skillConversations)
      .values({ userId, title, sourceId: payload.sourceId || null });
    conversationId = Number(result[0].insertId);
  }
  if (conversationId && payload.sourceId) {
    await db
      .update(skillConversations)
      .set({ sourceId: payload.sourceId })
      .where(
        and(
          eq(skillConversations.id, conversationId),
          eq(skillConversations.userId, userId)
        )
      );
  }
  const messageInsert = db.insert(skillMessages).values([
    { conversationId, role: "user", content: payload.taskText },
    ...(payload.botResponse
      ? [
          {
            conversationId,
            role: "assistant" as const,
            content: payload.botResponse,
          },
        ]
      : []),
  ]);
  const usageInsert = payload.sourceId
    ? db
        .insert(skillUsage)
        .values({
          userId,
          sourceId: payload.sourceId,
          taskText: payload.taskText,
        })
    : null;
  await Promise.all(
    usageInsert ? [messageInsert, usageInsert] : [messageInsert]
  );
  return { conversationId };
}

export async function getRecentActivity(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ usage: skillUsage, skill: skillCatalog })
    .from(skillUsage)
    .innerJoin(skillCatalog, eq(skillUsage.sourceId, skillCatalog.sourceId))
    .where(eq(skillUsage.userId, userId))
    .orderBy(desc(skillUsage.createdAt))
    .limit(8);
}

export async function getConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const conversations = await db
    .select()
    .from(skillConversations)
    .where(eq(skillConversations.userId, userId))
    .orderBy(desc(skillConversations.createdAt))
    .limit(12);
  if (conversations.length === 0) return [];
  const conversationIds = conversations.map(c => c.id);
  const allMessages = await db
    .select()
    .from(skillMessages)
    .where(inArray(skillMessages.conversationId, conversationIds))
    .orderBy(skillMessages.createdAt);
  return conversations.map(conversation => ({
    ...conversation,
    messages: allMessages.filter(m => m.conversationId === conversation.id),
  }));
}

export async function getConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversation = (
    await db
      .select()
      .from(skillConversations)
      .where(
        and(
          eq(skillConversations.id, conversationId),
          eq(skillConversations.userId, userId)
        )
      )
      .limit(1)
  )[0];
  if (!conversation) return undefined;
  const messages = await db
    .select()
    .from(skillMessages)
    .where(eq(skillMessages.conversationId, conversationId))
    .orderBy(skillMessages.createdAt);
  return { conversation, messages };
}

export async function deleteConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("データベースに接続できません。会話を削除できません。");

  const existing = await db
    .select({ id: skillConversations.id })
    .from(skillConversations)
    .where(and(eq(skillConversations.id, conversationId), eq(skillConversations.userId, userId)))
    .limit(1);
  if (!existing[0]) throw new Error("指定された会話は見つかりません。");

  await db.delete(skillMessages).where(eq(skillMessages.conversationId, conversationId));
  await db.delete(skillConversations).where(eq(skillConversations.id, conversationId));
  return { success: true };
}

export async function scheduledCatalogSyncHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid)
      return res.status(403).json({ error: "cron-only" });
    const result = await syncUnaiCatalog();
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[CatalogSync] Scheduled sync failed", error);
    return res
      .status(500)
      .json({ error: "Scheduled sync failed", timestamp: new Date().toISOString() });
  }
}
