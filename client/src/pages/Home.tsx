import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { unaiSkills, type UnaiSkillDefinition } from "@/lib/unaiCatalog";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import { Bot, Check, ChevronLeft, Clock3, Heart, History, Languages, Library, Loader2, Menu, MessageSquareText, Moon, Plus, RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Sun, X, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { formatDateLocalized, languages as availableLanguages, starterPrompts, type Language } from "@/i18n/translations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };
type CatalogItem = Omit<UnaiSkillDefinition, "id"> & { sourceId: string; helpText?: string | null };
type LocalActivity = { sourceId: string; taskText: string; createdAt: string };
type LocalConversation = { id: string; sourceId: string; title: string; messages: ChatMessage[]; createdAt: string };
type AppView = "chat" | "catalog" | "history" | "settings";
type Thread = { id: string; sourceId: string; title: string; messages: ChatMessage[]; createdAt: Date | string; remoteId?: number };
type ExecutionMetadata = { tokens: number; elapsedMs: number; tps: number; execution: "local" | "external" | "fallback"; cacheHit: boolean; externalNotice?: string };

const favoriteStore = "clio-skill-favorites";
const activityStore = "clio-skill-activity";
const localConversationStore = "clio-skill-conversations";

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const catalogQuery = trpc.catalog.list.useQuery();
  const latestSyncQuery = trpc.catalog.latestSync.useQuery();
  const scheduleQuery = trpc.catalog.schedule.useQuery();
  const favoritesQuery = trpc.library.favorites.useQuery(undefined, { enabled: isAuthenticated });
  const conversationsQuery = trpc.library.conversations.useQuery(undefined, { enabled: isAuthenticated });
  const syncMutation = trpc.catalog.sync.useMutation();
  const chatMutation = trpc.clio.chat.useMutation();
  const favoriteMutation = trpc.library.toggleFavorite.useMutation();
  const recordMutation = trpc.library.record.useMutation();
  const deleteConversationMutation = trpc.library.deleteConversation.useMutation();
  const enableScheduleMutation = trpc.catalog.enableSchedule.useMutation();
  const updateScheduleMutation = trpc.catalog.setScheduleEnabled.useMutation();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t, locale } = useLanguage();

  const searchRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState("ddgs");
  const [autoSkillId, setAutoSkillId] = useState<string | null>(null);
  const [selectionReason, setSelectionReason] = useState("");
  const [executionMeta, setExecutionMeta] = useState<ExecutionMetadata | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [currentLocalConversationId, setCurrentLocalConversationId] = useState<string | null>(null);
  const [localFavorites, setLocalFavorites] = useState<string[]>([]);
  const [localActivity, setLocalActivity] = useState<LocalActivity[]>([]);
  const [localConversations, setLocalConversations] = useState<LocalConversation[]>([]);

  useEffect(() => {
    setLocalFavorites(readStored<string[]>(favoriteStore, []));
    setLocalActivity(readStored<LocalActivity[]>(activityStore, []));
    setLocalConversations(readStored<LocalConversation[]>(localConversationStore, []));
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveView("catalog");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const skills = useMemo<CatalogItem[]>(() => catalogQuery.data?.length ? catalogQuery.data : unaiSkills.map(skill => ({ ...skill, sourceId: skill.id })), [catalogQuery.data]);
  const categories = useMemo(() => ["All", ...Array.from(new Set(skills.map(skill => skill.category)))], [skills]);
  const favoriteIds = useMemo(() => isAuthenticated && favoritesQuery.data ? new Set(favoritesQuery.data.map(item => item.skill.sourceId)) : new Set(localFavorites), [favoritesQuery.data, isAuthenticated, localFavorites]);
  const filteredSkills = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return skills.filter(skill => {
      const haystack = [skill.name, skill.description, skill.category, ...skill.keywords, ...skill.useCases].join(" ").toLowerCase();
      return (category === "All" || skill.category === category) && (!savedOnly || favoriteIds.has(skill.sourceId)) && (!normalized || haystack.includes(normalized));
    });
  }, [category, favoriteIds, query, savedOnly, skills]);
  const selected = skills.find(skill => skill.sourceId === selectedId) ?? skills[0];
  const threads = useMemo<Thread[]>(() => {
    if (isAuthenticated && conversationsQuery.data?.length) {
      return conversationsQuery.data.map(thread => ({
        id: `remote-${thread.id}`,
        remoteId: thread.id,
        sourceId: thread.sourceId ?? "ddgs",
        title: thread.title,
        messages: thread.messages.map(message => ({ role: message.role, content: message.content })),
        createdAt: thread.createdAt,
      }));
    }
    return localConversations.map(thread => ({ ...thread }));
  }, [conversationsQuery.data, isAuthenticated, localConversations]);
  const recentActivity = useMemo(() => localActivity.slice(0, 4), [localActivity]);

  const goTo = (view: AppView) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  const selectSkill = (id: string) => {
    setSelectedId(id);
    goTo("catalog");
  };

  const saveActivity = useCallback((sourceId: string, taskText: string) => {
    const next = [{ sourceId, taskText, createdAt: new Date().toISOString() }, ...localActivity.filter(item => item.sourceId !== sourceId)].slice(0, 6);
    setLocalActivity(next);
    localStorage.setItem(activityStore, JSON.stringify(next));
  }, [localActivity]);

  const saveLocalConversation = useCallback((sourceId: string, title: string, updatedMessages: ChatMessage[]) => {
    const conversationId = currentLocalConversationId ?? `local-${Date.now()}`;
    const conversation: LocalConversation = { id: conversationId, sourceId, title: title.slice(0, 80), messages: updatedMessages, createdAt: new Date().toISOString() };
    setLocalConversations(current => {
      const next = [conversation, ...current.filter(item => item.id !== conversationId)].slice(0, 8);
      localStorage.setItem(localConversationStore, JSON.stringify(next));
      return next;
    });
    setCurrentLocalConversationId(conversationId);
  }, [currentLocalConversationId]);

  const sendToClio = useCallback((text: string) => {
    const prompt = text.trim();
    if (!prompt || chatMutation.isPending) return;
    const outgoing: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages(outgoing);
    setDraft("");
    chatMutation.mutate({ messages: outgoing.slice(-12) }, {
      onSuccess: result => {
        const completedMessages: ChatMessage[] = [...outgoing, { role: "assistant", content: result.content }];
        const proposedId = result.selectedSkillId || result.matchedSkillIds[0] || selected?.sourceId || "ddgs";
        setMessages(completedMessages);
        setSelectedId(proposedId);
        setAutoSkillId(proposedId);
        setSelectionReason(result.selectionReason);
        setExecutionMeta(result.metadata);
        setRetryPrompt(result.metadata.execution === "external" && /No (?:search results|relevant answer|Wikipedia summary) found\./.test(result.content) ? prompt : null);
        if (isAuthenticated) {
          recordMutation.mutate({ sourceId: proposedId, taskText: prompt, botResponse: result.content, conversationId: currentConversationId ?? undefined }, {
            onSuccess: saved => {
              setCurrentConversationId(saved.conversationId);
              utils.library.conversations.invalidate();
            },
          });
        } else {
          saveActivity(proposedId, prompt);
          saveLocalConversation(proposedId, prompt, completedMessages);
        }
      },
      onError: () => {
        setExecutionMeta({ tokens: 0, elapsedMs: 0, tps: 0, execution: "fallback", cacheHit: false });
        setRetryPrompt(prompt);
        setMessages(current => [...current, { role: "assistant", content: t("chat.errorFallback") }]);
      },
    });
  }, [chatMutation, currentConversationId, isAuthenticated, messages, recordMutation, saveActivity, saveLocalConversation, selected?.sourceId, t, utils.library.conversations]);

  const newConversation = () => {
    setCurrentConversationId(null);
    setCurrentLocalConversationId(null);
    setMessages([]);
    setAutoSkillId(null);
    setSelectionReason("");
    setExecutionMeta(null);
    setRetryPrompt(null);
    goTo("chat");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const resumeThread = (thread: Thread) => {
    setCurrentConversationId(thread.remoteId ?? null);
    setCurrentLocalConversationId(thread.remoteId ? null : thread.id);
    setSelectedId(thread.sourceId);
    setMessages(thread.messages);
    setAutoSkillId(thread.sourceId);
    setSelectionReason(t("chat.resumeReason"));
    setExecutionMeta(null);
    setRetryPrompt(null);
    goTo("chat");
  };

  const toggleFavorite = (sourceId: string) => {
    if (isAuthenticated) {
      favoriteMutation.mutate({ sourceId }, { onSuccess: () => utils.library.favorites.invalidate(), onError: () => toast.error(t("toast.favoriteError")) });
      return;
    }
    const next = favoriteIds.has(sourceId) ? localFavorites.filter(id => id !== sourceId) : [...localFavorites, sourceId];
    setLocalFavorites(next);
    localStorage.setItem(favoriteStore, JSON.stringify(next));
  };

  const syncCatalog = () => syncMutation.mutate(undefined, {
    onSuccess: result => { utils.catalog.list.invalidate(); utils.catalog.latestSync.invalidate(); toast.success(t("toast.syncSuccess", { count: result.count })); },
    onError: () => toast.error(t("toast.syncError")),
  });

  const setSchedule = () => {
    if (!scheduleQuery.data?.configured) {
      enableScheduleMutation.mutate(undefined, { onSuccess: () => utils.catalog.schedule.invalidate(), onError: () => toast.error(t("toast.scheduleEnableError")) });
      return;
    }
    updateScheduleMutation.mutate({ enabled: !scheduleQuery.data.enabled }, { onSuccess: () => utils.catalog.schedule.invalidate(), onError: () => toast.error(t("toast.scheduleUpdateError")) });
  };

  return (
    <div className="clio-app">
      <aside className={cn("app-sidebar", sidebarOpen && "is-open")}>
        <div className="sidebar-brand"><span><Sparkles className="size-4" /></span><strong>Clio</strong><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label={t("common.closeMenu")}><X className="size-4" /></button></div>
        <Button className="new-chat-button" onClick={newConversation}><Plus className="size-4" />{t("action.newChat")}</Button>
        <nav className="primary-nav" aria-label={t("nav.primaryAria")}>
          <NavButton active={activeView === "chat"} icon={<MessageSquareText className="size-4" />} label={t("nav.chat")} onClick={() => goTo("chat")} />
          <NavButton active={activeView === "catalog"} icon={<Library className="size-4" />} label={t("nav.catalog")} onClick={() => { setSavedOnly(false); goTo("catalog"); }} />
          <NavButton active={activeView === "history"} icon={<History className="size-4" />} label={t("nav.history")} onClick={() => goTo("history")} />
          <NavButton active={activeView === "settings"} icon={<Settings2 className="size-4" />} label={t("nav.settings")} onClick={() => goTo("settings")} />
        </nav>
        <div className="sidebar-section"><p>{t("sidebar.recent")}</p>{threads.slice(0, 4).map(thread => <button key={thread.id} onClick={() => resumeThread(thread)}>{thread.title}</button>)}{!threads.length && <span>{t("sidebar.empty")}</span>}</div>
        <div className="sidebar-user"><span className="avatar">{user?.name?.slice(0, 1).toUpperCase() || "C"}</span><div><b>{user?.name || t("sidebar.guestName")}</b><small>{isAuthenticated ? t("sidebar.cloudHistory") : t("sidebar.deviceOnly")}</small></div></div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label={t("common.closeMenu")} />}

      <main className="app-main">
        <header className="app-header"><button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label={t("common.openMenu")}><Menu className="size-5" /></button><div><p>{activeView === "chat" ? "Clio" : activeView === "catalog" ? t("header.catalogTitle") : activeView === "history" ? t("header.historyTitle") : t("header.settingsTitle")}</p><small>{activeView === "chat" ? t("header.subtitleChat") : ""}</small></div>{activeView === "catalog" && user?.role === "admin" && <button className="header-action" onClick={syncCatalog} disabled={syncMutation.isPending}>{syncMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}{t("header.sync")}</button>}</header>

        {activeView === "chat" && <ChatView messages={messages} draft={draft} setDraft={setDraft} textareaRef={textareaRef} pending={chatMutation.isPending} activeSkill={autoSkillId ? skills.find(skill => skill.sourceId === autoSkillId) : undefined} selectionReason={selectionReason} executionMeta={executionMeta} retryPrompt={retryPrompt} onSubmit={sendToClio} onRetry={sendToClio} onSelectPrompt={sendToClio} onOpenSkill={() => goTo("catalog")} />}
        {activeView === "catalog" && <CatalogView searchRef={searchRef} query={query} setQuery={setQuery} categories={categories} category={category} setCategory={setCategory} savedOnly={savedOnly} setSavedOnly={setSavedOnly} favoriteIds={favoriteIds} skills={filteredSkills} selected={selected && filteredSkills.some(skill => skill.sourceId === selected.sourceId) ? selected : undefined} loading={catalogQuery.isLoading} error={Boolean(catalogQuery.error)} onRetry={() => catalogQuery.refetch()} onSelect={selectSkill} onFavorite={toggleFavorite} onCreateDraft={(skill) => { goTo("chat"); setDraft(t("catalog.askPrompt", { name: skill.name, query: query || skill.description })); requestAnimationFrame(() => textareaRef.current?.focus()); }} />}
        {activeView === "history" && <HistoryView threads={threads} activities={recentActivity} onResume={resumeThread} onNew={newConversation} onDelete={(thread) => {
          if (!thread.remoteId) {
            const next = localConversations.filter(item => item.id !== thread.id);
            setLocalConversations(next);
            localStorage.setItem(localConversationStore, JSON.stringify(next));
            return;
          }
          deleteConversationMutation.mutate({ conversationId: thread.remoteId }, {
            onSuccess: () => utils.library.conversations.invalidate(),
            onError: () => toast.error(t("toast.syncError")),
          });
        }} />}
        {activeView === "settings" && <SettingsView latestSync={latestSyncQuery.data} schedule={scheduleQuery.data} isAdmin={user?.role === "admin"} syncing={syncMutation.isPending} onSync={syncCatalog} onSchedule={setSchedule} theme={theme} onToggleTheme={() => toggleTheme?.()} />}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={cn(active && "active")} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function ChatView({ messages, draft, setDraft, textareaRef, pending, activeSkill, selectionReason, executionMeta, retryPrompt, onSubmit, onRetry, onSelectPrompt, onOpenSkill }: { messages: ChatMessage[]; draft: string; setDraft: (value: string) => void; textareaRef: React.RefObject<HTMLTextAreaElement | null>; pending: boolean; activeSkill?: CatalogItem; selectionReason: string; executionMeta: ExecutionMetadata | null; retryPrompt: string | null; onSubmit: (value: string) => void; onRetry: (value: string) => void; onSelectPrompt: (value: string) => void; onOpenSkill: () => void }) {
  const { language, t } = useLanguage();
  const executionLabel = executionMeta?.execution === "local" ? t("chat.executionLocal") : executionMeta?.execution === "external" ? t("chat.executionExternal") : t("chat.executionGuide");
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages.length, pending]);
  return <section className="chat-view"><div ref={transcriptRef} className={cn("chat-transcript", messages.length && "has-messages")}>{activeSkill && <button className="auto-skill-banner" onClick={onOpenSkill}><span><Sparkles className="size-3.5" />{t("chat.autoSelect")} <b>{activeSkill.name}</b></span><small>{selectionReason}</small></button>}{executionMeta && <div className={cn("execution-status", executionMeta.execution)}><span>{executionMeta.execution === "local" ? <Zap className="size-3.5" /> : <ShieldCheck className="size-3.5" />}{executionLabel}</span><small>{executionMeta.elapsedMs ? `${executionMeta.elapsedMs}ms` : t("chat.retryAvailable")}{executionMeta.cacheHit ? t("chat.cacheHit") : ""}</small>{executionMeta.externalNotice && <em>{executionMeta.externalNotice}</em>}</div>}{retryPrompt && <div className="retry-notice"><span>{t("chat.retryNotice")}</span><button onClick={() => onRetry(retryPrompt)} disabled={pending}><RotateCcw className="size-3.5" />{t("common.retry")}</button></div>}{messages.length ? messages.map((message, index) => <article key={`${message.role}-${index}`} className={cn("chat-message", message.role === "user" ? "user" : "assistant")}><div className="message-avatar">{message.role === "user" ? t("chat.you") : <Bot className="size-4" />}</div><div className="message-content">{message.role === "assistant" ? <Streamdown>{message.content}</Streamdown> : message.content}</div></article>) : <div className="chat-landing"><span className="landing-mark"><Sparkles className="size-6" /></span><h1>{t("chat.landingTitle")}</h1><p>{t("chat.landingSubtitle")}</p><div>{starterPrompts(language).map(prompt => <button key={prompt} onClick={() => onSelectPrompt(prompt)}>{prompt}</button>)}</div></div>}{pending && <article className="chat-message assistant"><div className="message-avatar"><Bot className="size-4" /></div><div className="message-content thinking"><Loader2 className="size-4 animate-spin" />{t("chat.thinking")}</div></article>}</div><form className="chat-composer" onSubmit={event => { event.preventDefault(); onSubmit(draft); }}><div className="composer-field"><Textarea ref={textareaRef} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(draft); } }} placeholder={t("chat.composerPlaceholder")} rows={1} /><Button type="submit" className="composer-send" disabled={!draft.trim() || pending} aria-label={t("chat.send")}><Send className="size-[18px]" /></Button></div><small>{t("chat.composerHint")}</small></form></section>;
}

