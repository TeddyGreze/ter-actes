'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import '../../../../styles/admin.css'
import '../../../../styles/admin-upload-multiple.css'
import { useToast } from '../../../../../components/Toast'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const KNOWN_TYPES = ['Arrêté', 'Décision', 'Délibération']
const KNOWN_SERVICES = ['Culture', 'Mairie', 'Urbanisme', 'Voirie']

type BulkRow = {
  titre: string
  type: string
  typeChoice: string
  typeCustom: string
  service: string
  serviceChoice: string
  serviceCustom: string
  date_signature: string
  date_publication: string
  pdf?: File | null
}

export default function BulkUploadPage() {
  const router = useRouter()
  const toast = useToast()

  const [rows, setRows] = useState<BulkRow[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const getTodayISO = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // Normalise une date potentielle venant de l'OCR (JJ/MM/AAAA, JJ/MM/AA ou AAAA-MM-JJ)
  const normalizeDate = (value: string): string => {
    const v = value.trim()
    if (!v) return ''

    const fr4 = /^(\d{2})\/(\d{2})\/(\d{4})$/
    const fr2 = /^(\d{2})\/(\d{2})\/(\d{2})$/
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/

    if (fr4.test(v)) {
      const [, d, m, y] = v.match(fr4)!
      return `${y}-${m}-${d}`
    }

    if (fr2.test(v)) {
      const [, d, m, yy] = v.match(fr2)!
      const yNum = Number(yy)
      const fullYear = 2000 + yNum
      return `${fullYear}-${m}-${d}`
    }

    if (iso.test(v)) {
      return v
    }

    return ''
  }

  // Sélection de plusieurs PDF -> analyse automatique pour chaque
  const handleFilesChange = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)

    setAnalyzing(true)
    try {
      const today = getTodayISO()
      const newRows: BulkRow[] = []

      for (const file of files) {
        let row: BulkRow = {
          titre: file.name.replace(/\.[^.]+$/, ''),
          type: '',
          typeChoice: '',
          typeCustom: '',
          service: '',
          serviceChoice: '',
          serviceCustom: '',
          date_signature: '',
          date_publication: today, // par défaut : date du jour
          pdf: file,
        }

        try {
          const fd = new FormData()
          fd.set('pdf', file)

          const res = await fetch(`${API}/admin/analyse-pdf`, {
            method: 'POST',
            body: fd,
            credentials: 'include',
            cache: 'no-store',
          })

          if (res.ok) {
            const data = await res.json()
            const detectedDate = data.date_auto ? normalizeDate(data.date_auto) : ''

            // Type : si l'OCR trouve un type qui est dans la liste, on le sélectionne
            if (data.type_auto) {
              if (KNOWN_TYPES.includes(data.type_auto)) {
                row.type = data.type_auto
                row.typeChoice = data.type_auto
              } else {
                row.type = data.type_auto
                row.typeChoice = '__other__'
                row.typeCustom = data.type_auto
              }
            }

            // Service : pareil
            if (data.service_auto) {
              if (KNOWN_SERVICES.includes(data.service_auto)) {
                row.service = data.service_auto
                row.serviceChoice = data.service_auto
              } else {
                row.service = data.service_auto
                row.serviceChoice = '__other__'
                row.serviceCustom = data.service_auto
              }
            }

            if (detectedDate) {
              row.date_signature = detectedDate
            }
          }
        } catch (err) {
          console.error('Erreur analyse PDF', err)
        }

        newRows.push(row)
      }

      setRows(newRows)
      toast.success(`${newRows.length} acte(s) analysé(s) automatiquement.`)
    } catch (e) {
      console.error(e)
      toast.error("Erreur lors de l'analyse des PDF.")
    } finally {
      setAnalyzing(false)
    }
  }

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const handleTypeSelectChange = (idx: number, value: string) => {
    setRows(prev =>
      prev.map((r, i) => {
        if (i !== idx) return r
        if (value === '__other__') {
          // on bascule en mode "autre"
          return {
            ...r,
            typeChoice: value,
            type: r.typeCustom || '',
          }
        }
        // choix dans la liste
        return {
          ...r,
          typeChoice: value,
          type: value,
          typeCustom: '',
        }
      }),
    )
  }

  const handleTypeCustomChange = (idx: number, value: string) => {
    setRows(prev =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              typeCustom: value,
              type: value,
            }
          : r,
      ),
    )
  }

  const handleServiceSelectChange = (idx: number, value: string) => {
    setRows(prev =>
      prev.map((r, i) => {
        if (i !== idx) return r
        if (value === '__other__') {
          return {
            ...r,
            serviceChoice: value,
            service: r.serviceCustom || '',
          }
        }
        return {
          ...r,
          serviceChoice: value,
          service: value,
          serviceCustom: '',
        }
      }),
    )
  }

  const handleServiceCustomChange = (idx: number, value: string) => {
    setRows(prev =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              serviceCustom: value,
              service: value,
            }
          : r,
      ),
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (rows.length === 0) {
      toast.error('Aucun acte à publier.')
      return
    }

    const missing = rows.findIndex(r => !r.pdf)
    if (missing !== -1) {
      toast.error(`PDF manquant pour l'acte #${missing + 1}.`)
      return
    }

    setSubmitting(true)
    try {
      const formData = new FormData()

      const itemsToSend = rows.map(r => ({
        titre: r.titre,
        type: r.type,
        service: r.service,
        date_signature: r.date_signature,
        date_publication: r.date_publication,
      }))
      formData.append('items', JSON.stringify(itemsToSend))

      rows.forEach((r, idx) => {
        if (r.pdf) {
          formData.append('files', r.pdf, `pdf_${idx}.pdf`)
        }
      })

      const res = await fetch(`${API}/admin/actes/bulk`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!res.ok) {
        toast.error('Erreur lors de la création des actes.')
        setSubmitting(false)
        return
      }

      // Récupère éventuellement le nombre créé pour l’afficher dans le toast du dashboard
      let count = rows.length
      try {
        const data = await res.json()
        if (typeof data?.count === 'number') {
          count = data.count
        }
      } catch {
        // pas grave, on garde rows.length
      }

      // Redirection vers le dashboard qui affichera le toast global
      router.push(`/admin?bulk=${count}`)
    } catch (e) {
      console.error(e)
      toast.error('Erreur réseau.')
      setSubmitting(false)
      return
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="admin-wrap upload-multi">
      {/* Top bar */}
      <div className="admin-topbar">
        <div className="admin-breadcrumb">
          <Link href="/admin" className="link-back">
            ← Tableau de bord
          </Link>
        </div>
        <h1 className="admin-title">Dépôt multiple d&apos;actes</h1>
      </div>

      {/* Étape 1 : sélection multi-PDF */}
      <section className="admin-panel">
        <h2 className="panel-title">Sélection des PDF</h2>
        <p className="panel-text">
          Sélectionnez tous les PDF à déposer.
          Les métadonnées principales seront remplies automatiquement à partir du contenu.
        </p>
        <label className="f-field">
          <span>Fichiers PDF </span>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={e => handleFilesChange(e.target.files)}
            disabled={analyzing || submitting}
          />
        </label>
        {analyzing && (
          <p className="panel-text" style={{ marginTop: '0.5rem' }}>
            Analyse des PDF en cours…
          </p>
        )}
      </section>

      {/* Étape 2 : vérification & publication */}
      {rows.length > 0 && (
        <form className="admin-panel" onSubmit={handleSubmit}>
          <h2 className="panel-title">Vérification &amp; publication</h2>
          <p className="panel-text">
            {rows.length} acte(s) détecté(s). Vérifiez les informations puis publiez.
          </p>

          {rows.map((row, idx) => (
            <fieldset key={idx} className="bulk-group">
              <legend>Acte #{idx + 1}</legend>

              <div className="f-field">
                <label>Titre *</label>
                <input
                  className="f-input"
                  value={row.titre}
                  onChange={e => updateRow(idx, { titre: e.target.value })}
                  required
                />
              </div>

              {/* Type d'acte : liste + "Autre…" */}
              <div className="f-field">
                <label>Type d&apos;acte *</label>
                <select
                  className="f-input"
                  value={
                    row.typeChoice ||
                    (KNOWN_TYPES.includes(row.type)
                      ? row.type
                      : row.type
                      ? '__other__'
                      : '')
                  }
                  onChange={e => handleTypeSelectChange(idx, e.target.value)}
                >
                  <option value="">— Sélectionner —</option>
                  {KNOWN_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__other__">Autre…</option>
                </select>
              </div>

              {row.typeChoice === '__other__' && (
                <div className="f-field">
                  <label>Type d&apos;acte (autre)</label>
                  <input
                    className="f-input"
                    value={row.typeCustom}
                    onChange={e => handleTypeCustomChange(idx, e.target.value)}
                    placeholder="Saisissez le type d'acte"
                    required
                  />
                </div>
              )}

              {/* Service : liste + "Autre…" */}
              <div className="f-field">
                <label>Service *</label>
                <select
                  className="f-input"
                  value={
                    row.serviceChoice ||
                    (KNOWN_SERVICES.includes(row.service)
                      ? row.service
                      : row.service
                      ? '__other__'
                      : '')
                  }
                  onChange={e => handleServiceSelectChange(idx, e.target.value)}
                >
                  <option value="">— Sélectionner —</option>
                  {KNOWN_SERVICES.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__other__">Autre…</option>
                </select>
              </div>

              {row.serviceChoice === '__other__' && (
                <div className="f-field">
                  <label>Service (autre)</label>
                  <input
                    className="f-input"
                    value={row.serviceCustom}
                    onChange={e => handleServiceCustomChange(idx, e.target.value)}
                    placeholder="Saisissez le service"
                    required
                  />
                </div>
              )}

              <div className="f-field">
                <label>Date de signature</label>
                <input
                  className="f-input"
                  type="date"
                  value={row.date_signature}
                  onChange={e => updateRow(idx, { date_signature: e.target.value })}
                />
              </div>

              <div className="f-field">
                <label>Date de publication *</label>
                <input
                  className="f-input"
                  type="date"
                  value={row.date_publication}
                  onChange={e => updateRow(idx, { date_publication: e.target.value })}
                  required
                />
              </div>
            </fieldset>
          ))}

          <button type="submit" className="btn-primary" disabled={submitting || analyzing}>
            {submitting ? 'Publication en cours…' : `Publier ${rows.length} acte(s)`}
          </button>
        </form>
      )}
    </main>
  )
}
