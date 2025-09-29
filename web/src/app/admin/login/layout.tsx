// web/src/app/admin/login/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  const hasJwt = !!cookies().get('access_token')?.value;
  if (hasJwt) {
    redirect('/admin'); // déjà connecté → tableau de bord
  }
  return <>{children}</>;
}
