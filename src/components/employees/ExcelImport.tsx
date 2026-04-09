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
  generalDirector: string;
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
const COL_GENERAL_DIRECTOR = ["Генеральный директор", "Ген. директор", "CEO", "ceo"];
const COL_CFO = ["ЦФО", "CFO", "cfo"];
const COL_BLOCK = ["Блок", "Block", "block"];
const COL_DEPT = ["Подразделение", "Department", "department"];
const COL_SUB_DEPT = ["Дочернее подразделение", "SubDepartment", "subDepartment"];
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

const ALL_KNOWN_ALIASES = [
  ...COL_GENERAL_DIRECTOR, ...COL_CFO, ...COL_BLOCK, ...COL_DEPT, ...COL_SUB_DEPT,
  ...COL_POSITION, ...COL_NAME, ...COL_FTE, ...COL_CATEGORY,
];

interface DbField {
  key: keyof ImportRow;
  label: string;
  defaultValue: string | number;
  aliases: string[];
}

const DB_FIELDS: DbField[] = [
  { key: "generalDirector", label: "Генеральный директор", defaultValue: "Генеральный директор", aliases: COL_GENERAL_DIRECTOR },
  { key: "cfo", label: "ЦФО", defaultValue: "", aliases: COL_CFO },
  { key: "block", label: "Блок", defaultValue: "", aliases: COL_BLOCK },
  { key: "department", label: "Подразделение", defaultValue: "", aliases: COL_DEPT },
  { key: "subDepartment", label: "Дочернее подразделение", defaultValue: "", aliases: COL_SUB_DEPT },
  { key: "position", label: "Должность", defaultValue: "Не указана", aliases: COL_POSITION },
  { key: "fullName", label: "ФИО", defaultValue: "", aliases: COL_NAME },
  { key: "fte", label: "FTE", defaultValue: 1, aliases: COL_FTE },
  { key: "category", label: "Тип занятости", defaultValue: "PP", aliases: COL_CATEGORY },
];

const MAPPING_STORAGE_KEY = "excel-import-mapping-v2";
const NONE_VALUE = "__none__";

type ColumnMapping = Record<keyof ImportRow, string | null>;

function createEmptyMapping(): ColumnMapping {
  const m = {} as ColumnMapping;
  for (const f of DB_FIELDS) m[f.key] = null;
  return m;
}

// Find the row number (0-based) that contains column headers
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
  return 0; // fallback to first row
}

function loadSavedMapping(): Partial<Record<keyof ImportRow, string>> {
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
    // Priority 1: saved mapping from localStorage (if header still exists)
    const savedHeader = saved[field.key];
    if (savedHeader && headers.includes(savedHeader)) {
      mapping[field.key] = savedHeader;
      continue;
    }

    // Priority 2: match by aliases
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
): ImportRow[] {
  return rawRows.map((row) => {
    const out = {} as ImportRow;
    for (const field of DB_FIELDS) {
      const sourceCol = mapping[field.key];
      const rawValue = sourceCol ? row[sourceCol] : undefined;

      if (field.key === "fte") {
        const num = rawValue != null ? Number(rawValue) : NaN;
        out.fte = isNaN(num) ? (field.defaultValue as number) : num;
      } else {
        const str = rawValue != null ? String(rawValue) : "";
        (out as Record<string, string | number>)[field.key] =
          str || (field.defaultValue as string);
      }
    }
    return out;
  });
}

