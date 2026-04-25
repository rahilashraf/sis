import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  children: ReactNode;
  className?: string;
  description?: string;
  htmlFor?: string;
  label: string;
};

type CheckboxFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  description?: string;
  label: string;
};

export function Field({
  children,
  className,
  description,
  htmlFor,
  label,
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        className="block text-sm font-medium text-slate-700"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      {children}
      {description ? (
        <p className="text-xs leading-5 text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  className,
  description,
  label,
  ...props
}: CheckboxFieldProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3",
        className,
      )}
    >
      <input
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-4 focus:ring-slate-950/10"
        type="checkbox"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
