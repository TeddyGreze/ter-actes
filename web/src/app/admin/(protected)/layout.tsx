import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const hasJwt = !!cookies().get('access_token')?.value;
  if (!hasJwt) {
    redirect('/admin/login');
  }
  return <>{children}</>;
}
