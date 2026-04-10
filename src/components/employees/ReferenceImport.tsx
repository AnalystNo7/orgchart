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
  periodsUpdated: number;
  notFoundNames?: string[];
}

// Row sent to API after mapping
interface RefImportRow {
  employeeCode: string;        // "Сотрудник" column — match key (ВПР by fullName)
  tariff: string;              // "К" — К1-К6
  costRate: number;            // "Оценка Себес Р/Ч"
  contractName: string;        // "Проект (Код)" — Contract.name
  contractDescription: string; // "Проект (Наименование)" — Contract.description
  contractAmount: number;      // "Оценка Сумма"
  month: number | string;      // "Месяц" — Excel serial date
  fte: number;                 // "Оценка FTE"
}

type FieldKey = keyof RefImportRow;

interface DbField {
  key: FieldKey;
  label: string;
  defaultValue: string | number;
  aliases: string[];
}

const DB_FIELDS: DbField[] = [
  {
    key: "employeeCode",
    label: "Сотрудник (код)",
    defaultValue: "",
    aliases: ["Сотрудник", "Сотруд", "Employee", "Код сотрудника"],
  },
  {
    key: "tariff",
    label: "Тариф (К1-К6)",
    defaultValue: "",
    aliases: ["К", "Тариф", "Tariff", "Категория ставки"],
  },
  {
    key: "costRate",
    label: "Ставка с/с",
    defaultValue: 0,
    aliases: ["Оценка Себес Р/Ч", "Факт Себес Р/Ч", "План Себес Р/Ч", "Столбец1", "Ставка с/с", "Себес Р/Ч"],
  },
  {
    key: "contractName",
    label: "Код договора (name)",
    defaultValue: "",
    aliases: ["Проект (Код)", "Код проекта", "Contract Code"],
  },
  {
    key: "contractDescription",
    label: "Описание договора",
    defaultValue: "",
    aliases: ["Проект (Наименование)", "Наименование проекта", "Договор", "Contract", "Проект"],
  },
  {
    key: "contractAmount",
    label: "Сумма договора",
    defaultValue: 0,
    aliases: ["Оценка Сумма", "План Сумма", "Факт Сумма", "Сумма"],
  },
  {
    key: "month",
    label: "Месяц/Период",
    defaultValue: "",
    aliases: ["Месяц", "Период", "Month", "Date"],
  },
  {
    key: "fte",
    label: "FTE",
    defaultValue: 0,
    aliases: ["Оценка FTE", "Бронь FTE", "Факт FTE", "FTE"],
  },
];

const ALL_KNOWN_ALIASES = DB_FIELDS.flatMap((f) => f.aliases);

const MAPPING_STORAGE_KEY = "ref-import-mapping-v2";
const NONE_VALUE = "__none__";

type ColumnMapping = Record<FieldKey, string | null>;

function createEmptyMapping(): ColumnMapping {
  const m = {} as ColumnMapping;
  for (const f of DB_FIELDS) m[f.key] = null;
  return m;
}

function normalizeHeader(s: string): string {
  return s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function findHeaderRow(
  XLSX: typeof import("xlsx"),
  sheet: import("xlsx").WorkSheet
): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let r = range.s.r; r <= Math.min(range.e.r, 30); r++) {
    let matchCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const val = normalizeHeader(String(cell.v ?? ""));
      if (val && ALL_KNOWN_ALIASES.some((alias) => normalizeHeader(alias) === val)) {
        matchCount++;
      }
    }
    // If we matched at least 2 known aliases in this row, it's the header
    if (matchCount >= 2) return r;
  }
  return 0;
}