function CatalogView({ searchRef, query, setQuery, categories, category, setCategory, savedOnly, setSavedOnly, favoriteIds, skills, selected, loading, error, onRetry, onSelect, onFavorite, onCreateDraft }: { searchRef: React.RefObject<HTMLInputElement | null>; query: string; setQuery: (value: string) => void; categories: string[]; category: string; setCategory: (value: string) => void; savedOnly: boolean; setSavedOnly: (value: boolean) => void; favoriteIds: Set<string>; skills: CatalogItem[]; selected?: CatalogItem; loading: boolean; error: boolean; onRetry: () => void; onSelect: (id: string) => void; onFavorite: (id: string) => void; onCreateDraft: (skill: CatalogItem) => void }) {
  const { t } = useLanguage();
  return <section className="catalog-view"><div className="catalog-toolbar"><div className="catalog-search"><Search className="size-4" /><Input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder={t("catalog.searchPlaceholder")} /><kbd>⌘ K</kbd></div><button className={cn("saved-filter", savedOnly && "active")} onClick={() => setSavedOnly(!savedOnly)}><Heart className="size-4" />{t("catalog.savedOnly")}</button></div><div className="catalog-layout"><div><div className="catalog-heading"><div><h1>{t("catalog.title")}</h1><p>{t("catalog.subtitle")}</p></div><span>{t("catalog.count", { count: skills.length })}</span></div><div className="category-tabs">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={cn(category === item && "active")}>{item === "All" ? t("catalog.all") : item}</button>)}</div>{error && <div className="notice error">{t("catalog.loadError")}<button onClick={onRetry}>{t("common.retry")}</button></div>}<div className="skill-grid">{loading ? <LoadingState /> : skills.length ? skills.map(skill => <button key={skill.sourceId} className={cn("catalog-card", selected?.sourceId === skill.sourceId && "selected")} onClick={() => onSelect(skill.sourceId)}><span className="card-top"><i>{skill.category}</i><Heart className={cn("size-4", favoriteIds.has(skill.sourceId) && "filled")} /></span><b>{skill.name}</b><p>{skill.description}</p><small>{skill.keywords.slice(0, 3).join(" · ")}</small></button>) : <div className="empty-panel"><Library className="size-5" /><b>{t("catalog.emptyTitle")}</b><span>{t("catalog.emptyDesc")}</span></div>}</div></div>{selected && <aside className="skill-inspector"><div className="inspector-top"><button onClick={() => onSelect("")} aria-label={t("common.closeMenu")} title={t("common.closeMenu")}><ChevronLeft className="size-4" /></button><span>{selected.category}</span><button onClick={() => onFavorite(selected.sourceId)} aria-label={t("catalog.favoriteAria")} title={t("catalog.favoriteAria")}><Heart className={cn("size-4", favoriteIds.has(selected.sourceId) && "filled")} /></button></div><h2>{selected.name}</h2><p>{selected.description}</p><section><b>{t("catalog.useCases")}</b>{selected.useCases.slice(0, 3).map(item => <span key={item}><Check className="size-3.5" />{item}</span>)}</section><section><b>{t("catalog.inputs")}</b>{selected.inputs.length ? selected.inputs.map(input => <div className="input-contract" key={input.key}><strong>{input.label}</strong>{input.required && <em>{t("catalog.required")}</em>}<small>{input.description}</small></div>) : <small>{t("catalog.noInputs")}</small>}</section><section><b>{t("catalog.steps")}</b><ol>{selected.steps.map(step => <li key={step}>{step}</li>)}</ol></section><Button variant="outline" onClick={() => onCreateDraft(selected)}><Sparkles className="size-4" />{t("catalog.createDraft")}</Button></aside>}</div></section>;
}

