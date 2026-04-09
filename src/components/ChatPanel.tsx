"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PROVIDER_COLORS } from "./shared";
import type { ModelData } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  model_id: string | null;
  updated_at: string;
  message_count: number;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface CanvasItem {
  type: "code" | "html" | "markdown";
  content: string;
  language: string;
  title: string;
}

const AUTO_MODEL: ModelData = {
  id: "auto", name: "Auto — Smart Routing", nickname: null,
  provider: "auto", modelId: "auto", contextLength: 0, tier: "large",
  supportsVision: false, supportsTools: false,
  health: { status: "available", latencyMs: 0, lastCheck: null, cooldownUntil: null },
  firstSeen: "", lastSeen: "",
};

// ─── Markdown Parser ──────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseInline(text: string): string {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code class="md-inline-code">${c}</code>`);
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
  return s;
}

function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().toLowerCase() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = esc(codeLines.join("\n"));
      out.push(
        `<pre class="md-pre" data-lang="${esc(lang)}">` +
        `<code class="language-${esc(lang)} md-code">${code}</code></pre>`
      );
      continue;
    }

    // ATX Headings
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      const level = hm[1].length;
      out.push(`<h${level} class="md-h${level}">${parseInline(hm[2])}</h${level}>`);
      i++; continue;
    }

    // Horizontal rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push('<hr class="md-hr">');
      i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        ql.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote class="md-blockquote">${ql.map(parseInline).join("<br>")}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(`<li>${parseInline(lines[i].replace(/^[-*+] /, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="md-ul">${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${parseInline(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol class="md-ol">${items.join("")}</ol>`);
      continue;
    }

    // Table (detect by pipe + next line being separator)
    if (line.includes("|") && i + 1 < lines.length && /^[\s|:_-]+$/.test(lines[i + 1])) {
      const tLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tLines.push(lines[i]);
        i++;
      }
      const parseCells = (l: string) =>
        l.split("|").slice(1, -1).map((c) => c.trim());
      const header = parseCells(tLines[0]);
      const body = tLines.slice(2).map(parseCells);
      const thead = `<thead><tr>${header.map((c) => `<th class="md-th">${parseInline(c)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${body.map((r) =>
        `<tr>${r.map((c) => `<td class="md-td">${parseInline(c)}</td>`).join("")}</tr>`
      ).join("")}</tbody>`;
      out.push(`<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // Paragraph — collect lines until block boundary
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^[-*+] /.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^> /.test(lines[i]) &&
      !/^(---+|\*\*\*+|___+)\s*$/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length > 0) {
      out.push(`<p class="md-p">${parseInline(pLines.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}

// ─── Canvas Detection ─────────────────────────────────────────────────────────

function detectCanvas(content: string): CanvasItem | null {
  // Find last code block (most likely the final/complete one)
  const codeRe = /```(\w*)\n([\s\S]*?)```/g;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(content)) !== null) last = m;
  if (last) {
    const lang = last[1].toLowerCase() || "text";
    const code = last[2];
    if (lang === "html" || code.trim().startsWith("<!DOCTYPE") || code.trim().startsWith("<html")) {
      return { type: "html", content: code, language: "html", title: "HTML Preview" };
    }
    return { type: "code", content: code, language: lang, title: `${lang} code` };
  }
  // Large markdown with structure
  if ((/^#{1,3}\s/m.test(content) || /^\|.+\|$/m.test(content)) && content.length > 300) {
    return { type: "markdown", content, language: "markdown", title: "Document Preview" };
  }
  return null;
}

// ─── Highlight.js Loader ──────────────────────────────────────────────────────

let hljsReady = false;
const hljsQueue: Array<() => void> = [];

function ensureHljs(cb: () => void) {
  if (hljsReady) { cb(); return; }
  hljsQueue.push(cb);
  if (document.getElementById("hljs-script")) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
  document.head.appendChild(link);

  const script = document.createElement("script");
  script.id = "hljs-script";
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
  script.onload = () => {
    hljsReady = true;
    hljsQueue.splice(0).forEach((fn) => fn());
  };
  document.head.appendChild(script);
}

function applyHighlight(container: HTMLElement | null) {
  if (!container) return;
  const apply = () => {
    container.querySelectorAll("pre code[class^='language-']").forEach((el) => {
      (window as { hljs?: { highlightElement: (el: Element) => void } }).hljs?.highlightElement(el as HTMLElement);
    });
  };
  ensureHljs(apply);
}

// ─── Code Block Component ─────────────────────────────────────────────────────

function CodeBlock({ code, language, onSendToCanvas }: {
  code: string; language: string; onSendToCanvas?: (item: CanvasItem) => void;
}) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => { applyHighlight(preRef.current?.parentElement ?? null); }, [code, language]);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 my-3">
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800/80 border-b border-white/10">
        <span className="text-xs font-mono text-gray-400">{language || "text"}</span>
        <div className="flex items-center gap-2">
          {onSendToCanvas && (
            <button
              onClick={() => onSendToCanvas({ type: "code", content: code, language, title: `${language} code` })}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              title="Open in canvas"
            >
              ⊞ Canvas
            </button>
          )}
          <button
            onClick={copy}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre ref={preRef} className="overflow-x-auto p-4 bg-gray-900/90 text-sm leading-relaxed m-0">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

// ─── Markdown Content ──────────────────────────────────────────────────────────

function MarkdownContent({ content, onSendToCanvas }: {
  content: string;
  onSendToCanvas?: (item: CanvasItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Split content at code fences so we can render them as CodeBlock components
  const segments = content.split(/(```\w*\n[\s\S]*?```)/g);

  const renderedSegments = segments.map((seg, idx) => {
    const fenceMatch = seg.match(/^```(\w*)\n([\s\S]*?)```$/);
    if (fenceMatch) {
      const lang = fenceMatch[1].toLowerCase() || "text";
      const code = fenceMatch[2];
      return (
        <CodeBlock
          key={idx}
          code={code}
          language={lang}
          onSendToCanvas={onSendToCanvas}
        />
      );
    }
    if (!seg.trim()) return null;
    return (
      <div
        key={idx}
        className="md-content"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(seg) }}
      />
    );
  });

  useEffect(() => { applyHighlight(containerRef.current); }, [content]);

  return <div ref={containerRef} className="text-gray-100 text-sm leading-relaxed">{renderedSegments}</div>;
}

// ─── Canvas Panel ─────────────────────────────────────────────────────────────

function CanvasPanel({ item, onClose }: { item: CanvasItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"source" | "preview">(
    item.type === "html" ? "preview" : "source"
  );
  const codeRef = useRef<HTMLDivElement>(null);

  useEffect(() => { applyHighlight(codeRef.current); }, [item]);
  useEffect(() => { setActiveTab(item.type === "html" ? "preview" : "source"); }, [item.type]);

  const copy = () => {
    navigator.clipboard.writeText(item.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <aside className="flex flex-col border-l border-white/10 bg-gray-950/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300 truncate max-w-[160px]">{item.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 uppercase tracking-wide">
            {item.language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {copied ? "✓" : "Copy"}
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">
            ×
          </button>
        </div>
      </div>

      {/* Tabs */}
      {(item.type === "html" || item.type === "markdown") && (
        <div className="flex border-b border-white/10 shrink-0">
          {item.type !== "markdown" && (
            <button
              onClick={() => setActiveTab("source")}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "source"
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Source
            </button>
          )}
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "preview"
                ? "text-indigo-400 border-b-2 border-indigo-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Preview
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Code source */}
        {item.type === "code" && (
          <div ref={codeRef} className="h-full">
            <pre className="p-4 text-sm leading-relaxed m-0 h-full overflow-auto bg-gray-900/60">
              <code className={`language-${item.language}`}>{item.content}</code>
            </pre>
          </div>
        )}

        {/* HTML source */}
        {item.type === "html" && activeTab === "source" && (
          <div ref={codeRef}>
            <pre className="p-4 text-sm leading-relaxed m-0 overflow-auto bg-gray-900/60">
              <code className="language-html">{item.content}</code>
            </pre>
          </div>
        )}

        {/* HTML preview */}
        {item.type === "html" && activeTab === "preview" && (
          <iframe
            srcDoc={item.content}
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-white"
            title="HTML Preview"
          />
        )}

        {/* Markdown preview */}
        {item.type === "markdown" && (
          <div className="p-4 md-content">
            <div
              className="md-content text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(item.content) }}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Conversation Sidebar ─────────────────────────────────────────────────────

function ConvSidebar({
  conversations, activeId, onSelect, onCreate, onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const fmt = (iso: string) => {
    const d = new Date(iso.includes("Z") ? iso : iso + "Z");
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <aside className="flex flex-col border-r border-white/10 bg-gray-950/60 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-white/10 shrink-0">
        <button
          onClick={onCreate}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-600 text-center py-6 px-3">No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group relative flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
              conv.id === activeId
                ? "bg-indigo-600/20 border-r-2 border-indigo-500"
                : "hover:bg-white/5"
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 truncate leading-snug">{conv.title}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{fmt(conv.updated_at)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 shrink-0 text-gray-600 hover:text-red-400 transition-all p-0.5"
              title="Delete"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Main ChatPanel ───────────────────────────────────────────────────────────

function getOrCreateUserId(): string {
  try {
    let uid = localStorage.getItem("bcproxy_user_id");
    if (!uid) {
      uid = "u_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem("bcproxy_user_id", uid);
    }
    return uid;
  } catch {
    return "anonymous";
  }
}

function getSidebarPref(): boolean {
  try { return localStorage.getItem("bcproxy_sidebar_open") === "true"; } catch { return false; }
}

function setSidebarPref(open: boolean) {
  try { localStorage.setItem("bcproxy_sidebar_open", open ? "true" : "false"); } catch { /* */ }
}

export function ChatPanel({ availableModels }: { availableModels: ModelData[] }) {
  const [selectedModel, setSelectedModel] = useState<ModelData>(AUTO_MODEL);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canvasItem, setCanvasItem] = useState<CanvasItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userIdRef = useRef<string>("anonymous");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Init userId + sidebar pref from localStorage (client-only)
  useEffect(() => {
    userIdRef.current = getOrCreateUserId();
    setSidebarOpen(getSidebarPref());
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const uid = userIdRef.current;
      const data = await fetch(`/api/conversations?userId=${encodeURIComponent(uid)}`).then((r) => r.json()) as Conversation[];
      setConversations(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load a specific conversation
  const loadConversation = useCallback(async (id: string) => {
    try {
      const data = await fetch(`/api/conversations/${id}`).then((r) => r.json()) as {
        messages: { id: string; role: string; content: string }[];
      };
      const msgs = (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setMessages(msgs);
      setActiveConvId(id);
      setErrorMsg(null);
      // Detect canvas content from last AI message
      const lastAI = [...msgs].reverse().find((m) => m.role === "assistant");
      if (lastAI) setCanvasItem(detectCanvas(lastAI.content));
    } catch { /* silent */ }
  }, []);

  // Create new conversation (just clears UI — DB entry created on first send)
  const startNewChat = () => {
    setMessages([]);
    setActiveConvId(null);
    setCanvasItem(null);
    setErrorMsg(null);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Delete conversation
  const deleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (activeConvId === id) startNewChat();
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  // Save messages to DB
  const saveMessages = async (convId: string, msgs: { role: string; content: string }[]) => {
    await fetch(`/api/conversations/${convId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs }),
    }).catch(() => {});
    loadConversations();
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: text };
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);
    setErrorMsg(null);

    // Ensure a conversation exists in DB
    let convId = activeConvId;
    if (!convId) {
      try {
        const title = text.slice(0, 60);
        const data = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, modelId: selectedModel.modelId, userId: userIdRef.current }),
        }).then((r) => r.json()) as { id: string };
        convId = data.id;
        setActiveConvId(convId);
      } catch { /* continue without saving */ }
    }

    abortRef.current = new AbortController();
    let finalContent = "";

    try {
      const prevMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          modelId: selectedModel.modelId,
          provider: selectedModel.provider,
          messages: [...prevMessages, { role: "user", content: text }],
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const cleaned = accumulated.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
        finalContent = cleaned;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: cleaned } : m))
        );
      }

      // Auto-detect canvas content
      const canvas = detectCanvas(finalContent);
      if (canvas) setCanvasItem(canvas);

      // Save to DB
      if (convId) {
        await saveMessages(convId, [
          { role: "user", content: text },
          { role: "assistant", content: finalContent },
        ]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg(String(err));
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const provColor = PROVIDER_COLORS[selectedModel?.provider ?? ""] ?? { text: "text-gray-300" };

  // Layout: sidebar (260px) | chat (flex-1) | canvas (360px)
  return (
    <div className="flex h-[calc(100vh-56px)] min-h-[500px] rounded-2xl overflow-hidden border border-white/10 glass">

      {/* ── Sidebar (conversations) ── */}
      <div
        className="shrink-0 transition-all duration-200 overflow-hidden"
        style={{ width: sidebarOpen ? "220px" : "0px" }}
      >
        {sidebarOpen && (
          <ConvSidebar
            conversations={conversations}
            activeId={activeConvId}
            onSelect={loadConversation}
            onCreate={startNewChat}
            onDelete={deleteConversation}
          />
        )}
      </div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-gray-900/60 shrink-0">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((o) => { setSidebarPref(!o); return !o; })}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Model selector */}
          <select
            value={selectedModel.id}
            onChange={(e) => {
              if (e.target.value === "auto") { setSelectedModel(AUTO_MODEL); return; }
              const m = availableModels.find((x) => x.id === e.target.value);
              if (m) setSelectedModel(m);
            }}
            className="flex-1 bg-gray-800/60 text-gray-200 text-xs rounded-lg px-3 py-1.5 border border-gray-700/60 focus:outline-none focus:border-indigo-500"
          >
            <option value="auto">⚡ Auto — Smart Routing</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
            ))}
          </select>

          {selectedModel.id !== "auto" && (
            <span className={`text-xs shrink-0 ${provColor.text}`}>{selectedModel.provider}</span>
          )}

          {/* Canvas toggle */}
          <button
            onClick={() => setCanvasItem(canvasItem ? null : canvasItem)}
            className={`p-1.5 rounded-lg text-xs transition-colors ${
              canvasItem ? "text-indigo-400 bg-indigo-500/10" : "text-gray-600 hover:text-gray-300"
            }`}
            title="Toggle canvas"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-400 font-medium text-sm">Start a conversation</p>
                <p className="text-gray-600 text-xs mt-1">Using {selectedModel.name}</p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <span className="text-xs font-bold text-indigo-400">AI</span>
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600/70 text-white text-sm leading-relaxed rounded-br-sm"
                    : "glass-bright text-gray-100 rounded-bl-sm"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                ) : msg.content ? (
                  <MarkdownContent
                    content={msg.content}
                    onSendToCanvas={setCanvasItem}
                  />
                ) : isLoading ? (
                  <span className="flex gap-1 py-1">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}

          {errorMsg && (
            <div className="text-center text-red-400 text-xs py-2 px-4 glass rounded-lg">
              {errorMsg}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 p-3 border-t border-white/10 bg-gray-900/50">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Generating..." : "Message AI (Enter to send, Shift+Enter for new line)"}
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-gray-800/70 text-gray-100 text-sm rounded-xl px-4 py-3 border border-gray-700/60 focus:outline-none focus:border-indigo-500 placeholder-gray-600 disabled:opacity-50 resize-none leading-relaxed"
              style={{ minHeight: "48px", maxHeight: "160px" }}
            />
            {isLoading ? (
              <button
                onClick={stopStreaming}
                className="px-4 py-3 rounded-xl bg-red-600/80 hover:bg-red-500 text-white transition-colors shrink-0"
                title="Stop generating"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => void sendMessage()}
                disabled={!input.trim()}
                className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white shrink-0"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-700 mt-1.5 text-center">
            AI can make mistakes. Canvas opens automatically for code & documents.
          </p>
        </div>
      </div>

      {/* ── Canvas panel ── */}
      {canvasItem && (
        <div className="shrink-0 w-[360px] min-w-0 flex overflow-hidden border-l border-white/10">
          <CanvasPanel item={canvasItem} onClose={() => setCanvasItem(null)} />
        </div>
      )}
    </div>
  );
}
