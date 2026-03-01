"use client";

import { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

interface ExcelImportProps {
  open: boolean;
  onClose: () => void;
  scenarioId: string | null;
  onImportComplete: (result: ImportResult) => void;
}

export interface ImportRow {
  cfo: string;
  block: string;
  department: string;
  subDepartment: string;
  position: string;
  fullName: string;
  fte: number;
  category: string;
}

export interface ImportResult {
  employeesCreated: number;
  departmentsCreated: number;
  skipped?: number;
  skippedNames?: string[];
  modeledOrgStructure: boolean;
}

// Column name aliases for flexible mapping
const COL_CFO = ["ЦФО", "CFO", "cfo"];
const COL_BLOCK = ["Блок", "Block", "block"];
const COL_DEPT = ["Подразделение", "Department", "department"];
const COL_SUB_DEPT = ["Нижестоящее подразделение", "SubDepartment", "subDepartment"];
const COL_POSITION = ["Должность", "Position", "position"];
const COL_NAME = [
  "Сотрудник\n(ФИО или вакансия)",
  "Сотрудник (ФИО или вакансия)",
  "ФИО",
  "fullName",
  "Name",
];
const COL_FTE = ["Плановая ставка", "FTE", "fte", "Ставка"];
const COL_CATEGORY = ["Тип занятости", "Категория", "Category", "category"];

function findColumn(
  row: Record<string, string | number>,
  aliases: string[]
): string | number | undefined {
  for (const alias of aliases) {
    if (alias in row) return row[alias];
  }
  return undefined;
}

export function ExcelImport({
  open,
  onClose,
  scenarioId,
  onImportComplete,
}: ExcelImportProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelOrgStructure, setModelOrgStructure] = useState(true);
  const [clearExisting, setClearExisting] = useState<"clear" | "append">(
    "clear"
  );
  const [defaultShetilType, setDefaultShetilType] =
    useState<ShetilType>("BACKOFFICE");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<
        Record<string, string | number>
      >(sheet);

      const parsed: ImportRow[] = jsonData.map((row) => ({
        cfo: String(findColumn(row, COL_CFO) ?? ""),
        block: String(findColumn(row, COL_BLOCK) ?? ""),
        department: String(findColumn(row, COL_DEPT) ?? ""),
        subDepartment: String(findColumn(row, COL_SUB_DEPT) ?? ""),
        position: String(findColumn(row, COL_POSITION) ?? ""),
        fullName: String(findColumn(row, COL_NAME) ?? ""),
        fte: Number(findColumn(row, COL_FTE) ?? 1),
        category: String(findColumn(row, COL_CATEGORY) ?? "PP"),
      }));

      setRows(parsed.filter((r) => r.fullName.trim()));
    } catch {
      setError("Ошибка чтения файла. Убедитесь, что файл имеет формат .xlsx");
    }
  }

  async function handleImport() {
    if (!scenarioId || rows.length === 0) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          modelOrgStructure,
          clearExisting: modelOrgStructure && clearExisting === "clear",
          defaultShetilType,
          rows,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка импорта");
      }

      const result = await res.json();
      onImportComplete({
        ...result,
        modeledOrgStructure: modelOrgStructure,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setRows([]);
    setError("");
    setLoading(false);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Импорт из Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Выбрать файл
            </Button>
            <p className="mt-1 text-xs text-neutral-500">
              Колонки: ЦФО, Блок, Подразделение, Нижестоящее подразделение,
              Должность, Сотрудник (ФИО или вакансия), Плановая ставка, Тип
              занятости
            </p>
          </div>

          {/* Options */}
          {rows.length > 0 && (
            <div className="space-y-4 rounded-md border p-4">
              {/* Model org structure checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="modelOrg"
                  checked={modelOrgStructure}
                  onCheckedChange={(checked) =>
                    setModelOrgStructure(checked === true)
                  }
                />
                <Label htmlFor="modelOrg" className="cursor-pointer">
                  Смоделировать оргструктуру?
                </Label>
              </div>

              {/* Options visible when modeling */}
              {modelOrgStructure && (
                <div className="ml-6 space-y-4">
                  {/* Clear or append */}
                  <div className="space-y-2">
                    <Label className="text-sm text-neutral-600">
                      Действие с существующими данными:
                    </Label>
                    <RadioGroup
                      value={clearExisting}
                      onValueChange={(v) =>
                        setClearExisting(v as "clear" | "append")
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="clear" id="clear" />
                        <Label htmlFor="clear" className="cursor-pointer font-normal">
                          Очистить и заменить все данные
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="append" id="append" />
                        <Label htmlFor="append" className="cursor-pointer font-normal">
                          Дополнить существующие данные
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Default ShetilType */}
                  <div className="space-y-2">
                    <Label className="text-sm text-neutral-600">
                      Тип подразделений по умолчанию:
                    </Label>
                    <Select
                      value={defaultShetilType}
                      onValueChange={(v) =>
                        setDefaultShetilType(v as ShetilType)
                      }
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SHETIL_CONFIG).map(
                          ([key, config]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-3 w-3 rounded-full"
                                  style={{ backgroundColor: config.color }}
                                />
                                {config.label}
                              </span>
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">ЦФО</TableHead>
                    <TableHead className="whitespace-nowrap">Блок</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Подразделение
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Ниж. подр.
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Должность
                    </TableHead>
                    <TableHead className="whitespace-nowrap">ФИО</TableHead>
                    <TableHead className="whitespace-nowrap">Ставка</TableHead>
                    <TableHead className="whitespace-nowrap">Тип</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-[80px] truncate">
                        {row.cfo}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate">
                        {row.block}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {row.department}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {row.subDepartment}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate">
                        {row.position}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {row.fullName}
                      </TableCell>
                      <TableCell>{row.fte}</TableCell>
                      <TableCell>{row.category}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 10 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-neutral-500"
                      >
                        ...и ещё {rows.length - 10} строк
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Отмена
          </Button>
          <Button
            onClick={handleImport}
            disabled={rows.length === 0 || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Импортировать ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
