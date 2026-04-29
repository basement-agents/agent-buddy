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
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      description={description}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    >
      <div className="mt-4 flex justify-end gap-3">
        <Button onClick={() => onOpenChange(false)} variant="outline">
          {cancelLabel}
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
          variant={destructive ? "error" : "primary"}
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalDialog>
  );
}
