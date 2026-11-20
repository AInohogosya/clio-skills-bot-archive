export const languages = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
] as const;

export type Language = (typeof languages)[number]["code"];

export type TranslationParams = Record<string, string | number>;

const ja = {
  "common.retry": "再試行",
  "common.closeMenu": "メニューを閉じる",
  "common.openMenu": "メニューを開く",

  "action.newChat": "新しいチャット",

  "nav.chat": "チャット",
  "nav.catalog": "スキルを探す",
  "nav.history": "履歴",
  "nav.settings": "設定",
  "nav.primaryAria": "主なナビゲーション",

  "sidebar.recent": "最近",
  "sidebar.empty": "まだ会話はありません",
  "sidebar.guestName": "Clio user",
  "sidebar.cloudHistory": "クラウド履歴が有効",
  "sidebar.deviceOnly": "この端末に保存されます",

  "header.catalogTitle": "スキルカタログ",
  "header.historyTitle": "会話履歴",
  "header.settingsTitle": "設定",
  "header.subtitleChat": "Unai skill companion",
  "header.sync": "同期",

  "chat.executionLocal": "ローカルで即時実行",
  "chat.executionExternal": "公開情報を取得",
  "chat.executionGuide": "ローカル案内",
  "chat.autoSelect": "自動選択:",
  "chat.retryAvailable": "再試行できます",
  "chat.cacheHit": " · キャッシュ",
  "chat.retryNotice": "外部情報を取得できませんでした。",
  "chat.you": "You",
  "chat.landingTitle": "今日は何を進めますか？",
  "chat.landingSubtitle":
    "依頼を送ると、Clioが最適なUnaiスキルと次の一手を整理します。",
  "chat.thinking": "高速な実行経路を選択しています…",
  "chat.composerPlaceholder": "メッセージを入力…",
  "chat.send": "送信",
  "chat.composerHint": "Enter で送信 · Shift + Enter で改行",
  "chat.resumeReason": "前回の会話で選択されたスキルです",
  "chat.errorFallback":
    "応答を準備できませんでした。別の表現で、もう一度試してください。",

  "catalog.searchPlaceholder": "スキル、目的、キーワードで検索",
  "catalog.savedOnly": "保存済み",
  "catalog.all": "All",
  "catalog.title": "スキルを探す",
  "catalog.subtitle": "Unaiが提供するスキルを、目的に合わせて選べます。",
  "catalog.count": "{count} skills",
  "catalog.loadError": "カタログを読み込めませんでした。",
  "catalog.emptyTitle": "スキルが見つかりません",
  "catalog.emptyDesc": "検索語やカテゴリを変えてみてください。",
  "catalog.useCases": "利用場面",
  "catalog.inputs": "入力",
  "catalog.required": "必須",
  "catalog.noInputs": "追加の入力はありません。",
  "catalog.steps": "実行手順",
  "catalog.askClio": "Clioに相談",
  "catalog.createDraft": "下書きを作成",
  "catalog.favoriteAria": "お気に入りを切り替え",
  "catalog.askPrompt":
    "{name} を使って「{query}」を実行したいです。必要な入力と実行手順を整理してください。",

  "history.title": "会話履歴",
  "history.subtitle": "以前の相談を開いて、作業をすぐに再開できます。",
  "history.messageCount": "{count} メッセージ",
  "history.emptyTitle": "まだ会話はありません",
  "history.emptyDesc": "チャットを始めると、ここから再開できます。",
  "history.startChat": "チャットを始める",
  "history.recentSkills": "最近使ったスキル",
  "history.openAria": "会話を開く",
  "history.deleteAria": "会話を削除",
  "history.deleteConfirm":
    "「{title}」を削除しますか？この操作は取り消せません。",

  "date.unsaved": "未保存",
  "date.unknown": "不明",
  "date.next": "次回 {date}",

  "settings.title": "設定",
  "settings.subtitle": "スキルカタログと同期状態を管理します。",
  "settings.theme.title": "表示テーマ",
  "settings.theme.desc":
    "ライトモードとダークモードを切り替えます。選択したテーマはこの端末に保存されます。",
  "settings.theme.toLight": "ライトモードへ",
  "settings.theme.toDark": "ダークモードへ",
  "settings.language.title": "表示言語",
  "settings.language.desc":
    "アプリの表示言語のみを切り替えます。既存の会話内容は翻訳されず、選択した言語はこの端末に保存されます。",
  "settings.catalog.title": "スキルカタログ",
  "settings.catalog.needsAttention": "同期に注意が必要です",
  "settings.catalog.connected": "リポジトリに接続済み",
  "settings.catalog.bundled": "同梱カタログを利用中",
  "settings.syncNow": "今すぐ同期",
  "settings.schedule.title": "毎日の自動同期",
  "settings.schedule.enabled": "有効",
  "settings.schedule.disabled": "停止中",
  "settings.schedule.afterPublish": "公開後に有効化できます",
  "settings.schedule.stop": "停止",
  "settings.schedule.enable": "有効にする",
  "settings.adminOnly": "管理者のみ",
  "settings.privacy.title": "応答とデータの扱い",
  "settings.privacy.desc":
    "計算・あいさつは端末へ即時応答します。検索・概要は公開情報APIへ、翻訳文は外部翻訳サービスへ送信されます。利用者にAPIキーの入力は求めません。サインインしない会話履歴はこの端末にのみ保存されます。",

  "toast.syncSuccess": "{count} 件のスキルを同期しました",
  "toast.syncError": "スキルカタログを同期できませんでした。",
  "toast.favoriteError": "お気に入りを更新できませんでした。",
  "toast.scheduleEnableError": "公開後に自動同期を有効化できます。",
  "toast.scheduleUpdateError": "同期設定を変更できませんでした。",
};

