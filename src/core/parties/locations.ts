import locations from './data/turkey-locations.json';
import taxOffices from './data/tax-offices.json';

const LOCATIONS = locations as Record<string, string[]>;
const TAX_OFFICES = taxOffices as Record<string, string[]>;

export const PROVINCES = Object.keys(LOCATIONS).sort((a, b) => a.localeCompare(b, 'tr'));

export function districtsOf(province: string): string[] {
  return LOCATIONS[province] ?? [];
}

export function isDistrictOf(province: string, district: string): boolean {
  return districtsOf(province).includes(district);
}

export function taxOfficesOf(province: string): string[] {
  return TAX_OFFICES[province] ?? [];
}
