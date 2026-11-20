export type UnaiSkillDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  author: string;
  version: string;
  keywords: string[];
  useCases: string[];
  inputs: Array<{
    label: string;
    key: string;
    required: boolean;
    description: string;
  }>;
  steps: string[];
  sourceUrl: string;
  status: "ready" | "setup";
};

export const unaiSkills: UnaiSkillDefinition[] = [
  {
    id: "greeting",
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
        label: "メッセージ",
        key: "text",
        required: true,
        description: "ユーザーからのあいさつまたは短文",
      },
    ],
    steps: [
      "メッセージを入力する",
      "あいさつとして一致するかを判定する",
      "短い応答を返す",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai/tree/main/skills/greeting",
    status: "ready",
  },
  {
    id: "calc",
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
        label: "数式または依頼",
        key: "expression",
        required: true,
        description: "例: solve x^2 - 4 = 0",
      },
    ],
    steps: [
      "数式または操作を入力する",
      "安全なAST解析を行う",
      "計算結果を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai/tree/main/skills/calc",
    status: "ready",
  },
  {
    id: "wikipedia",
    name: "Wikipedia Summary",
    category: "Research",
    description:
      "英語Wikipediaの要約APIを使い、トピックの概要を短く取得するリサーチスキルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["wikipedia", "要約", "調査", "概要", "research"],
    useCases: ["人物・用語の概要確認", "調査の出発点づくり"],
    inputs: [
      {
        label: "トピック",
        key: "query",
        required: true,
        description: "調べたい英語または固有名詞のトピック",
      },
    ],
    steps: [
      "調べたいトピックを入力する",
      "Wikipedia Summary APIから要約を取得する",
      "要点と参照先を確認する",
    ],
    sourceUrl:
      "https://github.com/PixelNest256/Unai/tree/main/skills/wikipedia",
    status: "ready",
  },
  {
    id: "ddgs",
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
        label: "検索クエリ",
        key: "query",
        required: true,
        description: "具体的な検索キーワードまたは質問",
      },
    ],
    steps: [
      "知りたい内容を具体的に入力する",
      "検索結果の関連性を確認する",
      "最初の結果の要約を読む",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai/tree/main/skills/ddgs",
    status: "ready",
  },
  {
    id: "ddgs_chatbot",
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
        label: "最初の質問",
        key: "question",
        required: true,
        description: "調べたいテーマを会話形式で入力",
      },
    ],
    steps: [
      "最初の質問を送る",
      "結果に対する補足質問を続ける",
      "必要な情報へ到達したら記録する",
    ],
    sourceUrl:
      "https://github.com/PixelNest256/Unai/tree/main/skills/ddgs_chatbot",
    status: "ready",
  },
  {
    id: "joke",
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
    sourceUrl: "https://github.com/PixelNest256/Unai/tree/main/skills/joke",
    status: "ready",
  },
  {
    id: "translate",
    name: "Translate",
    category: "Language",
    description:
      "日本語・英語などの短いテキストを翻訳します。翻訳文は外部翻訳APIへ送信されます。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["翻訳", "translate", "英訳", "和訳"],
    useCases: ["短文の英訳・和訳", "用語の意味を別言語で確認"],
    inputs: [
      {
        label: "翻訳したいテキスト",
        key: "text",
        required: true,
        description: "例: 英語に翻訳: こんにちは",
      },
    ],
    steps: ["翻訳先と言語を指定する", "翻訳結果を確認する"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "unit_convert",
    name: "Unit Converter",
    category: "Utility",
    description: "長さ・重さ・容量の単位をローカルで即時変換します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["単位", "変換", "convert", "km", "kg"],
    useCases: ["距離の変換", "重量・容量の変換"],
    inputs: [
      {
        label: "変換する値",
        key: "conversion",
        required: true,
        description: "例: 10 km を m に変換",
      },
    ],
    steps: ["値と変換先を入力する", "変換結果を確認する"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "text_stats",
    name: "Text Statistics",
    category: "Utility",
    description: "文字数、単語数、行数をローカルで集計します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["文字数", "単語数", "text stats", "word count"],
    useCases: ["文章量の確認", "入力テキストの簡易集計"],
    inputs: [
      {
        label: "集計するテキスト",
        key: "text",
        required: true,
        description: "例: 文字数: Clio Bot",
      },
    ],
    steps: ["テキストを入力する", "集計結果を確認する"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "json_format",
    name: "JSON Formatter",
    category: "Development",
    description: "JSONを検証して読みやすく整形します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["JSON", "整形", "format", "validate"],
    useCases: ["JSONの可読性向上", "JSON構文の確認"],
    inputs: [
      {
        label: "JSON",
        key: "json",
        required: true,
        description: '例: JSONを整形: {"name":"Clio"}',
      },
    ],
    steps: ["JSONを入力する", "整形済みJSONを確認する"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "uuid",
    name: "UUID Generator",
    category: "Utility",
    description: "UUID v4形式の一意識別子をローカル生成します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["UUID", "GUID", "識別子", "generate"],
    useCases: ["テストデータの識別子生成", "一意なIDの作成"],
    inputs: [],
    steps: ["UUID生成を依頼する", "生成された識別子をコピーする"],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "color",
    name: "Color Converter",
    category: "Utility",
    description:
      "HEX・RGB・HSLのカラーコードをローカルで相互変換します。主要な色名にも対応しています。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["色", "カラー", "color", "hex", "rgb", "hsl", "カラーコード"],
    useCases: ["デザイン指定の色形式の確認", "HEX・RGB・HSLの相互変換"],
    inputs: [
      {
        label: "カラーコードまたは色名",
        key: "color",
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
  },
  {
    id: "percent",
    name: "Percentage Calculator",
    category: "Utility",
    description:
      "「20% of 150」「150の20%は？」などの割合計算をローカルで即時行います。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["パーセント", "割合", "percent", "percentage", "割引"],
    useCases: ["割引・税込価格の割合計算", "全体に対する割合の算出"],
    inputs: [
      {
        label: "割合の計算",
        key: "expression",
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
  },
  {
    id: "base_convert",
    name: "Number Base Converter",
    category: "Development",
    description:
      "2進数・8進数・10進数・16進数をローカルで相互変換し、4種類の基数をまとめて表示します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["進数", "バイナリ", "hex", "binary", "基数", "radix"],
    useCases: ["ビット演算やマスク値の確認", "ソースコード内の数値表記の変換"],
    inputs: [
      {
        label: "数値と変換先",
        key: "value",
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
  },
  {
    id: "roman",
    name: "Roman Numerals",
    category: "Utility",
    description: "数字とローマ数字（1〜3999）をローカルで相互変換します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ローマ数字", "roman", "numeral", "文字番号"],
    useCases: ["西暦年のローマ数字表記", "ローマ数字の読み取り"],
    inputs: [
      {
        label: "数値またはローマ数字",
        key: "value",
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
  },
  {
    id: "timestamp",
    name: "Unix Timestamp",
    category: "Utility",
    description:
      "Unixタイムスタンプと日時（UTC/JST）をローカルで相互変換し、現在のEpoch時間も取得します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["タイムスタンプ", "unix", "epoch", "エポック", "日時変換"],
    useCases: ["ログの時刻解読", "APIで使うUnix時間の取得"],
    inputs: [
      {
        label: "タイムスタンプまたは日付",
        key: "value",
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
  },
  {
    id: "dice",
    name: "Dice & Random",
    category: "Conversation",
    description:
      "サイコロ・コイントス・範囲内のランダム整数を暗号学的乱数でローカル生成します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ダイス", "サイコロ", "dice", "コイン", "乱数", "random"],
    useCases: ["ボードゲームのダイスロール", "くじ引きやランダム選択"],
    inputs: [
      {
        label: "ダイス・コイン・乱数の依頼",
        key: "request",
        required: false,
        description: "例: 6面ダイスを2個振って / コインを投げて",
      },
    ],
    steps: [
      "依頼内容を入力する",
      "ローカルで乱数を生成する",
      "結果と合計を確認する",
    ],
    sourceUrl: "https://github.com/PixelNest256/Unai",
    status: "ready",
  },
  {
    id: "password",
    name: "Password Generator",
    category: "Development",
    description:
      "指定した長さと記号の有無で、暗号学的乱数による安全なパスワードをローカル生成します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["パスワード", "password", "生成", "セキュリティ", "乱数"],
    useCases: [
      "安全なアカウント用パスワードの作成",
      "英数字のみのパスワード生成",
    ],
    inputs: [
      {
        label: "長さと記号の指定",
        key: "options",
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
  },
  {
    id: "base64",
    name: "Base64 Encoder",
    category: "Development",
    description:
      "テキストをBase64でローカルにエンコード・デコードします。UTF-8とURL-safe形式に対応しています。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["base64", "エンコード", "デコード", "encode", "decode"],
    useCases: ["APIトークンやデータURIの作成", "Base64文字列の復元"],
    inputs: [
      {
        label: "対象テキスト",
        key: "text",
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
  },
  {
    id: "hash",
    name: "Hash Generator",
    category: "Development",
    description:
      "SHA-256・SHA-512・SHA-1・MD5のハッシュ値をローカル計算します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["ハッシュ", "hash", "sha256", "md5", "ダイジェスト"],
    useCases: ["ファイルや文字列の整合性確認", "学習用のハッシュ値比較"],
    inputs: [
      {
        label: "アルゴリズムと対象テキスト",
        key: "text",
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
  },
  {
    id: "slugify",
    name: "URL Slug Generator",
    category: "Development",
    description:
      "テキストをURL向けのスラッグ（kebab-case）へローカル変換します。",
    author: "Clio Skills Bot",
    version: "1.0.0",
    keywords: ["スラッグ", "slugify", "slug", "url", "kebab"],
    useCases: ["記事URLのスラッグ作成", "ファイル名の正規化"],
    inputs: [
      {
        label: "スラッグ化するテキスト",
        key: "text",
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
  },
  {
    id: "valves_test",
    name: "Valves Test",
    category: "Development",
    description:
      "スキルごとの保存済み設定値（valves）を表示する、設定画面向けの開発用サンプルです。",
    author: "PixelNest256",
    version: "1.0.0",
    keywords: ["valves", "設定", "開発", "config"],
    useCases: ["スキル設定UIの確認", "バルブ値の動作確認"],
    inputs: [
      {
        label: "設定値",
        key: "valves",
        required: false,
        description: "スキルに保存した任意の設定",
      },
    ],
    steps: [
      "対象スキルの設定を保存する",
      "Valves Testを実行する",
      "保存済みの値を確認する",
    ],
    sourceUrl:
      "https://github.com/PixelNest256/Unai/tree/main/skills/valves_test",
    status: "setup",
  },
];

export const catalogCategories = [
  "All",
  "Conversation",
  "Utility",
  "Language",
  "Research",
  "Development",
] as const;
