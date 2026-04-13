import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-950 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-950/15",
  secondary:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-950/10",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-600/20",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-950/10",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 rounded-lg px-3 text-sm",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-11 rounded-xl px-5 text-sm",
};

export function buttonClassName({
  className,
  size = "md",
  variant = "primary",
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );
}

export function Button({
  className,
  size = "md",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName({ className, size, variant })}
      {...props}
    />
  );
}
