import type { ShetilType, EmployeeCategory, ScenarioStatus } from "@prisma/client";

export type { ShetilType, EmployeeCategory, ScenarioStatus };

export const SHETIL_CONFIG: Record<
  ShetilType,
  { label: string; color: string; bg: string; border: string }
> = {
  REVENUE: {
    label: "Зарабатывающее",
    color: "#22C55E",
    bg: "bg-green-50",
    border: "border-green-500",
  },
  RESOURCE: {
    label: "Ресурсный центр",
    color: "#3B82F6",
    bg: "bg-blue-50",
    border: "border-blue-500",
  },
  SERVICE: {
    label: "Сервисное",
    color: "#EAB308",
    bg: "bg-yellow-50",
    border: "border-yellow-500",
  },
  BACKOFFICE: {
    label: "Бэк-офис",
    color: "#EF4444",
    bg: "bg-red-50",
    border: "border-red-500",
  },
};

export const CATEGORY_LABELS: Record<EmployeeCategory, string> = {
  PP: "ПП",
  OPP: "ОПП",
  AUP: "АУП",
};

export type MetricsMode = "own" | "selected_levels" | "all_descendants";

export const DEFAULT_LEVEL_NAMES = ["ГД", "ЗГД", "Блок", "Управление", "Отдел", "Группа"];

export interface DepartmentWithMetrics {
  id: string;
  scenarioId: string;
  parentId: string | null;
  name: string;
  cfo: string | null;
  shetilType: ShetilType;
  headId: string | null;
  sortOrder: number;
  originId: string | null;
  head: { id: string; fullName: string } | null;
  _count: { employees: number };
  metrics: {
    pp: number;
    opp: number;
    aup: number;
    totalFte: number;
  };
  children?: DepartmentWithMetrics[];
}
