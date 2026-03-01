"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

interface DepartmentOption {
  id: string;
  name: string;
  parentId: string | null;
}

interface AddParentDialogProps {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  currentParentId: string | null;
  scenarioId: string;
  onComplete: () => void;
}

function getDescendantIds(
  departments: DepartmentOption[],
  rootId: string
): Set<string> {
  const ids = new Set<string>();
  function collect(parentId: string) {
    for (const d of departments) {
      if (d.parentId === parentId && !ids.has(d.id)) {
        ids.add(d.id);
        collect(d.id);
      }
    }
  }
  collect(rootId);
  return ids;
}

export function AddParentDialog({
  open,
  onClose,
  departmentId,
  currentParentId,
  scenarioId,
  onComplete,
}: AddParentDialogProps) {
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState("");
  const [shetilType, setShetilType] = useState<ShetilType>("REVENUE");
  const [selectedExistingId, setSelectedExistingId] = useState<string>("");
  const [allDepartments, setAllDepartments] = useState<DepartmentOption[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchDepartments = useCallback(async () => {
    if (!scenarioId) return;
    const res = await fetch(`/api/departments?scenarioId=${scenarioId}`);
    if (res.ok) {
      const data = await res.json();
      setAllDepartments(
        data.map((d: DepartmentOption) => ({
          id: d.id,
          name: d.name,
          parentId: d.parentId,
        }))
      );
    }
  }, [scenarioId]);

  useEffect(() => {
    if (open) {
      fetchDepartments();
    }
  }, [open, fetchDepartments]);

  // Filter out: self, descendants of self, current parent
  const availableDepartments = allDepartments.filter((d) => {
    if (d.id === departmentId) return false;
    const descendantIds = getDescendantIds(allDepartments, departmentId);
    if (descendantIds.has(d.id)) return false;
    if (d.id === currentParentId) return false;
    return true;
  });

  async function handleCreateNew() {
    if (!name.trim()) return;
    setSaving(true);

    // 1. Create new department with current dept's old parentId
    const createRes = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId,
        parentId: currentParentId,
        name: name.trim(),
        shetilType,
      }),
    });

    if (!createRes.ok) {
      setSaving(false);
      return;
    }

    const newDept = await createRes.json();

    // 2. Update current department to point to the new one as parent
    await fetch(`/api/departments/${departmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: newDept.id }),
    });

    setSaving(false);
    handleReset();
    onComplete();
  }

  async function handleAttachExisting() {
    if (!selectedExistingId) return;
    setSaving(true);

    await fetch(`/api/departments/${departmentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: selectedExistingId }),
    });

    setSaving(false);
    handleReset();
    onComplete();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create") {
      handleCreateNew();
    } else {
      handleAttachExisting();
    }
  }

  function handleReset() {
    setName("");
    setShetilType("REVENUE");
    setSelectedExistingId("");
    setMode("create");
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      handleReset();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить вышестоящее подразделение</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "create" | "existing")}
            className="flex gap-4"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="create" id="mode-create" />
              <Label htmlFor="mode-create" className="cursor-pointer text-sm">
                Создать новое
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="existing" id="mode-existing" />
              <Label
                htmlFor="mode-existing"
                className="cursor-pointer text-sm"
              >
                Привязать к существующему
              </Label>
            </div>
          </RadioGroup>

          {mode === "create" ? (
            <>
              <div className="space-y-2">
                <Label>Название</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Название подразделения"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Тип (Шетил)</Label>
                <Select
                  value={shetilType}
                  onValueChange={(v) => setShetilType(v as ShetilType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(SHETIL_CONFIG) as [
                        ShetilType,
                        { label: string; color: string },
                      ][]
                    ).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded"
                            style={{ backgroundColor: cfg.color }}
                          />
                          {cfg.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>Выберите подразделение</Label>
              {availableDepartments.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Нет доступных подразделений
                </p>
              ) : (
                <Select
                  value={selectedExistingId}
                  onValueChange={setSelectedExistingId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите подразделение..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                (mode === "create" ? !name.trim() : !selectedExistingId)
              }
            >
              {saving
                ? "Сохранение..."
                : mode === "create"
                  ? "Создать"
                  : "Привязать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
