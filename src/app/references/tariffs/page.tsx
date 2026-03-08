"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditableHeader } from "@/components/employees/EditableHeader";
import * as XLSX from "xlsx";

const TARIFF_COLUMN_DEFAULTS: Record<string, string> = {
  name: "Наименование",
  rate: "Тарифная ставка (руб.)",
  description: "Описание",
};

const STORAGE_KEY = "tariff-column-names";

interface Tariff {
  id: string;
  name: string;
  rate: number | string;
  description: string | null;
}

export default function TariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [columnNames, setColumnNames] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch { return {}; }
  });

  function getColName(id: string) {
    return columnNames[id] ?? TARIFF_COLUMN_DEFAULTS[id] ?? id;
  }

  function renameColumn(id: string, name: string) {
    setColumnNames((prev) => {
      const next = { ...prev, [id]: name };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<"rate" | "description" | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const fetchTariffs = useCallback(async () => {
    const res = await fetch("/api/tariffs");
    if (res.ok) setTariffs(await res.json());
  }, []);

  useEffect(() => {
    fetchTariffs();
  }, [fetchTariffs]);

  async function saveField(id: string, field: "rate" | "description", value: string) {
    const payload: Record<string, unknown> = {};
    if (field === "rate") {
      payload.rate = parseFloat(value);
      if (isNaN(payload.rate as number)) return;
    } else {
      payload.description = value || null;
    }
    await fetch(`/api/tariffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setEditingId(null);
    setEditField(null);
    fetchTariffs();
  }

  function startEdit(tariff: Tariff, field: "rate" | "description") {
    setEditingId(tariff.id);
    setEditField(field);
    if (field === "rate") {
      setEditRate(String(Number(tariff.rate)));
    } else {
      setEditDesc(tariff.description ?? "");
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string, field: "rate" | "description") {
    if (e.key === "Enter") saveField(id, field, field === "rate" ? editRate : editDesc);
    if (e.key === "Escape") cancelEdit();
  }

  function handleExport() {
    const wsData = tariffs.map((t) => ({
      "Наименование": t.name,
      "Тарифная ставка (руб.)": Number(t.rate),
      "Описание": t.description ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Тарифы");
    XLSX.writeFile(wb, "tariffs.xlsx");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    for (const row of rows) {
      const name = String(row["Наименование"] ?? "").trim();
      const rate = Number(row["Тарифная ставка (руб.)"] ?? 0);
      const description = String(row["Описание"] ?? "") || null;

      const tariff = tariffs.find((t) => t.name === name);
      if (tariff) {
        await fetch(`/api/tariffs/${tariff.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rate, description }),
        });
      }
    }

    fetchTariffs();
    e.target.value = "";
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Тарифы</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Экспорт
          </Button>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              Импорт
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImport}
              />
            </label>
          </Button>
        </div>
      </div>

      <div className="inline-block rounded-md border">
        <TooltipProvider>
          <Table className="w-auto">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">
                  <EditableHeader value={getColName("name")} onSave={(v) => renameColumn("name", v)} />
                </TableHead>
                <TableHead className="w-[180px]">
                  <EditableHeader value={getColName("rate")} onSave={(v) => renameColumn("rate", v)} />
                </TableHead>
                <TableHead>
                  <EditableHeader value={getColName("description")} onSave={(v) => renameColumn("description", v)} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.map((tariff) => (
                <TableRow key={tariff.id}>
                  <TableCell className="font-medium">{tariff.name}</TableCell>
                  <TableCell>
                    {editingId === tariff.id && editField === "rate" ? (
                      <Input
                        type="number"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, tariff.id, "rate")}
                        onBlur={() => saveField(tariff.id, "rate", editRate)}
                        className="h-8 w-32"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => startEdit(tariff, "rate")}
                      >
                        {Number(tariff.rate).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === tariff.id && editField === "description" ? (
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, tariff.id, "description")}
                        onBlur={() => saveField(tariff.id, "description", editDesc)}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="block max-w-[300px] cursor-pointer truncate hover:text-blue-600"
                            onClick={() => startEdit(tariff, "description")}
                          >
                            {tariff.description ?? "—"}
                          </span>
                        </TooltipTrigger>
                        {tariff.description && (
                          <TooltipContent>
                            <p className="max-w-xs">{tariff.description}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  );
}
