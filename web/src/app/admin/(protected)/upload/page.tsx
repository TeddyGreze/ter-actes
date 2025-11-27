'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import '../../../styles/admin-upload.css';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// PDFViewer dynamiquement côté client
type PDFViewerProps = { url?: string; file?: File | Blob | null };
const PDFViewer = dynamic<PDFViewerProps>(
  () => import('../../../../components/PDFViewer'),
  { ssr: false }
);

export default function AdminUpload() {
  const search = useSearchParams();
  const router = useRouter();
  const next = search.get('next') || null;

  // Référentiels => utilisés aussi pour valider ce que l'OCR propose
  const [types, setTypes] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);

  const getTodayISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = getTodayISO();

  const [form, setForm] = useState<Record<string, string>>({
    titre: '',
    type: '',
    service: '',
    date_signature: '',
    date_publication: today,
  });

  // gestion champ personnalisé "Autre…"
  const [useCustomType, setUseCustomType] = useState(false);
  const [customType, setCustomType] = useState('');
  const [useCustomService, setUseCustomService] = useState(false);
  const [customService, setCustomService] = useState('');

  // pdf sélectionné
  const [file, setFile] = useState<File | null>(null);

  // UI state
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(true);     // vérification session admin
  const [submitting, setSubmitting] = useState(false); // bouton Publier
  const [analyzing, setAnalyzing] = useState(false);  // analyse OCR en cours

  // ref pour pouvoir reset l'input file
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // aperçu PDF (en modal)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // blob URL pour prévisualisation locale
  useEffect(() => {
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // ESC pour fermer la modale d’aperçu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Vérifie la session admin + charge référentiels officiels (types/services)
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
        // pas connecté => redirection login
        window.location.assign(
          '/admin/login' + (next ? `?next=${encodeURIComponent(next)}` : '')
        );
        return;
      } finally {
        setChecking(false);
      }
    };
    boot();
  }, [next]);

  // Analyse auto du PDF dès qu'on le choisit
  const handleFileChange = async (f: File | null) => {
    setFile(f);
    if (!f) return;

    setAnalyzing(true);
    setMsg('');

    try {
      const fd = new FormData();
      fd.set('pdf', f);

      const res = await fetch(`${API}/admin/analyse-pdf`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        // data = { fulltext_excerpt, date_auto, service_auto, type_auto }

        // propose la date de signature détectée si le champ est encore vide
        setForm(prev => ({
          ...prev,
          date_signature: prev.date_signature || (data.date_auto || prev.date_signature),
        }));

        // propose le type détecté
        if (data.type_auto) {
          if (types.includes(data.type_auto)) {
            // reconnu => on reste en mode sélection
            setUseCustomType(false);
            setForm(prev => ({
              ...prev,
              type: prev.type || data.type_auto,
            }));
          } else {
            // inconnu => passe en "Autre…"
            setUseCustomType(true);
            setCustomType(data.type_auto);
          }
        }

        // propose le service détecté
        if (data.service_auto) {
          if (services.includes(data.service_auto)) {
            setUseCustomService(false);
            setForm(prev => ({
              ...prev,
              service: prev.service || data.service_auto,
            }));
          } else {
            setUseCustomService(true);
            setCustomService(data.service_auto);
          }
        }
      } else {
        console.warn('analyse-pdf error', res.status);
      }
    } catch (err) {
      console.error('analyse-pdf failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Soumission du formulaire => création d'acte
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');

    if (!file) {
      setMsg('Sélectionnez un PDF');
      return;
    }

    setSubmitting(true);

    try {
      const fd = new FormData();

      // champs texte simples
      fd.set('titre', form.titre);

      // valeurs finales type / service
      const finalType = useCustomType ? customType : form.type;
      const finalService = useCustomService ? customService : form.service;

      if (finalType) fd.set('type', finalType);
      if (finalService) fd.set('service', finalService);
      if (form.date_signature) fd.set('date_signature', form.date_signature);
      if (form.date_publication) fd.set('date_publication', form.date_publication);

      // fichier PDF
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

      await res.json();

      // succès => retour au tableau de bord avec paramètre pour le toast
      setSubmitting(false);
      router.push('/admin?created=1');
    } catch (err) {
      console.error('submit failed:', err);
      setMsg('Erreur réseau.');
      setSubmitting(false);
    }
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
        <Link href="/admin" className="u-back">← Tableau de bord</Link>

        <div className="upload-card">
          <h1 className="u-title">Dépôt d’un acte</h1>

          <form onSubmit={submit} className="u-form">
            {/* Titre */}
            <div className="u-field">
              <label htmlFor="titre">Titre *</label>
              <input
                id="titre"
                className="u-input"
                value={form.titre}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                required
              />
            </div>

            {/* Type d'acte */}
            <div className="u-field">
              <label htmlFor="type">Type d’acte *</label>
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
                    required
                  />
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => setUseCustomType(false)}
                  >
                    Utiliser la liste
                  </button>
                </div>
              )}
            </div>

            {/* Service */}
            <div className="u-field">
              <label htmlFor="service">Service *</label>
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
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => setUseCustomService(false)}
                  >
                    Utiliser la liste
                  </button>
                </div>
              )}
            </div>

            {/* Date signature */}
            <div className="u-field">
              <label htmlFor="datesig">Date de signature</label>
              <input
                id="datesig"
                type="date"
                className="u-input"
                value={form.date_signature}
                onChange={(e) => setForm({ ...form, date_signature: e.target.value })}
              />
              {analyzing && <small className="u-note">Analyse en cours…</small>}
            </div>

            {/* Date publication */}
            <div className="u-field">
              <label htmlFor="datepub">Date de publication *</label>
              <input
                id="datepub"
                type="date"
                className="u-input"
                value={form.date_publication}
                onChange={(e) => setForm({ ...form, date_publication: e.target.value })}
                required
              />
            </div>

            {/* Fichier PDF */}
            <div className="u-field">
              <label htmlFor="pdf">PDF *</label>
              <input
                id="pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="u-input u-file"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                required
              />
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
              {analyzing && <div className="u-note">Extraction automatique des métadonnées…</div>}
            </div>

            <button type="submit" className="u-btn" disabled={submitting}>
              {submitting ? 'Publication…' : 'Publier'}
            </button>

            {msg && <p className="u-msg">{msg}</p>}
          </form>
        </div>
      </div>

      {/* Modale d’aperçu PDF */}
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
              <PDFViewer file={file} url={previewUrl || undefined} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
