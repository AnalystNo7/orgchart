import type { ShetilType, EmployeeCategory, ScenarioStatus } from "@prisma/client";

export type { ShetilType, EmployeeCategory, ScenarioStatus };

export const SHETIL_CONFIG: Record<
  ShetilType,
  { label: string; color: string; bg: string; border: string }
> = {
  REVENUE: {
    label: "Зарабатывающее",
    color: "#6DBFB8",
    bg: "bg-teal-50",
    border: "border-teal-500",
  },
  RESOURCE: {
    label: "Ресурсный центр",
    color: "#3AAEE0",
    bg: "bg-sky-50",
    border: "border-sky-500",
  },
  SERVICE: {
    label: "Сервисное",
    color: "#F5A000",
    bg: "bg-amber-50",
    border: "border-amber-500",
  },
  BACKOFFICE: {
    label: "Бэк-офис",
    color: "#C62200",
    bg: "bg-red-50",
    border: "border-red-700",
  },
};

export const CATEGORY_LABELS: Record<EmployeeCategory, string> = {
  PP: "ПП",
  OPP: "ОПП",
  AUP: "АУП",
};

export type MetricsMode = "own" | "selected_levels" | "all_descendants";

export const HIERARCHY_SKIP_LEVELS = 0;

export const DEFAULT_LEVEL_NAMES = ["Генеральный директор", "Блок", "Подразделение", "Дочернее подразделение"];

export const DEFAULT_COLUMN_NAMES: Record<string, string> = {
  cfo: "ЦФО",
  hierarchy_0: "Генеральный директор",
  hierarchy_1: "Блок",
  hierarchy_2: "Подразделение",
  hierarchy_3: "Дочернее подразделение",
  hierarchy_path: "Иерархия",
  position: "Должность",
  fullName: "ФИО",
  fte: "FTE",
  category: "Тип занятости",
};

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
