import { getCurrentUser } from '@/core/auth/session';

export default async function HomePage() {
  const user = await getCurrentUser();
  return <main className="p-6">Hoş geldiniz, {user?.name}.</main>;
}
