'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

/** PDFViewer dynamiquement côté client */
type PDFViewerProps = { url: string };
/**
 * Chemin relatif depuis:
 *   /src/app/admin/(protected)/upload/page.tsx
 * vers:
 *   /src/components/PDFViewer.tsx
 * => ../../../../components/PDFViewer
 */
const PDFViewer = dynamic<PDFViewerProps>(
  () => import('../../../../components/PDFViewer'),
  { ssr: false }
);

export default function AdminUpload() {
  const search = useSearchParams();
  const next = search.get('next') || null;

  const [form, setForm] = useState<Record<string, string>>({
    titre: '',
    type: '',
    service: '',
    date_signature: '',
    date_publication: '',
    statut: '',
    resume: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 🔧 ref vers l'input fichier pour pouvoir le vider
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Aperçu PDF (blob URL + modale)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // crée / révoque l’URL blob quand le fichier change
  useEffect(() => {
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ESC pour fermer la modale
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ⛔️ vérifie la session réelle sur l'API (sans cache)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/admin/me?ts=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('unauthorized');
      } catch {
        window.location.assign('/admin/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
        return;
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    if (!file) {
      setMsg('Sélectionnez un PDF');
      return;
    }

    setSubmitting(true);

    const fd = new FormData();
    for (const k of Object.keys(form)) {
      if (form[k]) fd.set(k, form[k]);
    }
    fd.set('pdf', file);

    const res = await fetch(`${API}/admin/actes`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      setMsg('Erreur: ' + text);
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setMsg('Acte créé (id=' + data.id + ')');
    setSubmitting(false);
  };

  if (checking) {
    return <main style={{ padding: 24 }}>Vérification de session…</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <p><Link href="/admin">← Retour</Link></p>
      <h1>Dépôt d’un acte</h1>

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Titre
          <input
            value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })}
            required
          />
        </label>

        <label>
          Type
          <input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        </label>

        <label>
          Service
          <input
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
          />
        </label>

        <label>
          Date de signature
          <input
            type="date"
            value={form.date_signature}
            onChange={(e) => setForm({ ...form, date_signature: e.target.value })}
          />
        </label>

        <label>
          Date de publication
          <input
            type="date"
            value={form.date_publication}
            onChange={(e) => setForm({ ...form, date_publication: e.target.value })}
          />
        </label>

        <label>
          Statut
          <input value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} />
        </label>

        <label>
          Résumé
          <textarea value={form.resume} onChange={(e) => setForm({ ...form, resume: e.target.value })} />
        </label>

        <label>
          PDF
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </label>

        {/* Lien de prévisualisation cliquable + bouton retirer */}
        {file && (
          <div style={{ fontSize: 14 }}>
            Aperçu :{' '}
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setShowPreview(true); }}
              style={{ textDecoration: 'underline' }}
              title="Cliquer pour prévisualiser"
            >
              {file.name}
            </a>
            {' '}·{' '}
            <button
              type="button"
              onClick={() => {
                setShowPreview(false);
                setFile(null);
                // ✅ vide visuellement l'input => “Aucun fichier choisi”
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              retirer
            </button>
          </div>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Publication…' : 'Publier'}
        </button>

        {msg && <p>{msg}</p>}
      </form>

      {/* Modale d’aperçu PDF avec PDFViewer (uniformisé) */}
      {showPreview && previewUrl && (
        <div
          onClick={() => setShowPreview(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            display: 'grid', placeItems: 'center', zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', width: '90vw', height: '90vh',
              borderRadius: 8, padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Aperçu : {file?.name}</strong>
              <button onClick={() => setShowPreview(false)}>Fermer</button>
            </div>
            <div style={{ width: '100%', height: 'calc(100% - 36px)' }}>
              <PDFViewer url={previewUrl} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
