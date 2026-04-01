"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  side?: "left" | "right";
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
    <div className={`relative flex ${className}`} style={{ width: `${width}px`, minWidth: `${minWidth}px` }}>
      {/* Resize handle — left edge for right-side panels */}
      {side === "right" && (
        <div
          onMouseDown={handleMouseDown}
          className="group absolute left-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-purple-100/50 active:bg-purple-200/50"
        >
          <div className="h-8 w-1 rounded-full bg-neutral-300 transition-colors group-hover:bg-purple-400 group-active:bg-purple-500" />
        </div>
      )}

      {/* Panel content */}
      <div className="flex h-full w-full flex-col overflow-hidden">
        {children}
      </div>

      {/* Resize handle — right edge for left-side panels */}
      {side === "left" && (
        <div
          onMouseDown={handleMouseDown}
          className="group absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center hover:bg-purple-100/50 active:bg-purple-200/50"
        >
          <div className="h-8 w-1 rounded-full bg-neutral-300 transition-colors group-hover:bg-purple-400 group-active:bg-purple-500" />
        </div>
      )}
    </div>
  );
}
