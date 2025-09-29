'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

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

export default function ActePage() {
  const params = useParams() as { id: string }
  const [acte, setActe] = useState<Acte | null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API}/actes/${params.id}`)
      const data = await res.json()
      setActe(data)
    }
    load()
  }, [params.id])

  if (!acte) return <main style={{padding:24}}>Chargement...</main>

  return (
    <main style={{padding: 24, maxWidth: 1000, margin: '0 auto'}}>
      <Link href="/">← Retour</Link>
      <h1>{acte.titre}</h1>
      <p><strong>Type:</strong> {acte.type || '-'} · <strong>Service:</strong> {acte.service || '-'}</p>
      <p>{acte.resume}</p>
      <PDFViewer url={`${API}/actes/${acte.id}/pdf`} />
    </main>
  )
}
