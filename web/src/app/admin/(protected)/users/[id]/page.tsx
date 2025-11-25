'use client'

import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import '../../../../styles/admin.css'
import '../../../../styles/users.css'

import { useToast } from '../../../../../components/Toast'

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

export default function AdminUserEditPage({
  params,
}: {
  params: { id: string }
}) {
  const router = useRouter()
  const toast = useToast()

  const [me, setMe] = useState<Me | null>(null)
  const [user, setUser] = useState<UserRow | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('agent')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userId = Number(params.id)

  const isMe = me && user && me.email === user.email

  useEffect(() => {
    const boot = async () => {
      try {
        // Vérifier l'auth admin
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

        // Charger l'utilisateur à éditer
        const resUser = await fetch(`${API}/admin/users/${userId}`, {
          credentials: 'include',
          cache: 'no-store',
        })

        if (!resUser.ok) {
          if (resUser.status === 404) {
            setError('Utilisateur introuvable.')
          } else {
            setError("Impossible de charger l'utilisateur.")
          }
          return
        }

        const data = (await resUser.json()) as UserRow
        setUser(data)
        setEmail(data.email)
        setRole(data.role)
      } catch (err) {
        console.error(err)
        setError('Erreur réseau lors du chargement.')
      } finally {
        setLoading(false)
      }
    }

    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return

    const payload: any = {}

    if (email && email !== user.email) {
      payload.email = email
    }

    if (password.trim() !== '') {
      payload.password = password
    }

    if (role && role !== user.role) {
      payload.role = role
    }

    setSaving(true)
    try {
      const res = await fetch(`${API}/admin/users/${user.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const txt = await res.text()
        console.error(txt)
        let message = 'Mise à jour impossible.'
        try {
          const data = JSON.parse(txt)
          if (data.detail) message = data.detail
        } catch {
          // ignore
        }
        toast.error(message)
        return
      }

      const updated = (await res.json()) as UserRow
      setUser(updated)
      setEmail(updated.email)
      setRole(updated.role)
      setPassword('')
      toast.success('Utilisateur mis à jour.')
      router.push('/admin/users')
    } catch (err) {
      console.error(err)
      toast.error('Erreur réseau pendant la mise à jour.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-wrap admin-users-page">
      <div className="users-backline">
        <div className="users-breadcrumbs">
          <Link href="/admin" className="a-link">
            &larr; Tableau de bord
          </Link>
          <span>&nbsp;/&nbsp;</span>
          <Link href="/admin/users" className="a-link">
            Utilisateurs
          </Link>
        </div>
        {me && (
          <span className="users-me">
            Connecté en tant que <strong>{me.email}</strong> ({me.role})
          </span>
        )}
      </div>

      <h1 className="users-title">Modifier un utilisateur</h1>

      {loading ? (
        <p className="users-info">Chargement…</p>
      ) : error ? (
        <p className="users-error">{error}</p>
      ) : !user ? (
        <p className="users-error">Utilisateur introuvable.</p>
      ) : (
        <section className="users-card" aria-label="Formulaire édition utilisateur">
          <h2 className="users-section-title">
            Utilisateur #{user.id} – {user.email}
          </h2>

          <form className="users-edit-form" onSubmit={handleSubmit}>
            <div className="users-field">
              <label htmlFor="edit-email">E-mail</label>
              <input
                id="edit-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="users-field">
              <label htmlFor="edit-password">
                Nouveau mot de passe (laisser vide pour ne pas modifier)
              </label>
              <input
                id="edit-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className="users-field">
              <label htmlFor="edit-role">Rôle</label>
              <select
                id="edit-role"
                value={role}
                onChange={e => setRole(e.target.value as UserRole)}
                disabled={!!isMe}
              >
                <option value="agent">Agent</option>
                <option value="admin">Administrateur</option>
              </select>
              {isMe && (
                <p className="users-info">
                  Vous ne pouvez pas modifier votre propre rôle.
                </p>
              )}
            </div>

            <div className="users-edit-actions">
              <button
                type="button"
                className="users-cancel-btn"
                onClick={() => router.push('/admin/users')}
                disabled={saving}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>

            <p className="users-edit-meta">
              Créé le{' '}
              {new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(user.created_at))}
            </p>
          </form>
        </section>
      )}
    </main>
  )
}
