import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  action,
  className,
  compact = false,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
      {...props}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
