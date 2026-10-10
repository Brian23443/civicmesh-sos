import { AlertTriangle, RotateCcw, X } from "lucide-react";

export interface DashboardToast {
  id: number;
  kind: "alert" | "undo" | "error";
  message: string;
  incidentId?: string;
}

interface ToastRegionProps {
  toast: DashboardToast | null;
  onDismiss: () => void;
  onUndo: (incidentId: string) => void;
}

export function ToastRegion({
  toast,
  onDismiss,
  onUndo,
}: ToastRegionProps) {
  if (!toast) return null;

  return (
    <div aria-live="assertive" className="toast-region">
      <div className="dashboard-toast" data-kind={toast.kind} role="status">
        <AlertTriangle size={17} aria-hidden="true" />
        <strong>{toast.message}</strong>
        {toast.kind === "undo" && toast.incidentId && (
          <button
            className="toast-undo"
            onClick={() => onUndo(toast.incidentId!)}
            type="button"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Undo
          </button>
        )}
        <button
          aria-label="Dismiss notification"
          className="toast-close"
          onClick={onDismiss}
          type="button"
        >
          <X size={15} aria-hidden="true" />
        </button>
        {toast.kind === "undo" && <span className="toast-timer" />}
      </div>
    </div>
  );
}
