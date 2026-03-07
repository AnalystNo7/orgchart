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
import * as XLSX from "xlsx";

interface Tariff {
  id: string;
  name: string;
  rate: number | string;
  description: string | null;
}

export default function TariffsPage() {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const fetchTariffs = useCallback(async () => {
    const res = await fetch("/api/tariffs");
    if (res.ok) setTariffs(await res.json());
  }, []);

  useEffect(() => {
    fetchTariffs();
  }, [fetchTariffs]);

  function startEdit(tariff: Tariff) {
    setEditingId(tariff.id);
    setEditRate(String(Number(tariff.rate)));
    setEditDesc(tariff.description ?? "");
  }

  async function saveEdit(id: string) {
    await fetch(`/api/tariffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rate: parseFloat(editRate),
        description: editDesc || null,
      }),
    });
    setEditingId(null);
    fetchTariffs();
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") saveEdit(id);
    if (e.key === "Escape") setEditingId(null);
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

      <div className="overflow-x-auto rounded-md border">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Наименование</TableHead>
                <TableHead className="w-[180px]">Тарифная ставка (руб.)</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead className="w-[100px]">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tariffs.map((tariff) => (
                <TableRow key={tariff.id}>
                  <TableCell className="font-medium">{tariff.name}</TableCell>
                  <TableCell>
                    {editingId === tariff.id ? (
                      <Input
                        type="number"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, tariff.id)}
                        onBlur={() => saveEdit(tariff.id)}
                        className="h-8 w-32"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => startEdit(tariff)}
                      >
                        {Number(tariff.rate).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === tariff.id ? (
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, tariff.id)}
                        onBlur={() => saveEdit(tariff.id)}
                        className="h-8"
                      />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="block max-w-[300px] cursor-pointer truncate hover:text-blue-600"
                            onClick={() => startEdit(tariff)}
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
                  <TableCell>
                    {editingId === tariff.id ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => saveEdit(tariff.id)}>
                          OK
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Отмена
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(tariff)}>
                        Изменить
                      </Button>
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
