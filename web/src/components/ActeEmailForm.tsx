// web/src/components/ActeEmailForm.tsx
'use client';

import React, { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface Props {
  acteId: number;
  acteTitle: string;
}

export default function ActeEmailForm({ acteId, acteTitle }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!email) {
      setError('Merci de saisir une adresse e-mail.');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API}/actes/${acteId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Le PDF est toujours joint
        body: JSON.stringify({ email, include_pdf: true }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        throw new Error(data?.detail ?? 'Erreur lors de l’envoi de l’e-mail.');
      }

      setMessage('E-mail envoyé. Pensez à vérifier vos spams.');
      setEmail('');
    } catch (err: any) {
      setError(err.message ?? 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="acte-email-form"
      aria-label={`Envoyer l'acte « ${acteTitle} » par e-mail`}
    >
      <label className="acte-email-label">
        Adresse e-mail du destinataire
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="acte-email-input"
          placeholder="ex : exemple@domaine.fr"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="acte-email-button"
      >
        {loading ? 'Envoi en cours…' : 'Envoyer par e-mail'}
      </button>

      {message && <p className="acte-email-success">{message}</p>}
      {error && <p className="acte-email-error">{error}</p>}
    </form>
  );
}
