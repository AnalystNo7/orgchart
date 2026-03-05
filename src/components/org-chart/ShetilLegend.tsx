"use client";

import { SHETIL_CONFIG } from "@/types";
import type { ShetilType } from "@prisma/client";

const types: ShetilType[] = ["REVENUE", "RESOURCE", "SERVICE", "BACKOFFICE"];

export function ShetilLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex items-center gap-4 rounded-lg border bg-white/90 px-4 py-2 shadow-sm backdrop-blur-sm">
      {types.map((type) => {
        const config = SHETIL_CONFIG[type];
        return (
          <div key={type} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-3 w-3 rounded"
              style={{ backgroundColor: config.color }}
            />
            <span>{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
