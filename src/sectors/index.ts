import { bags } from './bags';
import { plasticBags } from './plastic-bags';
import { ROLE_LABELS, type Role } from '@/core/modules/types';
import type { SectorPackage } from './types';

const SECTORS: Record<string, SectorPackage> = { bags: bags as unknown as SectorPackage, 'plastic-bags': plasticBags as unknown as SectorPackage };

export const SECTOR_IDS = Object.keys(SECTORS);

export function getSector(id: string): SectorPackage {
  const sector = SECTORS[id];
  if (!sector) throw new Error(`Bilinmeyen sektör: ${id}`);
  return sector;
}

/** Rol adları: genel adlar, sektörün bölüm adlarıyla ezilir. */
export function roleLabelsFor(sectorId: string): Record<Role, string> {
  const sector = SECTORS[sectorId];
  return { ...ROLE_LABELS, ...(sector?.roleLabels ?? {}) };
}
