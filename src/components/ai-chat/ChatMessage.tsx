"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Wrench, BookOpenCheck, BarChart3, Brain } from "lucide-react";
import type { AiMessage } from "@/lib/ai-store";
import { toolLabel } from "./tool-labels";
import React from "react";

interface SourceRef {
  type: "OSINT" | "KB" | "LLM";
  label: string;
}

const SOURCE_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  OSINT: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    icon: <BarChart3 className="h-3 w-3" />,
  },
  KB: {
    bg: "bg-green-100",
    text: "text-green-700",
    icon: <BookOpenCheck className="h-3 w-3" />,
  },
  LLM: {
    bg: "bg-neutral-100",
    text: "text-neutral-500",
    icon: <Brain className="h-3 w-3" />,
  },
};

/**
 * Parse source markers like 【OSINT: Bain Spans & Layers】 from text
 */
function parseSourceMarkers(text: string): SourceRef[] {
  const regex = /【(OSINT|KB|LLM)(?::?\s*([^】]*))?】/g;
  const sources: SourceRef[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = regex.exec(text)) !== null) {
    const type = match[1] as "OSINT" | "KB" | "LLM";
    const detail = match[2]?.trim() || "";
    const label = detail || type;
    const key = `${type}:${label}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ type, label });
    }
  }

  return sources;
}

/**
 * Убрать маркеры источников из текста ответа.
 *
 * Сами источники показываются списком в подвале сообщения (parseSourceMarkers),
 * а внутри текста они только мешают читать анализ. Чистка идёт на уровне
 * отображения, поэтому ранее сохранённые диалоги тоже открываются чистыми.
 */
function stripSourceMarkers(text: string): string {
  return (
    text
      .replace(/【(?:OSINT|KB|LLM)(?::?\s*[^】]*)?】/g, "")
      // Маркер обычно стоит перед знаком препинания или в конце строки —
      // после удаления остаётся висячий пробел.
      .replace(/[ \t]+([.,;:!?)»])/g, "$1")
      .replace(/([(«])[ \t]+/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/gm, "")
  );
}

function SourceBadge({ type, label }: { type: string; label: string }) {
  const style = SOURCE_STYLES[type] || SOURCE_STYLES.LLM;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${style.bg} ${style.text} align-middle mx-0.5`}
    >
      {style.icon}
      {label}
    </span>
  );
}

export function ChatMessage({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  const sources = !isUser ? parseSourceMarkers(message.content) : [];
  const processedContent = !isUser
    ? stripSourceMarkers(message.content)
    : message.content;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-blue-100 text-blue-600" : "bg-ai-bg text-ai"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-50 text-neutral-900"
            : "bg-neutral-50 text-neutral-900"
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700"
              >
                <Wrench className="h-3 w-3" />
                <span>{toolLabel(tc.name)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {processedContent}
          </ReactMarkdown>
        </div>

        {/* Sources footer */}
        {!isUser && sources.length > 0 && (
          <div className="mt-2 border-t border-line-strong pt-2">
            <div className="text-[10px] font-medium text-neutral-400 mb-1">Источники:</div>
            <div className="flex flex-wrap gap-1">
              {sources.map((s, i) => (
                <SourceBadge key={i} type={s.type} label={s.label} />
              ))}
            </div>
          </div>
        )}

        {/* LLM-only badge when no tools were called and no markers found */}
        {!isUser && sources.length === 0 && !message.content.includes("【") && message.content.length > 0 && (
          <div className="mt-2 border-t border-line-strong pt-2">
            <div className="flex items-center gap-1">
              <SourceBadge type="LLM" label="LLM-знания" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
