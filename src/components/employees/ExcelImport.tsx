"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
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

interface ExcelImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: ImportRow[]) => void;
}

export interface ImportRow {
  fullName: string;
  position: string;
  category: string;
  fte: number;
  departmentName?: string;
}

export function ExcelImport({ open, onClose, onImport }: ExcelImportProps) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
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
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);

      const parsed: ImportRow[] = jsonData.map((row) => ({
        fullName: String(row["ФИО"] ?? row["fullName"] ?? row["Name"] ?? ""),
        position: String(row["Должность"] ?? row["position"] ?? row["Position"] ?? ""),
        category: String(row["Категория"] ?? row["category"] ?? row["Category"] ?? "PP").toUpperCase(),
        fte: Number(row["FTE"] ?? row["fte"] ?? row["Ставка"] ?? 1),
        departmentName: row["Подразделение"] ?? row["department"]
          ? String(row["Подразделение"] ?? row["department"])
          : undefined,
      }));

      setRows(parsed.filter((r) => r.fullName));
    } catch {
      setError("Ошибка чтения файла");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт из Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
            >
              <Upload className="mr-2 h-4 w-4" />
              Выбрать файл
            </Button>
            <p className="mt-1 text-xs text-neutral-500">
              Ожидаемые колонки: ФИО, Должность, Категория (ПП/ОПП/АУП), FTE
            </p>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {rows.length > 0 && (
            <div className="max-h-60 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ФИО</TableHead>
                    <TableHead>Должность</TableHead>
                    <TableHead>Кат.</TableHead>
                    <TableHead>FTE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.fullName}</TableCell>
                      <TableCell>{row.position}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>{row.fte}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-neutral-500">
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
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => onImport(rows)}
            disabled={rows.length === 0}
          >
            Импортировать ({rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
