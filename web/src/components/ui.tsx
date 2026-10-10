import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Button({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`button ${className}`} {...props} />;
}
export function Status({ children }: { children: ReactNode }) {
  return <span className="status" role="status" aria-live="polite" aria-atomic="true">{children}</span>;
}
/** Native modal supplies focus trapping, background inertness, and Escape handling. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={id} onCancel={onClose} onClose={onClose} className="sheet">
    <div className="flex items-center justify-between gap-4"><h2 id={id}>{title}</h2><Button aria-label="Close panel" onClick={onClose}><X aria-hidden="true" size={20}/></Button></div>
    {children}
  </dialog>;
}
