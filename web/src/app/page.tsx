'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import './styles/raa.css'
import { Skeleton } from '../components/Skeleton'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const PAGE_SIZE = 10 as const

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

type SortKey = 'titre' | 'date_publication' | 'type' | 'service'
type SortDir = 'asc' | 'desc'

/** Normalise : minuscules + sans accents */
const norm = (s?: string) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Nomme gentiment un fichier */
const safeFileName = (s: string, fallback: string) =>
  (s || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_\-\.]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 120)

export default function HomePage() {
  // Filtres
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [service, setService] = useState('')
  const [dateMin, setDateMin] = useState('')
  const [dateMax, setDateMax] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined)

  // Données
  const [items, setItems] = useState<Acte[]>([])
  const [loading, setLoading] = useState(true)

  // Tri
  const [sortKey, setSortKey] = useState<SortKey>('date_publication')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Sélection multiple
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const isSelected = (id: number) => selected.has(id)
  const toggleOne = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }
  const clearSelection = () => setSelected(new Set())

  const selectAllDisplayed = (checked: boolean, list: Acte[]) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (checked) list.forEach(a => s.add(a.id))
      else list.forEach(a => s.delete(a.id))
      return s
    })
  }

  async function search(p = page) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (dateMin) params.set('date_min', dateMin)
      if (dateMax) params.set('date_max', dateMax)
      params.set('page', String(p))
      params.set('size', String(PAGE_SIZE))

      const res = await fetch(`${API}/actes?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()

      if (Array.isArray(data)) {
        setItems(data)
        setTotalPages(undefined)
      } else {
        const arr: Acte[] = data.items ?? data.results ?? data.data ?? []
        setItems(arr)
        const total =
          typeof data.total_pages === 'number'
            ? data.total_pages
            : typeof data.total === 'number'
            ? Math.max(1, Math.ceil(data.total / PAGE_SIZE))
            : undefined
        setTotalPages(total)
      }
      setPage(p)
      clearSelection() // on nettoie la sélection quand on change de page
    } catch (e) {
      console.error('Search failed:', e)
      setItems([])
      setTotalPages(undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { search(1) }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const displayItems = useMemo(() => {
    const nq = norm(q)
    const nt = norm(type)
    const ns = norm(service)

    const filtered = items.filter(a => {
      if (nq) {
        const haystack = norm(`${a.titre} ${a.resume ?? ''} ${a.type ?? ''} ${a.service ?? ''}`)
        if (!haystack.includes(nq)) return false
      }
      if (nt && !norm(a.type).includes(nt)) return false
      if (ns && !norm(a.service).includes(ns)) return false
      return true
    })

    const arr = [...filtered]
    arr.sort((a, b) => {
      const get = (it: Acte, k: SortKey) =>
        k === 'date_publication'
          ? (it.date_publication || it.created_at || '')
          : (it[k] || '')
      const A = get(a, sortKey).toString().toLowerCase()
      const B = get(b, sortKey).toString().toLowerCase()
      if (A < B) return sortDir === 'asc' ? -1 : 1
      if (A > B) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [items, q, type, service, sortKey, sortDir])

  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕')
  const formatDate = (iso?: string) =>
    iso ? new Intl.DateTimeFormat('fr-FR').format(new Date(iso)) : ''

  const hasPrev = page > 1
  const hasNext = typeof totalPages === 'number' ? page < totalPages : items.length === PAGE_SIZE

  // ---- Téléchargements ----
  const downloadOne = async (a: Acte) => {
    try {
      const res = await fetch(`${API}/actes/${a.id}/pdf`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const aTag = document.createElement('a')
      const base = safeFileName(a.titre, `acte_${a.id}`)
      aTag.href = url
      aTag.download = `${base}.pdf`
      document.body.appendChild(aTag)
      aTag.click()
      aTag.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('download failed', err)
      alert("Téléchargement impossible pour cet acte.")
    }
  }

  const bulkDownload = async () => {
    const map = new Map<number, Acte>()
    displayItems.forEach(a => map.set(a.id, a))
    const ids = [...selected]
    if (ids.length < 2) return
    for (const id of ids) {
      const a = map.get(id) || items.find(x => x.id === id)
      if (a) await downloadOne(a)
    }
  }

  const selectedCount = selected.size
  const allDisplayedSelected =
    displayItems.length > 0 && displayItems.every(a => selected.has(a.id))

  return (
    <main className="raa-wrap">
      <h1 className="raa-title">Recueil des actes</h1>

      {/* Filtres */}
      <div className="raa-filters">
        <div className="raa-field">
          <label htmlFor="q">Recherche</label>
          <input id="q" value={q} onChange={e => setQ(e.target.value)} placeholder="Mots-clés..." className="raa-input"/>
        </div>
        <div className="raa-field">
          <label htmlFor="type">Type</label>
          <input id="type" value={type} onChange={e => setType(e.target.value)} placeholder="Arrêté, Délibération..." className="raa-input"/>
        </div>
        <div className="raa-field">
          <label htmlFor="service">Service</label>
          <input id="service" value={service} onChange={e => setService(e.target.value)} placeholder="Voirie, Culture..." className="raa-input"/>
        </div>
        <div className="raa-field">
          <label htmlFor="dateMin">Date min</label>
          <input id="dateMin" type="date" value={dateMin} onChange={e => setDateMin(e.target.value)} className="raa-input"/>
        </div>
        <div className="raa-field">
          <label htmlFor="dateMax">Date max</label>
          <input id="dateMax" type="date" value={dateMax} onChange={e => setDateMax(e.target.value)} className="raa-input"/>
        </div>
        <button onClick={() => search(1)} title="Rechercher" className="raa-btn">Rechercher</button>
      </div>

      {/* Barre d’actions sélection */}
      {selectedCount >= 2 && (
        <div className="raa-bulk">
          <span>{selectedCount} sélectionnés</span>
          <button className="raa-btn" onClick={bulkDownload} title="Télécharger les PDF sélectionnés">⭳ Télécharger</button>
          <button className="raa-btn-outline" onClick={clearSelection} title="Réinitialiser la sélection">Réinitialiser</button>
        </div>
      )}

      {/* Tableau */}
      <div className="raa-table" role="table" aria-label="Liste des actes">
        <div className="raa-row raa-head" role="row">
          {/* Sélecteur tout */}
          <div className="raa-cell raa-th raa-col-check" role="columnheader" title="Sélectionner tout">
            <input
              type="checkbox"
              className="raa-check"
              aria-label="Sélectionner tout"
              checked={allDisplayedSelected}
              onChange={e => selectAllDisplayed(e.target.checked, displayItems)}
            />
          </div>

          <div
            className={`raa-cell raa-th ${sortKey === 'titre' ? 'active' : ''}`}
            role="columnheader" tabIndex={0}
            onClick={() => toggleSort('titre')}
            title="Trier par nom"
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('titre')}
          >
            <span>Nom</span> <span className="sort">{sortArrow('titre')}</span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-date ${sortKey === 'date_publication' ? 'active' : ''}`}
            role="columnheader" tabIndex={0}
            onClick={() => toggleSort('date_publication')}
            title="Trier par date de publication"
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('date_publication')}
          >
            <span>Publication</span> <span className="sort">{sortArrow('date_publication')}</span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-type ${sortKey === 'type' ? 'active' : ''}`}
            role="columnheader" tabIndex={0}
            onClick={() => toggleSort('type')}
            title="Trier par type"
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('type')}
          >
            <span>Type</span> <span className="sort">{sortArrow('type')}</span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-service ${sortKey === 'service' ? 'active' : ''}`}
            role="columnheader" tabIndex={0}
            onClick={() => toggleSort('service')}
            title="Trier par service"
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('service')}
          >
            <span>Service</span> <span className="sort">{sortArrow('service')}</span>
          </div>

          {/* Colonne Download */}
          <div className="raa-cell raa-th raa-col-dl" role="columnheader" aria-label="Télécharger un acte">
          </div>
        </div>

        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="raa-row" role="row" aria-hidden="true">
              <div className="raa-cell raa-col-check"><Skeleton className="skel-line" style={{ width: 18, height: 18, borderRadius: 4 }} /></div>
              <div className="raa-cell raa-name"><Skeleton className="skel-line" style={{ width: '60%' }} /><div className="raa-meta"><Skeleton className="skel-pill" style={{ width: 80 }} /></div></div>
              <div className="raa-cell"><Skeleton className="skel-line" style={{ width: 90 }} /></div>
              <div className="raa-cell raa-col-type"><Skeleton className="skel-line" style={{ width: 120 }} /></div>
              <div className="raa-cell raa-col-service"><Skeleton className="skel-line" style={{ width: 130 }} /></div>
              <div className="raa-cell raa-col-dl"><Skeleton className="skel-line" style={{ width: 24 }} /></div>
            </div>
          ))
        ) : (
          displayItems.map(it => {
            const date = it.date_publication || it.created_at
            return (
              <div key={it.id} className="raa-row" role="row">
                {/* checkbox */}
                <div className="raa-cell raa-col-check" role="cell">
                  <input
                    type="checkbox"
                    className="raa-check"
                    aria-label={`Sélectionner ${it.titre}`}
                    checked={isSelected(it.id)}
                    onChange={() => toggleOne(it.id)}
                  />
                </div>

                {/* NOM : ordre = Titre -> Date mobile -> Type/Service mobile -> Ouvrir */}
                <div className="raa-cell raa-name" role="cell">
                  <span className="title" title={it.titre}>{it.titre}</span>

                  {/* date affichée UNIQUEMENT en mobile */}
                  <div className="raa-date-mobile raa-meta">{formatDate(date)}</div>

                  {(it.type || it.service) && (
                    <div className="raa-meta-mobile raa-meta">
                      {it.type || ''} {it.service ? `· ${it.service}` : ''}
                    </div>
                  )}

                  <Link href={`/acte/${it.id}`} title="Ouvrir l'acte" className="raa-open">Ouvrir</Link>
                </div>

                <div className="raa-cell raa-col-date" role="cell">{formatDate(date)}</div>
                <div className="raa-cell raa-col-type" role="cell">{it.type || '—'}</div>
                <div className="raa-cell raa-col-service" role="cell">{it.service || '—'}</div>

                {/* bouton DL */}
                <div className="raa-cell raa-col-dl" role="cell">
                  <button
                    className="raa-iconbtn"
                    title="Télécharger l'acte"
                    aria-label={`Télécharger ${it.titre}`}
                    onClick={() => downloadOne(it)}
                  >⭳</button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <nav className="raa-pager-pill" aria-label="Pagination">
        <div className="raa-pill" role="group">
          <button type="button" onClick={() => page > 1 && search(1)} disabled={page <= 1} aria-label="Première page" title="Première page">««</button>
          <button type="button" onClick={() => page > 1 && search(page - 1)} disabled={page <= 1} aria-label="Page précédente" title="Page précédente">‹</button>
          <span className="raa-count" aria-live="polite">
            {typeof totalPages === 'number' ? `${page} / ${totalPages}` : `Page ${page}`}
          </span>
          <button type="button" onClick={() => hasNext && search(page + 1)} disabled={!hasNext} aria-label="Page suivante" title="Page suivante">›</button>
          <button type="button" onClick={() => typeof totalPages === 'number' && page !== totalPages && search(totalPages)} disabled={typeof totalPages !== 'number' || page === totalPages} aria-label="Dernière page" title="Dernière page">»»</button>
        </div>
      </nav>
    </main>
  )
}
