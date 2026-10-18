import { redirect } from 'next/navigation';

// Sevk, panonun "Faturaya Hazır" sekmesinden ve iş kartından yapılır.
export default function ShipmentsPage() {
  redirect('/uretim?sekme=ready');
}
