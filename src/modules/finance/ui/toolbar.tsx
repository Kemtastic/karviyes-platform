'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt, Repeat, ScrollText } from 'lucide-react';
import { Button } from '@/ui/button';
import { CheckDialog, ExpenseDialog, InvoiceDialog, PaymentDialog, TransferDialog, type AccountOption } from './dialogs';

export type QuickAction = 'collection' | 'payment' | 'sales' | 'purchase' | 'sales_return' | 'purchase_return' | 'expense' | 'income' | 'transfer' | 'checkIn' | 'checkOut';

const LABELS: Record<QuickAction, string> = {
  collection: 'Tahsilat al', payment: 'Ödeme yap', sales: 'Satış faturası', purchase: 'Alış faturası', sales_return: 'Satış iadesi', purchase_return: 'Alış iadesi', expense: 'Masraf gir', income: 'Diğer gelir',
  transfer: 'Virman', checkIn: 'Çek al', checkOut: 'Çek ver',
};
const ICONS: Partial<Record<QuickAction, React.ReactNode>> = {
  collection: <ArrowDownLeft aria-hidden className="h-4 w-4" />, payment: <ArrowUpRight aria-hidden className="h-4 w-4" />, sales: <Receipt aria-hidden className="h-4 w-4" />,
  purchase: <Receipt aria-hidden className="h-4 w-4" />, expense: <Plus aria-hidden className="h-4 w-4" />, transfer: <Repeat aria-hidden className="h-4 w-4" />, checkIn: <ScrollText aria-hidden className="h-4 w-4" />,
};

/** Ekranların üstündeki hızlı işlem düğmeleri; ilk düğme vurgulu. */
export function FinanceToolbar({ actions, accounts }: { actions: QuickAction[]; accounts: AccountOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<QuickAction | null>(null);
  const close = () => setOpen(null);
  const done = () => { setOpen(null); router.refresh(); };
  return (
    <>
      {actions.map((a, i) => (
        <Button key={a} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => setOpen(a)}>{ICONS[a]} {LABELS[a]}</Button>
      ))}
      {(open === 'collection' || open === 'payment') && <PaymentDialog kind={open} accounts={accounts} onClose={close} onDone={done} />}
      {(open === 'sales' || open === 'purchase' || open === 'sales_return' || open === 'purchase_return') && <InvoiceDialog kind={open} onClose={close} onDone={done} />}
      {open === 'expense' && <ExpenseDialog direction="out" accounts={accounts} onClose={close} onDone={done} />}
      {open === 'income' && <ExpenseDialog direction="in" accounts={accounts} onClose={close} onDone={done} />}
      {open === 'transfer' && <TransferDialog accounts={accounts} onClose={close} onDone={done} />}
      {open === 'checkIn' && <CheckDialog direction="received" onClose={close} onDone={done} />}
      {open === 'checkOut' && <CheckDialog direction="issued" onClose={close} onDone={done} />}
    </>
  );
}
