'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import '../../../../../styles/admin-upload.css';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

type Acte = {
  id: number;
  titre: string;
  type?: string | null;
  service?: string | null;
  date_publication?: string | null;
  pdf_path: string;
};

export default function EditActePage() {
  const router = useRouter();
  const params = useParams() as { id: string };

  const [a, setA] = useState<Acte | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // cache-buster pour le PDF actuel
  const [pdfVersion, setPdfVersion] = useState<number>(Date.now());

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API}/actes/${params.id}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) { router.replace('/admin/login'); return; }
      const data = await res.json();
      setA({
        id: data.id,
        titre: data.titre || '',
        type: data.type || '',
        service: data.service || '',
        date_publication: data.date_publication || '',
        pdf_path: data.pdf_path,
      });
      setPdfVersion(Date.now());
    };
    load();
  }, [params.id, router]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!a) return;

    setSaving(true);
    setMsg('');

    const fd = new FormData();
    fd.set('titre', a.titre);
    if (a.type) fd.set('type', a.type);
    if (a.service) fd.set('service', a.service);
    if (a.date_publication) fd.set('date_publication', a.date_publication);
    if (file) fd.set('pdf', file);

    const res = await fetch(`${API}/admin/actes/${a.id}`, {
      method: 'PUT',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) {
      setMsg('Erreur : ' + (await res.text()).slice(0,200));
      setSaving(false);
      return;
    }

    setMsg('Modifications enregistrées.');
    setSaving(false);
    router.replace('/admin'); // on retourne à la liste
  };

  if (!a) {
    return (
      <main className="upload-shell"><div className="upload-wrap">Chargement…</div></main>
    );
  }

  return (
    <main className="upload-shell">
      <div className="upload-wrap">
        <Link href="/admin" className="u-back">← Retour</Link>

        <div className="upload-card">
          <h1 className="u-title">Modification de l’acte</h1>

          {/* Lien vers le PDF actuel */}
          <p className="u-note" style={{marginTop: -6, marginBottom: 10}}>
            PDF actuel :{' '}
            <a
              href={`${API}/actes/${a.id}/pdf?ts=${pdfVersion}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ouvrir
            </a>
          </p>

          <form onSubmit={save} className="u-form">
            <div className="u-field">
              <label htmlFor="titre">Titre</label>
              <input id="titre" className="u-input" required
                value={a.titre} onChange={e=>setA({...a, titre:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="type">Type</label>
              <input id="type" className="u-input"
                value={a.type || ''} onChange={e=>setA({...a, type:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="service">Service</label>
              <input id="service" className="u-input"
                value={a.service || ''} onChange={e=>setA({...a, service:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="datepub">Date de publication</label>
              <input id="datepub" type="date" className="u-input"
                value={a.date_publication || ''} onChange={e=>setA({...a, date_publication:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="pdf">Remplacer le PDF</label>
              <input
                id="pdf"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="u-input u-file"
                onChange={e=>setFile(e.target.files?.[0] || null)}
              />
              {file && <div className="u-filemeta">{file.name}</div>}
            </div>

            <button type="submit" className="u-btn" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            {msg && <p className="u-msg">{msg}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
