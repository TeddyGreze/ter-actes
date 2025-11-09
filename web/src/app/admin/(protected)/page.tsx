'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import '../../styles/admin.css'
import { useToast } from '../../../components/Toast'
import { Skeleton } from '../../../components/Skeleton'
import AdvancedSearchPanel from '../../../components/AdvancedSearchPanel'

export const dynamic = 'force-dynamic'
const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
const PAGE_SIZE = 10 as const

type Acte = {
  id: number
  titre: string
  type?: string
  service?: string
  date_publication?: string
  resume?: string
  created_at: string
}

type SortKey = 'titre' | 'date_publication' | 'type' | 'service'
type SortDir = 'asc' | 'desc'

const norm = (s?: string) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const fmtDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('fr-FR').format(new Date(iso)) : ''

export default function AdminDashboard() {
  const router = useRouter()
  const toast = useToast()

  const [items, setItems] = useState<Acte[]>([])
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  // Filtres
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [service, setService] = useState('')
  const [dateMin, setDateMin] = useState('')
  const [dateMax, setDateMax] = useState('')

  // Tri
  const [sortKey, setSortKey] = useState<SortKey>('date_publication')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pagination
  const [page, setPage] = useState(1)

  // Filtre avancé (OCR plein texte)
  const [advFilter, setAdvFilter] = useState<{ term: string; ids: number[] } | null>(null)

  useEffect(() => {
    const boot = async () => {
      const me = await fetch(`${API}/admin/me`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      })
      if (!me.ok) {
        toast.error('Session expirée')
        router.replace('/admin/login')
        return
      }
      await load(1)
    }
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load(p = page) {
    setLoading(true)
    const url = new URL(`${API}/admin/actes`)
    if (q) url.searchParams.set('q', q)
    url.searchParams.set('page', String(p))
    url.searchParams.set('size', String(PAGE_SIZE))

    const res = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    })
    if (!res.ok) {
      toast.error('Erreur de chargement')
      router.replace('/admin/login')
      return
    }
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
    setLoading(false)
  }

  const logout = async () => {
    try {
      await fetch(`${API}/admin/logout?ts=${Date.now()}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      })
    } catch {}
    try {
      await fetch('/api/session/clear', { method: 'POST', cache: 'no-store' })
    } catch {}
    window.location.assign('/admin/login')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'

  // Filtrage accent/casse + date range + filtre avancé + tri
  const displayItems = useMemo(() => {
    const nq = norm(q)
    const nt = norm(type)
    const ns = norm(service)
    const min = dateMin ? new Date(dateMin).getTime() : undefined
    const max = dateMax ? new Date(dateMax).getTime() : undefined

    let filtered = items.filter(a => {
      if (nq) {
        const hay = norm(`${a.titre} ${a.resume ?? ''} ${a.type ?? ''} ${a.service ?? ''}`)
        if (!hay.includes(nq)) return false
      }
      if (nt && !norm(a.type).includes(nt)) return false
      if (ns && !norm(a.service).includes(ns)) return false
      if (min || max) {
        const d = new Date(a.date_publication || a.created_at || '').getTime()
        if (Number.isFinite(d)) {
          if (min && d < min) return false
          if (max && d > max) return false
        }
      }
      return true
    })

    // ⬇️ Application du filtre avancé OCR
    if (advFilter && advFilter.ids.length > 0) {
      const allowed = new Set(advFilter.ids)
      filtered = filtered.filter(a => allowed.has(a.id))
    } else if (advFilter && advFilter.ids.length === 0) {
      filtered = []
    }

    const arr = [...filtered]
    arr.sort((a, b) => {
      const get = (it: Acte, k: SortKey) =>
        k === 'date_publication' ? (it.date_publication || it.created_at || '') : (it[k] || '')
      const A = get(a, sortKey).toString().toLowerCase()
      const B = get(b, sortKey).toString().toLowerCase()
      if (A < B) return sortDir === 'asc' ? -1 : 1
      if (A > B) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [items, q, type, service, dateMin, dateMax, sortKey, sortDir, advFilter])

  const hasPrev = page > 1
  const hasNext = typeof totalPages === 'number' ? page < totalPages : items.length === PAGE_SIZE

  const onDelete = async (id: number) => {
    if (!confirm('Voulez-vous vraiment supprimer cet acte ?')) return
    const res = await fetch(`${API}/admin/actes/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    })
    if (res.ok) {
      toast.success('Acte supprimé')
      load(page)
    } else {
      toast.error('Échec de la suppression')
    }
  }

  return (
    <main className="admin-wrap">
      {/* Header */}
      <div className="admin-topbar">
        <h1 className="admin-title">Tableau de bord - Actes</h1>
        <div className="admin-actions">
          <Link href="/admin/upload" className="btn-primary">+ Ajouter un acte</Link>
          <button onClick={logout} className="btn-ghost">Se déconnecter</button>
        </div>
      </div>

      {/* Filtres */}
      <div className="admin-filters">
        <div className="f-field">
          <label>Recherche</label>
          <input className="f-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Mots-clés…" />
        </div>
        <div className="f-field">
          <label>Type</label>
          <input className="f-input" value={type} onChange={e=>setType(e.target.value)} placeholder="Arrêté, Délibération…" />
        </div>
        <div className="f-field">
          <label>Service</label>
          <input className="f-input" value={service} onChange={e=>setService(e.target.value)} placeholder="Voirie, Culture…" />
        </div>
        <div className="f-field">
          <label>Date min</label>
          <input className="f-input" type="date" value={dateMin} onChange={e=>setDateMin(e.target.value)} />
        </div>
        <div className="f-field">
          <label>Date max</label>
          <input className="f-input" type="date" value={dateMax} onChange={e=>setDateMax(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={()=>load(1)}>Rechercher</button>
      </div>

      {/* Recherche avancée (plein texte OCR) */}
      <AdvancedSearchPanel
        advActive={!!advFilter}
        onApply={(term, ids) => setAdvFilter({ term, ids })}
        onReset={() => setAdvFilter(null)}
      />

      {/* Tableau */}
      <div className="admin-table" role="table" aria-label="Actes">
        <div className="t-row t-head" role="row">
          <div
            className={`t-cell t-th ${sortKey==='titre'?'active':''}`}
            role="columnheader"
            tabIndex={0}
            onClick={()=>toggleSort('titre')}
            onKeyDown={e=> (e.key==='Enter' || e.key===' ') && toggleSort('titre')}
          >
            <span>Nom</span> <span className="sort">{sortArrow('titre')}</span>
          </div>
          <div
            className={`t-cell t-th ${sortKey==='date_publication'?'active':''}`}
            role="columnheader"
            tabIndex={0}
            onClick={()=>toggleSort('date_publication')}
            onKeyDown={e=> (e.key==='Enter' || e.key===' ') && toggleSort('date_publication')}
          >
            <span>Publication</span> <span className="sort">{sortArrow('date_publication')}</span>
          </div>
          <div
            className={`t-cell t-th ${sortKey==='type'?'active':''}`}
            role="columnheader"
            tabIndex={0}
            onClick={()=>toggleSort('type')}
            onKeyDown={e=> (e.key==='Enter' || e.key===' ') && toggleSort('type')}
          >
            <span>Type</span> <span className="sort">{sortArrow('type')}</span>
          </div>
          <div
            className={`t-cell t-th ${sortKey==='service'?'active':''}`}
            role="columnheader"
            tabIndex={0}
            onClick={()=>toggleSort('service')}
            onKeyDown={e=> (e.key==='Enter' || e.key===' ') && toggleSort('service')}
          >
            <span>Service</span> <span className="sort">{sortArrow('service')}</span>
          </div>
          <div className="t-cell t-th t-actions">Actions</div>
        </div>

        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skel-row" role="row" aria-hidden="true">
              <Skeleton className="skel-line" />
              <Skeleton className="skel-line" />
              <Skeleton className="skel-line" />
              <Skeleton className="skel-line" />
              <Skeleton className="skel-pill" style={{ width: 120 }} />
            </div>
          ))
        ) : (
          <>
            {displayItems.map(a => {
              const date = a.date_publication || a.created_at
              return (
                <div key={a.id} className="t-row" role="row">
                  <div className="t-cell t-name" role="cell">
                    <span className="t-title" title={a.titre}>{a.titre}</span>
                    <div className="t-meta-mobile">
                      <div className="m-date">{fmtDate(date)}</div>
                      <div className="m-inline">
                        {a.type || '—'} · {a.service || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="t-cell" role="cell">{fmtDate(date)}</div>
                  <div className="t-cell" role="cell">{a.type || '—'}</div>
                  <div className="t-cell" role="cell">{a.service || '—'}</div>

                  {/* Actions */}
                  <div className="t-cell t-actions" role="cell">
                    <Link href={`/acte/${a.id}?from=admin`} className="btn-outline btn-open">Ouvrir</Link>
                    <div className="a-row">
                      <Link href={`/admin/actes/${a.id}/edit`} className="btn-outline">Modifier</Link>
                      <button onClick={()=>onDelete(a.id)} className="btn-danger">Supprimer</button>
                    </div>
                  </div>
                </div>
              )
            })}

            {displayItems.length === 0 && (
              <div className="t-row t-empty">Aucun acte</div>
            )}
          </>
        )}
      </div>

      {/* Pagination pilule */}
      <nav className="pager-wrap" aria-label="Pagination">
        <div className="pager-pill" role="group">
          <button type="button" onClick={()=> hasPrev && load(1)} disabled={!hasPrev} title="Première">««</button>
          <button type="button" onClick={()=> hasPrev && load(page-1)} disabled={!hasPrev} title="Précédente">‹</button>
          <span className="count">{typeof totalPages==='number' ? `Page ${page} / ${totalPages}` : `Page ${page}`}</span>
          <button type="button" onClick={()=> hasNext && load(page+1)} disabled={!hasNext} title="Suivante">›</button>
          <button
            type="button"
            onClick={()=> typeof totalPages==='number' && page!==totalPages && load(totalPages!)}
            disabled={typeof totalPages!=='number' || page===totalPages}
            title="Dernière"
          >»»</button>
        </div>
      </nav>
    </main>
  )
}
