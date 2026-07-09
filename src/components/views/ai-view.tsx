"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sparkles, Send, User, Trash2, Lightbulb, RefreshCw, Info,
  Star, FileText, Search, BarChart3, AlertTriangle, Building2,
  ChevronDown, MessageSquare, Bot,
} from "lucide-react";
import { toast } from "sonner";

/* ---------- Types ---------- */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO
  error?: boolean;
}

const STORAGE_KEY = "myfng-misa-conversation";

/* ---------- Static data ---------- */

const SUGGESTED_PROMPTS = [
  "Draft a reply to a 2-star review about delay",
  "Generate a monsoon offer post for Pune",
  "Which locations need attention this week?",
  "Summarize Mumbai's performance this month",
];

const QUICK_PROMPTS = [
  "Draft a reply to a 2-star review about delay",
  "Generate a monsoon offer post for Pune",
  "Which locations need attention this week?",
  "Summarize Mumbai's performance this month",
  "Write a business description for a new Thane car service centre",
  "Suggest 3 SEO keywords for car service in Pune",
];

const CAPABILITIES: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  { icon: Star, title: "Draft review replies", desc: "Empathetic, on-brand replies in seconds." },
  { icon: FileText, title: "Generate Google Posts", desc: "Offers, events & updates for any location." },
  { icon: Search, title: "SEO recommendations", desc: "Interpret rankings & next steps per city." },
  { icon: BarChart3, title: "Monthly performance summary", desc: "Plain-English recap of metrics that matter." },
  { icon: AlertTriangle, title: "Surface locations needing attention", desc: "Flag dips in rating, sync errors, drops." },
  { icon: Building2, title: "Business description writing", desc: "SEO-friendly copy for new locations." },
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

/* ---------- Component ---------- */

export function AiView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [mobileCapsOpen, setMobileCapsOpen] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const lastInputRef = React.useRef<string>(""); // for retry

  // Hydrate from localStorage once on mount
  React.useEffect(() => {
    setMessages(loadMessages());
  }, []);

  // Persist on change
  React.useEffect(() => {
    saveMessages(messages);
  }, [messages]);

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
    if (!trimmed || loading) return;

    lastInputRef.current = trimmed;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const payload = {
        action: "chat" as const,
        messages: nextMessages
          .filter((m) => m.content.trim() && !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      };
      const data = await api<{ reply: string }>("/api/ai", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const aiMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.reply || "Here's what I'd suggest…",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "I couldn't process that. Please try again.",
        createdAt: new Date().toISOString(),
        error: true,
      };
      setMessages((prev) => [...prev, errMsg]);
      toast.error(e?.message || "MiSA AI request failed");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="MiSA AI Assistant"
        description="Your MyFNG operations assistant — draft replies, plan posts, interpret SEO & summarise performance."
        icon={Sparkles}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasMessages || loading}
          >
            <Trash2 className="size-3.5 mr-1.5" /> Clear chat
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {/* ---------- Left: Chat panel ---------- */}
        <Card className="lg:col-span-2 flex flex-col h-[calc(100vh-12rem)] min-h-[520px] overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b bg-gradient-to-r from-amber-500/5 to-transparent">
            <div className="size-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">MiSA AI</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> online
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">Your MyFNG operations assistant</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleClear}
              disabled={!hasMessages || loading}
              aria-label="Clear chat"
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline ml-1.5">Clear</span>
            </Button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto scroll-area px-3 sm:px-5 py-4 space-y-4"
          >
            {!hasMessages ? (
              <WelcomeCard onPick={pickPrompt} />
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
          <div className="border-t bg-card/50 p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask MiSA AI to draft a reply, plan a post, interpret SEO…"
                className="resize-none min-h-[44px] max-h-[150px] bg-background"
                rows={1}
                disabled={loading}
                aria-label="Message MiSA AI"
              />
              <Button
                size="icon"
                onClick={() => sendMessage(input)}
                disabled={!canSend}
                className="size-10 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Info className="size-3" />
                Enter to send · Shift+Enter for newline
              </span>
              <span className="hidden sm:inline">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </Card>

        {/* ---------- Right: Capabilities panel ---------- */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          {/* Desktop: always visible. Mobile: collapsible */}
          <Collapsible open={mobileCapsOpen} onOpenChange={setMobileCapsOpen} className="lg:block">
            <div className="lg:hidden mb-2">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Lightbulb className="size-3.5 mr-1.5" />
                  {mobileCapsOpen ? "Hide MiSA AI guide" : "Show MiSA AI guide"}
                  <ChevronDown className={cn("size-3.5 ml-1.5 transition-transform", mobileCapsOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="lg:block">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="size-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Sparkles className="size-4" />
                    </div>
                    <h3 className="text-sm font-semibold">What MiSA AI can do</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Six core capabilities to accelerate MyFNG operations.
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
                    <Lightbulb className="size-4 text-amber-500" />
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

                  <Separator className="my-4" />

                  <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                    <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                      MiSA AI responses require review before publishing. All requests are logged for audit.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function WelcomeCard({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-8 sm:py-12">
      <div className="size-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/20 mb-4">
        <Sparkles className="size-8" />
      </div>
      <h3 className="text-lg font-semibold">Hi, I'm MiSA AI</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        I help the MyFNG team manage reviews, posts, SEO and performance across all 15 locations.
        Ask me anything, or start with one of these:
      </p>
      <div className="mt-5 flex flex-wrap gap-2 justify-center max-w-lg">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="text-xs sm:text-sm rounded-full border border-border bg-background px-3.5 py-2 text-left hover:bg-accent hover:border-primary/40 hover:text-primary transition"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageSquare className="size-3.5" />
        Powered by MyFNG · glm-4.6
      </div>
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
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div
        className={cn(
          "size-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          isUser
            ? "bg-primary/10 text-primary"
            : "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
        )}
      >
        {isUser ? <User className="size-4" /> : <Sparkles className="size-4" />}
      </div>

      {/* Bubble + meta */}
      <div className={cn("flex flex-col max-w-[85%] sm:max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
            isUser
              ? "bg-emerald-600 text-white rounded-tr-sm"
              : message.error
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-tl-sm"
                : "bg-card border rounded-tl-sm",
          )}
        >
          {message.content}
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
          {!isUser && !message.error && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              <Bot className="size-2.5" /> MiSA AI
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="size-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shrink-0 mt-0.5">
        <Sparkles className="size-4" />
      </div>
      <div className="flex flex-col items-start max-w-[75%]">
        <div className="rounded-2xl rounded-tl-sm bg-card border px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">MiSA AI is typing</span>
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
      className="size-1.5 rounded-full bg-amber-500 animate-bounce"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
