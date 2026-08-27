"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  side?: "left" | "right";
  /** Развернуть поверх всего окна: ширина и ручка не действуют,
   *  выставленное перетаскиванием значение сохраняется до возврата. */
  fullscreen?: boolean;
}

/**
 * Wrapper that adds a draggable resize handle to a panel.
 * side="right" means the panel is on the right — handle is on the left edge.
 */
export function ResizablePanel({
  children,
  defaultWidth,
  minWidth = 300,
  maxWidth,
  className = "",
  side = "right",
  fullscreen = false,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const effectiveMaxWidth = maxWidth || (typeof window !== "undefined" ? window.innerWidth - 300 : 1200);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      e.preventDefault();
    },
    [width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const delta = startX.current - e.clientX;
      const direction = side === "right" ? 1 : -1;
      const newWidth = Math.min(
        effectiveMaxWidth,
        Math.max(minWidth, startWidth.current + delta * direction)
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minWidth, effectiveMaxWidth, side]);

  return (
    <div
      className={fullscreen ? "fixed inset-0 z-40 flex bg-white" : `relative flex ${className}`}
      style={fullscreen ? undefined : { width: `${width}px`, minWidth: `${minWidth}px` }}
    >
      {/* Resize handle — left edge for right-side panels */}
      {!fullscreen && side === "right" && (
        <div
          onMouseDown={handleMouseDown}
          className="group absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-ink-100/60 active:bg-ink-200/60"
        >
          <div className="h-8 w-1 rounded-full bg-ink-300 transition-colors group-hover:bg-ink-400 group-active:bg-brand" />
        </div>
      )}

      {/* Panel content */}
      <div className="flex h-full w-full flex-col overflow-hidden">
        {children}
      </div>

      {/* Resize handle — right edge for left-side panels */}
      {!fullscreen && side === "left" && (
        <div
          onMouseDown={handleMouseDown}
          className="group absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-ink-100/60 active:bg-ink-200/60"
        >
          <div className="h-8 w-1 rounded-full bg-ink-300 transition-colors group-hover:bg-ink-400 group-active:bg-brand" />
        </div>
      )}
    </div>
  );
}
