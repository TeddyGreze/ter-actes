'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// CSS (chemin depuis .../app/admin/(protected)/actes/[id]/edit/page.tsx)
import '../../../../../styles/admin-upload.css';

type PDFViewerProps = { url: string };
const PDFViewer = dynamic<PDFViewerProps>(
  () => import('../../../../../../components/PDFViewer'),
  { ssr: false }
);

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

type Acte = {
  id: number;
  titre: string;
  type?: string | null;
  service?: string | null;
  date_signature?: string | null;
  date_publication?: string | null;
  statut?: string | null;
  resume?: string | null;
  pdf_path: string;
  created_at?: string;
};

export default function EditActePage() {
  const router = useRouter();
  const params = useParams() as { id: string };

  const [a, setA] = useState<Acte | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // référentiels + “Autre…”
  const [types, setTypes] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [useCustomType, setUseCustomType] = useState(false);
  const [customType, setCustomType] = useState('');
  const [useCustomService, setUseCustomService] = useState(false);
  const [customService, setCustomService] = useState('');

  // pour pouvoir vider l’input file
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modale d’aperçu (PDF actuel OU nouveau fichier)
  const [showPreview, setShowPreview] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null);

  // version pour casser le cache du PDF actuel
  const [pdfVersion, setPdfVersion] = useState<number>(Date.now());

  // Charge l’acte + les référentiels
  useEffect(() => {
    const load = async () => {
      try {
        const [actRes, tRes, sRes] = await Promise.all([
          fetch(`${API}/actes/${params.id}`, {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch(`${API}/admin/types`, { credentials: 'include', cache: 'no-store' }),
          fetch(`${API}/admin/services`, { credentials: 'include', cache: 'no-store' }),
        ]);

        if (!actRes.ok) { router.replace('/admin/login'); return; }

        const act = await actRes.json();
        setA(act);
        setPdfVersion(Date.now());

        const tData = await tRes.json().catch(() => []);
        const sData = await sRes.json().catch(() => []);
        setTypes(Array.isArray(tData) ? tData.map((r: any) => r.name) : []);
        setServices(Array.isArray(sData) ? sData.map((r: any) => r.name) : []);
      } catch {
        router.replace('/admin/login');
      }
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
  }, [file, newFileUrl]);

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

    // On applique la saisie libre si l’utilisateur est resté en mode “Autre…”
    const finalType = useCustomType ? customType : (a.type || '');
    const finalService = useCustomService ? customService : (a.service || '');

    const fd = new FormData();
    fd.set('titre', a.titre);
    if (finalType) fd.set('type', finalType);
    if (finalService) fd.set('service', finalService);
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
    if (!res.ok) {
      setMsg('Erreur: ' + (await res.text()).slice(0, 200));
      setSaving(false);
      return;
    }

    // ✅ enregistré : on bump la version pour invalider le cache
    setPdfVersion(Date.now());
    setMsg('Modifications enregistrées.');
    setSaving(false);

    // si tu veux rester sur la page, commente la ligne ci-dessous
    router.replace('/admin');
  };

  /* ---------- UI ---------- */

  if (!a) {
    return (
      <main className="upload-shell">
        <div className="upload-wrap">Chargement…</div>
      </main>
    );
  }

  return (
    <main className="upload-shell">
      <div className="upload-wrap">
        <Link href="/admin" className="u-back">← Retour</Link>

        <div className="upload-card">
          <h1 className="u-title">Modifier l’acte #{a.id}</h1>

          {/* Lien pour voir le PDF actuel (avec cache-buster) */}
          <p className="u-note" style={{ marginTop: -6, marginBottom: 10 }}>
            PDF actuel :{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPreviewSrc(`${API}/actes/${a.id}/pdf?ts=${pdfVersion}`);
                setShowPreview(true);
              }}
              title="Voir le PDF actuel"
            >
              Ouvrir
            </a>
          </p>

          <form onSubmit={save} className="u-form">
            <div className="u-field">
              <label htmlFor="titre">Titre</label>
              <input
                id="titre"
                className="u-input"
                required
                value={a.titre}
                onChange={(e) => setA({ ...a, titre: e.target.value })}
              />
            </div>

            {/* Type (select + Autre…) */}
            <div className="u-field">
              <label htmlFor="type">Type d’acte</label>
              {!useCustomType ? (
                <select
                  id="type"
                  className="u-input"
                  value={a.type || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__OTHER__') {
                      setUseCustomType(true);
                      setCustomType('');
                    } else {
                      setA({ ...a, type: v });
                    }
                  }}
                >
                  <option value="">— Sélectionner —</option>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__OTHER__">Autre…</option>
                </select>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    className="u-input"
                    placeholder="Saisir un type"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                  />
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => {
                      setUseCustomType(false);
                      setA({ ...a, type: customType });
                    }}
                  >
                    Utiliser cette valeur
                  </button>
                </div>
              )}
            </div>

            {/* Service (select + Autre…) */}
            <div className="u-field">
              <label htmlFor="service">Service</label>
              {!useCustomService ? (
                <select
                  id="service"
                  className="u-input"
                  value={a.service || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__OTHER__') {
                      setUseCustomService(true);
                      setCustomService('');
                    } else {
                      setA({ ...a, service: v });
                    }
                  }}
                >
                  <option value="">— Sélectionner —</option>
                  {services.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__OTHER__">Autre…</option>
                </select>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input
                    className="u-input"
                    placeholder="Saisir un service"
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                  />
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => {
                      setUseCustomService(false);
                      setA({ ...a, service: customService });
                    }}
                  >
                    Utiliser cette valeur
                  </button>
                </div>
              )}
            </div>

            <div className="u-field">
              <label htmlFor="datesig">Date de signature</label>
              <input
                id="datesig"
                type="date"
                className="u-input"
                value={a.date_signature || ''}
                onChange={(e) => setA({ ...a, date_signature: e.target.value || null })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="datepub">Date de publication</label>
              <input
                id="datepub"
                type="date"
                className="u-input"
                value={a.date_publication || ''}
                onChange={(e) => setA({ ...a, date_publication: e.target.value || null })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="statut">Statut</label>
              <input
                id="statut"
                className="u-input"
                value={a.statut || ''}
                onChange={(e) => setA({ ...a, statut: e.target.value })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="resume">Résumé</label>
              <textarea
                id="resume"
                className="u-input"
                value={a.resume || ''}
                onChange={(e) => setA({ ...a, resume: e.target.value })}
                rows={4}
              />
            </div>

            <div className="u-field">
              <label htmlFor="pdf">Remplacer le PDF</label>
              <input
                id="pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="u-input u-file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <div className="u-filemeta">
                  {file.name}{' '}
                  •{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (newFileUrl) { setPreviewSrc(newFileUrl); setShowPreview(true); }
                    }}
                    title="Prévisualiser le nouveau fichier"
                  >
                    Aperçu
                  </a>{' '}
                  •{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPreview(false);
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    title="Retirer le fichier"
                  >
                    retirer
                  </a>
                </div>
              )}
            </div>

            <button type="submit" className="u-btn" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            {msg && <p className="u-msg">{msg}</p>}
          </form>
        </div>
      </div>

      {/* Modale d’aperçu (PDF actuel OU nouveau fichier) */}
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
              borderRadius: 16, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,.3)'
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 8
            }}>
              <strong>Aperçu PDF</strong>
              <button className="u-btn" onClick={() => setShowPreview(false)} style={{ height: 36 }}>
                Fermer
              </button>
            </div>
            <div style={{ width: '100%', height: 'calc(100% - 44px)' }}>
              <PDFViewer url={previewSrc} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
