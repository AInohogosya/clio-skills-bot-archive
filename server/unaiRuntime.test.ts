import { afterEach, describe, expect, it, vi } from "vitest";
import { processUnaiInput, unaiPriority } from "./unaiRuntime";

describe("Unai-compatible runtime", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the published Unai priority order", () => {
    expect(unaiPriority).toEqual([
      "greeting",
      "wikipedia",
      "ddgs",
      "color",
      "percent",
      "base_convert",
      "roman",
      "timestamp",
      "dice",
      "password",
      "base64",
      "hash",
      "slugify",
      "calc",
      "joke",
      "ddgs_chatbot",
      "translate",
      "unit_convert",
      "text_stats",
      "json_format",
      "uuid",
    ]);
  });

  it("routes a numeric expression to calc and returns direct execution output", async () => {
    const result = await processUnaiInput("3 * (8 + 4)");
    expect(result.skill).toBe("calc");
    expect(result.response).toContain("Result: 36");
    expect(result.mode).toBe("unai");
    expect(result.execution).toBe("local");
    expect(result.elapsedMs).toBeLessThan(50);
  });

  it("understands natural Japanese and English arithmetic phrasing without an external request", async () => {
    const japanese = await processUnaiInput("12と8を足すと？");
    const english = await processUnaiInput("20 divided by 4");
    expect(japanese.skill).toBe("calc");
    expect(japanese.response).toContain("Result: 20");
    expect(english.skill).toBe("calc");
    expect(english.response).toContain("Result: 5");
    expect(japanese.execution).toBe("local");
  });

  it("routes common conversational wording to local greeting and joke skills", async () => {
    const greeting = await processUnaiInput("おつかれさま、何ができる？");
    const thanks = await processUnaiInput("サンキュー、助かった！");
    const joke = await processUnaiInput("笑える話をして");
    expect(greeting.skill).toBe("greeting");
    expect(thanks.skill).toBe("greeting");
    expect(joke.skill).toBe("joke");
    expect(greeting.execution).toBe("local");
  });

  it("recognizes polite Japanese search and summary variants as explicit external requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: "TypeScript is a programming language.",
          Heading: "TypeScript",
          title: "React",
          extract: "React is a library.",
        }),
      })
    );
    const search = await processUnaiInput("TypeScriptについて調べたい");
    const summary = await processUnaiInput("Reactって何？");
    expect(search.skill).toBe("ddgs");
    expect(summary.skill).toBe("wikipedia");
    expect(search.execution).toBe("external");
    expect(summary.execution).toBe("external");
  });

  it("routes varied search wording to DDGS while preserving the explicit-request boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: "Search result.",
          Heading: "Result",
        }),
      })
    );
    const requests = [
      "OpenAIをググって",
      "ウェブで Rust の最新情報を探してほしい",
      "Pythonの情報を検索してください",
      "Could you look up the latest Rust release?",
      "Find information about TypeScript",
    ];
    const results = await Promise.all(
      requests.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "ddgs",
      "ddgs",
      "ddgs",
      "ddgs",
      "ddgs",
    ]);
    expect(results.every(result => result.execution === "external")).toBe(true);
    const ambiguous = await processUnaiInput("次の発表の内容を考えたい");
    expect(ambiguous.execution).toBe("fallback");
  });

  it("routes varied concept wording to Wikipedia-compatible summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "Concept",
          extract: "A concise concept summary.",
        }),
      })
    );
    const requests = [
      "量子コンピュータってどんなもの？",
      "HTTPの意味を教えて",
      "Reactについてわかりやすく説明して",
      "Define recursion",
      "Can you give me an overview of Kubernetes?",
      "What does API mean?",
    ];
    const results = await Promise.all(
      requests.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "wikipedia",
      "wikipedia",
      "wikipedia",
      "wikipedia",
      "wikipedia",
      "wikipedia",
    ]);
    expect(results.every(result => result.execution === "external")).toBe(true);
  });

  it("keeps a concept request on the Wikipedia-compatible path when external retrieval fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await processUnaiInput("ベル状態ってどんなもの？");
    expect(result.skill).toBe("wikipedia");
    expect(result.response).toBe("Wikipediaの要約が見つかりませんでした。");
    expect(result.execution).toBe("external");
  });

  it("uses a language-aware Wikipedia search result when a direct summary is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            search: [
              {
                title: "波動関数",
                snippet: "量子力学で用いられる数学的な関数。",
              },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processUnaiInput("波動関数って何？");
    expect(result.skill).toBe("wikipedia");
    expect(result.response).toContain("【波動関数】");
    expect(result.response).toContain("Wikipedia検索");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "ja.wikipedia.org/api/rest_v1"
    );
    expect(fetchMock.mock.calls[1][0]).toContain("ja.wikipedia.org/w/api.php");
  });

  it("uses a Wikipedia search fallback when the DuckDuckGo instant-answer endpoint is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          query: {
            search: [
              {
                title: "OpenAI",
                snippet: "Artificial intelligence research organization.",
              },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processUnaiInput("NebulaAIをググって");
    expect(result.skill).toBe("ddgs");
    expect(result.response).toContain("【OpenAI】");
    expect(result.response).toContain("Wikipedia検索");
    expect(fetchMock.mock.calls[1][0]).toContain("ja.wikipedia.org/w/api.php");
  });

  it("answers Japanese requests about English proper nouns with Japanese Wikipedia content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "OpenAI",
          extract: "OpenAIは、アメリカ合衆国の人工知能研究企業である。",
        }),
      })
    );
    const requests = [
      "OpenAIとは？",
      "OpenAIについて教えて",
      "OpenAIの概要を知りたい",
    ];
    for (const request of requests) {
      const result = await processUnaiInput(request);
      expect(result.skill).toBe("wikipedia");
      expect(result.response).toContain("【OpenAI】");
      expect(result.response).toContain("人工知能");
      expect(result.response).not.toContain("※");
      expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain(
        "ja.wikipedia.org/api/rest_v1"
      );
    }
  });

  it("falls back to English Wikipedia only when no Japanese article exists, disclosing the language switch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "ZephyrCore",
          extract: "ZephyrCore is an open-source runtime library.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processUnaiInput("ZephyrCoreって何？");
    expect(result.skill).toBe("wikipedia");
    expect(result.response).toContain("【ZephyrCore】");
    expect(result.response).toContain("英語版の概要を表示");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "ja.wikipedia.org/api/rest_v1"
    );
    expect(fetchMock.mock.calls[1][0]).toContain("ja.wikipedia.org/w/api.php");
    expect(fetchMock.mock.calls[2][0]).toContain(
      "en.wikipedia.org/api/rest_v1"
    );
  });

  it("keeps every supported local and external skill executable through a representative request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AbstractText: "A direct answer.",
        Heading: "Answer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const inputs = ["やあ", "6 * 7", "笑わせて", "answer: AuroraGraph"];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "greeting",
      "calc",
      "joke",
      "ddgs_chatbot",
    ]);
    expect(results.map(result => result.execution)).toEqual([
      "local",
      "local",
      "local",
      "external",
    ]);
    expect(results[1].response).toContain("Result: 42");
    expect(results[3].response).toContain("A direct answer.");
    expect(fetchMock.mock.calls[0][0]).toContain("q=AuroraGraph");
  });

  it("routes translation requests and discloses external text transfer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translated_text: "Hello" }),
      })
    );
    const result = await processUnaiInput("英語に翻訳: こんにちは");
    expect(result.skill).toBe("translate");
    expect(result.response).toContain("Hello");
    expect(result.execution).toBe("external");
    expect(result.externalNotice).toContain("翻訳するテキスト");
  });

  it("uses an operator-managed DeepL key server-side without requesting a user key", async () => {
    const previousKey = process.env.DEEPL_AUTH_KEY;
    process.env.DEEPL_AUTH_KEY = "test-managed-key:fx";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: [{ text: "Apple" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processUnaiInput("りんごを英語にして");
    if (previousKey === undefined) delete process.env.DEEPL_AUTH_KEY;
    else process.env.DEEPL_AUTH_KEY = previousKey;
    expect(result.skill).toBe("translate");
    expect(result.response).toContain("Apple");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api-free.deepl.com/v2/translate"
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toContain(
      "test-managed-key"
    );
  });

  it("uses a fast local phrase fallback when the translation API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await processUnaiInput("英語に翻訳: こんにちは、Clio");
    expect(result.skill).toBe("translate");
    expect(result.response).toContain("Hello、Clio");
    expect(result.response).toContain("ローカル語句");
  });

  it("understands natural Japanese and English translation requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const inputs = [
      "りんごを英語にして",
      "appleを日本語に訳して",
      "りんごの英語は？",
      "How do you say apple in Japanese?",
    ];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "translate",
      "translate",
      "translate",
      "translate",
    ]);
    expect(results[0].response).toContain("apple");
    expect(results[1].response).toContain("りんご");
    expect(results[2].response).toContain("apple");
    expect(results[3].response).toContain("りんご");
  });

  it("supports multilingual targets, explicit source languages, and question forms", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const inputs = [
      "りんごをフランス語にすると？",
      "appleを中国語にして",
      "スペイン語のmanzanaを日本語に訳して",
      "りんごはドイツ語で何て言う？",
      "How do you say apple in Korean?",
      "translate apple from English to Arabic",
    ];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "translate",
      "translate",
      "translate",
      "translate",
      "translate",
      "translate",
    ]);
    expect(results[0].response).toContain("pomme");
    expect(results[1].response).toContain("苹果");
    expect(results[2].response).toContain("りんご");
    expect(results[3].response).toContain("Apfel");
    expect(results[4].response).toContain("사과");
    expect(results[5].response).toContain("تفاحة");
  });

  it("classifies alternate Japanese and English phrasing for every new skill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translated_text: "ありがとう" }),
      })
    );
    const inputs = [
      "translate: Thank you to Japanese",
      "convert 2 kg to lb",
      "word count: one two three",
      'JSON format: {"ok":true}',
      "GUIDを作成",
    ];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "translate",
      "unit_convert",
      "text_stats",
      "json_format",
      "uuid",
    ]);
    expect(results[0].response).toContain("ありがとう");
    expect(results[1].response).toContain("lb");
    expect(results[2].response).toContain("Words: 3");
    expect(results[3].response).toContain('"ok": true');
  });

  it("returns actionable guidance for invalid unit and text-statistics input", async () => {
    const incompatibleUnit = await processUnaiInput("単位変換: 1 km to kg");
    const missingText = await processUnaiInput("文字数を数えて");
    expect(incompatibleUnit.skill).toBe("unit_convert");
    expect(incompatibleUnit.response).toContain("同じ種類の単位");
    expect(missingText.skill).toBe("text_stats");
    expect(missingText.response).toContain("テキストを指定");
  });

  it("runs unit conversion, text statistics, JSON formatting, and UUID generation locally", async () => {
    const inputs = [
      "10 km を m に変換",
      "文字数: Clio Bot",
      'JSONを整形: {"name":"Clio"}',
      "UUIDを生成",
    ];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "unit_convert",
      "text_stats",
      "json_format",
      "uuid",
    ]);
    expect(results.every(result => result.execution === "local")).toBe(true);
    expect(results[0].response).toContain("10000 m");
    expect(results[1].response).toContain("文字数: 8");
    expect(results[2].response).toContain('"name": "Clio"');
    expect(results[3].response).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it("returns stable guidance for invalid local utility input and unavailable translation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const badJson = await processUnaiInput("JSONを整形: {name: Clio}");
    const failedTranslation = await processUnaiInput(
      "translate: resilient runtime to Japanese"
    );
    expect(badJson.skill).toBe("json_format");
    expect(badJson.response).toContain("JSONを解析できませんでした");
    expect(failedTranslation.skill).toBe("translate");
    expect(failedTranslation.response).toContain(
      "Could not retrieve the translation"
    );
  });

  it("handles the Unai-compatible help slash command before skills", async () => {
    const result = await processUnaiInput("/help calc");
    expect(result.skill).toBe("help");
    expect(result.response).toContain("calc");
  });

  it("returns the Unai no-skill fallback when all skills are disabled", async () => {
    const result = await processUnaiInput("unmatched input", {
      disabledSkillIds: unaiPriority,
    });
    expect(result.skill).toBeNull();
    expect(result.response).toContain("No matching local skill");
    expect(result.execution).toBe("fallback");
  });

  it("returns a stable response when the explicit DDGS-compatible lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await processUnaiInput("search: compiler design");
    expect(result.skill).toBe("ddgs");
    expect(result.response).toBe("No search results found.");
    expect(result.execution).toBe("external");
  });

  it("keeps an ambiguous request local instead of waiting for a network fallback", async () => {
    const result = await processUnaiInput("次にやることを考えたい");
    expect(result.execution).toBe("fallback");
    expect(result.elapsedMs).toBeLessThan(50);
  });

  it("converts HEX, RGB, HSL, and named colors locally", async () => {
    const fromHex = await processUnaiInput("#FF0000 の色コードを変換して");
    const fromRgb = await processUnaiInput("rgb(0, 128, 255) を 変換");
    const fromNamed = await processUnaiInput("赤のカラーコード");
    expect(fromHex.skill).toBe("color");
    expect(fromHex.response).toContain("RGB: rgb(255, 0, 0)");
    expect(fromHex.response).toContain("HSL: hsl(0, 100%, 50%)");
    expect(fromRgb.response).toContain("#0080ff");
    expect(fromNamed.response).toContain("#ff0000");
    expect(
      [fromHex, fromRgb, fromNamed].every(r => r.execution === "local")
    ).toBe(true);
    const invalid = await processUnaiInput("rgb(300, 0, 0) の カラーコード");
    expect(invalid.skill).toBe("color");
    expect(invalid.response).toContain("解析できませんでした");
  });

  it("routes percentage phrasing in Japanese and English without touching the calculator path", async () => {
    const ofEnglish = await processUnaiInput("20% of 150");
    const ofJapanese = await processUnaiInput("150の20%は？");
    const ratioEnglish = await processUnaiInput(
      "What percentage is 30 of 150?"
    );
    const ratioJapanese = await processUnaiInput("30は150の何%？");
    expect(ofEnglish.skill).toBe("percent");
    expect(ofEnglish.response).toContain("= 30");
    expect(ofJapanese.skill).toBe("percent");
    expect(ofJapanese.response).toContain("= 30");
    expect(ratioEnglish.skill).toBe("percent");
    expect(ratioEnglish.response).toContain("20%");
    expect(ratioJapanese.skill).toBe("percent");
    expect(ratioJapanese.response).toContain("20%");
    const zeroTotal = await processUnaiInput("what percent is 5 of 0?");
    expect(zeroTotal.skill).toBe("percent");
    expect(zeroTotal.response).toContain("Cannot calculate");
  });

  it("shows all number bases for decimal, prefixed, and keyword-sourced values", async () => {
    const toHex = await processUnaiInput("255 を 16進数に変換");
    const fromPrefix = await processUnaiInput("0xff to decimal");
    const fromKeyword = await processUnaiInput("2進数の1011を10進に変換");
    expect(toHex.skill).toBe("base_convert");
    expect(fromPrefix.skill).toBe("base_convert");
    expect(fromKeyword.skill).toBe("base_convert");
    expect(toHex.response).toContain("Hex: 0xff");
    expect(fromPrefix.response).toContain("Dec: 255");
    expect(fromKeyword.response).toContain("Dec: 11");
    expect(fromKeyword.response).toContain("Bin: 0b1011");
    expect(
      [toHex, fromPrefix, fromKeyword].every(r => r.execution === "local")
    ).toBe(true);
    const invalid = await processUnaiInput(
      "99999999999999999999999999 を 16進数に変換"
    );
    expect(invalid.skill).toBe("base_convert");
    expect(invalid.response).toContain("有効な数字");
  });

  it("translates numbers and Roman numerals in both directions", async () => {
    const toRoman = await processUnaiInput("2024 を ローマ数字に変換");
    const fromRoman = await processUnaiInput("MCMXCIV は 何？");
    const english = await processUnaiInput("roman numeral for 49");
    expect(toRoman.skill).toBe("roman");
    expect(toRoman.response).toContain("MMXXIV");
    expect(fromRoman.skill).toBe("roman");
    expect(fromRoman.response).toContain("1994");
    expect(english.skill).toBe("roman");
    expect(english.response).toContain("XLIX");
    const outOfRange = await processUnaiInput("4000 を ローマ数字に変換");
    expect(outOfRange.skill).toBe("roman");
    expect(outOfRange.response).toContain("1〜3999");
  });

  it("converts timestamps and dates locally with deterministic results", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-26T00:00:00Z"));
      const now = await processUnaiInput("現在のタイムスタンプ");
      expect(now.skill).toBe("timestamp");
      expect(now.execution).toBe("local");
      expect(now.response).toContain("Unix: 1787702400");
      expect(now.response).toContain("JST (+9): 2026-08-26 09:00:00");
    } finally {
      vi.useRealTimers();
    }
    const toDate = await processUnaiInput("1700000000 を 日付に変換");
    const toDateWithKeyword = await processUnaiInput("unix time: 1700000000");
    const toUnix = await processUnaiInput(
      "2025-01-01 09:30 の unix タイムスタンプ"
    );
    expect(toDate.skill).toBe("timestamp");
    expect(toDate.response).toContain("ISO (UTC): 2023-11-14T22:13:20.000Z");
    expect(toDate.response).toContain("JST (+9): 2023-11-15 07:13:20");
    expect(toDateWithKeyword.skill).toBe("timestamp");
    expect(toDateWithKeyword.response).toContain("Unix: 1700000000");
    expect(toUnix.skill).toBe("timestamp");
    expect(toUnix.response).toContain("Unix: 1735723800");
    const invalidDate = await processUnaiInput(
      "2025-13-40 の unix タイムスタンプ"
    );
    expect(invalidDate.skill).toBe("timestamp");
    expect(invalidDate.response).toContain("有効な日付");
  });

  it("rolls dice, flips coins, and picks random integers within a range", async () => {
    const twoDice = await processUnaiInput("6面ダイスを2個振って");
    const notation = await processUnaiInput("2d6");
    expect(twoDice.skill).toBe("dice");
    expect(twoDice.execution).toBe("local");
    expect(twoDice.elapsedMs).toBeLessThan(50);
    expect(twoDice.response).toMatch(/\[\d+, \d+\]/);
    expect(twoDice.response).toContain("合計:");
    expect(notation.skill).toBe("dice");
    expect(notation.response).toMatch(/\[\d+, \d+\]/);
    const coin = await processUnaiInput("コインを投げて");
    expect(coin.skill).toBe("dice");
    expect(coin.response).toMatch(/表（Heads）|裏（Tails）|集計/);
    const range = await processUnaiInput("1から100までの乱数");
    expect(range.skill).toBe("dice");
    const picked = Number(
      range.response.match(/選んだ整数: \*\*(-?\d+)\*\*/)?.[1]
    );
    expect(picked).toBeGreaterThanOrEqual(1);
    expect(picked).toBeLessThanOrEqual(100);
  });

  it("generates passwords of the requested length and charset policy", async () => {
    const alnumOnly = await processUnaiInput("パスワード生成 24文字 記号なし");
    expect(alnumOnly.skill).toBe("password");
    expect(alnumOnly.execution).toBe("local");
    const password = alnumOnly.response.match(/```\n([^\n]+)\n```/)?.[1] ?? "";
    expect(password).toMatch(/^[A-Za-z0-9]{24}$/);
    const defaulted = await processUnaiInput("新しいパスワードを作成");
    expect(defaulted.skill).toBe("password");
    expect(defaulted.response).toContain("長さ 16");
    expect(defaulted.response).toContain("記号あり");
    const tooShort = await processUnaiInput("パスワード生成 3文字");
    expect(tooShort.response).toMatch(/^[A-Za-z0-9!@#$%^&*\-_=+?]{8}$/m);
  });

  it("encodes and decodes Base64 locally and rejects broken input", async () => {
    const encoded = await processUnaiInput("base64エンコード: こんにちは");
    const decoded = await processUnaiInput("base64 デコード: aGVsbG8=");
    expect(encoded.skill).toBe("base64");
    expect(encoded.execution).toBe("local");
    expect(encoded.response).toContain("44GT44KT44Gr44Gh44Gv");
    expect(decoded.skill).toBe("base64");
    expect(decoded.response).toContain("hello");
    const invalid = await processUnaiInput("base64 デコード: ###not-base64###");
    expect(invalid.skill).toBe("base64");
    expect(invalid.response).toContain("デコードできませんでした");
  });

  it("computes SHA-256 and MD5 digests locally and guides empty payloads", async () => {
    const sha256 = await processUnaiInput("sha256: hello");
    const md5 = await processUnaiInput("md5: hello");
    expect(sha256.skill).toBe("hash");
    expect(sha256.execution).toBe("local");
    expect(sha256.response).toContain(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    expect(md5.skill).toBe("hash");
    expect(md5.response).toContain("5d41402abc4b2a76b9719d911017c592");
    expect(md5.response).toContain("not recommended");
    const empty = await processUnaiInput("ハッシュを計算して");
    expect(empty.skill).toBe("hash");
    expect(empty.response).toContain("指定してください");
  });

  it("builds URL slugs and explains Japanese-only limitations", async () => {
    const english = await processUnaiInput("slugify: Hello World!");
    const mixed = await processUnaiInput("スラッグ生成: Clio Skills Bot");
    expect(english.skill).toBe("slugify");
    expect(english.execution).toBe("local");
    expect(english.response).toContain("`hello-world`");
    expect(mixed.skill).toBe("slugify");
    expect(mixed.response).toContain("`clio-skills-bot`");
    const japaneseOnly = await processUnaiInput("スラッグ: こんにちは");
    expect(japaneseOnly.skill).toBe("slugify");
    expect(japaneseOnly.response).toContain("英数字を含むテキスト");
  });

  it("keeps existing routes intact while the new local skills sit ahead of calc", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const calcRoute = await processUnaiInput("3 * (8 + 4)");
    const jsonRoute = await processUnaiInput('JSONを整形: {"color":"#fff"}');
    const translateRoute = await processUnaiInput("赤色を英語にして");
    expect(calcRoute.skill).toBe("calc");
    expect(calcRoute.response).toContain("Result: 36");
    expect(jsonRoute.skill).toBe("json_format");
    expect(jsonRoute.response).toContain('"color": "#fff"');
    expect(translateRoute.skill).toBe("translate");
  });

  it("answers every new utility request locally in well under the interactive budget", async () => {
    const inputs = [
      "#0080ff のカラーコード",
      "消費税で1500の10%は？",
      "0b101010 を 10進数に変換",
      "LVIII は 何？",
      "unix time: 1609459200",
      "20面ダイスを振って",
      "パスワード生成 32文字",
      "base64エンコード: Clio",
      "sha256: clio",
      "slugify: Fast Local Skills",
    ];
    const results = await Promise.all(
      inputs.map(input => processUnaiInput(input))
    );
    expect(results.map(result => result.skill)).toEqual([
      "color",
      "percent",
      "base_convert",
      "roman",
      "timestamp",
      "dice",
      "password",
      "base64",
      "hash",
      "slugify",
    ]);
    for (const result of results) {
      expect(result.execution).toBe("local");
      expect(result.cacheHit).toBe(false);
      expect(result.externalNotice).toBeUndefined();
      expect(result.elapsedMs).toBeLessThan(50);
    }
  });
});