function HistoryView({ threads, activities, onResume, onNew, onDelete }: { threads: Thread[]; activities: LocalActivity[]; onResume: (thread: Thread) => void; onNew: () => void; onDelete: (thread: Thread) => void }) {
  const { t, locale } = useLanguage();
  return <section className="list-view"><div className="view-heading"><div><h1>{t("history.title")}</h1><p>{t("history.subtitle")}</p></div><Button onClick={onNew}><Plus className="size-4" />{t("action.newChat")}</Button></div>{threads.length ? <div className="thread-list">{threads.map(thread => <div key={thread.id} className="thread-row"><button onClick={() => onResume(thread)} aria-label={`${thread.title}: ${t("history.openAria")}`} title={t("history.openAria")}><span className="thread-icon"><MessageSquareText className="size-4" /></span><div><b>{thread.title}</b><small>{t("history.messageCount", { count: thread.messages.length })} · {formatDateLocalized(thread.createdAt, locale) ?? t("date.unsaved")}</small></div><ChevronLeft className="size-4" /></button><button className="thread-delete" onClick={() => { if (window.confirm(t("history.deleteConfirm", { title: thread.title }))) onDelete(thread); }} aria-label={`${thread.title}: ${t("history.deleteAria")}`} title={t("history.deleteAria")}><X className="size-4" /></button></div>)}</div> : <div className="empty-panel large"><History className="size-6" /><b>{t("history.emptyTitle")}</b><span>{t("history.emptyDesc")}</span><Button onClick={onNew}>{t("history.startChat")}</Button></div>}{!threads.length && activities.length > 0 && <div className="activity-list"><b>{t("history.recentSkills")}</b>{activities.map(item => <span key={`${item.sourceId}-${item.createdAt}`}>{item.sourceId} · {item.taskText}</span>)}</div>}</section>;
}

