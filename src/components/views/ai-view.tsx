"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Bot, Send, User, Trash2, Lightbulb, RefreshCw,
  Star, FileText, Search, BarChart3, AlertTriangle, Building2,
  ChevronDown, MessageSquare, Cpu, Eye, PanelRight, Sparkles, Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  AUTO_MODEL_ID,
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
  getOpenRouterModelLabel,
  type OpenRouterModel,
} from "@/lib/openrouter-models";
import { consumeMisaPendingPrompt } from "@/lib/misa-handoff";

const MISA_AVATAR =
  "bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white shadow-sm shadow-[#0047AB]/20";

/* ---------- Types ---------- */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO
  error?: boolean;
  model?: string;
}

const STORAGE_KEY = "myfng-misa-conversation";
const MODEL_STORAGE_KEY = "myfng-misa-model";

const MODEL_OPTIONS: OpenRouterModel[] = [
  {
    id: AUTO_MODEL_ID,
    label: "Auto (best available)",
    provider: "OpenRouter",
    free: true,
    description: "Tries free models until one responds",
  },
  ...OPENROUTER_MODELS,
];

/* ---------- Static data ---------- */

const SUGGESTED_PROMPTS = [
  "Aaj kitne reviews aaye? Overall aur location-wise batao",
  "Kaunsi locations ko abhi attention chahiye?",
  "Next 7 days ka forecast batao - search views aur calls",
  "Mumbai ka is mahine ka performance summarize karo",
];

const QUICK_PROMPTS = [
  "Aaj kitne reviews aaye? Overall aur location-wise batao",
  "Pending review replies kitne hain, especially negative?",
  "Kaunsi locations ko abhi attention chahiye?",
  "Next 7 days reviews, search views aur calls ka forecast",
  "Last 30 days vs previous 30 days analytics compare karo",
  "Top SEO keywords aur average rank kya hai?",
  "2-star delay review ka reply draft karo",
  "Pune ke liye monsoon offer post generate karo",
];

const CAPABILITIES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: BarChart3, title: "Live dashboard intelligence", desc: "Answers from real MyFNG DB data - not guesses." },
  { icon: Star, title: "Reviews A-Z", desc: "Today / week / month counts, ratings, pending replies." },
  { icon: Search, title: "SEO & keywords", desc: "Ranks, audits, competitor gaps from live data." },
  { icon: FileText, title: "Content & posts", desc: "Draft posts plus live draft/scheduled/published stats." },
  { icon: AlertTriangle, title: "Predict & forecast", desc: "7-day projections from last 14 days of trends." },
  { icon: Building2, title: "Full menu access", desc: "Locations, media, products, clients, alerts, reports." },
];

/* ---------- Helpers ---------- */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((m) => m && m.id && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
  } catch {
    return [];
  }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
  } catch {
    /* ignore quota errors */
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ---------- Live Preview parser ---------- */

interface PreviewTable {
  title?: string;
  headers: string[];
  rows: string[][];
}

interface PreviewPayload {
  title: string;
  summary: string;
  metrics: { label: string; value: string }[];
  tables: PreviewTable[];
  bullets: string[];
  question?: string;
  hasStructure: boolean;
}

function stripMdInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*#+\s*/, "")
    .trim();
}

/** Fix common free-model table issues so GFM can parse them */
function normalizeMisaMarkdown(raw: string): string {
  // Em/en dashes → simple hyphen (UI + model often emit -)
  const cleaned = raw.replace(/\u2014|\u2013/g, "-");
  const lines = cleaned.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    out.push(line);
    const isPipeRow = /^\s*\|.+\|\s*$/.test(line);
    const nextIsPipe = /^\s*\|.+\|\s*$/.test(next);
    const nextIsSep = /^\s*\|?\s*:?-{3,}/.test(next);
    if (isPipeRow && nextIsPipe && !nextIsSep) {
      const cols = line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cols.length > 0) {
        out.push(`| ${cols.map(() => "---").join(" | ")} |`);
      }
    }
  }
  return out.join("\n");
}

