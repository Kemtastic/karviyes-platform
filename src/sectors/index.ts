import { bags } from './bags';
import type { SectorPackage } from './types';

const SECTORS: Record<string, SectorPackage> = { bags: bags as unknown as SectorPackage };

export function getSector(id: string): SectorPackage {
  const sector = SECTORS[id];
  if (!sector) throw new Error(`Bilinmeyen sektör: ${id}`);
  return sector;
}
