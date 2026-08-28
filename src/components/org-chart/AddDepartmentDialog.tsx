"use client";

import { useState } from "react";
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
import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

interface AddDepartmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; shetilType: ShetilType }) => void;
  title: string;
}

export function AddDepartmentDialog({
  open,
  onClose,
  onSubmit,
  title,
}: AddDepartmentDialogProps) {
  const [name, setName] = useState("");
  const [shetilType, setShetilType] = useState<ShetilType>("REVENUE");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), shetilType });
    setName("");
    setShetilType("REVENUE");
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setName("");
      setShetilType("REVENUE");
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