function parseMarkdownTables(content: string): PreviewTable[] {
  const lines = normalizeMisaMarkdown(content).replace(/\r\n/g, "\n").split("\n");
  const tables: PreviewTable[] = [];
  let i = 0;
  let lastHeading = "";

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (heading) {
      lastHeading = stripMdInline(heading[2] ?? "");
      i++;
      continue;
    }
    // Bold-only title line before a table (common MiSA pattern)
    const boldTitle = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (boldTitle) {
      lastHeading = stripMdInline(boldTitle[1] ?? "");
      i++;
      continue;
    }

    if (!/^\s*\|.+\|\s*$/.test(line)) {
      i++;
      continue;
    }

    const block: string[] = [];
    while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i] ?? "")) {
      block.push(lines[i]!.trim());
      i++;
    }
    if (block.length < 2) continue;

    const splitRow = (row: string) =>
      row
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => stripMdInline(c));

    const isSep = (row: string) => /^\|?\s*:?-{3,}/.test(row);
    let headerIdx = 0;
    let dataStart = 1;
    if (block.length >= 2 && isSep(block[1]!)) {
      headerIdx = 0;
      dataStart = 2;
    } else if (block.length >= 3 && isSep(block[2]!)) {
      headerIdx = 1;
      dataStart = 3;
      lastHeading = lastHeading || stripMdInline(splitRow(block[0]!).join(" "));
    }

    const headers = splitRow(block[headerIdx]!);
    const rows = block
      .slice(dataStart)
      .filter((r) => !isSep(r))
      .map(splitRow)
      .filter((r) => r.some((c) => c.length > 0));

    if (headers.length && rows.length) {
      tables.push({ title: lastHeading || undefined, headers, rows });
      lastHeading = "";
    }
  }
  return tables;
}

function parseAssistantPreview(content: string, question?: string): PreviewPayload {
  const normalized = normalizeMisaMarkdown(content);
  const tables = parseMarkdownTables(normalized);
  const lines = normalized.replace(/\r\n/g, "\n").split("\n");

  let title = "";
  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
    if (h) {
      title = stripMdInline(h[1] ?? "");
      break;
    }
  }
  if (!title && question) title = question.length > 72 ? `${question.slice(0, 72)}…` : question;
  if (!title) title = "MiSA Preview";

  const bullets = lines
    .map((l) => l.match(/^\s*[-*•]\s+(.+)$/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(stripMdInline)
    .slice(0, 8);

  let summary = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("|") || /^[-*•]/.test(t) || /^-{3,}$/.test(t)) continue;
    summary = stripMdInline(t);
    break;
  }

  const metrics: { label: string; value: string }[] = [];
  const boldNums = [...content.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!.trim());
  for (const b of boldNums) {
    if (/^\d[\d,]*(?:\.\d+)?%?$/.test(b) || /^\d+\s*\/\s*\d+/.test(b)) {
      metrics.push({ label: "Key figure", value: b });
    }
    if (metrics.length >= 4) break;
  }
  // Relabel first few metrics from nearby context when possible
  const metricHints = [
    { re: /reviews?/i, label: "Reviews" },
    { re: /rating/i, label: "Rating" },
    { re: /pending/i, label: "Pending" },
    { re: /search/i, label: "Search" },
    { re: /call/i, label: "Calls" },
  ];
  metrics.forEach((m, idx) => {
    const nearby = content.slice(Math.max(0, content.indexOf(`**${m.value}**`) - 40), content.indexOf(`**${m.value}**`) + 40);
    const hint = metricHints.find((h) => h.re.test(nearby));
    if (hint) m.label = hint.label;
    else if (idx === 0 && /total|overall|kitne|count/i.test(summary)) m.label = "Total";
  });

  return {
    title,
    summary,
    metrics,
    tables,
    bullets,
    question,
    hasStructure: tables.length > 0 || bullets.length > 0 || metrics.length > 0,
  };
}

