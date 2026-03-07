"use client";

interface PnlLegendProps {
  thresholds: {
    deepRed: number;
    red: number;
    yellow: number;
    green: number;
    deepGreen: number;
  };
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

const stops = [
  { color: "#991b1b", label: "deepRed" },
  { color: "#dc2626", label: "red" },
  { color: "#f59e0b", label: "yellow" },
  { color: "#22c55e", label: "green" },
  { color: "#15803d", label: "deepGreen" },
] as const;

export function PnlLegend({ thresholds }: PnlLegendProps) {
  const values = [
    thresholds.deepRed,
    thresholds.red,
    thresholds.yellow,
    thresholds.green,
    thresholds.deepGreen,
  ];

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg border bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
      <div className="mb-1 text-[10px] font-medium text-neutral-500">
        Шкала P&L
      </div>
      <div className="flex items-center gap-0">
        {stops.map((stop, i) => (
          <div key={stop.label} className="flex flex-col items-center">
            <div
              className="h-3 w-12"
              style={{
                backgroundColor: stop.color,
                borderRadius:
                  i === 0
                    ? "4px 0 0 4px"
                    : i === stops.length - 1
                    ? "0 4px 4px 0"
                    : undefined,
              }}
            />
            <span className="mt-0.5 text-[9px] text-neutral-500">
              {formatNumber(values[i])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
