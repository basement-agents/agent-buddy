import { useState } from "react";
import { Button } from "./button";
import { ModalDialog } from "./modal-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const isConfirming = loading || confirming;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Confirmation action failed:", error);
    } finally {
      setConfirming(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (isConfirming && !next) return;
    onOpenChange(next);
  };

  return (
    <ModalDialog
      description={description}
      onOpenChange={handleOpenChange}
      open={open}
      title={title}
    >
      <div className="mt-4 flex justify-end gap-3">
        <Button disabled={isConfirming} onClick={() => onOpenChange(false)} variant="outline">
          {cancelLabel}
        </Button>
        <Button
          loading={isConfirming}
          onClick={handleConfirm}
          variant={destructive ? "error" : "primary"}
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalDialog>
  );
}
