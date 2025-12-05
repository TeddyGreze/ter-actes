// web/src/app/admin/(protected)/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  // Vérification côté serveur avant rendu
  const hasJwt = !!cookies().get('access_token')?.value;
  if (!hasJwt) redirect('/admin/login');
  return <>{children}</>;
}
