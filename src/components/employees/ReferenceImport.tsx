"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";

interface ReferenceImportProps {
  open: boolean;
  onClose: () => void;
  scenarioId: string | null;
  onImportComplete: (result: ReferenceImportResult) => void;
}

export interface ReferenceImportResult {
  employeesUpdated: number;
  employeesNotFound: number;
  contractsCreated: number;
  contractsUpdated: number;
  periodsCreated: number;
  notFoundNames?: string[];
}

interface RefImportRow {
  fullName: string;
  tariff: string;
  costRate: string;
  contractName: string;
  contractAmount: number;
  month: number | string;
  fte: number;
  contractCode: string;
  contractNumber: string;
}

interface DbField {
  key: keyof RefImportRow;
  label: string;
  defaultValue: string | number;
  aliases: string[];
}

const FIELD_ALIASES = {
  fullName: ["Пользователь (Наименование)", "ФИО", "Сотрудник (ФИО)", "Name"],
  tariff: ["К", "Тариф", "Tariff", "Категория ставки"],
  costRate: ["Столбец1", "Ставка с/с", "Ставка себестоимости", "План Себес Р/Ч", "Оценка Себес Р/Ч", "Факт Себес Р/Ч"],
  contractName: ["Проект (Наименование)", "Договор", "Contract", "Проект"],
  contractAmount: ["Оценка Сумма", "План Сумма", "Факт Сумма", "Сумма"],
  month: ["Месяц", "Период", "Month", "Date"],
  fte: ["Оценка FTE", "Бронь FTE", "Факт FTE", "FTE"],
  contractCode: ["Проект (Код)", "Код", "Code"],
  contractNumber: ["Проект (Номер договора)", "Номер договора", "Number"],
};

const ALL_KNOWN_ALIASES = Object.values(FIELD_ALIASES).flat();

const DB_FIELDS: DbField[] = [
  { key: "fullName", label: "ФИО сотрудника", defaultValue: "", aliases: FIELD_ALIASES.fullName },
  { key: "tariff", label: "Тариф (К1-К6)", defaultValue: "", aliases: FIELD_ALIASES.tariff },
  { key: "costRate", label: "Ставка с/с", defaultValue: "", aliases: FIELD_ALIASES.costRate },
  { key: "contractName", label: "Название договора", defaultValue: "", aliases: FIELD_ALIASES.contractName },
  { key: "contractAmount", label: "Сумма договора", defaultValue: 0, aliases: FIELD_ALIASES.contractAmount },
  { key: "month", label: "Месяц/Период", defaultValue: "", aliases: FIELD_ALIASES.month },
  { key: "fte", label: "FTE", defaultValue: 0, aliases: FIELD_ALIASES.fte },
  { key: "contractCode", label: "Код договора", defaultValue: "", aliases: FIELD_ALIASES.contractCode },
  { key: "contractNumber", label: "Номер договора", defaultValue: "", aliases: FIELD_ALIASES.contractNumber },
];

const MAPPING_STORAGE_KEY = "ref-import-mapping-v1";
const NONE_VALUE = "__none__";

type ColumnMapping = Record<keyof RefImportRow, string | null>;

function createEmptyMapping(): ColumnMapping {
  const m = {} as ColumnMapping;
  for (const f of DB_FIELDS) m[f.key] = null;
  return m;
}

function findHeaderRow(
  XLSX: typeof import("xlsx"),
  sheet: import("xlsx").WorkSheet
): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const val = String(cell.v ?? "").trim();
      if (ALL_KNOWN_ALIASES.some((alias) => val === alias.replace("\n", " ") || val === alias)) {
        return r;
      }
    }
  }
  return 0;
}

function loadSavedMapping(): Partial<Record<keyof RefImportRow, string>> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(MAPPING_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMapping(mapping: ColumnMapping) {
  if (typeof window === "undefined") return;
  const toSave: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (v) toSave[k] = v;
  }
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(toSave));
}

function autoDetectMapping(headers: string[]): ColumnMapping {
  const saved = loadSavedMapping();
  const mapping = createEmptyMapping();

  for (const field of DB_FIELDS) {
    const savedHeader = saved[field.key];
    if (savedHeader && headers.includes(savedHeader)) {
      mapping[field.key] = savedHeader;
      continue;
    }
    for (const alias of field.aliases) {
      const normalizedAlias = alias.replace(/\r?\n/g, " ").trim();
      const found = headers.find((h) => h === normalizedAlias || h === alias);
      if (found) {
        mapping[field.key] = found;
        break;
      }
    }
  }

  return mapping;
}

function applyMapping(
  rawRows: Record<string, string | number>[],
  mapping: ColumnMapping
): RefImportRow[] {
  return rawRows.map((row) => {
    const out = {} as RefImportRow;
    for (const field of DB_FIELDS) {
      const sourceCol = mapping[field.key];
      const rawValue = sourceCol ? row[sourceCol] : undefined;

      if (field.key === "fte" || field.key === "contractAmount") {
        const num = rawValue != null ? Number(rawValue) : NaN;
        (out as Record<string, unknown>)[field.key] = isNaN(num) ? field.defaultValue : num;
      } else if (field.key === "month") {
        out.month = rawValue != null ? rawValue : "";
      } else if (field.key === "costRate") {
        // Parse "3 325,56 ₽" → number string
        const str = rawValue != null ? String(rawValue) : "";
        out.costRate = str;
      } else {
        const str = rawValue != null ? String(rawValue) : "";
        (out as Record<string, unknown>)[field.key] = str || (field.defaultValue as string);
      }
    }
    return out;
  });
}

