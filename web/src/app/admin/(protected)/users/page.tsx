'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import '../../../styles/admin.css'
import '../../../styles/users.css'

import { useToast } from '../../../../components/Toast'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

type UserRole = 'admin' | 'agent'

type UserRow = {
  id: number
  email: string
  role: UserRole
  created_at: string
}

type Me = {
  email: string
  role: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const toast = useToast()

  const [me, setMe] = useState<Me | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('agent')
  const [saving, setSaving] = useState(false)

  const [deletingUserId, setDeletingUserId] = useState<number | null>(null)

  // Chargement initial : vérifier que l'on est admin + récupérer les users
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

        await loadUsers()
      } catch (err) {
        console.error(err)
        setError('Erreur réseau lors du chargement.')
      } finally {
        setLoading(false)
      }
    }

    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadUsers = async () => {
    setError(null)
    try {
      const res = await fetch(`${API}/admin/users`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error('failed')
      }
      const data = await res.json()
      const arr: UserRow[] = (Array.isArray(data)
        ? data
        : data.items ?? data.users ?? []) as UserRow[]
      setUsers(arr)
    } catch (err) {
      console.error(err)
      setError('Erreur réseau lors du chargement.')
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('E-mail et mot de passe sont obligatoires.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`${API}/admin/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error('Erreur création utilisateur:', txt)

        let message = 'Création impossible.'

        try {
          const data = JSON.parse(txt)

          // Cas standard FastAPI : {"detail": "..."}
          if (typeof data.detail === 'string') {
            message = data.detail
          }
          // Cas validation Pydantic : {"detail": [{ msg: "...", ... }]}
          else if (Array.isArray(data.detail) && data.detail[0]?.msg) {
            const rawMsg: string = data.detail[0].msg

            const lower = rawMsg.toLowerCase()

            if (lower.includes('valid email')) {
              // Erreur sur EmailStr
              message = 'Adresse e-mail invalide.'
            } else if (lower.includes('at least 6 characters') || lower.includes('6 characters')) {
              // Erreur sur la longueur minimale du mot de passe
              message = 'Le mot de passe doit contenir au moins 6 caractères.'
            } else {
              // Fallback : on affiche le message brut
              message = rawMsg
            }
          }
        } catch {
          // body pas en JSON -> on garde le message générique
        }

        toast.error(message)
        return
      }

      setEmail('')
      setPassword('')
      setRole('agent')
      toast.success('Utilisateur créé.')
      await loadUsers()
    } catch (err) {
      console.error(err)
      toast.error('Erreur réseau pendant la création.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (user: UserRow) => {
    if (me && me.email === user.email) {
      toast.error('Vous ne pouvez pas supprimer votre propre compte.')
      return
    }

    const ok = window.confirm(
      `Supprimer l'utilisateur "${user.email}" ? Cette action est définitive.`,
    )
    if (!ok) return

    setDeletingUserId(user.id)
    try {
      const res = await fetch(`${API}/admin/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error(txt)
        let message = 'Suppression impossible.'
        try {
          const data = JSON.parse(txt)
          if (data.detail) message = data.detail
        } catch {
          // ignore
        }
        toast.error(message)
        return
      }

      setUsers(prev => prev.filter(u => u.id !== user.id))
      toast.success('Utilisateur supprimé.')
    } catch (err) {
      console.error(err)
      toast.error('Erreur réseau pendant la suppression.')
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <main className="admin-wrap admin-users-page">
      {/* ligne retour + info utilisateur */}
      <div className="users-backline">
        <Link href="/admin" className="a-link">
          &larr; Tableau de bord
        </Link>
        {me && (
          <span className="users-me">
            Connecté en tant que <strong>{me.email}</strong> ({me.role})
          </span>
        )}
      </div>

      {/* Titre + bouton vers le journal d'audit */}
      <div className="users-header-line">
        <h1 className="users-title">Gestion des utilisateurs</h1>
        <Link href="/admin/audit-logs" className="users-audit-link">
          Voir le journal d&apos;audit
        </Link>
      </div>

      {/* Carte : création */}
      <section className="users-card" aria-labelledby="users-create-title">
        <h2 id="users-create-title" className="users-section-title">
          Créer un utilisateur
        </h2>

        <form className="users-form" onSubmit={handleCreate}>
          <div className="users-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="users-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="users-field">
            <label htmlFor="role">Rôle</label>
            <select
              id="role"
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
            >
              <option value="agent">Agent</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          <button
            type="submit"
            className="btn-primary users-submit"
            disabled={saving}
          >
            {saving ? 'Création…' : "Créer l'utilisateur"}
          </button>
        </form>
      </section>

      {/* Carte : liste */}
      <section className="users-card" aria-labelledby="users-list-title">
        <h2 id="users-list-title" className="users-section-title">
          Liste des utilisateurs
        </h2>

        {loading ? (
          <p className="users-info">Chargement…</p>
        ) : error ? (
          <p className="users-error">{error}</p>
        ) : users.length === 0 ? (
          <p className="users-info">Aucun utilisateur pour le moment.</p>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isMe = me && me.email === u.email
                  const deleteDisabled =
                    deletingUserId === u.id || !!isMe

                  return (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.email}</td>
                      <td className={`users-role users-role-${u.role}`}>
                        {u.role}
                      </td>
                      <td>
                        {new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(u.created_at))}
                      </td>
                      <td className="users-actions">
                        <div className="users-actions-buttons">
                          <button
                            type="button"
                            className="users-edit-btn"
                            onClick={() =>
                              router.push(`/admin/users/${u.id}`)
                            }
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="users-delete-btn"
                            disabled={deleteDisabled}
                            onClick={() => handleDeleteUser(u)}
                          >
                            {deletingUserId === u.id
                              ? 'Suppression…'
                              : 'Supprimer'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
