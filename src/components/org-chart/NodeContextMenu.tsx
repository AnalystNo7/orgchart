"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Plus, CopyPlus, Trash2 } from "lucide-react";

interface NodeContextMenuProps {
  children: React.ReactNode;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  isRoot: boolean;
}

export function NodeContextMenu({
  children,
  onAddChild,
  onAddSibling,
  onDelete,
  isRoot,
}: NodeContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onAddChild}>
          <Plus className="mr-2 h-4 w-4" />
          Добавить дочернее
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddSibling} disabled={isRoot}>
          <CopyPlus className="mr-2 h-4 w-4" />
          Добавить параллельное
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-red-600"
          disabled={isRoot}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
