"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Star, ExternalLink, GitCompare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrgChartStore } from "@/lib/store";

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  isBaseline: boolean;
  status: string;
  createdAt: string;
  createdFrom: { id: string; name: string } | null;
  _count: { departments: number; employees: number };
}

/** Значение селекта «На основе» для создания сценария с нуля. */
const BLANK_SOURCE = "blank";

const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активный",
  ARCHIVED: "Архив",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-neutral-100 text-neutral-800",
};

export default function ScenariosPage() {
  const router = useRouter();
  const { setCurrentScenarioId } = useOrgChartStore();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  // "blank" — создать сценарий с нуля, без копирования данных
  const [sourceId, setSourceId] = useState(BLANK_SOURCE);
  const [creating, setCreating] = useState(false);

  const fetchScenarios = useCallback(async () => {
    const res = await fetch("/api/scenarios");
    if (res.ok) setScenarios(await res.json());
  }, []);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  async function handleCreate() {
    if (!newName || !sourceId) return;
    setCreating(true);
    // Пустой сценарий — обычное создание; иначе глубокая копия выбранного
    const url =
      sourceId === BLANK_SOURCE
        ? "/api/scenarios"
        : `/api/scenarios/${sourceId}/clone`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDescription || undefined }),
    });
    setCreating(false);

    if (!res.ok) {
      alert("Не удалось создать сценарий");
      return;
    }

    const created: { id: string } = await res.json();
    setShowCreate(false);
    setNewName("");
    setNewDescription("");
    setSourceId(BLANK_SOURCE);
    // Сразу открываем новый сценарий: у пустого видна карточка с действиями,
    // у клона — скопированная структура
    setCurrentScenarioId(created.id);
    router.push("/");
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить сценарий?")) return;
    const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected(null);
      fetchScenarios();
    } else {
      const data = await res.json();
      alert(data.error);
    }
  }

  function handleOpen(scenario: Scenario) {
    setCurrentScenarioId(scenario.id);
    router.push("/");
  }

  function handleCompare(scenario: Scenario) {
    const baseline = scenarios.find((s) => s.isBaseline);
    if (baseline) {
      router.push(`/compare?left=${baseline.id}&right=${scenario.id}`);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Сценарии</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Создать сценарий
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>На основе</TableHead>
              <TableHead>Подразделений</TableHead>
              <TableHead>Сотрудников</TableHead>
              <TableHead>Создан</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => setSelected(s)}
              >
                <TableCell className="font-medium">
                  {s.isBaseline && <Star className="mr-1 inline h-4 w-4 text-yellow-500" />}
                  {s.name}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusColors[s.status]}>
                    {statusLabels[s.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-neutral-500">
                  {s.createdFrom?.name ?? "—"}
                </TableCell>
                <TableCell>{s._count.departments}</TableCell>
                <TableCell>{s._count.employees}</TableCell>
                <TableCell className="text-neutral-500">
                  {new Date(s.createdAt).toLocaleDateString("ru")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="rounded-lg border p-4 space-y-3">
          <h2 className="text-lg font-semibold">{selected.name}</h2>
          <div className="text-sm text-neutral-500">
            <div className="flex items-center gap-2">
              <span>Статус:</span>
              <Select
                value={selected.status}
                onValueChange={async (status) => {
                  await fetch(`/api/scenarios/${selected.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                  });
                  setSelected({ ...selected, status });
                  fetchScenarios();
                }}
              >
                <SelectTrigger className="h-7 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      <Badge variant="secondary" className={statusColors[key]}>
                        {label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-500">
                {sourceId === BLANK_SOURCE
                  ? "Сценарий создастся пустым — структуру можно построить на дашборде или загрузить из Excel."
                  : "Подразделения, сотрудники и связанные данные будут скопированы из выбранного сценария."}
              </p>
            </div>
            {selected.description && <p className="mt-1">{selected.description}</p>}
            <p className="mt-1">
              Подразделений: {selected._count.departments} | Сотрудников: {selected._count.employees}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleOpen(selected)}>
              <ExternalLink className="mr-1 h-3 w-3" />
              Открыть
            </Button>
            {!selected.isBaseline && (
              <Button size="sm" variant="outline" onClick={() => handleCompare(selected)}>
                <GitCompare className="mr-1 h-3 w-3" />
                Сравнить
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => {
              const newN = prompt("Новое название:", selected.name);
              if (newN) {
                fetch(`/api/scenarios/${selected.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: newN }),
                }).then(() => fetchScenarios());
              }
            }}>
              <Pencil className="mr-1 h-3 w-3" />
              Переименовать
            </Button>
            {!selected.isBaseline && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(selected.id)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Удалить
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Create scenario dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать сценарий</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Реорганизация цехов"
              />
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Необязательно"
              />
            </div>
            <div className="space-y-2">
              <Label>На основе</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сценарий" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BLANK_SOURCE}>
                    — Пустой сценарий (с нуля) —
                  </SelectItem>
                  {scenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.isBaseline ? "\u2605 " : ""}
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-500">
                {sourceId === BLANK_SOURCE
                  ? "Сценарий создастся пустым — структуру можно построить на дашборде или загрузить из Excel."
                  : "Подразделения, сотрудники и связанные данные будут скопированы из выбранного сценария."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName || !sourceId}>
              {creating ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
