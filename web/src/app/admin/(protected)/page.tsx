'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic'; // évite les caches côté Next
const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

type Acte = {
  id: number;
  titre: string;
  type?: string;
  service?: string;
  date_publication?: string;
  resume?: string;
  created_at: string;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [items, setItems] = useState<Acte[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const boot = async () => {
      // 1) check session (lit le cookie HttpOnly côté serveur)
      const me = await fetch(`${API}/admin/me`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      });
      if (!me.ok) {
        router.replace('/admin/login');
        return;
      }
      // 2) charge la liste
      await load();
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    const url = new URL(`${API}/admin/actes`);
    if (q) url.searchParams.set('q', q);

    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });

    if (!res.ok) {
      router.replace('/admin/login');
      return;
    }
    setItems(await res.json());
    setLoading(false);
  };

  const onDelete = async (id: number) => {
    if (!confirm('Voulez-vous vraiment supprimer cet acte ?')) return;
    const res = await fetch(`${API}/admin/actes/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });
    if (res.ok) load();
  };

  // 🔐 Logout robuste (même recette que la page Upload)
  const logout = async () => {
    try {
      // 1) invalide côté API (port 8000)
      await fetch(`${API}/admin/logout?ts=${Date.now()}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      });
    } catch {}

    try {
      // 2) supprime les cookies côté 3000 via Set-Cookie
      await fetch('/api/session/clear', { method: 'POST', cache: 'no-store' });
    } catch {}

    // 3) hard reload pour rejouer le middleware sans cookie
    window.location.assign('/admin/login');
  };

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1>Tableau de bord — Actes</h1>
        <div>
          <Link href="/admin/upload" className="btn">+ Ajouter un acte</Link>{' '}
          <button onClick={logout}>Se déconnecter</button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input placeholder="Recherche…" value={q} onChange={e => setQ(e.target.value)} />
        <button onClick={load} style={{ marginLeft: 8 }}>Rechercher</button>
      </div>

      {loading ? 'Chargement…' : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Titre</th>
              <th>Type</th>
              <th>Service</th>
              <th>Publication</th>
              <th style={{ width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(a => (
              <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{a.titre}</td>
                <td style={{ textAlign: 'center' }}>{a.type || '-'}</td>
                <td style={{ textAlign: 'center' }}>{a.service || '-'}</td>
                <td style={{ textAlign: 'center' }}>{a.date_publication || '-'}</td>
                <td style={{ textAlign: 'center' }}>
                  <Link href={`/admin/actes/${a.id}/edit`}>Modifier</Link>{' '}
                  <button onClick={() => onDelete(a.id)} style={{ marginLeft: 8 }}>Supprimer</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center' }}>Aucun acte</td></tr>
            )}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .btn {
          display:inline-block;background:#1b72e8;color:#fff;
          padding:8px 12px;border-radius:8px;text-decoration:none
        }
      `}</style>
    </main>
  );
}
