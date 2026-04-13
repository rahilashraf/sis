import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({
  actions,
  className,
  description,
  meta,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-4 flex flex-wrap gap-2">{meta}</div> : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
