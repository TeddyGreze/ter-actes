'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import '../../../styles/admin-upload.css'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export default function AdminUpload() {
  const search = useSearchParams()
  const next = search.get('next') || null

  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // champs conservés
  const [form, setForm] = useState({
    titre: '',
    type: '',
    service: '',
    date_publication: '',
  })

  // vérifie la session côté API
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API}/admin/me?ts=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('unauthorized')
      } catch {
        window.location.assign('/admin/login' + (next ? `?next=${encodeURIComponent(next)}` : ''))
        return
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [next])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    if (!file) { setMsg('Sélectionnez un PDF.'); return }

    setSubmitting(true)

    const fd = new FormData()
    fd.set('titre', form.titre)
    if (form.type) fd.set('type', form.type)
    if (form.service) fd.set('service', form.service)
    if (form.date_publication) fd.set('date_publication', form.date_publication)
    fd.set('pdf', file)

    const res = await fetch(`${API}/admin/actes`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(()=> '')
      setMsg('Erreur : ' + (text || res.status))
      setSubmitting(false)
      return
    }

    // succès
    setMsg('Acte créé')
    setSubmitting(false)

    // reset léger
    setForm({ titre: '', type: '', service: '', date_publication: '' })
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (checking) return <main className="upload-shell"><div className="upload-wrap">Vérification de session…</div></main>

  return (
    <main className="upload-shell">
      <div className="upload-wrap">
        <Link href="/admin" className="u-back">← Retour</Link>

        <div className="upload-card">
          <h1 className="u-title">Dépôt d’un acte</h1>

          <form onSubmit={submit} className="u-form">
            <div className="u-field">
              <label htmlFor="titre">Titre</label>
              <input id="titre" className="u-input" required
                value={form.titre} onChange={e=>setForm({...form, titre:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="type">Type</label>
              <input id="type" className="u-input"
                value={form.type} onChange={e=>setForm({...form, type:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="service">Service</label>
              <input id="service" className="u-input"
                value={form.service} onChange={e=>setForm({...form, service:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="datepub">Date de publication</label>
              <input id="datepub" type="date" className="u-input"
                value={form.date_publication} onChange={e=>setForm({...form, date_publication:e.target.value})}/>
            </div>

            <div className="u-field">
              <label htmlFor="pdf">PDF</label>
              <input id="pdf" ref={fileInputRef} type="file" accept="application/pdf"
                className="u-input u-file" onChange={e=>setFile(e.target.files?.[0] || null)} required />
              {file && <div className="u-filemeta">{file.name}</div>}
            </div>

            <button type="submit" className="u-btn" disabled={submitting}>
              {submitting ? 'Publication…' : 'Publier'}
            </button>

            {msg && <p className="u-msg">{msg}</p>}
          </form>
        </div>
      </div>
    </main>
  )
}

