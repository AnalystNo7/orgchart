import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold leading-tight transition-colors",
  {
    variants: {
      variant: {
        default: "bg-sky-soft text-brand-800",
        secondary: "bg-ink-100 text-ink-600",
        outline: "border border-line-strong bg-white text-ink-600",
        destructive: "bg-err-bg text-err",
        success: "bg-ok-bg text-ok",
        warning: "bg-warn-bg text-[#B7780A]",
        orange: "bg-[#FFE7D8] text-accent-orange-700",
        ai: "bg-ai-bg text-ai",
      },
      dot: {
        true: "before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-['']",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, dot, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, dot }), className)} {...props} />;
}

export { Badge, badgeVariants };
