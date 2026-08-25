"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, BookOpen, FolderKanban, GitCompare, Target, Bot, BarChart3, BookOpenCheck, Network, GraduationCap, Crosshair, Briefcase, Wallet, Users, LogOut, Settings, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiChatStore } from "@/lib/ai-store";
import { useOrgChartStore } from "@/lib/store";
import { useSession, signOut } from "next-auth/react";
import { BrandMark } from "@/components/layout/BrandMark";

const navGroups = [
  {
    group: "Основное",
    items: [
      { href: "/scenarios", label: "Сценарии", icon: FolderKanban },
      { href: "/", label: "Дашборд", icon: Gauge },
      { href: "/strategy", label: "Стратегия", icon: Crosshair },
      { href: "/finance", label: "Финансы", icon: Wallet },
    ],
  },
  {
    group: "Организация",
    items: [
      { href: "/processes", label: "Процессы", icon: Network },
      { href: "/competencies", label: "Компетенции", icon: GraduationCap },
      { href: "/clients", label: "Заказчики", icon: Briefcase },
    ],
  },
  {
    group: "Анализ",
    items: [
      { href: "/compare", label: "Сравнение сценариев", icon: GitCompare },
      { href: "/gap-analysis", label: "Gap-анализ сценариев", icon: Target },
      { href: "/benchmarks", label: "Бенчмарки", icon: BarChart3 },
    ],
  },
  {
    group: "Данные",
    items: [
      { href: "/knowledge", label: "База знаний", icon: BookOpenCheck },
      { href: "/references", label: "Справочники", icon: BookOpen },
    ],
  },
];

const adminLinks = [
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/settings", label: "Настройки", icon: Settings },
];

function initials(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._@-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

const itemBase =
  "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[13.5px] font-medium leading-tight transition-colors";

export function Sidebar() {
  const pathname = usePathname();
  const toggleAi = useAiChatStore((s) => s.toggle);
  const isAiOpen = useAiChatStore((s) => s.isOpen);
  const collapsed = useOrgChartStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useOrgChartStore((s) => s.toggleSidebarCollapsed);
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin ?? false;
  const userLabel = session?.user?.name ?? session?.user?.email ?? "";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className="flex h-full shrink-0 flex-col text-white"
      style={{
        width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)",
        background: "linear-gradient(180deg, var(--gpc-blue) 0%, var(--gpc-blue-700) 100%)",
      }}
    >
      <div
        className="flex items-center gap-2.5 border-b border-white/10 px-4"
        style={{ height: "var(--header-h)", minHeight: "var(--header-h)" }}
      >
        <Link href="/" className="flex items-center gap-2.5" title="OrgChart Modeler">
          <BrandMark size={28} />
          {!collapsed && (
            <span className="flex flex-col leading-none">
              <b className="font-head text-[15px] font-bold tracking-[0.02em] text-white">OrgChart</b>
              <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/70">Моделер</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((section) => (
          <div key={section.group}>
            {collapsed ? (
              <div className="mx-3 my-2 h-px bg-white/15" />
            ) : (
              <div className="px-2.5 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                {section.group}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    itemBase,
                    collapsed && "justify-center px-0 py-2.5",
                    active
                      ? "bg-white/15 text-white shadow-[inset_3px_0_0_var(--gpc-orange)]"
                      : "text-white/[0.88] hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 p-2">
        <button
          onClick={toggleAi}
          title={collapsed ? "AI-ассистент" : undefined}
          className={cn(
            itemBase,
            collapsed && "justify-center px-0 py-2.5",
            isAiOpen
              ? "bg-white text-ai"
              : "text-white/[0.88] hover:bg-white/10 hover:text-white"
          )}
        >
          <Bot className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="flex-1 text-left">AI-ассистент</span>}
        </button>
        {isAdmin &&
          adminLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={collapsed ? link.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  itemBase,
                  collapsed && "justify-center px-0 py-2.5",
                  active
                    ? "bg-white/15 text-white shadow-[inset_3px_0_0_var(--gpc-orange)]"
                    : "text-white/[0.88] hover:bg-white/10 hover:text-white"
                )}
              >
                <link.icon className="h-[18px] w-[18px] shrink-0 opacity-90" />
                {!collapsed && <span className="flex-1">{link.label}</span>}
              </Link>
            );
          })}
      </div>

      <div className="border-t border-white/10 p-2">
        <div className={cn("flex items-center gap-2 px-1 py-1", collapsed && "justify-center px-0")}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold text-white">
            {initials(userLabel)}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-xs text-white/70" title={userLabel}>
                {userLabel}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-[var(--r-xs)] p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="Выйти"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="mt-1 flex w-full items-center justify-center rounded-[var(--r-sm)] py-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-[var(--r-sm)] bg-white/[0.08] px-2.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-white/15",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Свернуть меню</span>}
        </button>
      </div>
    </aside>
  );
}
