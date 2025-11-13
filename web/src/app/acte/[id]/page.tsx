'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import '../../styles/acte.css'

import ActeEmailForm from '../../../components/ActeEmailForm'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const PDFViewer = dynamic(
  () => import('../../../components/PDFViewer'),
  { ssr: false }
)

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

  const [acte, setActe] = useState<Acte | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)

  // Détermine la bonne cible du bouton “Retour”
  const from = search.get('from')
  let backHref = '/'
  if (from === 'admin') backHref = '/admin'
  else if (typeof document !== 'undefined' && document.referrer.includes('/admin')) {
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
      <Link href={backHref} className="acte-back">← Retour</Link>

      <h1 className="acte-title">{acte.titre}</h1>

      {/* Métadonnées */}
      <div className="acte-meta">
        <span className="meta-item">
          <strong>Type</strong> : <span className="badge">{acte.type || '—'}</span>
        </span>
        <span className="dot" aria-hidden>•</span>
        <span className="meta-item">
          <strong>Service</strong> : <span className="badge">{acte.service || '—'}</span>
        </span>
        <span className="dot" aria-hidden>•</span>
        <span className="meta-item">
          <strong>Publication</strong> : <span className="badge">{formatDate(pub)}</span>
        </span>
      </div>

      {acte.resume && <p className="acte-resume">{acte.resume}</p>}

      {/* Visionneuse + bouton "Envoyer par e-mail" dans la barre */}
      <div className="acte-viewer">
        <PDFViewer
          url={`${API}/actes/${acte.id}/pdf`}
          height={900}
          initialScale={1.25}
          fitModeDefault="page"
          extraActions={
            <button
              type="button"
              className="pdfbtn pdfbtn-primary acte-email-toolbar-btn"
              onClick={() => setShowEmailModal(true)}
            >
              Envoyer par e-mail
            </button>
          }
        />
      </div>

      <p className="acte-hint">
        Astuce : Ctrl/Cmd + molette pour zoomer · molette aux bords pour changer de page.
      </p>

      {/* Modale d’envoi par e-mail */}
      {showEmailModal && (
        <div
          className="acte-email-modal-backdrop"
          onClick={() => setShowEmailModal(false)}
        >
          <div
            className="acte-email-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="acte-email-modal-header">
              <h2 className="acte-email-modal-title">
                Envoyer l&apos;acte « {acte.titre} » par e-mail
              </h2>
              <button
                type="button"
                className="acte-email-modal-close"
                aria-label="Fermer"
                onClick={() => setShowEmailModal(false)}
              >
                ×
              </button>
            </div>

            <ActeEmailForm acteId={acte.id} acteTitle={acte.titre} />
          </div>
        </div>
      )}
    </main>
  )
}