function loadSavedMapping(): Partial<Record<FieldKey, string>> {
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
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const field of DB_FIELDS) {
    // Priority 1: saved mapping from localStorage
    const savedHeader = saved[field.key];
    if (savedHeader) {
      const idx = normalizedHeaders.indexOf(normalizeHeader(savedHeader));
      if (idx >= 0) {
        mapping[field.key] = headers[idx];
        continue;
      }
    }
    // Priority 2: match by aliases
    for (const alias of field.aliases) {
      const normAlias = normalizeHeader(alias);
      const idx = normalizedHeaders.findIndex((h) => h === normAlias);
      if (idx >= 0) {
        mapping[field.key] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

function parseNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  // Handle "3 325,56 ₽" format
  const clean = String(val).replace(/[^\d,.\-]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function applyMapping(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping
): RefImportRow[] {
  return rawRows.map((row) => {
    const get = (key: FieldKey) => {
      const col = mapping[key];
      return col ? row[col] : undefined;
    };

    return {
      employeeCode: String(get("employeeCode") ?? "").trim(),
      tariff: String(get("tariff") ?? "").trim(),
      costRate: parseNumber(get("costRate")),
      contractName: String(get("contractName") ?? "").trim(),
      contractDescription: String(get("contractDescription") ?? "").trim(),
      contractAmount: parseNumber(get("contractAmount")),
      month: (get("month") as number | string) ?? "",
      fte: parseNumber(get("fte")),
    };
  });
}

function formatExcelDate(val: number | string): string {
  if (typeof val === "number" && val > 10000) {
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
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(() => createEmptyMapping());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    employees: number;
    contracts: number;
    months: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rawRows.length === 0) {
      setRows([]);
      setStats(null);
      return;
    }
    const applied = applyMapping(rawRows, mapping).filter(
      (r) => r.employeeCode
    );
    setRows(applied);

    const uniqueEmps = new Set(applied.map((r) => r.employeeCode));
    const uniqueContracts = new Set(
      applied.filter((r) => r.contractName).map((r) => r.contractName)
    );
    const uniqueMonths = new Set(
      applied.filter((r) => r.month).map((r) => String(r.month))
    );
    setStats({
      employees: uniqueEmps.size,
      contracts: uniqueContracts.size,
      months: uniqueMonths.size,
    });
  }, [rawRows, mapping]);

  const updateMapping = useCallback(
    (fieldKey: FieldKey, value: string | null) => {
      setMapping((prev) => {
        const next = { ...prev, [fieldKey]: value };
        saveMapping(next);
        return next;
      });
    },
    []
  );

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
      const dataRange = {
        ...fullRange,
        s: { ...fullRange.s, r: headerRowIdx },
      };

      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { range: dataRange }
      );

      if (jsonData.length === 0) {
        setError("Файл пуст или не содержит данных");
        return;
      }

      // Normalize header names (remove line breaks, extra spaces)
      const normalizedData = jsonData.map((row) => {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          out[normalizeHeader(key)] = val;
        }
        return out;
      });

      // Collect all unique headers across all rows (first row may not have all)
      const headerSet = new Set<string>();
      for (const row of normalizedData.slice(0, 100)) {
        for (const key of Object.keys(row)) {
          if (key) headerSet.add(key);
        }
      }
      const headers = Array.from(headerSet);

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
              Сотрудники сопоставляются по коду (ВПР). Договоры создаются по
              коду проекта. Периоды — помесячные.
            </p>
          </div>

          {/* Column mapping */}
          {rawHeaders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Сопоставление колонок</h4>
              <div className="overflow-x-auto rounded-md border p-3">
                <div className="flex gap-3 min-w-max">
                  {DB_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex flex-col gap-1 min-w-[170px]"
                    >
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
              <span>
                Найдено: <strong>{stats.employees}</strong> сотрудников
              </span>
              <span>
                <strong>{stats.contracts}</strong> договоров
              </span>
              <span>
                <strong>{stats.months}</strong> периодов
              </span>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Preview table */}
          {rows.length > 0 && (
            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">
                      Сотрудник
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Тариф</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Ставка с/с
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Код договора
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Описание
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Сумма</TableHead>
                    <TableHead className="whitespace-nowrap">Месяц</TableHead>
                    <TableHead className="whitespace-nowrap">FTE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">
                        {row.employeeCode}
                      </TableCell>
                      <TableCell>{row.tariff}</TableCell>
                      <TableCell className="text-right">
                        {row.costRate > 0
                          ? row.costRate.toLocaleString("ru-RU")
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.contractName || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap max-w-[250px] truncate">
                        {row.contractDescription || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.contractAmount > 0
                          ? row.contractAmount.toLocaleString("ru-RU")
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatExcelDate(row.month)}
                      </TableCell>
                      <TableCell>{row.fte}</TableCell>
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
