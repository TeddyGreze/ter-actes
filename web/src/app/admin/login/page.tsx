'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import '../../styles/admin-auth.css';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function AdminLogin() {
  const search = useSearchParams();
  const next = search.get('next') || '/admin';

  const [ident, setIdent] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');

    try {
      // Auth FastAPI (cookie HttpOnly access_token)
      const form = new FormData();
      form.set('username', ident);
      form.set('password', password);

      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) {
        setMsg('Identifiant ou mot de passe incorrect.');
        return;
      }

      // Cookie côté Next pour rendre la session visible immédiatement
      await fetch('/api/session/set', { method: 'POST', cache: 'no-store' }).catch(() => {});

      window.location.assign(next);
    } catch {
      setMsg('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-wrap">
        <div className="auth-card">
          <h1 className="a-title">Connexion Admin</h1>

          <form onSubmit={submit} className="a-form" noValidate>
            <div className="a-field">
              <label htmlFor="ident">Identifiant</label>
              <input
                id="ident"
                className="a-input"
                value={ident}
                onChange={(e) => setIdent(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="a-field">
              <label htmlFor="pass">Mot de passe</label>
              <input
                id="pass"
                className="a-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="a-btn" disabled={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

            {msg && <p className="a-error" role="alert">{msg}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
