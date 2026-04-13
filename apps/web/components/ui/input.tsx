import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const inputClassName =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, ...props }: InputProps) {
  return (
    <input className={cn(inputClassName, className)} {...props} />
  );
}
