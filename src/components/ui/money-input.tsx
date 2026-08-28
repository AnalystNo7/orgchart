"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface MoneyInputProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  className?: string;
}

function formatMoney(value: string): string {
  // Preserve leading minus
  const negative = value.startsWith("-");
  // Remove non-digit chars except dots
  const clean = value.replace(/[^\d.]/g, "");
  const parts = clean.split(".");
  // Format integer part with spaces every 3 digits
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  // Limit decimal to 2 digits
  if (parts[1] !== undefined) {
    parts[1] = parts[1].slice(0, 2);
  }
  return (negative ? "-" : "") + parts.join(".");
}

function parseMoney(formatted: string): number {
  const clean = formatted.replace(/\s/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function MoneyInput({ value, onChange, placeholder, className }: MoneyInputProps) {
  const [display, setDisplay] = useState(() =>
    value != null && value !== 0 ? formatMoney(String(value)) : ""
  );

  useEffect(() => {
    // Sync external value changes (e.g. form reset)
    const newDisplay = value != null && value !== 0 ? formatMoney(String(value)) : "";
    setDisplay(newDisplay);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const formatted = formatMoney(raw);
    setDisplay(formatted);
    const parsed = parseMoney(raw);
    onChange(parsed || null);
  }

  return (
    <Input
      value={display}
      onChange={handleChange}
      placeholder={placeholder ?? "0"}
      className={className}
      inputMode="decimal"
    />
  );
}
