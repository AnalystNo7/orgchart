import { create } from "zustand";
import type { MetricsMode } from "@/types";

export type ViewMode = "orgchart" | "pnl-heatmap";
export type PnlDisplayMode = "plan" | "forecast" | "combined";

interface OrgChartState {
  currentScenarioId: string | null;
  selectedDepartmentId: string | null;
  setCurrentScenarioId: (id: string | null) => void;
  setSelectedDepartmentId: (id: string | null) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // P&L Heatmap state
  pnlDisplayMode: PnlDisplayMode;
  setPnlDisplayMode: (mode: PnlDisplayMode) => void;
  pnlDrillDownDeptId: string | null;
  setPnlDrillDownDeptId: (id: string | null) => void;

  // Metrics display mode
  metricsMode: MetricsMode;
  selectedLevels: number[];
  departmentOverrides: Record<string, MetricsMode | null>;
  setMetricsMode: (mode: MetricsMode) => void;
  setSelectedLevels: (levels: number[]) => void;
  toggleLevel: (level: number) => void;
  setDepartmentOverride: (deptId: string, mode: MetricsMode | null) => void;
  clearDepartmentOverrides: () => void;

  // Shared collapsed state (persists across view switches within scenario)
  collapsedIds: Set<string>;
  setCollapsedIds: (ids: Set<string>) => void;
  toggleCollapsed: (id: string) => void;
  collapseInitializedForScenario: string | null;
  setCollapseInitializedForScenario: (scenarioId: string | null) => void;

  // Per-node layout direction (vertical = children stacked, horizontal = default side-by-side)
  verticalIds: Set<string>;
  toggleVertical: (id: string) => void;

  // Refresh trigger for OrgChart after add/delete
  refreshCounter: number;
  triggerRefresh: () => void;

  // Undo/Redo state
  canUndo: boolean;
  canRedo: boolean;
  undoRedoLoading: boolean;
  setUndoRedoState: (canUndo: boolean, canRedo: boolean) => void;
  fetchUndoRedoState: () => Promise<void>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
}

export const useOrgChartStore = create<OrgChartState>((set, get) => ({
  currentScenarioId: null,
  selectedDepartmentId: null,
  setCurrentScenarioId: (id) =>
    set({
      currentScenarioId: id,
      selectedDepartmentId: null,
      departmentOverrides: {},
      verticalIds: new Set<string>(),
      collapsedIds: new Set<string>(),
    }),
  setSelectedDepartmentId: (id) => set({ selectedDepartmentId: id }),

  // View mode
  viewMode: (typeof window !== "undefined"
    ? (localStorage.getItem("viewMode") as ViewMode) || "orgchart"
    : "orgchart") as ViewMode,
  setViewMode: (mode) => {
    localStorage.setItem("viewMode", mode);
    set({ viewMode: mode });
  },

  // P&L Heatmap
  pnlDisplayMode: (typeof window !== "undefined"
    ? (localStorage.getItem("pnlDisplayMode") as PnlDisplayMode) || "plan"
    : "plan") as PnlDisplayMode,
  setPnlDisplayMode: (mode) => {
    localStorage.setItem("pnlDisplayMode", mode);
    set({ pnlDisplayMode: mode });
  },
  pnlDrillDownDeptId: null,
  setPnlDrillDownDeptId: (id) => set({ pnlDrillDownDeptId: id }),

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

  collapsedIds: new Set<string>(),
  setCollapsedIds: (ids) => set({ collapsedIds: ids }),
  toggleCollapsed: (id) =>
    set((state) => {
      const next = new Set(state.collapsedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { collapsedIds: next };
    }),
  collapseInitializedForScenario: null,
  setCollapseInitializedForScenario: (scenarioId) => set({ collapseInitializedForScenario: scenarioId }),

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

  // Undo/Redo
  canUndo: false,
  canRedo: false,
  undoRedoLoading: false,
  setUndoRedoState: (canUndo, canRedo) => set({ canUndo, canRedo }),

  fetchUndoRedoState: async () => {
    const scenarioId = get().currentScenarioId;
    if (!scenarioId) {
      set({ canUndo: false, canRedo: false });
      return;
    }
    try {
      const res = await fetch(`/api/actions?scenarioId=${scenarioId}`);
      if (res.ok) {
        const data = await res.json();
        set({ canUndo: data.canUndo, canRedo: data.canRedo });
      }
    } catch {
      // ignore
    }
  },

  undo: async () => {
    const { currentScenarioId, undoRedoLoading } = get();
    if (!currentScenarioId || undoRedoLoading) return false;
    set({ undoRedoLoading: true });
    try {
      const res = await fetch(
        `/api/actions/undo?scenarioId=${currentScenarioId}`,
        { method: "POST" }
      );
      if (res.ok) {
        // Refresh the chart and undo/redo state
        get().triggerRefresh();
        await get().fetchUndoRedoState();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      set({ undoRedoLoading: false });
    }
  },

  redo: async () => {
    const { currentScenarioId, undoRedoLoading } = get();
    if (!currentScenarioId || undoRedoLoading) return false;
    set({ undoRedoLoading: true });
    try {
      const res = await fetch(
        `/api/actions/redo?scenarioId=${currentScenarioId}`,
        { method: "POST" }
      );
      if (res.ok) {
        get().triggerRefresh();
        await get().fetchUndoRedoState();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      set({ undoRedoLoading: false });
    }
  },
}));