export function ExcelImport({
  open,
  onClose,
  scenarioId,
  onImportComplete,
}: ExcelImportProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string | number>[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(() => createEmptyMapping());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelOrgStructure, setModelOrgStructure] = useState(true);
  const [clearExisting, setClearExisting] = useState<"clear" | "append">(
    "clear"
  );
  const [defaultShetilType, setDefaultShetilType] =
    useState<ShetilType>("BACKOFFICE");
  const [gdConflictValues, setGdConflictValues] = useState<string[]>([]);
  const [gdSelected, setGdSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Recompute rows whenever mapping or rawRows change
  useEffect(() => {
    if (rawRows.length === 0) {
      setRows([]);
      setGdConflictValues([]);
      setGdSelected(null);
      return;
    }
    const applied = applyMapping(rawRows, mapping).filter((r) => r.fullName.trim());

    // Detect unique non-empty generalDirector values
    if (mapping.generalDirector) {
      const unique = Array.from(
        new Set(
          applied
            .map((r) => r.generalDirector?.trim())
            .filter((v): v is string => !!v && v !== "Генеральный директор")
        )
      );
      setGdConflictValues(unique);
      if (unique.length === 1) {
        setGdSelected(unique[0]);
      } else if (unique.length === 0) {
        setGdSelected("Генеральный директор");
      } else if (gdSelected && !unique.includes(gdSelected)) {
        setGdSelected(null);
      }
    } else {
      setGdConflictValues([]);
      setGdSelected(null);
    }

    setRows(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, mapping]);

  const updateMapping = useCallback((fieldKey: keyof ImportRow, value: string | null) => {
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

      // Auto-detect header row (handles files with title rows above the table)
      const headerRowIdx = findHeaderRow(XLSX, sheet);
      const fullRange = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      const dataRange = { ...fullRange, s: { ...fullRange.s, r: headerRowIdx } };

      const jsonData = XLSX.utils.sheet_to_json<
        Record<string, string | number>
      >(sheet, { range: dataRange });

      if (jsonData.length === 0) {
        setError("Файл пуст или не содержит данных");
        return;
      }

      // Normalize headers: xlsx may preserve newlines from merged cells
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
    if (mapping.generalDirector && gdConflictValues.length > 1 && !gdSelected) {
      setError("Выберите одно значение 'Генеральный директор' для всей организации");
      return;
    }
    setLoading(true);
    setError("");

    // Apply selected GD value to all rows (if mapping is set)
    const finalRows = mapping.generalDirector
      ? rows.map((r) => ({
          ...r,
          generalDirector:
            gdSelected ||
            (r.generalDirector && r.generalDirector.trim()
              ? r.generalDirector
              : "Генеральный директор"),
        }))
      : rows;

    try {
      saveMapping(mapping);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          modelOrgStructure,
          clearExisting: modelOrgStructure && clearExisting === "clear",
          defaultShetilType,
          rows: finalRows,
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
    setRawRows([]);
    setRawHeaders([]);
    setMapping(createEmptyMapping());
    setGdConflictValues([]);
    setGdSelected(null);
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
          <DialogTitle>Импорт из Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <div>
            <input
              id="excel-file-input"
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="sr-only"
            />
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={loading} asChild>
                <label htmlFor="excel-file-input" className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Выбрать файл
                </label>
              </Button>
              {fileName && (
                <span className="text-sm text-neutral-700">{fileName}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              После загрузки файла сопоставьте колонки из Excel с полями БД
            </p>
          </div>

          {/* Column mapping */}
          {rawHeaders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">📋 Сопоставление колонок</h4>
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

          {/* GD conflict selector */}
          {rows.length > 0 && mapping.generalDirector && gdConflictValues.length > 1 && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4">
              <h4 className="text-sm font-medium text-amber-900">
                ⚠️ Найдено несколько значений &quot;Генеральный директор&quot;
              </h4>
              <p className="text-xs text-amber-800">
                В разных строках указаны разные значения. Выберите одно,
                которое будет применено ко всей организации:
              </p>
              <RadioGroup
                value={gdSelected ?? ""}
                onValueChange={(v) => setGdSelected(v)}
                className="space-y-1"
              >
                {gdConflictValues.map((v) => (
                  <div key={v} className="flex items-center space-x-2">
                    <RadioGroupItem value={v} id={`gd-${v}`} />
                    <Label htmlFor={`gd-${v}`} className="cursor-pointer font-normal">
                      {v}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

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
                    <TableHead className="whitespace-nowrap">Ген. директор</TableHead>
                    <TableHead className="whitespace-nowrap">ЦФО</TableHead>
                    <TableHead className="whitespace-nowrap">Блок</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Подразделение
                    </TableHead>
                    <TableHead className="whitespace-nowrap">
                      Дочернее подр.
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
                      <TableCell className="whitespace-nowrap">{row.generalDirector}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.cfo}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.block}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.department}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.subDepartment}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.position}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.fullName}</TableCell>
                      <TableCell>{row.fte}</TableCell>
                      <TableCell>{row.category}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 10 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
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
