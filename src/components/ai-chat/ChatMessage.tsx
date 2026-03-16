"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Wrench } from "lucide-react";
import type { AiMessage } from "@/lib/ai-store";

export function ChatMessage({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
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
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    get_org_structure: "Получение оргструктуры",
    get_department_details: "Детали подразделения",
    get_org_metrics: "Расчёт метрик",
    compare_scenarios: "Сравнение сценариев",
    clone_scenario: "Клонирование сценария",
    create_department: "Создание подразделения",
    move_department: "Перемещение подразделения",
    rename_department: "Переименование",
    delete_department: "Удаление подразделения",
    move_employees: "Перемещение сотрудников",
    create_gap_passport: "Создание паспорта разрыва",
    calculate_pnl: "Расчёт P&L",
    list_scenarios: "Список сценариев",
    run_whatif_scenario: "What-if моделирование",
    add_employee: "Добавление сотрудника",
    remove_employees: "Удаление сотрудников",
  };
  return labels[name] || name;
}
