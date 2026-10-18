'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';

type Props = { open: boolean; title: string; onClose: () => void; dirty?: boolean; children: React.ReactNode; wide?: boolean };

// Erişilebilir diyalog: odak içeride tutulur, Esc kapatır; kaydedilmemiş değişiklik varsa önce onay sorar.
export function Modal({ open, title, onClose, dirty = false, children, wide = false }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])');
    first?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!open) return null;

  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>('input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-[var(--shadow-pop)] sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <Button variant="ghost" onClick={requestClose} aria-label="Kapat" className="-mr-2 -mt-1 min-h-9 px-2">
            <X aria-hidden className="h-5 w-5" />
          </Button>
        </div>
        {confirming ? (
          <div className="space-y-4">
            <p>Girdiğiniz bilgiler kaybolacak. Kapatmak istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Forma dön
              </Button>
              <Button variant="danger" onClick={onClose}>
                Kapat ve vazgeç
              </Button>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
