'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function AdminLogin() {
  const search = useSearchParams();
  // ➜ par défaut on va sur le tableau de bord
  const next = search.get('next') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    try {
      // Auth FastAPI (pose le cookie HttpOnly access_token)
      const form = new FormData();
      form.set('username', email);
      form.set('password', password);

      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        body: form,
        credentials: 'include', // important: reçoit le cookie JWT
        cache: 'no-store',
      });

      if (!res.ok) {
        setMsg('Échec de connexion');
        return;
      }

      // Pose un cookie côté Next pour que middleware/layout voient immédiatement la session
      await fetch('/api/session/set', { method: 'POST', cache: 'no-store' }).catch(() => {});

      // Hard reload pour rejouer le middleware avec cookies à jour
      window.location.assign(next);
    } catch (err) {
      setMsg('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: '0 auto' }}>
      <h1>Connexion Admin</h1>

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>

        {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
      </form>
    </main>
  );
}
