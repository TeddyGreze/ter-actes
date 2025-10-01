'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import '../../styles/acte.css'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const PDFViewer = dynamic(() => import('../../../components/PDFViewer'), { ssr: false })

type Acte = {
  id: number
  titre: string
  type?: string
  service?: string
  date_publication?: string
  resume?: string
  pdf_path: string
  created_at: string
}

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR').format(new Date(iso)) : '—'

export default function ActePage() {
  const params = useParams() as { id: string }
  const search = useSearchParams()
  const router = useRouter()

  const [acte, setActe] = useState<Acte | null>(null)

  // Détermine la bonne cible du bouton “Retour”
  const from = search.get('from')
  let backHref = '/'
  if (from === 'admin') backHref = '/admin'
  else if (typeof document !== 'undefined' && document.referrer.includes('/admin')) {
    // fallback utile si on arrive depuis l’admin sans le paramètre (ou via l’historique)
    backHref = '/admin'
  }

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API}/actes/${params.id}`, { cache: 'no-store' })
      const data = await res.json()
      setActe(data)
    }
    load()
  }, [params.id])

  if (!acte) {
    return (
      <main className="acte-wrap">
        <p>Chargement…</p>
      </main>
    )
  }

  const pub = acte.date_publication || acte.created_at

  return (
    <main className="acte-wrap">
      {/* Bouton retour : utilise la bonne cible */}
      <Link href={backHref} className="acte-back">← Retour</Link>

      <h1 className="acte-title">{acte.titre}</h1>

      {/* Métadonnées */}
      <div className="acte-meta">
        <span className="meta-item"><strong>Type</strong> : <span className="badge">{acte.type || '—'}</span></span>
        <span className="dot" aria-hidden>•</span>
        <span className="meta-item"><strong>Service</strong> : <span className="badge">{acte.service || '—'}</span></span>
        <span className="dot" aria-hidden>•</span>
        <span className="meta-item"><strong>Publication</strong> : <span className="badge">{formatDate(pub)}</span></span>
      </div>

      {acte.resume && <p className="acte-resume">{acte.resume}</p>}

      {/* Visionneuse */}
      <div className="acte-viewer">
        <PDFViewer url={`${API}/actes/${acte.id}/pdf`} height={900} initialScale={1.25} fitModeDefault="page" />
      </div>

      <p className="acte-hint">Astuce : Ctrl/Cmd + molette pour zoomer · molette aux bords pour changer de page.</p>
    </main>
  )
}