describe("Multilingual runtime (en / ja / zh)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("greets and chats back in the detected language", async () => {
    const zhHello = await processUnaiInput("你好！");
    expect(zhHello.skill).toBe("greeting");
    expect(zhHello.response).toContain("你好");
    const zhThanks = await processUnaiInput("谢谢！");
    expect(zhThanks.skill).toBe("greeting");
    expect(zhThanks.response).toContain("不客气");
    const enHello = await processUnaiInput("hello!");
    expect(enHello.skill).toBe("greeting");
    expect(enHello.execution).toBe("local");
  });

  it("routes Chinese concept questions to zh.wikipedia.org first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "北京",
          extract: "北京是中华人民共和国的首都。",
        }),
      })
    );
    const result = await processUnaiInput("北京是什么？");
    expect(result.skill).toBe("wikipedia");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
      "zh.wikipedia.org/api/rest_v1"
    );
    expect(result.response).toContain("【北京】");
    expect(result.response).toContain("首都");
  });

  it("keeps Japanese questions on ja.wikipedia.org", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "東京タワー",
          extract: "東京タワーは、東京都港区にある塔である。",
        }),
      })
    );
    const result = await processUnaiInput("東京タワーとは？");
    expect(result.skill).toBe("wikipedia");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
      "ja.wikipedia.org/api/rest_v1"
    );
  });

  it("answers English overview questions via en.wikipedia.org", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "React",
          extract:
            "React is a JavaScript library for building user interfaces.",
        }),
      })
    );
    const result = await processUnaiInput("What is React?");
    expect(result.skill).toBe("wikipedia");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
      "en.wikipedia.org/api/rest_v1"
    );
  });

  it("discloses the edition switch in Chinese when no zh article exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { search: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "QuantumFlux",
          extract: "QuantumFlux is a fictional runtime.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const result = await processUnaiInput("QuantumFlux是什么？");
    expect(result.skill).toBe("wikipedia");
    expect(result.response).toContain("【QuantumFlux】");
    expect(result.response).toContain("未找到中文维基百科的对应词条");
    expect(fetchMock.mock.calls[0][0]).toContain(
      "zh.wikipedia.org/api/rest_v1"
    );
    expect(fetchMock.mock.calls[1][0]).toContain("zh.wikipedia.org/w/api.php");
    expect(fetchMock.mock.calls[2][0]).toContain(
      "en.wikipedia.org/api/rest_v1"
    );
  });

  it("runs Chinese utility requests locally with localized responses", async () => {
    const calcResult = await processUnaiInput("计算 3 * 4");
    expect(calcResult.skill).toBe("calc");
    expect(calcResult.response).toContain("Result: 12");

    const percentResult = await processUnaiInput("150的20%是多少");
    expect(percentResult.skill).toBe("percent");
    expect(percentResult.response).toContain("= 30");
    expect(percentResult.response).toContain("是 30");

    const baseResult = await processUnaiInput("255 转换为 十六进制");
    expect(baseResult.skill).toBe("base_convert");
    expect(baseResult.response).toContain("Hex: 0xff");

    const romanResult = await processUnaiInput("2024 转换为 罗马数字");
    expect(romanResult.skill).toBe("roman");
    expect(romanResult.response).toContain("MMXXIV");

    const tsResult = await processUnaiInput("1700000000 转换为日期");
    expect(tsResult.skill).toBe("timestamp");
    expect(tsResult.response).toContain("ISO (UTC): 2023-11-14T22:13:20.000Z");

    const diceResult = await processUnaiInput("掷2个6面骰子");
    expect(diceResult.skill).toBe("dice");
    expect(diceResult.response).toMatch(/\[\d+, \d+\]/);
    expect(diceResult.response).toContain("总计:");

    const passwordResult = await processUnaiInput("生成密码 24位 无符号");
    expect(passwordResult.skill).toBe("password");
    expect(passwordResult.response).toMatch(/^[A-Za-z0-9]{24}$/m);
    expect(passwordResult.response).toContain("长度 24");

    const statsResult = await processUnaiInput("字数统计: 你好世界");
    expect(statsResult.skill).toBe("text_stats");
    expect(statsResult.response).toContain("字符数: 4");

    const jsonResult = await processUnaiInput('格式化JSON: {"a":"b"}');
    expect(jsonResult.skill).toBe("json_format");
    expect(jsonResult.response).toContain('"a": "b"');

    const uuidResult = await processUnaiInput("生成UUID");
    expect(uuidResult.skill).toBe("uuid");
    expect(uuidResult.response).toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);

    const jokeResult = await processUnaiInput("讲个笑话");
    expect(jokeResult.skill).toBe("joke");
  });

  it("translates through Chinese instructions using the offline phrase list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await processUnaiInput("把苹果翻译成英语");
    expect(result.skill).toBe("translate");
    expect(result.execution).toBe("external");
    expect(result.response).toContain("apple");
    expect(result.response).toContain("本地词库");
  });

  it("searches in Chinese through the DDGS-compatible path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          AbstractText: "量子计算机是一种计算设备。",
          Heading: "量子计算机",
        }),
      })
    );
    const result = await processUnaiInput("搜索: 量子计算机");
    expect(result.skill).toBe("ddgs");
    expect(result.execution).toBe("external");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("api.duckduckgo.com");
    expect(result.response).toContain("【量子计算机】");
  });

  it("localizes metadata such as selectionReason and external notices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ translated_text: "Hello" }),
      })
    );
    const zhTranslate = await processUnaiInput("把水翻译成英语");
    expect(zhTranslate.selectionReason).toContain("优先位");
    expect(zhTranslate.externalNotice).toContain("外部翻译API");

    const jaSearch = await processUnaiInput("検索: TypeScript");
    expect(jaSearch.selectionReason).toContain("番目の");
    expect(jaSearch.externalNotice).toContain("公開情報API");

    const enHelp = await processUnaiInput("/help");
    expect(enHelp.response).toContain("Slash Commands:");
    const zhHelp = await processUnaiInput("/help 计算器");
    expect(zhHelp.response).toContain("未找到技能");
    const unmatched = await processUnaiInput("xyzzy quux", {
      disabledSkillIds: unaiPriority,
    });
    expect(unmatched.selectionReason).toContain("No matching Unai skill");
  });
});
