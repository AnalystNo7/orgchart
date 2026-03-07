"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { value: "employees", label: "Сотрудники", href: "/references/employees" },
  { value: "tariffs", label: "Тарифы", href: "/references/tariffs" },
  { value: "contracts", label: "Договоры", href: "/references/contracts" },
];

export default function ReferencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const activeTab =
    tabs.find((t) => pathname.startsWith(t.href))?.value ?? "employees";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 pt-4 pb-0">
        <h1 className="mb-3 text-xl font-semibold">Справочники</h1>
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
