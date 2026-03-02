import { create } from "zustand";
import type { MetricsMode } from "@/types";

interface OrgChartState {
  currentScenarioId: string | null;
  selectedDepartmentId: string | null;
  setCurrentScenarioId: (id: string | null) => void;
  setSelectedDepartmentId: (id: string | null) => void;

  // Metrics display mode
  metricsMode: MetricsMode;
  selectedLevels: number[];
  departmentOverrides: Record<string, MetricsMode | null>;
  setMetricsMode: (mode: MetricsMode) => void;
  setSelectedLevels: (levels: number[]) => void;
  toggleLevel: (level: number) => void;
  setDepartmentOverride: (deptId: string, mode: MetricsMode | null) => void;
  clearDepartmentOverrides: () => void;

  // Per-node layout direction (vertical = children stacked, horizontal = default side-by-side)
  verticalIds: Set<string>;
  toggleVertical: (id: string) => void;

  // Refresh trigger for OrgChart after add/delete
  refreshCounter: number;
  triggerRefresh: () => void;
}

export const useOrgChartStore = create<OrgChartState>((set) => ({
  currentScenarioId: null,
  selectedDepartmentId: null,
  setCurrentScenarioId: (id) => set({ currentScenarioId: id }),
  setSelectedDepartmentId: (id) => set({ selectedDepartmentId: id }),

  metricsMode: "own",
  selectedLevels: [1],
  departmentOverrides: {},
  setMetricsMode: (mode) => set({ metricsMode: mode }),
  setSelectedLevels: (levels) => set({ selectedLevels: levels }),
  toggleLevel: (level) =>
    set((state) => ({
      selectedLevels: state.selectedLevels.includes(level)
        ? state.selectedLevels.filter((l) => l !== level)
        : [...state.selectedLevels, level].sort(),
    })),
  setDepartmentOverride: (deptId, mode) =>
    set((state) => ({
      departmentOverrides: { ...state.departmentOverrides, [deptId]: mode },
    })),
  clearDepartmentOverrides: () => set({ departmentOverrides: {} }),

  verticalIds: new Set<string>(),
  toggleVertical: (id) =>
    set((state) => {
      const next = new Set(state.verticalIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { verticalIds: next };
    }),

  refreshCounter: 0,
  triggerRefresh: () =>
    set((state) => ({ refreshCounter: state.refreshCounter + 1 })),
}));
