"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger" | "ghost";
  description: string;
  errorMessage?: string | null;
  isOpen: boolean;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  pendingLabel?: string;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Delete",
  confirmVariant = "danger",
  description,
  errorMessage,
  isOpen,
  isPending = false,
  onCancel,
  onConfirm,
  pendingLabel = "Deleting...",
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPending, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-describedby={errorMessage ? `${descriptionId} ${errorId}` : descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onCancel();
        }
      }}
      role="dialog"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950" id={titleId}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600" id={descriptionId}>
          {description}
        </p>
        {errorMessage ? (
          <p
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            id={errorId}
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            disabled={isPending}
            onClick={onCancel}
            type="button"
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={isPending}
            onClick={() => {
              void onConfirm();
            }}
            type="button"
            variant={confirmVariant}
          >
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
