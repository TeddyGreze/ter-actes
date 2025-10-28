'use client';

import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

type Props = {
  // est-ce qu'un filtre avancé est actif ?
  advActive: boolean;
  // appliquer un filtre avancé (liste d'ids issus de /actes/search_fulltext)
  onApply: (term: string, ids: number[]) => void;
  // réinitialiser le filtre avancé
  onReset: () => void;
};

export default function AdvancedSearchPanel({ advActive, onApply, onReset }: Props) {
  // ouverture / fermeture du formulaire avancé
  const [open, setOpen] = useState(false);

  // champ de recherche avancée
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  function toggleOpen() {
    setOpen(o => !o);
  }

  async function runSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!q.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `${API}/actes/search_fulltext?q=${encodeURIComponent(q)}`,
        { method: 'GET' }
      );

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || `HTTP ${res.status}`);
      }

      const data = await res.json();

      // On ne garde QUE les ids uniques numériques
      const ids = Array.isArray(data)
        ? Array.from(
            new Set(
              data
                .map((hit: any) => hit?.id)
                .filter((id: any) => typeof id === 'number')
            )
          )
        : [];

      // On envoie ça au parent pour filtrer le tableau
      onApply(q.trim(), ids);

      // on laisse ouvert
    } catch (err) {
      console.error(err);
      setError('Erreur lors de la recherche.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="adv-wrapper">
      <div className="adv-inline-row">
        {/* Bouton pour ouvrir/fermer la zone de recherche avancée */}
        <button
          type="button"
          className="raa-btn adv-toggle-btn"
          onClick={toggleOpen}
        >
          <span>Recherche avancée</span>
          <span className="adv-chevron">{open ? '▲' : '▼'}</span>
        </button>

        {/* Bouton Réinitialiser si un filtre avancé est actif */}
        {advActive && (
          <button
            type="button"
            className="raa-btn-outline adv-reset-inline"
            onClick={onReset}
          >
            Réinitialiser
          </button>
        )}

        {/* Formulaire avancé, inline (desktop) ou en dessous (mobile) */}
        <div
          className={
            'adv-inline-formwrap ' + (open ? 'is-open' : '')
          }
          aria-hidden={open ? 'false' : 'true'}
        >
          <form onSubmit={runSearch} className="adv-inline-form">
            <input
              className="raa-input adv-inline-input"
              placeholder="Rechercher dans le corps du document..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <button
              className="raa-btn adv-inline-submit"
              type="submit"
              disabled={loading || !q.trim()}
            >
              {loading ? 'Recherche…' : 'Rechercher'}
            </button>
          </form>

          {error && <p className="search-error adv-error">{error}</p>}
        </div>
      </div>
    </section>
  );
}