function SettingsView({ latestSync, schedule, isAdmin, syncing, onSync, onSchedule, theme, onToggleTheme }: { latestSync: { status: string; createdAt: Date } | null | undefined; schedule: { enabled: boolean; configured: boolean; nextExecutionAt: string | null } | null | undefined; isAdmin: boolean; syncing: boolean; onSync: () => void; onSchedule: () => void; theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { language, setLanguage, t, locale } = useLanguage();
  return <section className="list-view settings-view"><div className="view-heading"><div><h1>{t("settings.title")}</h1><p>{t("settings.subtitle")}</p></div></div><div className="settings-card"><div><span className="setting-icon">{theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}</span><div><b>{t("settings.theme.title")}</b><small>{t("settings.theme.desc")}</small></div></div><Button variant="outline" onClick={onToggleTheme}>{theme === "dark" ? t("settings.theme.toLight") : t("settings.theme.toDark")}</Button></div><div className="settings-card"><div><span className="setting-icon"><Languages className="size-4" /></span><div><b>{t("settings.language.title")}</b><small>{t("settings.language.desc")}</small></div></div><Select value={language} onValueChange={value => setLanguage(value as Language)}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{availableLanguages.map(item => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="settings-card"><div><span className="setting-icon"><Library className="size-4" /></span><div><b>{t("settings.catalog.title")}</b><small>{latestSync ? `${latestSync.status === "error" ? t("settings.catalog.needsAttention") : t("settings.catalog.connected")} · ${formatDateLocalized(latestSync.createdAt, locale) ?? t("date.unknown")}` : t("settings.catalog.bundled")}</small></div></div>{isAdmin ? <Button variant="outline" onClick={onSync} disabled={syncing}>{syncing && <Loader2 className="size-4 animate-spin" />}{t("settings.syncNow")}</Button> : <span className="setting-muted">{t("settings.adminOnly")}</span>}</div><div className="settings-card"><div><span className="setting-icon"><Clock3 className="size-4" /></span><div><b>{t("settings.schedule.title")}</b><small>{schedule?.configured ? `${schedule.enabled ? t("settings.schedule.enabled") : t("settings.schedule.disabled")}${schedule.nextExecutionAt ? ` · ${t("date.next", { date: formatDateLocalized(schedule.nextExecutionAt, locale) ?? "" })}` : ""}` : t("settings.schedule.afterPublish")}</small></div></div>{isAdmin ? <Button variant="outline" onClick={onSchedule}>{schedule?.enabled ? t("settings.schedule.stop") : t("settings.schedule.enable")}</Button> : <span className="setting-muted">{t("settings.adminOnly")}</span>}</div><div className="settings-card privacy-card"><div><span className="setting-icon"><ShieldCheck className="size-4" /></span><div><b>{t("settings.privacy.title")}</b><small>{t("settings.privacy.desc")}</small></div></div></div></section>;
}

function LoadingState() { return <div className="loading-grid">{[1, 2, 3, 4, 5, 6].map(item => <span key={item} />)}</div>; }
