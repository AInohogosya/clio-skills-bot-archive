import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { chatLimiter, requestIdentity } from "./_core/rateLimit";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { deleteConversation, enableCatalogSyncSchedule, getCatalogSkills, getConversation, getConversations, getFavorites, getLatestSync, getPublicCatalogSyncSchedule, getRecentActivity, recordSkillUse, setCatalogSyncScheduleEnabled, syncUnaiCatalog, toggleFavorite } from "./unaiCatalog";
import { processUnaiInput } from "./unaiRuntime";

const messageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) });

function sessionToken(cookieHeader?: string, authorization?: string) {
  const cookieToken = parseCookie(cookieHeader ?? "")[COOKIE_NAME] ?? "";
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const token = cookieToken || bearerToken;
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "定期同期の設定にはサインインが必要です。" });
  return token;
}

const fallbackCatalog = [
  { sourceId: "greeting", name: "Greeting", category: "Conversation", description: "あいさつや短い会話" },
  { sourceId: "calc", name: "Calculator", category: "Utility", description: "数式の安全な計算・方程式の解法" },
  { sourceId: "wikipedia", name: "Wikipedia Summary", category: "Research", description: "Wikipedia の概要取得" },
  { sourceId: "ddgs", name: "Web Search Summary", category: "Research", description: "DuckDuckGo 検索結果の要約" },
  { sourceId: "ddgs_chatbot", name: "Search Conversation", category: "Research", description: "対話型のWeb検索" },
  { sourceId: "joke", name: "Joke", category: "Conversation", description: "定義済みジョーク" },
];

type SkillCandidate = { sourceId: string; name: string; category: string; description: string };

function textContent(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(part => "text" in part ? part.text : "").join("\n");
  return "";
}

export function autoSelectSkill(message: string, catalog: SkillCandidate[]) {
  const query = message.toLowerCase();
  const preferredId = /計算|方程式|数式|解き|solve|calculate|math|[a-z]\s*\^|\d\s*[=+\-*/^]\s*\d/.test(query) ? "calc"
    : /あいさつ|こんにちは|hello|hi\b/.test(query) ? "greeting"
    : /冗談|ジョーク|joke/.test(query) ? "joke"
    : /wiki|人物|用語|概要/.test(query) ? "wikipedia"
    : /検索|調べ|research|search/.test(query) ? "ddgs"
    : "ddgs_chatbot";
  const skill = catalog.find(item => item.sourceId === preferredId) ?? catalog[0];
  const reason = preferredId === "calc" ? "数式・計算の依頼を検出しました"
    : preferredId === "greeting" ? "あいさつ・会話の依頼を検出しました"
    : preferredId === "joke" ? "ジョークの依頼を検出しました"
    : preferredId === "wikipedia" ? "用語や人物の概要依頼を検出しました"
    : preferredId === "ddgs" ? "検索・調査の依頼を検出しました"
    : "会話型の検索支援として選択しました";
  return { skill, reason };
}

export function catalogFallback(message: string, catalog: SkillCandidate[]) {
  const { skill, reason } = autoSelectSkill(message, catalog);
  if (!skill) return { content: "現在利用できるスキル情報を取得できませんでした。カタログを同期してから再度お試しください。", matchedSkillIds: [], selectedSkillId: null, selectionReason: "利用可能なスキルがありません", mode: "fallback" as const };
  return {
    content: `**${skill.name}** を使うのがよさそうです。\n\n${skill.description}\n\n1. カタログで **${skill.name}** を開きます。\n2. 詳細ビューの入力項目を確認します。\n3. Unai 環境でこの依頼を送って実行します。\n\n*現在はカタログガイドとして提案しています。*`,
    matchedSkillIds: [skill.sourceId],
    selectedSkillId: skill.sourceId,
    selectionReason: reason,
    mode: "fallback" as const,
  };
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  catalog: router({
    list: publicProcedure.query(async () => getCatalogSkills()),
    latestSync: publicProcedure.query(async () => getLatestSync()),
    schedule: publicProcedure.query(async () => getPublicCatalogSyncSchedule()),
    sync: adminProcedure.mutation(async () => syncUnaiCatalog()),
    enableSchedule: adminProcedure.mutation(({ ctx }) => enableCatalogSyncSchedule(sessionToken(ctx.req.headers.cookie, ctx.req.headers.authorization))),
    setScheduleEnabled: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(({ ctx, input }) => setCatalogSyncScheduleEnabled(sessionToken(ctx.req.headers.cookie, ctx.req.headers.authorization), input.enabled)),
  }),
  clio: router({
    chat: publicProcedure.input(z.object({ messages: z.array(messageSchema).min(1).max(12) })).mutation(async ({ input, ctx }) => {
      const rateLimit = chatLimiter.consume(requestIdentity(ctx.req));
      if (!rateLimit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        });
      }
      const result = await processUnaiInput(input.messages.at(-1)?.content ?? "");
      return { content: result.response, matchedSkillIds: result.matchedSkillIds, selectedSkillId: result.skill, selectionReason: result.selectionReason, mode: result.mode, metadata: { tokens: result.tokens, elapsedMs: result.elapsedMs, tps: result.tps, execution: result.execution, cacheHit: result.cacheHit, externalNotice: result.externalNotice } };
    }),
  }),
  library: router({
    favorites: protectedProcedure.query(({ ctx }) => getFavorites(ctx.user.id)),
    recent: protectedProcedure.query(({ ctx }) => getRecentActivity(ctx.user.id)),
    conversations: protectedProcedure.query(({ ctx }) => getConversations(ctx.user.id)),
    conversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(({ ctx, input }) => getConversation(ctx.user.id, input.conversationId)),
    deleteConversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(({ ctx, input }) => deleteConversation(ctx.user.id, input.conversationId)),
    toggleFavorite: protectedProcedure.input(z.object({ sourceId: z.string().min(1).max(128) })).mutation(({ ctx, input }) => toggleFavorite(ctx.user.id, input.sourceId)),
    record: protectedProcedure.input(z.object({ sourceId: z.string().max(128), taskText: z.string().min(1).max(4000), botResponse: z.string().max(6000).optional(), conversationId: z.number().int().positive().optional() })).mutation(({ ctx, input }) => recordSkillUse(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;