export type TranslationKey = keyof typeof ja;

const en: Record<TranslationKey, string> = {
  "common.retry": "Retry",
  "common.closeMenu": "Close menu",
  "common.openMenu": "Open menu",

  "action.newChat": "New chat",

  "nav.chat": "Chat",
  "nav.catalog": "Find skills",
  "nav.history": "History",
  "nav.settings": "Settings",
  "nav.primaryAria": "Primary navigation",

  "sidebar.recent": "RECENT",
  "sidebar.empty": "No conversations yet",
  "sidebar.guestName": "Clio user",
  "sidebar.cloudHistory": "Cloud history enabled",
  "sidebar.deviceOnly": "Saved on this device",

  "header.catalogTitle": "Skill catalog",
  "header.historyTitle": "Conversation history",
  "header.settingsTitle": "Settings",
  "header.subtitleChat": "Unai skill companion",
  "header.sync": "Sync",

  "chat.executionLocal": "Executed locally",
  "chat.executionExternal": "Fetched public sources",
  "chat.executionGuide": "Local guidance",
  "chat.autoSelect": "Auto-selected:",
  "chat.retryAvailable": "You can retry",
  "chat.cacheHit": " · Cached",
  "chat.retryNotice": "Couldn't fetch external information.",
  "chat.you": "You",
  "chat.landingTitle": "What would you like to work on today?",
  "chat.landingSubtitle":
    "Send a request and Clio will pick the right Unai skill and map out your next steps.",
  "chat.thinking": "Choosing the fastest execution path…",
  "chat.composerPlaceholder": "Type a message…",
  "chat.send": "Send",
  "chat.composerHint": "Enter to send · Shift + Enter for a new line",
  "chat.resumeReason": "Skill selected in your previous conversation",
  "chat.errorFallback":
    "Couldn't prepare a response. Please try rephrasing and sending it again.",

  "catalog.searchPlaceholder": "Search skills, goals, or keywords",
  "catalog.savedOnly": "Saved",
  "catalog.all": "All",
  "catalog.title": "Find skills",
  "catalog.subtitle":
    "Choose from the skills Unai provides to match your goal.",
  "catalog.count": "{count} skills",
  "catalog.loadError": "Failed to load the catalog.",
  "catalog.emptyTitle": "No skills found",
  "catalog.emptyDesc": "Try a different search term or category.",
  "catalog.useCases": "Use cases",
  "catalog.inputs": "Inputs",
  "catalog.required": "Required",
  "catalog.noInputs": "No additional inputs required.",
  "catalog.steps": "Steps",
  "catalog.askClio": "Ask Clio",
  "catalog.createDraft": "Create draft",
  "catalog.favoriteAria": "Toggle favorite",
  "catalog.askPrompt":
    "I want to use {name} for: {query}. Please organize the required inputs and execution steps.",

  "history.title": "Conversation history",
  "history.subtitle":
    "Reopen past conversations and pick up right where you left off.",
  "history.messageCount": "{count} messages",
  "history.emptyTitle": "No conversations yet",
  "history.emptyDesc": "Start a chat and you can resume it from here anytime.",
  "history.startChat": "Start chatting",
  "history.recentSkills": "Recently used skills",
  "history.openAria": "Open conversation",
  "history.deleteAria": "Delete conversation",
  "history.deleteConfirm": 'Delete "{title}"? This action cannot be undone.',

  "date.unsaved": "Not saved",
  "date.unknown": "Unknown",
  "date.next": "Next {date}",

  "settings.title": "Settings",
  "settings.subtitle": "Manage the skill catalog and sync status.",
  "settings.theme.title": "Appearance",
  "settings.theme.desc":
    "Switch between light and dark mode. Your choice is saved on this device.",
  "settings.theme.toLight": "Switch to light mode",
  "settings.theme.toDark": "Switch to dark mode",
  "settings.language.title": "Language",
  "settings.language.desc":
    "Changes the app UI language only. Existing conversations are not translated, and your selection is saved on this device.",
  "settings.catalog.title": "Skill catalog",
  "settings.catalog.needsAttention": "Sync needs attention",
  "settings.catalog.connected": "Connected to repository",
  "settings.catalog.bundled": "Using the bundled catalog",
  "settings.syncNow": "Sync now",
  "settings.schedule.title": "Daily auto sync",
  "settings.schedule.enabled": "Enabled",
  "settings.schedule.disabled": "Paused",
  "settings.schedule.afterPublish": "Available after publishing",
  "settings.schedule.stop": "Pause",
  "settings.schedule.enable": "Enable",
  "settings.adminOnly": "Admins only",
  "settings.privacy.title": "Responses & data handling",
  "settings.privacy.desc":
    "Calculations and greetings are answered instantly on this device. Search and summaries are sent to public information APIs, and translations are sent to an external translation service. You never need to enter an API key. Conversation history while signed out is stored only on this device.",

  "toast.syncSuccess": "Synced {count} skills",
  "toast.syncError": "Failed to sync the skill catalog.",
  "toast.favoriteError": "Failed to update favorites.",
  "toast.scheduleEnableError": "Auto sync can be enabled after publishing.",
  "toast.scheduleUpdateError": "Failed to change the sync setting.",
};

