import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] border border-transparent text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-600 active:bg-brand-700",
        orange: "bg-accent-orange text-white hover:bg-accent-orange-700",
        destructive: "bg-err text-white hover:brightness-95",
        outline: "border-line-strong bg-white text-ink-700 hover:border-ink-400 hover:text-ink-800",
        secondary: "border-line-strong bg-white text-ink-700 hover:border-ink-400 hover:text-ink-800",
        ghost: "text-brand hover:bg-sky-soft",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-[30px] px-3 text-[12.5px]",
        lg: "h-11 px-[22px] text-sm",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
