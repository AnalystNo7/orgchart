"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScenarioSelector } from "@/components/scenarios/ScenarioSelector";
import { AiChatPanel } from "@/components/ai-chat/AiChatPanel";
import { useAiChatStore } from "@/lib/ai-store";

/** Название раздела для крошки в шапке. Порядок важен: сначала более длинные пути. */
const SECTION_TITLES: Array<[string, string]> = [
  ["/scenarios", "Сценарии"],
  ["/strategy", "Стратегия"],
  ["/finance", "Финансы"],
  ["/processes", "Процессы"],
  ["/competencies", "Компетенции"],
  ["/clients", "Заказчики"],
  ["/compare", "Сравнение сценариев"],
  ["/gap-analysis", "Gap-анализ сценариев"],
  ["/benchmarks", "Бенчмарки"],
  ["/knowledge", "База знаний"],
  ["/references", "Справочники"],
  ["/admin/users", "Пользователи"],
  ["/admin/settings", "Настройки"],
  ["/admin", "Администрирование"],
];

function sectionTitle(pathname: string): string {
  if (pathname === "/") return "Дашборд";
  return SECTION_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Раздел";
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isAiOpen = useAiChatStore((s) => s.isOpen);
  const toggleAi = useAiChatStore((s) => s.toggle);

  if (isLoginPage) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <div className="flex h-screen bg-page">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header
            className="flex shrink-0 items-center gap-4 border-b border-line bg-white px-6"
            style={{ height: "var(--header-h)" }}
          >
            <div className="flex items-center gap-2 font-head text-[17px] tracking-[0.01em]">
              <span className="text-ink-400">Моделер</span>
              <span className="text-ink-300">/</span>
              <span className="font-bold text-ink-800">{sectionTitle(pathname)}</span>
            </div>
            <ScenarioSelector />
            <div className="flex-1" />
            <button
              onClick={toggleAi}
              className="inline-flex h-9 items-center gap-2 rounded-[var(--r-sm)] bg-accent-orange px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-orange-700"
              title="Открыть AI-ассистента"
            >
              <Sparkles className="h-4 w-4" />
              Спросить AI
            </button>
          </header>
          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-auto">{children}</main>
            {isAiOpen && <AiChatPanel />}
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}