const zh: Record<TranslationKey, string> = {
  "common.retry": "重试",
  "common.closeMenu": "关闭菜单",
  "common.openMenu": "打开菜单",

  "action.newChat": "新建对话",

  "nav.chat": "对话",
  "nav.catalog": "探索技能",
  "nav.history": "历史记录",
  "nav.settings": "设置",
  "nav.primaryAria": "主导航",

  "sidebar.recent": "最近",
  "sidebar.empty": "暂无对话",
  "sidebar.guestName": "Clio user",
  "sidebar.cloudHistory": "已启用云端历史",
  "sidebar.deviceOnly": "保存在此设备上",

  "header.catalogTitle": "技能目录",
  "header.historyTitle": "对话历史",
  "header.settingsTitle": "设置",
  "header.subtitleChat": "Unai skill companion",
  "header.sync": "同步",

  "chat.executionLocal": "本地即时执行",
  "chat.executionExternal": "获取公开信息",
  "chat.executionGuide": "本地指引",
  "chat.autoSelect": "自动选择：",
  "chat.retryAvailable": "可以重试",
  "chat.cacheHit": " · 缓存",
  "chat.retryNotice": "无法获取外部信息。",
  "chat.you": "你",
  "chat.landingTitle": "今天想做点什么？",
  "chat.landingSubtitle":
    "发送请求后，Clio 会挑选最合适的 Unai 技能并为你规划下一步。",
  "chat.thinking": "正在选择最快的执行路径…",
  "chat.composerPlaceholder": "输入消息…",
  "chat.send": "发送",
  "chat.composerHint": "Enter 发送 · Shift + Enter 换行",
  "chat.resumeReason": "上次对话中选择的技能",
  "chat.errorFallback": "无法生成回复。请换一种表达方式重试。",

  "catalog.searchPlaceholder": "按技能、目标或关键词搜索",
  "catalog.savedOnly": "已保存",
  "catalog.all": "全部",
  "catalog.title": "探索技能",
  "catalog.subtitle": "从 Unai 提供的技能中，选择符合你目标的技能。",
  "catalog.count": "{count} 个技能",
  "catalog.loadError": "无法加载技能目录。",
  "catalog.emptyTitle": "未找到技能",
  "catalog.emptyDesc": "请尝试更换搜索词或分类。",
  "catalog.useCases": "使用场景",
  "catalog.inputs": "输入",
  "catalog.required": "必填",
  "catalog.noInputs": "无需其他输入。",
  "catalog.steps": "执行步骤",
  "catalog.askClio": "咨询 Clio",
  "catalog.createDraft": "创建草稿",
  "catalog.favoriteAria": "切换收藏",
  "catalog.askPrompt": "我想用{name}执行：{query}。请整理所需输入和执行步骤。",

  "history.title": "对话历史",
  "history.subtitle": "打开以前的对话，立即继续之前的工作。",
  "history.messageCount": "{count} 条消息",
  "history.emptyTitle": "暂无对话",
  "history.emptyDesc": "开始对话后，可随时从这里继续。",
  "history.startChat": "开始对话",
  "history.recentSkills": "最近使用的技能",
  "history.openAria": "打开对话",
  "history.deleteAria": "删除对话",
  "history.deleteConfirm": "确定删除“{title}”吗？此操作无法撤销。",

  "date.unsaved": "未保存",
  "date.unknown": "未知",
  "date.next": "下次 {date}",

  "settings.title": "设置",
  "settings.subtitle": "管理技能目录和同步状态。",
  "settings.theme.title": "外观主题",
  "settings.theme.desc": "切换浅色模式和深色模式。所选主题会保存在此设备上。",
  "settings.theme.toLight": "切换到浅色模式",
  "settings.theme.toDark": "切换到深色模式",
  "settings.language.title": "显示语言",
  "settings.language.desc": "仅切换应用界面语言，不翻译现有会话。所选语言会保存在此设备上。",
  "settings.catalog.title": "技能目录",
  "settings.catalog.needsAttention": "同步需要处理",
  "settings.catalog.connected": "已连接仓库",
  "settings.catalog.bundled": "使用内置技能目录",
  "settings.syncNow": "立即同步",
  "settings.schedule.title": "每日自动同步",
  "settings.schedule.enabled": "已启用",
  "settings.schedule.disabled": "已暂停",
  "settings.schedule.afterPublish": "发布后可启用",
  "settings.schedule.stop": "暂停",
  "settings.schedule.enable": "启用",
  "settings.adminOnly": "仅管理员",
  "settings.privacy.title": "回复与数据处理",
  "settings.privacy.desc":
    "计算和问候语会在本机即时响应。搜索和摘要会发送到公开信息 API，翻译文本会发送到外部翻译服务。无需输入 API 密钥。未登录时的对话历史仅保存在此设备上。",

  "toast.syncSuccess": "已同步 {count} 个技能",
  "toast.syncError": "无法同步技能目录。",
  "toast.favoriteError": "无法更新收藏。",
  "toast.scheduleEnableError": "发布后可启用自动同步。",
  "toast.scheduleUpdateError": "无法更改同步设置。",
};

export const translations: Record<Language, Record<TranslationKey, string>> = {
  ja,
  en,
  zh,
};

const starterPromptsByLanguage: Record<Language, readonly string[]> = {
  ja: [
    "Pythonで安全に数式を計算したい",
    "Ada Lovelaceについて概要を調べたい",
    "Webで競合を調べる手順を知りたい",
  ],
  en: [
    "Safely evaluate a math expression with Python",
    "Look up an overview of Ada Lovelace",
    "Learn how to research competitors on the web",
  ],
  zh: [
    "用 Python 安全地计算数学表达式",
    "查一查 Ada Lovelace 的概况",
    "了解在 Web 上调研竞争对手的步骤",
  ],
};

export function starterPrompts(language: Language): readonly string[] {
  return starterPromptsByLanguage[language];
}

const localeTags: Record<Language, string> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
};

export function localeTag(language: Language): string {
  return localeTags[language];
}

export function formatDateLocalized(
  value?: Date | string | null,
  locale = "ja-JP"
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}
