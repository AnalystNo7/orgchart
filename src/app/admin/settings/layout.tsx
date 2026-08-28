"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { value: "llm", label: "LLM", href: "/admin/settings/llm" },
  { value: "prompt", label: "Системный промт", href: "/admin/settings/prompt" },
];

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  // Admin gate for the whole section — the pages under it assume it passed.
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isAdmin) router.push("/");
  }, [session, status, router]);

  const activeTab =
    tabs.find((t) => pathname.startsWith(t.href))?.value ?? "llm";

  if (status === "loading" || !session?.user?.isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 pt-4 pb-0">
        <h1 className="mb-3 text-xl font-semibold">Настройки</h1>
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            const tab = tabs.find((t) => t.value === val);
            if (tab) router.push(tab.href);
          }}
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
