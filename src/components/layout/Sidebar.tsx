"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, BookOpen, FolderKanban, GitCompare, Target, Bot, BarChart3, BookOpenCheck, Network, GraduationCap, Crosshair, Briefcase, Wallet, Users, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiChatStore } from "@/lib/ai-store";
import { useSession, signOut } from "next-auth/react";

const navItems = [
  { href: "/scenarios", label: "Сценарии", icon: FolderKanban },
  { href: "/", label: "Дашборд", icon: Gauge },
  { href: "/strategy", label: "Стратегия", icon: Crosshair },
  { href: "/finance", label: "Финансы", icon: Wallet },
  { href: "/processes", label: "Процессы", icon: Network },
  { href: "/competencies", label: "Компетенции", icon: GraduationCap },
  { href: "/clients", label: "Заказчики", icon: Briefcase },
  { href: "/compare", label: "Сравнение сценариев", icon: GitCompare },
  { href: "/gap-analysis", label: "Gap-анализ сценариев", icon: Target },
  { href: "/benchmarks", label: "Бенчмарки", icon: BarChart3 },
  { href: "/knowledge", label: "База знаний", icon: BookOpenCheck },
  { href: "/references", label: "Справочники", icon: BookOpen },
];

const adminLinks = [
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/llm", label: "Настройки LLM", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const toggleAi = useAiChatStore((s) => s.toggle);
  const isAiOpen = useAiChatStore((s) => s.isOpen);
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-neutral-50">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-bold">
          OrgChart
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-neutral-200 text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2 space-y-1">
        <button
          onClick={toggleAi}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isAiOpen
              ? "bg-purple-100 text-purple-700"
              : "text-neutral-600 hover:bg-purple-50 hover:text-purple-700"
          )}
        >
          <Bot className="h-4 w-4" />
          AI-ассистент
        </button>
        {isAdmin &&
          adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(link.href)
                  ? "bg-neutral-200 text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
      </div>
      <div className="border-t p-2">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="truncate text-xs text-neutral-500">
            {session?.user?.name ?? session?.user?.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
