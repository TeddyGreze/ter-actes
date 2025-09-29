'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import './styles/raa.css'

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

/** Normalise une chaîne : minuscules, sans accents/diacritiques */
const norm = (s?: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

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

  // Tri
  const [sortKey, setSortKey] = useState<SortKey>('date_publication')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function search(p = page) {
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
      setTotalPages(undefined) // total inconnu
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
  }

  useEffect(() => {
    search(1)
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  /** Filtrage (accent/casse-insensible) + tri */
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
  // hasNext basé sur la page renvoyée par l'API (pas sur le filtrage client)
  const hasNext = typeof totalPages === 'number' ? page < totalPages : items.length === PAGE_SIZE

  return (
    <main className="raa-wrap">
      <h1 className="raa-title">Portail des actes</h1>

      {/* Filtres */}
      <div className="raa-filters">
        <div className="raa-field">
          <label htmlFor="q">Recherche</label>
          <input
            id="q"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="mots-clés..."
            className="raa-input"
          />
        </div>
        <div className="raa-field">
          <label htmlFor="type">Type</label>
          <input
            id="type"
            value={type}
            onChange={e => setType(e.target.value)}
            placeholder="arrêté, délibération..."
            className="raa-input"
          />
        </div>
        <div className="raa-field">
          <label htmlFor="service">Service</label>
          <input
            id="service"
            value={service}
            onChange={e => setService(e.target.value)}
            placeholder="Voirie, Culture..."
            className="raa-input"
          />
        </div>
        <div className="raa-field">
          <label htmlFor="dateMin">Date min</label>
          <input
            id="dateMin"
            type="date"
            value={dateMin}
            onChange={e => setDateMin(e.target.value)}
            className="raa-input"
          />
        </div>
        <div className="raa-field">
          <label htmlFor="dateMax">Date max</label>
          <input
            id="dateMax"
            type="date"
            value={dateMax}
            onChange={e => setDateMax(e.target.value)}
            className="raa-input"
          />
        </div>
        <button onClick={() => search(1)} className="raa-btn">
          Rechercher
        </button>
      </div>

      {/* Tableau */}
      <div className="raa-table" role="table" aria-label="Liste des actes">
        <div className="raa-row raa-head" role="row">
          <div
            className={`raa-cell raa-th ${sortKey === 'titre' ? 'active' : ''}`}
            role="columnheader"
            tabIndex={0}
            onClick={() => toggleSort('titre')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('titre')}
          >
            <span>Nom</span> <span className="sort">{sortArrow('titre')}</span>
          </div>
          <div
            className={`raa-cell raa-th ${sortKey === 'date_publication' ? 'active' : ''}`}
            role="columnheader"
            tabIndex={0}
            onClick={() => toggleSort('date_publication')}
            onKeyDown={e =>
              (e.key === 'Enter' || e.key === ' ') && toggleSort('date_publication')
            }
          >
            <span>Publication</span>{' '}
            <span className="sort">{sortArrow('date_publication')}</span>
          </div>
          <div
            className={`raa-cell raa-th raa-col-type ${sortKey === 'type' ? 'active' : ''}`}
            role="columnheader"
            tabIndex={0}
            onClick={() => toggleSort('type')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('type')}
          >
            <span>Type</span> <span className="sort">{sortArrow('type')}</span>
          </div>
          <div
            className={`raa-cell raa-th raa-col-service ${sortKey === 'service' ? 'active' : ''}`}
            role="columnheader"
            tabIndex={0}
            onClick={() => toggleSort('service')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('service')}
          >
            <span>Service</span> <span className="sort">{sortArrow('service')}</span>
          </div>
        </div>

        {displayItems.map(it => {
          const date = it.date_publication || it.created_at
          return (
            <div key={it.id} className="raa-row" role="row">
              <div className="raa-cell raa-name" role="cell">
                <span className="title" title={it.titre}>
                  {it.titre}
                </span>
                <Link href={`/acte/${it.id}`} className="raa-open">
                  Ouvrir
                </Link>
                {(it.type || it.service) && (
                  <div className="raa-meta-mobile raa-meta">
                    {it.type || ''} {it.service ? `· ${it.service}` : ''}
                  </div>
                )}
              </div>
              <div className="raa-cell" role="cell">
                {formatDate(date)}
              </div>
              <div className="raa-cell raa-col-type" role="cell">
                {it.type || '—'}
              </div>
              <div className="raa-cell raa-col-service" role="cell">
                {it.service || '—'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <nav className="raa-pager-pill" aria-label="Pagination">
        <div className="raa-pill" role="group">
          <button
            type="button"
            onClick={() => page > 1 && search(1)}
            disabled={page <= 1}
            aria-label="Première page"
            title="Première page"
          >
            ««
          </button>

          <button
            type="button"
            onClick={() => page > 1 && search(page - 1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            title="Page précédente"
          >
            ‹
          </button>

          <span className="raa-count" aria-live="polite">
            {typeof totalPages === 'number' ? `${page} / ${totalPages}` : `Page ${page}`}
          </span>

          <button
            type="button"
            onClick={() => hasNext && search(page + 1)}
            disabled={!hasNext}
            aria-label="Page suivante"
            title="Page suivante"
          >
            ›
          </button>

          <button
            type="button"
            onClick={() =>
              typeof totalPages === 'number' && page !== totalPages && search(totalPages)
            }
            disabled={typeof totalPages !== 'number' || page === totalPages}
            aria-label="Dernière page"
            title="Dernière page"
          >
            »»
          </button>
        </div>
      </nav>
    </main>
  )
}

