'use client';
import { createContext, useContext } from 'react';
import { ROLE_LABELS, type Role } from '@/core/modules/types';

// Rol adları kurulumun sektörüne göre değişir (ör. plastikte "Dilimleme" yerine "Ekstrüzyon"); kabuk sağlar.
const RoleLabelsContext = createContext<Record<Role, string>>(ROLE_LABELS);

export function RoleLabelsProvider({ labels, children }: { labels: Record<Role, string>; children: React.ReactNode }) {
  return <RoleLabelsContext.Provider value={labels}>{children}</RoleLabelsContext.Provider>;
}

export const useRoleLabels = () => useContext(RoleLabelsContext);
