'use client'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import './styles/raa.css'
import { Skeleton } from '../components/Skeleton'
import AdvancedSearchPanel from '../components/AdvancedSearchPanel'

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

export default function HomePage() {
  // Filtres classiques
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

  // Filtre avancé (OCR plein texte)
  const [advFilter, setAdvFilter] = useState<{ term: string; ids: number[] } | null>(null)

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
      clearSelection()
    } catch (e) {
      console.error('Search failed:', e)
      setItems([])
      setTotalPages(undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    search(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const displayItems = useMemo(() => {
    const nq = norm(q)
    const nt = norm(type)
    const ns = norm(service)

    // 1) filtres simples
    let filtered = items.filter(a => {
      if (nq) {
        const haystack = norm(
          `${a.titre} ${a.resume ?? ''} ${a.type ?? ''} ${a.service ?? ''}`
        )
        if (!haystack.includes(nq)) return false
      }
      if (nt && !norm(a.type).includes(nt)) return false
      if (ns && !norm(a.service).includes(ns)) return false
      return true
    })

    // 2) filtre avancé OCR
    if (advFilter && advFilter.ids.length > 0) {
      const allowed = new Set(advFilter.ids)
      filtered = filtered.filter(a => allowed.has(a.id))
    } else if (advFilter && advFilter.ids.length === 0) {
      filtered = []
    }

    // 3) tri
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
  }, [items, q, type, service, sortKey, sortDir, advFilter])

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'

  const formatDate = (iso?: string) =>
    iso ? new Intl.DateTimeFormat('fr-FR').format(new Date(iso)) : ''

  const hasPrev = page > 1
  const hasNext =
    typeof totalPages === 'number'
      ? page < totalPages
      : items.length === PAGE_SIZE

  // ---- Téléchargements ----
  const downloadOne = async (a: Acte) => {
    try {
      const res = await fetch(`${API}/actes/${a.id}/pdf`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Nom de fichier depuis Content-Disposition (ou pdf_path en fallback)
      let filename: string | undefined;
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
      if (m?.[1]) {
        try { filename = decodeURIComponent(m[1]); } catch { filename = m[1]; }
      }
      if (!filename && a.pdf_path) {
        const seg = a.pdf_path.split(/[\\/]/).pop();
        if (seg && seg.toLowerCase().endsWith('.pdf')) filename = seg;
        else if (seg) filename = `${seg}.pdf`;
      }
      if (!filename) filename = `acte_${a.id}.pdf`;
      const safe = (filename.replace(/[\/\\:\*\?"<>\|\x00-\x1F]/g, '').trim() || `acte_${a.id}.pdf`)
      const finalName = safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`

      const aTag = document.createElement('a');
      aTag.href = url;
      aTag.download = finalName;
      document.body.appendChild(aTag);
      aTag.click();
      aTag.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('download failed', err);
      alert('Téléchargement impossible pour cet acte.');
    }
  };

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

  // ============ NAVIGATION CLAVIER (roving tabindex) ============
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const [activeIndex, setActiveIndex] = useState<number>(0)

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

  useEffect(() => {
    // Maintenir un index actif valide lorsque la liste change
    setActiveIndex(i => clamp(i, 0, Math.max(0, displayItems.length - 1)))
  }, [displayItems.length])

  useEffect(() => {
    const el = rowRefs.current[activeIndex]
    if (el) el.focus()
  }, [activeIndex])

  const focusRow = useCallback((i: number) => {
    setActiveIndex(clamp(i, 0, Math.max(0, displayItems.length - 1)))
  }, [displayItems.length])

  const openRow = useCallback((i: number) => {
    const it = displayItems[i]
    if (!it) return
    window.location.assign(`/acte/${it.id}`)
  }, [displayItems])

  const toggleRow = useCallback((i: number) => {
    const it = displayItems[i]
    if (!it) return
    toggleOne(it.id)
  }, [displayItems])

  const downloadRow = useCallback((i: number) => {
    const it = displayItems[i]
    if (!it) return
    downloadOne(it)
  }, [displayItems])

  const onRowKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const maxI = displayItems.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); focusRow(index + 1); break
      case 'ArrowUp':
        e.preventDefault(); focusRow(index - 1); break
      case 'Home':
        e.preventDefault(); focusRow(0); break
      case 'End':
        e.preventDefault(); focusRow(maxI); break
      case 'PageDown':
        e.preventDefault(); focusRow(index + 5); break
      case 'PageUp':
        e.preventDefault(); focusRow(index - 5); break
      case ' ':
        e.preventDefault(); toggleRow(index); break
      case 'Enter':
        e.preventDefault(); openRow(index); break
      case 'd':
      case 'D':
        e.preventDefault(); downloadRow(index); break
      default:
        if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          selectAllDisplayed(true, displayItems)
        }
    }
  }, [displayItems, focusRow, toggleRow, openRow, downloadRow, selectAllDisplayed])

  const onHeadKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); focusRow(0)
    }
  }
  // =============================================================

  return (
    <main className="raa-wrap">
      {/* En-tête du recueil */}
      <div className="recueil-head">
        <div>
          <h1 className="raa-title">Recueil des actes</h1>
          <p className="recueil-info">
            Consultation publique des actes administratifs
          </p>
        </div>
      </div>

      {/* Filtres classiques */}
      <div className="raa-filters">
        <div className="raa-field">
          <label htmlFor="q">Recherche</label>
          <input id="q" title="Champ Recherche" value={q} onChange={e => setQ(e.target.value)} placeholder="Mots-clés..." className="raa-input"/>
        </div>

        <div className="raa-field">
          <label htmlFor="type">Type</label>
          <input id="type" title="Champ Type" value={type} onChange={e => setType(e.target.value)} placeholder="Arrêté, Délibération..." className="raa-input"/>
        </div>

        <div className="raa-field">
          <label htmlFor="service">Service</label>
          <input id="service" title="Champ Service" value={service} onChange={e => setService(e.target.value)} placeholder="Voirie, Culture..." className="raa-input"/>
        </div>

        <div className="raa-field">
          <label htmlFor="dateMin">Date min</label>
          <input id="dateMin" title="Champ Date minimum" type="date" value={dateMin} onChange={e => setDateMin(e.target.value)} className="raa-input"/>
        </div>

        <div className="raa-field">
          <label htmlFor="dateMax">Date max</label>
          <input id="dateMax" title="Champ Date maximum" type="date" value={dateMax} onChange={e => setDateMax(e.target.value)} className="raa-input"/>
        </div>

        <button
          onClick={() => search(1)}
          title="Rechercher"
          className="raa-btn"
        >
          Rechercher
        </button>
      </div>

      {/* Recherche avancée (plein texte OCR) */}
      <AdvancedSearchPanel
        advActive={!!advFilter}
        onApply={(term, ids) => {
          setAdvFilter({ term, ids })
          clearSelection()
        }}
        onReset={() => {
          setAdvFilter(null)
          clearSelection()
        }}
      />

      {/* Barre d’actions si plusieurs sélectionnés */}
      {selectedCount >= 2 && (
        <div className="raa-bulk">
          <span>{selectedCount} sélectionnés</span>
          <button
            className="raa-btn"
            onClick={bulkDownload}
            title="Télécharger les PDF sélectionnés"
          >
            ⭳ Télécharger
          </button>
          <button
            className="raa-btn-outline"
            onClick={clearSelection}
            title="Réinitialiser la sélection"
          >
            Réinitialiser
          </button>
        </div>
      )}

      {/* Tableau responsive */}
      <div className="raa-table" role="table" aria-label="Liste des actes">
        <div
          className="raa-row raa-head"
          role="row"
          tabIndex={0}
          onKeyDown={onHeadKeyDown}
        >
          {/* Sélecteur tout */}
          <div
            className="raa-cell raa-th raa-col-check"
            role="columnheader"
            title="Sélectionner tout"
          >
            <input
              type="checkbox"
              className="raa-check"
              aria-label="Sélectionner tout"
              checked={allDisplayedSelected}
              onChange={e =>
                selectAllDisplayed(e.target.checked, displayItems)
              }
            />
          </div>

          <div
            className={`raa-cell raa-th ${sortKey === 'titre' ? 'active' : ''}`}
            role="columnheader"
            title="Trier par nom"
            aria-sort={sortKey === 'titre' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            tabIndex={0}
            onClick={() => toggleSort('titre')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('titre')}
          >
            <span>Nom</span>{' '}
            <span className="sort">{sortArrow('titre')}</span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-date ${sortKey === 'date_publication' ? 'active' : ''}`}
            role="columnheader"
            title="Trier par date de publication"
            aria-sort={sortKey === 'date_publication' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            tabIndex={0}
            onClick={() => toggleSort('date_publication')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('date_publication')}
          >
            <span>Publication</span>{' '}
            <span className="sort">
              {sortArrow('date_publication')}
            </span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-type ${sortKey === 'type' ? 'active' : ''}`}
            role="columnheader"
            title="Trier par type"
            aria-sort={sortKey === 'type' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            tabIndex={0}
            onClick={() => toggleSort('type')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('type')}
          >
            <span>Type</span>{' '}
            <span className="sort">{sortArrow('type')}</span>
          </div>

          <div
            className={`raa-cell raa-th raa-col-service ${sortKey === 'service' ? 'active' : ''}`}
            role="columnheader"
            title="Trier par service"
            aria-sort={sortKey === 'service' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            tabIndex={0}
            onClick={() => toggleSort('service')}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleSort('service')}
          >
            <span>Service</span>{' '}
            <span className="sort">{sortArrow('service')}</span>
          </div>

          {/* Colonne Download */}
          <div className="raa-cell raa-th raa-col-dl" role="columnheader" aria-label="Télécharger un acte" />
        </div>

        {/* Lignes du tableau */}
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="raa-row"
              role="row"
              aria-hidden="true"
            >
              <div className="raa-cell raa-col-check">
                <Skeleton
                  className="skel-line"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4
                  }}
                />
              </div>
              <div className="raa-cell raa-name">
                <Skeleton
                  className="skel-line"
                  style={{ width: '60%' }}
                />
                <div className="raa-meta">
                  <Skeleton
                    className="skel-pill"
                    style={{ width: 80 }}
                  />
                </div>
              </div>
              <div className="raa-cell">
                <Skeleton
                  className="skel-line"
                  style={{ width: 90 }}
                />
              </div>
              <div className="raa-cell raa-col-type">
                <Skeleton
                  className="skel-line"
                  style={{ width: 120 }}
                />
              </div>
              <div className="raa-cell raa-col-service">
                <Skeleton
                  className="skel-line"
                  style={{ width: 130 }}
                />
              </div>
              <div className="raa-cell raa-col-dl">
                <Skeleton
                  className="skel-line"
                  style={{ width: 24 }}
                />
              </div>
            </div>
          ))
        ) : (
          displayItems.map((it, i) => {
            const date = it.date_publication || it.created_at
            return (
              <div
                key={it.id}
                className="raa-row"
                role="row"
                tabIndex={i === activeIndex ? 0 : -1}
                ref={(el: HTMLDivElement | null) => {
                  rowRefs.current[i] = el;
                }}
                onKeyDown={(e) => onRowKeyDown(e, i)}
                aria-selected={isSelected(it.id) ? 'true' : 'false'}
                aria-rowindex={i + 2} // +1 header, +1 car index 1-based
              >
                {/* checkbox */}
                <div
                  className="raa-cell raa-col-check"
                  role="cell"
                >
                  <input
                    title="Sélectionner l'acte"
                    type="checkbox"
                    className="raa-check"
                    checked={isSelected(it.id)}
                    onChange={() => toggleOne(it.id)}
                  />
                </div>

                {/* NOM */}
                <div className="raa-cell raa-name" role="cell">
                  <span
                    className="title"
                    title={it.titre}
                  >
                    {it.titre}
                  </span>

                  <div className="raa-date-mobile raa-meta">
                    {formatDate(date)}
                  </div>

                  {(it.type || it.service) && (
                    <div className="raa-meta-mobile raa-meta">
                      {it.type || ''}{' '}
                      {it.service ? `· ${it.service}` : ''}
                    </div>
                  )}

                  <Link
                    href={`/acte/${it.id}`}
                    title="Ouvrir l'acte"
                    className="raa-open"
                  >
                    Ouvrir
                  </Link>
                </div>

                <div
                  className="raa-cell raa-col-date"
                  role="cell"
                >
                  {formatDate(date)}
                </div>
                <div
                  className="raa-cell raa-col-type"
                  role="cell"
                >
                  {it.type || '—'}
                </div>
                <div
                  className="raa-cell raa-col-service"
                  role="cell"
                >
                  {it.service || '—'}
                </div>

                {/* bouton DL */}
                <div
                  className="raa-cell raa-col-dl"
                  role="cell"
                >
                  <button
                    className="raa-iconbtn"
                    title="Télécharger l'acte"
                    aria-label={`Télécharger ${it.titre}`}
                    onClick={() => downloadOne(it)}
                  >
                    ⭳
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <nav className="raa-pager-pill" aria-label="Pagination">
        <div className="raa-pill" role="group">
          <button type="button" onClick={() => page > 1 && search(1)} disabled={page <= 1} title="Première page">««</button>
          <button type="button" onClick={() => page > 1 && search(page - 1)} disabled={page <= 1} title="Page précédente">‹</button>
          <span className="raa-count" aria-live="polite">
            {typeof totalPages === 'number' ? `${page} / ${totalPages}` : `Page ${page}`}
          </span>
          <button type="button" onClick={() => hasNext && search(page + 1)} disabled={!hasNext} title="Page suivante">›</button>
          <button type="button" onClick={() => typeof totalPages === 'number' && page !== totalPages && search(totalPages)} disabled={typeof totalPages !== 'number' || page === totalPages} title="Dernière page">»»</button>
        </div>
      </nav>
    </main>
  )
}
