import { create } from "zustand";

interface OrgChartState {
  currentScenarioId: string | null;
  selectedDepartmentId: string | null;
  setCurrentScenarioId: (id: string | null) => void;
  setSelectedDepartmentId: (id: string | null) => void;
}

export const useOrgChartStore = create<OrgChartState>((set) => ({
  currentScenarioId: null,
  selectedDepartmentId: null,
  setCurrentScenarioId: (id) => set({ currentScenarioId: id }),
  setSelectedDepartmentId: (id) => set({ selectedDepartmentId: id }),
}));
