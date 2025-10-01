'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Variant = 'info' | 'success' | 'error'
type Toast = { id: number; msg: string; variant: Variant }

type Ctx = {
  show: (msg: string, variant?: Variant, ms?: number) => void
  success: (msg: string, ms?: number) => void
  error: (msg: string, ms?: number) => void
  info: (msg: string, ms?: number) => void
}

const ToastContext = createContext<Ctx | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((msg: string, variant: Variant = 'info', ms = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, variant }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms)
  }, [])

  const api = useMemo<Ctx>(() => ({
    show,
    success: (m, ms) => show(m, 'success', ms),
    error:   (m, ms) => show(m, 'error', ms),
    info:    (m, ms) => show(m, 'info', ms),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="true">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.variant}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
