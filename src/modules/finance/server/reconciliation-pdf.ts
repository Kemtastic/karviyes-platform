import { formatMoney, money, type Currency } from '@/core/money';
import { renderReconciliationPdf } from '@/core/pdf/documents';
import type { ReconciliationResponse, ReconciliationSnapshot } from '../db/schema';

const STATUS: Record<string, string> = { agreed: 'Mutabıkız', disputed: 'Mutabık değiliz' };

/** Mutabakat kaydından PDF (iç ekran ve karşı taraf bağlantısı aynı belgeyi alır). */
export function reconciliationPdf(r: { no: string; currency: Currency; asOf: string; balance: string; contactName: string; message: string; status: string; snapshot: ReconciliationSnapshot; response: ReconciliationResponse | null }) {
  const fm = (v: string) => formatMoney(money(v, r.currency));
  const b = BigInt(r.balance);
  return renderReconciliationPdf({
    no: r.no, company: r.snapshot.company, companyInfo: r.snapshot.companyInfo, partyName: r.snapshot.partyName, taxId: r.snapshot.taxId, asOf: r.asOf,
    balance: fm((b < 0n ? -b : b).toString()), side: b > 0n ? 'firmamıza borçlusunuz' : b < 0n ? 'firmamızdan alacaklısınız' : 'hesap kapalı',
    contactName: r.contactName, message: r.message, truncated: r.snapshot.truncated,
    rows: r.snapshot.rows.map((x) => ({ date: x.date, text: x.text, debit: x.debit !== '0' ? fm(x.debit) : '', credit: x.credit !== '0' ? fm(x.credit) : '', balance: fm(x.balance) })),
    response: r.response && (r.status === 'agreed' || r.status === 'disputed')
      ? { status: STATUS[r.status]!, name: r.response.name, title: r.response.title, note: r.response.note, counterBalance: r.response.counterBalance ? fm(r.response.counterBalance) : null, at: r.response.at }
      : null,
  });
}
