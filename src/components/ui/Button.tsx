"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent border-transparent hover:bg-accent-hover active:translate-y-px shadow-sm",
  secondary:
    "bg-ink text-canvas border-transparent hover:opacity-90 active:translate-y-px",
  outline:
    "bg-surface text-ink border-line-strong hover:border-accent hover:text-accent",
  ghost:
    "bg-transparent text-muted border-transparent hover:bg-sunken hover:text-ink",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-11 px-5 text-[14px] gap-2 rounded-[12px]",
  lg: "h-[52px] px-7 text-[15px] gap-2.5 rounded-[14px]",
};

const BASE =
  "inline-flex items-center justify-center border font-semibold tracking-[-0.01em] " +
  "transition-[background-color,color,border-color,opacity,transform] duration-150 " +
  "disabled:opacity-45 disabled:pointer-events-none select-none whitespace-nowrap";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export interface ButtonLinkProps
  extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
