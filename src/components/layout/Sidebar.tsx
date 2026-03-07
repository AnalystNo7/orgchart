"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, FolderKanban, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/scenarios", label: "Сценарии", icon: FolderKanban },
  { href: "/", label: "Оргструктура", icon: LayoutDashboard },
  { href: "/references", label: "Справочники", icon: BookOpen },
  { href: "/compare", label: "Сравнение", icon: GitCompare },
];

export function Sidebar() {
  const pathname = usePathname();

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
    </aside>
  );
}
