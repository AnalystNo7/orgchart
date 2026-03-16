"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ScenarioSelector } from "@/components/scenarios/ScenarioSelector";
import { AiChatPanel } from "@/components/ai-chat/AiChatPanel";
import { useAiChatStore } from "@/lib/ai-store";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isAiOpen = useAiChatStore((s) => s.isOpen);

  if (isLoginPage) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between border-b px-6">
            <ScenarioSelector />
            <div className="text-sm text-neutral-500">OrgChart Modeler</div>
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
