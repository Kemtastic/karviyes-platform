import { Inbox } from 'lucide-react';

// Boş liste: ne olduğunu ve ne yapılacağını söyler.
export function EmptyState({ title, hint, action }: { title: string; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-stone-100 text-stone-500">
        <Inbox aria-hidden className="h-5 w-5" />
      </span>
      <p className="font-medium text-stone-700">{title}</p>
      {hint && <p className="max-w-md text-sm text-stone-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