function formatExcelDate(val: number | string): string {
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  }
  return String(val);
}

export function ReferenceImport({
  open,
  onClose,
  scenarioId,
  onImportComplete,
}: ReferenceImportProps) {
  const [rows, setRows] = useState<RefImportRow[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string | number>[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(() => createEmptyMapping());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ employees: number; contracts: number; months: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rawRows.length === 0) {
      setRows([]);
      setStats(null);
      return;
    }
    const applied = applyMapping(rawRows, mapping).filter((r) => r.fullName.trim());
    setRows(applied);

    // Compute stats
    const uniqueEmps = new Set(applied.map((r) => r.fullName));
    const uniqueContracts = new Set(applied.filter((r) => r.contractName).map((r) => r.contractName));
    const uniqueMonths = new Set(applied.filter((r) => r.month).map((r) => String(r.month)));
    setStats({
      employees: uniqueEmps.size,
      contracts: uniqueContracts.size,
      months: uniqueMonths.size,
    });
  }, [rawRows, mapping]);

  const updateMapping = useCallback((fieldKey: keyof RefImportRow, value: string | null) => {
    setMapping((prev) => {
      const next = { ...prev, [fieldKey]: value };
      saveMapping(next);
      return next;
    });
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const headerRowIdx = findHeaderRow(XLSX, sheet);
      const fullRange = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const dataRange = { ...fullRange, s: { ...fullRange.s, r: headerRowIdx } };

      const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { range: dataRange });

      if (jsonData.length === 0) {
        setError("Файл пуст или не содержит данных");
        return;
      }

      const normalizedData = jsonData.map((row) => {
        const out: Record<string, string | number> = {};
        for (const [key, val] of Object.entries(row)) {
          out[key.replace(/\r?\n/g, " ").trim()] = val;
        }
        return out;
      });

      const headers = Object.keys(normalizedData[0]);
      setRawHeaders(headers);
      setRawRows(normalizedData);
      setMapping(autoDetectMapping(headers));
    } catch (err) {
      setError(
        `Ошибка чтения файла: ${err instanceof Error ? err.message : "неизвестная ошибка"}. ` +
        "Убедитесь, что файл имеет формат .xlsx"
      );
    }
  }

  async function handleImport() {
    if (!scenarioId || rows.length === 0) return;
    setLoading(true);
    setError("");

    try {
      saveMapping(mapping);
      const res = await fetch("/api/import/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, rows }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка импорта");
      }

      const result: ReferenceImportResult = await res.json();
      onImportComplete(result);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setRows([]);
    setRawRows([]);
    setRawHeaders([]);
    setMapping(createEmptyMapping());
    setStats(null);
    setFileName("");
    setError("");
    setLoading(false);
    if (fileRef.current) fileRef.current.value = "";
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="w-[95vw] max-w-[95vw] max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Загрузка справочных данных</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <div>
            <input
              id="ref-file-input"
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={loading} asChild>
                <label htmlFor="ref-file-input" className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Выбрать файл
                </label>
              </Button>
              {fileName && (
                <span className="text-sm text-neutral-700">{fileName}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Загрузите файл с данными о сотрудниках, договорах и FTE по периодам.
              Сотрудники сопоставляются с существующими по ФИО. Договоры создаются автоматически.
            </p>
          </div>

          {/* Column mapping */}
          {rawHeaders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Сопоставление колонок</h4>
              <div className="overflow-x-auto rounded-md border p-3">
                <div className="flex gap-3 min-w-max">
                  {DB_FIELDS.map((field) => (
                    <div key={field.key} className="flex flex-col gap-1 min-w-[170px]">
                      <Label className="text-xs text-neutral-600 whitespace-nowrap">
                        {field.label}
                      </Label>
                      <Select
                        value={mapping[field.key] ?? NONE_VALUE}
                        onValueChange={(v) =>
                          updateMapping(field.key, v === NONE_VALUE ? null : v)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>
                            — не импортировать —
                          </SelectItem>
                          {rawHeaders.map((header) => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="flex gap-4 text-sm text-neutral-600">
              <span>Найдено: <strong>{stats.employees}</strong> сотрудников</span>
              <span><strong>{stats.contracts}</strong> договоров</span>
              <span><strong>{stats.months}</strong> периодов</span>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">ФИО</TableHead>
                    <TableHead className="whitespace-nowrap">Тариф</TableHead>
                    <TableHead className="whitespace-nowrap">Ставка с/с</TableHead>
                    <TableHead className="whitespace-nowrap">Договор</TableHead>
                    <TableHead className="whitespace-nowrap">Сумма</TableHead>
                    <TableHead className="whitespace-nowrap">Месяц</TableHead>
                    <TableHead className="whitespace-nowrap">FTE</TableHead>
                    <TableHead className="whitespace-nowrap">Код</TableHead>
                    <TableHead className="whitespace-nowrap">Номер</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{row.fullName}</TableCell>
                      <TableCell>{row.tariff}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.costRate}</TableCell>
                      <TableCell className="whitespace-nowrap max-w-[250px] truncate">{row.contractName}</TableCell>
                      <TableCell className="text-right">{typeof row.contractAmount === "number" && row.contractAmount > 0 ? row.contractAmount.toLocaleString("ru-RU") : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatExcelDate(row.month)}</TableCell>
                      <TableCell>{row.fte}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.contractCode}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.contractNumber}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-neutral-500">
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
          <Button onClick={handleImport} disabled={rows.length === 0 || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Импортировать ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
