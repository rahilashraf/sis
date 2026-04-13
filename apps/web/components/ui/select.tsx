import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const selectClassName =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-950 shadow-sm outline-none transition focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function Select({ className, ...props }: SelectProps) {
  return (
    <select className={cn(selectClassName, className)} {...props} />
  );
}
