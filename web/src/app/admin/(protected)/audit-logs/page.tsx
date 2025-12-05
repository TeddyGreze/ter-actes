'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import '../../../styles/admin.css'
import '../../../styles/users.css'
import { useToast } from '../../../../components/Toast'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

type Me = {
  email: string
  role: string
}

type AuditLog = {
  id: number
  created_at: string
  user_email: string | null
  action: string
  acte_id: number | null
  acte_titre: string | null
  detail?: string | null
}

type AuditActionFilter = '' | 'create' | 'update' | 'delete'

type Filters = {
  email: string
  action: AuditActionFilter
  acteId: string
}

export default function AuditLogsPage() {
  const router = useRouter()
  const toast = useToast()

  const [me, setMe] = useState<Me | null>(null)

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const pageSize = 20
  const [hasNext, setHasNext] = useState(false)
  const [totalPagesHint, setTotalPagesHint] = useState(1)

  const [exporting, setExporting] = useState(false)

  // Filtres saisis dans le formulaire
  const [filterEmail, setFilterEmail] = useState('')
  const [filterAction, setFilterAction] = useState<AuditActionFilter>('')
  const [filterActeId, setFilterActeId] = useState('')

  // Filtres actuellement appliqués au tableau
  const [activeFilters, setActiveFilters] = useState<Filters>({
    email: '',
    action: '',
    acteId: '',
  })

  useEffect(() => {
    const boot = async () => {
      try {
        const resMe = await fetch(`${API}/admin/me`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!resMe.ok) {
          router.replace('/admin/login')
          return
        }
        const meData = await resMe.json()
        setMe(meData)

        if (meData.role !== 'admin') {
          toast.error('Accès réservé aux administrateurs.')
          router.replace('/admin')
          return
        }

        setTotalPagesHint(1)
        await loadLogs(1, activeFilters)
      } catch (err) {
        console.error(err)
        setError('Erreur réseau lors du chargement.')
      }
    }

    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLogs = async (pageToLoad: number, filters: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(pageToLoad))
      params.set('size', String(pageSize))

      if (filters.email.trim()) {
        params.set('user_email', filters.email.trim())
      }
      if (filters.action) {
        params.set('action', filters.action)
      }
      if (filters.acteId.trim()) {
        params.set('acte_id', filters.acteId.trim())
      }

      const res = await fetch(`${API}/admin/audit-logs?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error(txt)
        throw new Error('failed')
      }

      const data = await res.json()
      const items: AuditLog[] = Array.isArray(data)
        ? data
        : ((data.items ?? data.logs ?? []) as AuditLog[])

      setLogs(items)

      const hasNextFromApi =
        typeof (data as any).has_next === 'boolean'
          ? (data as any).has_next
          : items.length === pageSize

      setHasNext(hasNextFromApi)

      // Met à jour le nombre total de pages connu
      setTotalPagesHint(prev =>
        hasNextFromApi
          ? Math.max(prev, pageToLoad + 1)
          : Math.max(prev, pageToLoad),
      )
    } catch (err) {
      console.error(err)
      setError('Erreur réseau lors du chargement.')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const newFilters: Filters = {
      email: filterEmail,
      action: filterAction,
      acteId: filterActeId,
    }
    setActiveFilters(newFilters)
    setPage(1)
    setTotalPagesHint(1)
    await loadLogs(1, newFilters)
  }

  const handlePrevPage = async () => {
    if (page <= 1) return
    const newPage = page - 1
    setPage(newPage)
    await loadLogs(newPage, activeFilters)
  }

  const handleNextPage = async () => {
    if (!hasNext) return
    const newPage = page + 1
    setPage(newPage)
    await loadLogs(newPage, activeFilters)
  }

  const formatActionLabel = (action: string) => {
    switch (action) {
      case 'create':
        return 'Création'
      case 'update':
        return 'Modification'
      case 'delete':
        return 'Suppression'
      default:
        return action
    }
  }

  const actionBadgeClass = (action: string) => {
    switch (action) {
      case 'create':
        return 'audit-action-badge audit-action-create'
      case 'update':
        return 'audit-action-badge audit-action-update'
      case 'delete':
        return 'audit-action-badge audit-action-delete'
      default:
        return 'audit-action-badge'
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)

      const params = new URLSearchParams()
      if (activeFilters.email.trim()) {
        params.set('user_email', activeFilters.email.trim())
      }
      if (activeFilters.action) {
        params.set('action', activeFilters.action)
      }
      if (activeFilters.acteId.trim()) {
        params.set('acte_id', activeFilters.acteId.trim())
      }

      const url = `${API}/admin/audit-logs/export${
        params.toString() ? `?${params.toString()}` : ''
      }`

      const res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        console.error(await res.text())
        toast.error('Export impossible.')
        return
      }

      const blob = await res.blob()
      const dlUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = dlUrl
      const today = new Date().toISOString().slice(0, 10)
      a.download = `journal-audit-${today}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(dlUrl)
    } catch (err) {
      console.error(err)
      toast.error("Erreur réseau pendant l'export.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="admin-wrap admin-users-page audit-page">
      <div className="users-backline">
        <Link href="/admin/users" className="a-link">
          &larr; Gestion des utilisateurs
        </Link>
        {me && (
          <span className="users-me">
            Connecté en tant que <strong>{me.email}</strong> ({me.role})
          </span>
        )}
      </div>

      <h1 className="users-title">Journal d&apos;audit des actes</h1>

      {/* Filtres */}
      <section className="users-card" aria-labelledby="audit-filters-title">
        <h2 id="audit-filters-title" className="users-section-title">
          Filtres
        </h2>

        <form className="audit-filters" onSubmit={handleFilterSubmit}>
          <div className="users-field">
            <label htmlFor="filter-email">E-mail (agent / admin)</label>
            <input
              id="filter-email"
              type="email"
              value={filterEmail}
              onChange={e => setFilterEmail(e.target.value)}
              placeholder="ex : agent@ville.fr"
            />
          </div>

          <div className="users-field">
            <label htmlFor="filter-action">Action</label>
            <select
              id="filter-action"
              value={filterAction}
              onChange={e =>
                setFilterAction(e.target.value as AuditActionFilter)
              }
            >
              <option value="">Toutes</option>
              <option value="create">Création</option>
              <option value="update">Modification</option>
              <option value="delete">Suppression</option>
            </select>
          </div>

          <div className="users-field">
            <label htmlFor="filter-acte-id">ID acte</label>
            <input
              id="filter-acte-id"
              type="number"
              value={filterActeId}
              onChange={e => setFilterActeId(e.target.value)}
              placeholder="ex : 42"
              min={1}
            />
          </div>

          <button type="submit" className="btn-primary audit-filter-submit">
            Appliquer
          </button>
        </form>
      </section>

      {/* Liste des logs */}
      <section className="users-card" aria-labelledby="audit-list-title">
        <div className="audit-list-header">
          <h2 id="audit-list-title" className="users-section-title">
            Dernières opérations
          </h2>
          <button
            type="button"
            className="audit-export-btn"
            onClick={handleExport}
            disabled={exporting || loading}
          >
            {exporting ? 'Export…' : 'Exporter en CSV'}
          </button>
        </div>

        {loading ? (
          <p className="users-info">Chargement…</p>
        ) : error ? (
          <p className="users-error">{error}</p>
        ) : logs.length === 0 ? (
          <p className="users-info">
            Aucun événement dans le journal pour le moment.
          </p>
        ) : (
          <>
            <div className="users-table-wrapper">
              <table className="users-table audit-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Utilisateur</th>
                    <th>Action</th>
                    <th>ID Acte</th>
                    <th>Titre de l&apos;acte</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>
                        {log.created_at
                          ? new Intl.DateTimeFormat('fr-FR', {
                              dateStyle: 'short',
                              timeStyle: 'medium',
                            }).format(new Date(log.created_at))
                          : '—'}
                      </td>
                      <td>{log.user_email ?? '—'}</td>
                      <td>
                        <span className={actionBadgeClass(log.action)}>
                          {formatActionLabel(log.action)}
                        </span>
                      </td>
                      <td>{log.acte_id ?? '—'}</td>
                      <td>{log.acte_titre ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="audit-pagination">
              <span className="audit-pagination-info">
                Page {page} / {totalPagesHint}
              </span>
              <div className="audit-pagination-buttons">
                <button
                  type="button"
                  className="audit-page-btn"
                  onClick={handlePrevPage}
                  disabled={page <= 1 || loading}
                >
                  Page précédente
                </button>
                <button
                  type="button"
                  className="audit-page-btn"
                  onClick={handleNextPage}
                  disabled={!hasNext || loading}
                >
                  Page suivante
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
