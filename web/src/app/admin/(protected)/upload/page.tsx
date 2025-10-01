'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// ⚠️ Chemins depuis: /src/app/admin/(protected)/upload/page.tsx
import '../../../styles/admin-upload.css';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// PDFViewer dynamiquement côté client (uniformisé avec la page edit)
type PDFViewerProps = { url: string };
const PDFViewer = dynamic<PDFViewerProps>(
  () => import('../../../../components/PDFViewer'),
  { ssr: false }
);

export default function AdminUpload() {
  const search = useSearchParams();
  const next = search.get('next') || null;

  // Référentiels
  const [types, setTypes] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);

  const [form, setForm] = useState<Record<string, string>>({
    titre: '',
    type: '',
    service: '',
    date_signature: '',
    date_publication: '',
    statut: '',
    resume: '',
  });

  // Gestion "Autre…" (saisie libre)
  const [useCustomType, setUseCustomType] = useState(false);
  const [customType, setCustomType] = useState('');
  const [useCustomService, setUseCustomService] = useState(false);
  const [customService, setCustomService] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // ref vers l'input fichier pour pouvoir le vider visuellement
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Aperçu PDF (blob URL + modale avec PDFViewer)
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
  }, [file, previewUrl]);

  // ESC pour fermer la modale
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ⛔️ vérifie la session réelle + charge les référentiels (sans cache)
  useEffect(() => {
    const boot = async () => {
      try {
        const me = await fetch(`${API}/admin/me?ts=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!me.ok) throw new Error('unauthorized');

        const [tRes, sRes] = await Promise.all([
          fetch(`${API}/admin/types`, { credentials: 'include', cache: 'no-store' }),
          fetch(`${API}/admin/services`, { credentials: 'include', cache: 'no-store' }),
        ]);

        const tData = await tRes.json().catch(() => []);
        const sData = await sRes.json().catch(() => []);

        setTypes(Array.isArray(tData) ? tData.map((r: any) => r.name) : []);
        setServices(Array.isArray(sData) ? sData.map((r: any) => r.name) : []);
      } catch {
        window.location.assign('/admin/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
        return;
      } finally {
        setChecking(false);
      }
    };
    boot();
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

    // champs texte de base
    fd.set('titre', form.titre);

    // valeurs finales type/service (liste ou saisie libre)
    const finalType = useCustomType ? customType : form.type;
    const finalService = useCustomService ? customService : form.service;

    if (finalType) fd.set('type', finalType);
    if (finalService) fd.set('service', finalService);
    if (form.date_signature) fd.set('date_signature', form.date_signature);
    if (form.date_publication) fd.set('date_publication', form.date_publication);
    if (form.statut) fd.set('statut', form.statut);
    if (form.resume) fd.set('resume', form.resume);

    // fichier
    fd.set('pdf', file);

    const res = await fetch(`${API}/admin/actes`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setMsg('Erreur: ' + (text || res.status));
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setMsg('Acte créé (id=' + data.id + ')');
    setSubmitting(false);

    // reset léger du formulaire + fichier
    setForm({
      titre: '',
      type: '',
      service: '',
      date_signature: '',
      date_publication: '',
      statut: '',
      resume: '',
    });
    setUseCustomType(false);
    setCustomType('');
    setUseCustomService(false);
    setCustomService('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowPreview(false);
  };

  if (checking) {
    return (
      <main className="upload-shell">
        <div className="upload-wrap">Vérification de session…</div>
      </main>
    );
  }

  return (
    <main className="upload-shell">
      <div className="upload-wrap">
        <Link href="/admin" className="u-back">← Retour</Link>

        <div className="upload-card">
          <h1 className="u-title">Dépôt d’un acte</h1>

          <form onSubmit={submit} className="u-form">
            <div className="u-field">
              <label htmlFor="titre">Titre</label>
              <input
                id="titre"
                className="u-input"
                value={form.titre}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                required
              />
            </div>

            {/* Type (select + Autre…) */}
            <div className="u-field">
              <label htmlFor="type">Type d’acte</label>
              {!useCustomType ? (
                <select
                  id="type"
                  className="u-input"
                  value={form.type}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__OTHER__') {
                      setUseCustomType(true);
                      setCustomType('');
                      setForm({ ...form, type: '' });
                    } else {
                      setForm({ ...form, type: v });
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
                  <button type="button" className="u-btn" onClick={() => setUseCustomType(false)}>
                    Utiliser la liste
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
                  value={form.service}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__OTHER__') {
                      setUseCustomService(true);
                      setCustomService('');
                      setForm({ ...form, service: '' });
                    } else {
                      setForm({ ...form, service: v });
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
                  <button type="button" className="u-btn" onClick={() => setUseCustomService(false)}>
                    Utiliser la liste
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
                value={form.date_signature}
                onChange={(e) => setForm({ ...form, date_signature: e.target.value })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="datepub">Date de publication</label>
              <input
                id="datepub"
                type="date"
                className="u-input"
                value={form.date_publication}
                onChange={(e) => setForm({ ...form, date_publication: e.target.value })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="statut">Statut</label>
              <input
                id="statut"
                className="u-input"
                value={form.statut}
                onChange={(e) => setForm({ ...form, statut: e.target.value })}
              />
            </div>

            <div className="u-field">
              <label htmlFor="resume">Résumé</label>
              <textarea
                id="resume"
                className="u-input"
                value={form.resume}
                onChange={(e) => setForm({ ...form, resume: e.target.value })}
                rows={4}
              />
            </div>

            <div className="u-field">
              <label htmlFor="pdf">PDF</label>
              <input
                id="pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="u-input u-file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
              {/* Lien de prévisualisation cliquable + bouton retirer */}
              {file && (
                <div className="u-filemeta">
                  {file.name} •{' '}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setShowPreview(true); }}
                    title="Cliquer pour prévisualiser"
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

            <button type="submit" className="u-btn" disabled={submitting}>
              {submitting ? 'Publication…' : 'Publier'}
            </button>

            {msg && <p className="u-msg">{msg}</p>}
          </form>
        </div>
      </div>

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
              borderRadius: 16, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Aperçu : {file?.name}</strong>
              <button className="u-btn" onClick={() => setShowPreview(false)} style={{ height: 36 }}>
                Fermer
              </button>
            </div>
            <div style={{ width: '100%', height: 'calc(100% - 44px)' }}>
              <PDFViewer url={previewUrl} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
