import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "success" | "warning" | "danger";

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  tone?: NoticeTone;
  children: ReactNode;
};

const toneStyles: Record<NoticeTone, string> = {
  info: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

export function Notice({
  children,
  className,
  title,
  tone = "info",
  ...props
}: NoticeProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 shadow-sm",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      <div className={cn("text-sm leading-6", title ? "mt-1" : undefined)}>
        {children}
      </div>
    </div>
  );
}
