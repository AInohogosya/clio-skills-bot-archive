import { boolean, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type SkillInput = {
  key: string;
  label: string;
  required: boolean;
  description: string;
};

export type CatalogSkillInput = {
  sourceId: string;
  name: string;
  category: string;
  description: string;
  author: string;
  version: string;
  keywords: string[];
  useCases: string[];
  inputs: SkillInput[];
  steps: string[];
  sourceUrl: string;
  status: "ready" | "setup";
  helpText: string | null;
};

export const skillCatalog = mysqlTable("skill_catalog", {
  sourceId: varchar("sourceId", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 96 }).notNull(),
  description: text("description").notNull(),
  author: varchar("author", { length: 255 }).notNull(),
  version: varchar("version", { length: 64 }).notNull(),
  keywords: json("keywords").$type<string[]>().notNull(),
  useCases: json("useCases").$type<string[]>().notNull(),
  inputs: json("inputs").$type<SkillInput[]>().notNull(),
  steps: json("steps").$type<string[]>().notNull(),
  sourceUrl: varchar("sourceUrl", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["ready", "setup"]).notNull().default("ready"),
  helpText: text("helpText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("skill_catalog_category_idx").on(table.category)]);

export const skillFavorites = mysqlTable("skill_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceId: varchar("sourceId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("skill_favorites_user_idx").on(table.userId),
  uniqueIndex("skill_favorites_user_skill_unique").on(table.userId, table.sourceId),
]);

export const skillUsage = mysqlTable("skill_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceId: varchar("sourceId", { length: 128 }).notNull(),
  taskText: text("taskText").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("skill_usage_user_created_idx").on(table.userId, table.createdAt)]);

export const skillConversations = mysqlTable("skill_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sourceId: varchar("sourceId", { length: 128 }),
  title: varchar("title", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("skill_conversations_user_idx").on(table.userId, table.createdAt)]);

export const skillMessages = mysqlTable("skill_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("skill_messages_conversation_idx").on(table.conversationId, table.createdAt)]);

export const catalogSyncs = mysqlTable("catalog_syncs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("status", ["success", "error"]).notNull(),
  syncedCount: int("syncedCount").notNull().default(0),
  errorText: text("errorText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const catalogSyncSchedule = mysqlTable("catalog_sync_schedule", {
  key: varchar("key", { length: 64 }).primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  cron: varchar("cron", { length: 64 }).notNull().default("0 0 3 * * *"),
  enabled: boolean("enabled").notNull().default(false),
  nextExecutionAt: varchar("nextExecutionAt", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
