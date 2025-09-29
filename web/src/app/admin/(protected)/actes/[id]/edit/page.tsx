'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

type PDFViewerProps = { url: string };
const PDFViewer = dynamic<PDFViewerProps>(
  () => import('../../../../../../components/PDFViewer'),
  { ssr: false }
);

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

type Acte = {
  id: number;
  titre: string;
  type?: string;
  service?: string;
  date_signature?: string | null;
  date_publication?: string | null;
  statut?: string | null;
  resume?: string | null;
  pdf_path: string;
  created_at: string;
};

export default function EditActePage() {
  const router = useRouter();
  const params = useParams() as { id: string };
  const [a, setA] = useState<Acte | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // pour pouvoir vider l’input file
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Aperçu (modale)
  const [showPreview, setShowPreview] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null);

  // version pour casser le cache du PDF actuel
  const [pdfVersion, setPdfVersion] = useState<number>(Date.now());

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API}/actes/${params.id}`, { credentials: 'include' });
      if (!res.ok) { router.replace('/admin/login'); return; }
      setA(await res.json());
      // à chaque ouverture de page on change la version pour être sûr de ne
      // jamais retomber sur un PDF mis en cache
      setPdfVersion(Date.now());
    };
    load();
  }, [params.id, router]);

  // crée/révogue l’URL blob du fichier sélectionné
  useEffect(() => {
    if (!file) {
      if (newFileUrl) URL.revokeObjectURL(newFileUrl);
      setNewFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setNewFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ESC pour fermer la modale
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a) return;
    setSaving(true); setMsg('');

    const fd = new FormData();
    fd.set('titre', a.titre);
    if (a.type) fd.set('type', a.type);
    if (a.service) fd.set('service', a.service);
    if (a.date_signature ?? '') fd.set('date_signature', a.date_signature as string);
    if (a.date_publication ?? '') fd.set('date_publication', a.date_publication as string);
    if (a.statut ?? '') fd.set('statut', a.statut as string);
    if (a.resume ?? '') fd.set('resume', a.resume as string);
    if (file) fd.set('pdf', file);

    const res = await fetch(`${API}/admin/actes/${a.id}`, {
      method: 'PUT',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) { setMsg('Erreur: ' + await res.text()); setSaving(false); return; }

    // ✅ enregistré : on bump la version pour invalider le cache
    setPdfVersion(Date.now());
    setMsg('Modifications enregistrées.');
    setSaving(false);

    // si tu préfères rester sur la page pour re-visualiser, garde cette ligne commentée
    router.replace('/admin');
  };

  if (!a) return <main style={{ padding: 24 }}>Chargement…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <p><Link href="/admin">← Retour</Link></p>
      <h1>Modifier l’acte #{a.id}</h1>

      {/* Lien pour voir le PDF actuel (avec cache-buster) */}
      <div style={{ margin: '8px 0 16px', fontSize: 14 }}>
        PDF actuel :{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPreviewSrc(`${API}/actes/${a.id}/pdf?ts=${pdfVersion}`);
            setShowPreview(true);
          }}
          style={{ textDecoration: 'underline' }}
          title="Voir le PDF actuel"
        >
          ouvrir
        </a>
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <label>Titre
          <input value={a.titre} onChange={e => setA({ ...a, titre: e.target.value })} required />
        </label>
        <label>Type
          <input value={a.type || ''} onChange={e => setA({ ...a, type: e.target.value })} />
        </label>
        <label>Service
          <input value={a.service || ''} onChange={e => setA({ ...a, service: e.target.value })} />
        </label>
        <label>Date de signature
          <input
            type="date"
            value={a.date_signature || ''}
            onChange={e => setA({ ...a, date_signature: e.target.value || null })}
          />
        </label>
        <label>Date de publication
          <input
            type="date"
            value={a.date_publication || ''}
            onChange={e => setA({ ...a, date_publication: e.target.value || null })}
          />
        </label>
        <label>Statut
          <input value={a.statut || ''} onChange={e => setA({ ...a, statut: e.target.value })} />
        </label>
        <label>Résumé
          <textarea value={a.resume || ''} onChange={e => setA({ ...a, resume: e.target.value })} />
        </label>

        <label>Remplacer le PDF
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
        </label>

        {file && (
          <div style={{ fontSize: 14 }}>
            Aperçu (nouveau) :{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (newFileUrl) { setPreviewSrc(newFileUrl); setShowPreview(true); }
              }}
              style={{ textDecoration: 'underline' }}
              title="Prévisualiser le nouveau fichier"
            >
              {file.name}
            </a>
            {' '}·{' '}
            <button
              type="button"
              onClick={() => {
                setShowPreview(false);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              retirer
            </button>
          </div>
        )}

        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <p>{msg}</p>}
      </form>

      {showPreview && previewSrc && (
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
              <strong>Aperçu PDF</strong>
              <button onClick={() => setShowPreview(false)}>Fermer</button>
            </div>
            <div style={{ width: '100%', height: 'calc(100% - 36px)' }}>
              <PDFViewer url={previewSrc} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
