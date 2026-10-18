import {
  Building2,
  ChartColumn,
  ClipboardList,
  Factory,
  Hammer,
  History,
  House,
  IdCard,
  Layers,
  type LucideIcon,
  Phone,
  Shield,
  Stamp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

// Modül bildirimlerindeki simge adları (manifest `icon`) → çizim. Bilinmeyen ad için nokta.
const ICONS: Record<string, LucideIcon> = {
  home: House,
  users: Users,
  'clipboard-list': ClipboardList,
  wallet: Wallet,
  chart: ChartColumn,
  factory: Factory,
  hammer: Hammer,
  layers: Layers,
  stamp: Stamp,
  truck: Truck,
  phone: Phone,
  shield: Shield,
  'id-card': IdCard,
  building: Building2,
  history: History,
};

export function NavIcon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const Icon = ICONS[name];
  return Icon ? <Icon aria-hidden className={className} strokeWidth={1.9} /> : <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />;
}