/** Structured markdown renderer - tables, headings, lists, bold */
function MisaMarkdown({ content, tone = "assistant" }: { content: string; tone?: "assistant" | "user" | "error" }) {
  const isUser = tone === "user";
  const md = React.useMemo(() => normalizeMisaMarkdown(content), [content]);
  return (
    <div
      className={cn(
        "misa-md text-sm leading-relaxed",
        isUser && "text-white [&_strong]:text-white [&_a]:text-white/90 [&_thead]:bg-white/15",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="text-base font-semibold text-[#0047AB] dark:text-[#0096FF] mt-3 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="text-[15px] font-semibold text-[#0047AB] dark:text-[#0096FF] mt-3 mb-2 first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mt-3 mb-1.5 first:mt-0">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h5 className="text-sm font-medium text-foreground mt-2 mb-1 first:mt-0">{children}</h5>
          ),
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className={cn("font-semibold", !isUser && "text-foreground")}>{children}</strong>
          ),
          em: ({ children }) => <em className="italic opacity-90">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-2 space-y-1.5 list-disc pl-5 marker:text-[#0096FF]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1.5 list-decimal pl-5 marker:text-[#0047AB] dark:marker:text-[#0096FF]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-snug pl-0.5">{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#0047AB] dark:text-[#0096FF] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-[#0047AB]/15" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[#0096FF] pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.includes("language-")) || String(children).includes("\n");
            if (isBlock) {
              return (
                <code
                  className="block my-2 overflow-x-auto rounded-lg bg-muted/80 border border-border/60 px-3 py-2 text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1 py-0.5 text-[12px] font-mono text-[#0047AB] dark:text-[#0096FF]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-[#0047AB]/15 shadow-sm">
              <table className="w-full min-w-[420px] border-collapse text-xs sm:text-[13px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody className="bg-background/80">{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border/60 last:border-0 even:bg-[#0047AB]/[0.03]">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 align-top text-foreground/90">{children}</td>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}

/* ---------- Component ---------- */

export function AiView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [mobileCapsOpen, setMobileCapsOpen] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_OPENROUTER_MODEL);
  const [lastUsedModel, setLastUsedModel] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const lastInputRef = React.useRef<string>(""); // for retry
  const messagesRef = React.useRef<ChatMessage[]>([]);

  const hydratedRef = React.useRef(false);
  const sendingRef = React.useRef(false);
  const selectedModelRef = React.useRef(selectedModel);
  selectedModelRef.current = selectedModel;

  // Hydrate from localStorage once on mount
  React.useEffect(() => {
    const loaded = loadMessages();
    messagesRef.current = loaded;
    setMessages(loaded);
    try {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved && MODEL_OPTIONS.some((m) => m.id === saved)) {
        setSelectedModel(saved);
      }
    } catch {
      /* ignore */
    }
    hydratedRef.current = true;
  }, []);

  // Persist on change
  React.useEffect(() => {
    messagesRef.current = messages;
    if (!hydratedRef.current) return;
    saveMessages(messages);
  }, [messages]);

  React.useEffect(() => {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
    } catch {
      /* ignore */
    }
  }, [selectedModel]);

  // Auto-scroll to bottom on new message / loading change
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-grow textarea up to ~5 lines
  React.useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxHeight = 5 * 24 + 24; // ~5 lines + padding
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }, [input]);

  const canSend = input.trim().length > 0 && !loading;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sendingRef.current) return;

    sendingRef.current = true;
    lastInputRef.current = trimmed;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    // Build payload from ref — never rely on setState updater timing (was sending [])
    const nextMessages = [...messagesRef.current, userMsg];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const history = nextMessages
        .filter((m) => m.content.trim() && !m.error)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = {
        action: "chat" as const,
        model: selectedModelRef.current,
        messages: history,
        message: trimmed,
      };
      const data = await api<{ reply: string; model?: string }>("/api/ai", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data.model) setLastUsedModel(data.model);
      const aiMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.reply || "Here's what I'd suggest…",
        createdAt: new Date().toISOString(),
        model: data.model,
      };
      messagesRef.current = [...messagesRef.current, aiMsg];
      setMessages(messagesRef.current);
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "I couldn't process that. Please try again.",
        createdAt: new Date().toISOString(),
        error: true,
      };
      messagesRef.current = [...messagesRef.current, errMsg];
      setMessages(messagesRef.current);
      toast.error(e?.message || "MiSA AI request failed");
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  // Dashboard / other pages can stash a prompt → auto-send after hydrate
  React.useEffect(() => {
    const pending = consumeMisaPendingPrompt();
    if (!pending) return;
    const t = setTimeout(() => sendMessage(pending), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  function handleRetry() {
    // Remove the last error message and resend the last user input
    const lastInput = lastInputRef.current;
    if (!lastInput) return;
    setMessages((prev) => {
      const withoutLastErr = prev[prev.length - 1]?.error ? prev.slice(0, -1) : prev;
      return withoutLastErr;
    });
    // small timeout so state update flushes before sending
    setTimeout(() => sendMessage(lastInput), 0);
  }

  function handleClear() {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    toast.success("Conversation cleared");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) sendMessage(input);
    }
  }

  function pickPrompt(prompt: string) {
    setInput(prompt);
    // focus + send
    setTimeout(() => {
      sendMessage(prompt);
      setInput("");
    }, 0);
  }

  const hasMessages = messages.length > 0;

  const preview = React.useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.error);
    if (!lastAssistant) return null;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return parseAssistantPreview(lastAssistant.content, lastUser?.content);
  }, [messages]);

  const [sideTab, setSideTab] = React.useState<"preview" | "guide">("preview");

  React.useEffect(() => {
    if (preview) setSideTab("preview");
  }, [preview?.title, preview?.hasStructure, messages.length]);

  const sidePanel = (
    <Card className="misa-shell overflow-hidden h-full max-h-[calc(100vh-11.5rem)] flex flex-col">
      <div className="px-4 pt-4 pb-2 border-b border-[#0096FF]/15 bg-gradient-to-r from-[#0047AB]/[0.08] via-[#0096FF]/[0.05] to-transparent shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="size-6 rounded-md bg-[linear-gradient(135deg,#0047AB,#0096FF)] text-white flex items-center justify-center">
            <Sparkles className="size-3.5" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-[#0047AB] dark:text-[#0096FF]">
            MiSA Workspace
          </span>
        </div>
        <Tabs value={sideTab} onValueChange={(v) => setSideTab(v as "preview" | "guide")}>
          <TabsList className="w-full grid grid-cols-2 h-9 bg-[#0047AB]/[0.06]">
            <TabsTrigger value="preview" className="text-xs gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#0047AB] dark:data-[state=active]:bg-card">
              <Eye className="size-3.5" /> Preview
            </TabsTrigger>
            <TabsTrigger value="guide" className="text-xs gap-1.5 data-[state=active]:bg-white data-[state=active]:text-[#0047AB] dark:data-[state=active]:bg-card">
              <Lightbulb className="size-3.5" /> Guide
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
        {sideTab === "preview" ? (
          <LivePreviewPanel
            preview={preview}
            loading={loading}
            onPickPrompt={pickPrompt}
          />
        ) : (
          <div className="p-5 overflow-y-auto max-h-[calc(100vh-16rem)] scroll-area">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-md bg-[#0047AB]/10 text-[#0047AB] dark:text-[#0096FF] flex items-center justify-center">
                <Bot className="size-4" />
              </div>
              <h3 className="text-sm font-semibold">MiSA kya kar sakti hai</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Answers ka structured showcase Preview tab mein aata hai.
            </p>

            <div className="space-y-3">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="flex items-start gap-3">
                  <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <c.icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{c.title}</div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="size-4 text-[#0096FF]" />
              <h4 className="text-sm font-semibold">Quick prompts</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pickPrompt(p)}
                  disabled={loading}
                  className="text-xs rounded-full border border-border bg-background px-3 py-1.5 text-left hover:bg-accent hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="misa-page p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="MiSA AI"
        description="MyFNG Instant Service Assistant - live data, Hinglish chat, forecasts aur on-brand drafts."
        icon={Bot}
        accent="cyan"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasMessages || loading}
            className="border-[#0096FF]/30 bg-white/70 backdrop-blur-sm hover:bg-white hover:border-[#0096FF]/50"
          >
            <Trash2 className="size-3.5 mr-1.5" /> Clear chat
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] gap-4 lg:gap-5 items-start">
        {/* ---------- Left: Chat panel ---------- */}
        <Card className="misa-shell flex flex-col h-[calc(100vh-11.5rem)] min-h-[560px] overflow-hidden">
          {/* Chat header */}
          <div className="relative flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[#0096FF]/15 overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 opacity-90"
              style={{
                background:
                  "linear-gradient(105deg, rgb(0 71 171 / 0.12) 0%, rgb(0 150 255 / 0.08) 45%, transparent 75%)",
              }}
            />
            <div className="relative size-11 rounded-xl flex items-center justify-center shrink-0 bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white shadow-md shadow-[#0096FF]/30">
              <Bot className="size-5" />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[#0096FF] ring-2 ring-white dark:ring-card animate-pulse" />
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold tracking-tight misa-shimmer-text">MiSA AI</h2>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#0096FF]/12 border border-[#0096FF]/20 px-2 py-0.5 text-[10px] font-medium text-[#0047AB] dark:text-[#0096FF]">
                  <Zap className="size-2.5" /> Live data
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                Instant Service Assistant · grounded on your dashboard
              </p>
            </div>
            <div className="relative flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
                disabled={loading}
              >
                <SelectTrigger
                  size="sm"
                  className="h-9 flex-1 sm:flex-none sm:w-[210px] text-xs bg-white/80 dark:bg-card/80 border-[#0096FF]/20 backdrop-blur-sm"
                  aria-label="Select AI model"
                >
                  <Cpu className="size-3.5 text-[#0096FF] shrink-0" />
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent align="end">
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label}{m.free ? " · free" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="misa-chat-canvas flex-1 overflow-y-auto scroll-area px-3 sm:px-5 py-5 space-y-5"
          >
            {!hasMessages ? (
              <WelcomeCard onPick={pickPrompt} selectedModel={selectedModel} />
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onRetry={handleRetry}
                />
              ))
            )}

            {loading && <TypingIndicator />}
          </div>

          {/* Input */}
          <div className="border-t border-[#0096FF]/15 bg-gradient-to-t from-[#0047AB]/[0.04] to-background/95 backdrop-blur-md p-3 sm:p-4">
            <div className="misa-composer flex items-end gap-2 rounded-2xl border border-[#0047AB]/15 bg-white/90 dark:bg-card/90 p-2 shadow-sm transition-shadow duration-200">
              <div className="hidden sm:flex size-9 mb-0.5 rounded-xl items-center justify-center shrink-0 bg-[#0047AB]/8 text-[#0047AB] dark:text-[#0096FF]">
                <Sparkles className="size-4" />
              </div>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hinglish mein poocho - reviews, locations, SEO, forecast…"
                className="resize-none min-h-[44px] max-h-[150px] border-0 bg-transparent shadow-none focus-visible:ring-0"
                rows={1}
                disabled={loading}
                aria-label="Message MiSA AI"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!canSend}
                className={cn(
                  "size-10 shrink-0 rounded-xl text-white shadow-md transition-all",
                  canSend
                    ? "bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] hover:brightness-110 shadow-[#0096FF]/35"
                    : "bg-[#0047AB]/40",
                )}
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground px-1">
              <span className="truncate inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[#0096FF]/70" />
                Enter to send · Shift+Enter newline
              </span>
              <span className="shrink-0 tabular-nums">
                {lastUsedModel ? getOpenRouterModelLabel(lastUsedModel) : getOpenRouterModelLabel(selectedModel)}
                {" · "}
                {messages.length} msg
              </span>
            </div>
          </div>
        </Card>

        {/* Desktop / tablet: always-visible Live Preview */}
        <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
          {sidePanel}
        </aside>

        {/* Mobile: collapsible preview */}
        <div className="lg:hidden space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setMobileCapsOpen((o) => !o)}
          >
            <PanelRight className="size-3.5 mr-1.5" />
            {mobileCapsOpen ? "Hide preview panel" : "Show Live Preview"}
            <ChevronDown className={cn("size-3.5 ml-1.5 transition-transform", mobileCapsOpen && "rotate-180")} />
          </Button>
          {mobileCapsOpen && sidePanel}
        </div>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function LivePreviewPanel({
  preview,
  loading,
  onPickPrompt,
}: {
  preview: PreviewPayload | null;
  loading: boolean;
  onPickPrompt: (p: string) => void;
}) {
  if (loading && !preview) {
    return (
      <div className="p-5 space-y-3">
        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-16 rounded-xl bg-muted animate-pulse" />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="p-5 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-8 -right-8 size-32 rounded-full blur-2xl opacity-40"
          style={{ background: "radial-gradient(circle, #0096FF, transparent 70%)" }}
        />
        <div className={cn("relative size-12 rounded-xl flex items-center justify-center mb-3", MISA_AVATAR)}>
          <Eye className="size-6" />
        </div>
        <h3 className="relative text-sm font-semibold">Live Preview</h3>
        <p className="relative text-xs text-muted-foreground mt-1.5 leading-relaxed">
          Jab tum MiSA se kuch poochoge, yahan tables, metrics aur key points structured UI mein dikhenge.
        </p>
        <div className="relative mt-4 space-y-2">
          {SUGGESTED_PROMPTS.slice(0, 3).map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => onPickPrompt(p)}
              className="misa-chip-in w-full text-left text-xs rounded-xl border border-[#0047AB]/12 bg-white/70 dark:bg-card/60 px-3 py-2.5 hover:border-[#0096FF]/45 hover:bg-[#0096FF]/[0.06] hover:shadow-sm transition"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-h-[calc(100vh-14rem)] overflow-y-auto scroll-area">
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PanelRight className="size-3.5 text-[#0047AB] dark:text-[#0096FF]" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0047AB] dark:text-[#0096FF]">
              Live Preview
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-snug text-foreground">{preview.title}</h3>
          {preview.question && (
            <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2 rounded-md bg-muted/50 px-2 py-1.5">
              Q: {preview.question}
            </p>
          )}
        </div>

        {preview.summary && (
          <p className="text-xs leading-relaxed text-foreground/85 border-l-2 border-[#0096FF] pl-3">
            {preview.summary}
          </p>
        )}

        {preview.metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {preview.metrics.map((m, i) => (
              <div
                key={`${m.label}-${i}`}
                className="rounded-xl border border-[#0047AB]/15 bg-gradient-to-br from-[#0047AB]/[0.06] to-transparent px-3 py-2.5"
              >
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</div>
                <div className="text-lg font-bold tabular-nums text-[#0047AB] dark:text-[#0096FF] mt-0.5">
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {preview.tables.map((table, ti) => (
          <div key={ti} className="rounded-xl border border-[#0047AB]/15 overflow-hidden shadow-sm">
            {table.title && (
              <div className="px-3 py-2 text-xs font-semibold bg-[#0047AB]/[0.06] border-b border-[#0047AB]/10">
                {table.title}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white">
                    {table.headers.map((h, hi) => (
                      <th key={hi} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-b border-border/50 last:border-0 even:bg-[#0047AB]/[0.03]"
                    >
                      {table.headers.map((_, ci) => (
                        <td key={ci} className="px-2.5 py-2 align-top text-foreground/90">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {preview.bullets.length > 0 && (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Key points
            </div>
            <ul className="space-y-1.5">
              {preview.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-xs leading-snug">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#0096FF]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!preview.hasStructure && (
          <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Is reply mein table/metrics nahi mile - chat bubble mein full answer dekho. Structured tables ke liye location/SEO style sawal poocho.
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeCard({
  onPick,
  selectedModel,
}: {
  onPick: (p: string) => void;
  selectedModel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-10 sm:py-14 px-2">
      <div className="relative mb-6">
        <span className="misa-orb-ring" />
        <span className="misa-orb-ring misa-orb-ring-delay" />
        <div
          className={cn(
            "misa-orb relative size-[4.75rem] rounded-2xl flex items-center justify-center",
            MISA_AVATAR,
            "shadow-xl shadow-[#0096FF]/30",
          )}
        >
          <Bot className="size-9" />
          <Sparkles className="absolute -right-1.5 -top-1.5 size-4 text-[#0096FF] drop-shadow-sm" />
        </div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0096FF] mb-2">
        Instant Service Assistant
      </p>
      <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">
        Namaste, main <span className="misa-shimmer-text">MiSA AI</span> hoon
      </h3>
      <p className="text-sm text-muted-foreground mt-2.5 max-w-md leading-relaxed">
        Live MyFNG dashboard padh ke real numbers, forecasts aur on-brand drafts deta/deti hoon.
        Hinglish mein baat karo.
      </p>
      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg text-left">
        {SUGGESTED_PROMPTS.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="misa-chip-in group text-xs sm:text-[13px] rounded-xl border border-[#0047AB]/12 bg-white/80 dark:bg-card/70 px-3.5 py-3.5 text-left shadow-sm hover:border-[#0096FF]/45 hover:bg-[#0096FF]/[0.06] hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#0096FF]/15 transition-all duration-200"
            style={{ animationDelay: `${80 + i * 70}ms` }}
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#0096FF] mb-1">
              <Sparkles className="size-3 opacity-80 group-hover:opacity-100" /> Try
            </span>
            <span className="block leading-snug text-foreground/90">{p}</span>
          </button>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border border-[#0047AB]/10 bg-white/60 dark:bg-card/50 px-3 py-1.5">
        <Cpu className="size-3.5 text-[#0096FF]" />
        Using <span className="font-medium text-foreground">{getOpenRouterModelLabel(selectedModel)}</span>
        {" · "}model header se change karo
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("misa-msg-in flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm",
          isUser
            ? "bg-[#0047AB]/12 text-[#0047AB] dark:text-[#0096FF]"
            : MISA_AVATAR,
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div className={cn("flex flex-col max-w-[92%] sm:max-w-[85%]", isUser ? "items-end" : "items-start")}>
        {!isUser && !message.error && (
          <div className="flex items-center gap-1.5 mb-1 px-1">
            <span className="text-[11px] font-medium text-[#0047AB] dark:text-[#0096FF]">MiSA AI</span>
            {message.model && (
              <span className="text-[10px] text-muted-foreground">
                · {getOpenRouterModelLabel(message.model)}
              </span>
            )}
          </div>
        )}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-3 text-sm leading-relaxed break-words overflow-hidden",
            isUser
              ? "bg-[linear-gradient(135deg,#0047AB_0%,#0066d6_100%)] text-white rounded-tr-md shadow-md shadow-[#0047AB]/20"
              : message.error
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-tl-md"
                : "bg-white/90 dark:bg-card/90 border border-[#0047AB]/12 shadow-sm shadow-[#0047AB]/[0.06] rounded-tl-md w-full backdrop-blur-sm",
          )}
        >
          {isUser || message.error ? (
            <MisaMarkdown content={message.content} tone={message.error ? "error" : "user"} />
          ) : (
            <MisaMarkdown content={message.content} tone="assistant" />
          )}
        </div>

        <div className={cn("flex items-center gap-2 mt-1 px-1", isUser ? "flex-row-reverse" : "flex-row")}>
          <span className="text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
          {message.error && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] font-medium text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-0.5"
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="misa-msg-in flex gap-2.5">
      <div className={cn("size-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 relative", MISA_AVATAR)}>
        <Bot className="size-4" />
        <span className="absolute inset-0 rounded-xl ring-2 ring-[#0096FF]/40 animate-ping opacity-40" />
      </div>
      <div className="flex flex-col items-start max-w-[75%]">
        <div className="text-[11px] font-medium text-[#0047AB] dark:text-[#0096FF] mb-1 px-1 inline-flex items-center gap-1">
          MiSA AI <Sparkles className="size-3 text-[#0096FF]" />
        </div>
        <div className="rounded-2xl rounded-tl-md bg-white/90 dark:bg-card/90 border border-[#0096FF]/25 shadow-sm shadow-[#0096FF]/10 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Live data scan kar rahi hoon</span>
            <span className="flex gap-1">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 rounded-full bg-[#0096FF] animate-bounce"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
