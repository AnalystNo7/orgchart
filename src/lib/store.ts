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

  // Shared collapsed state (persists across view & scenario switches)
  collapsedIds: Set<string>;
  setCollapsedIds: (ids: Set<string>) => void;
  toggleCollapsed: (id: string) => void;
  // Per-scenario persistence: saves/restores collapse state when switching scenarios
  collapsedIdsPerScenario: Record<string, string[]>;
  initializedScenarios: Set<string>;
  markScenarioInitialized: (scenarioId: string) => void;

  // Cross-page navigation: filter employees by department (set from orgchart double-click)
  employeeDeptFilter: { id: string; name: string } | null;
  setEmployeeDeptFilter: (filter: { id: string; name: string } | null) => void;

  // Persistent employee filters (survive navigation between pages/tabs)
  employeeSearch: string;
  employeeCategoryFilter: string;
  employeeHierarchyFilters: Record<string, string>;
  setEmployeeSearch: (search: string) => void;
  setEmployeeCategoryFilter: (category: string) => void;
  setEmployeeHierarchyFilters: (filters: Record<string, string>) => void;
  setEmployeeHierarchyFilter: (key: string, value: string) => void;

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
  setCurrentScenarioId: (id) => {
    const state = get();
    const prev = state.currentScenarioId;
    // Save current scenario's collapse state before switching
    const updatedMap = { ...state.collapsedIdsPerScenario };
    if (prev) {
      updatedMap[prev] = Array.from(state.collapsedIds);
    }
    // Restore target scenario's saved collapse state (or empty if first visit)
    const restored = id && updatedMap[id]
      ? new Set<string>(updatedMap[id])
      : new Set<string>();
    set({
      currentScenarioId: id,
      selectedDepartmentId: null,
      departmentOverrides: {},
      verticalIds: new Set<string>(),
      collapsedIds: restored,
      collapsedIdsPerScenario: updatedMap,
    });
  },
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
  setCollapsedIds: (ids) => {
    const scenarioId = get().currentScenarioId;
    const map = { ...get().collapsedIdsPerScenario };
    if (scenarioId) map[scenarioId] = Array.from(ids);
    set({ collapsedIds: ids, collapsedIdsPerScenario: map });
  },
  toggleCollapsed: (id) =>
    set((state) => {
      const next = new Set(state.collapsedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const map = { ...state.collapsedIdsPerScenario };
      if (state.currentScenarioId) map[state.currentScenarioId] = Array.from(next);
      return { collapsedIds: next, collapsedIdsPerScenario: map };
    }),
  collapsedIdsPerScenario: {},
  initializedScenarios: new Set<string>(),
  markScenarioInitialized: (scenarioId) =>
    set((state) => {
      const next = new Set(state.initializedScenarios);
      next.add(scenarioId);
      return { initializedScenarios: next };
    }),

  employeeDeptFilter: null,
  setEmployeeDeptFilter: (filter) => set({ employeeDeptFilter: filter }),

  // Persistent employee filters
  employeeSearch: "",
  employeeCategoryFilter: "",
  employeeHierarchyFilters: {},
  setEmployeeSearch: (search) => set({ employeeSearch: search }),
  setEmployeeCategoryFilter: (category) => set({ employeeCategoryFilter: category }),
  setEmployeeHierarchyFilters: (filters) => set({ employeeHierarchyFilters: filters }),
  setEmployeeHierarchyFilter: (key, value) =>
    set((state) => ({
      employeeHierarchyFilters: { ...state.employeeHierarchyFilters, [key]: value },
    })),

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
