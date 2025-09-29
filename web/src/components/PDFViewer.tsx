'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import '../app/styles/acte.css' 

// ———————————————————————————
// Worker pdf.js
// ———————————————————————————
async function ensureWorker() {
  if (typeof window === 'undefined') return
  const g = (pdfjsLib as any).GlobalWorkerOptions
  if (g?.workerSrc) return

  try {
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string
    ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc
  } catch {
    ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${(pdfjsLib as any).version}/build/pdf.worker.min.mjs`
  }
}

type FitMode = 'page' | 'none'
type Props = {
  url: string
  height?: number
  initialScale?: number
  fitModeDefault?: FitMode
}

export default function PDFViewer({
  url,
  height = 900,
  initialScale = 1.25,
  fitModeDefault = 'page',
}: Props) {
  const wrapRef   = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const pdfRef  = useRef<any | null>(null)
  const taskRef = useRef<any | null>(null)

  const pageRef       = useRef<number>(1)
  const runRef        = useRef(0)
  const fitRef        = useRef<FitMode>(fitModeDefault)
  const renderingRef  = useRef(false)
  const pendingScroll = useRef<number | null>(null)

  const [page, setPage]     = useState(1)
  const [numPages, setNum]  = useState(1)
  const [scale, setScale]   = useState(initialScale)
  const [fitMode, setFit]   = useState<FitMode>(fitModeDefault)

  const cancelRender = () => { try { taskRef.current?.cancel() } catch {} taskRef.current = null }
  const destroyPdf  = () => { try { pdfRef.current?.destroy() } catch {} pdfRef.current = null }

  const renderPage = useCallback(async () => {
    const pdf = pdfRef.current, canvas = canvasRef.current, wrap = wrapRef.current
    if (!pdf || !canvas || !wrap) return
    cancelRender()
    renderingRef.current = true

    const p  = await pdf.getPage(pageRef.current)
    const vp = p.getViewport({ scale })

    canvas.width  = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d')!
    taskRef.current = p.render({ canvasContext: ctx, viewport: vp })

    try { await taskRef.current.promise } catch {}
    taskRef.current = null
    renderingRef.current = false

    if (pendingScroll.current !== null) {
      wrap.scrollTop = pendingScroll.current === Number.MAX_SAFE_INTEGER
        ? wrap.scrollHeight
        : pendingScroll.current
      pendingScroll.current = null
    }
  }, [scale])

  const fitPage = useCallback(async () => {
    if (!pdfRef.current || !wrapRef.current) return
    const p = await pdfRef.current.getPage(pageRef.current)
    const vp1 = p.getViewport({ scale: 1 })
    const w = wrapRef.current.clientWidth
    const h = wrapRef.current.clientHeight
    const s = Math.max(0.25, Math.min(4, Math.min(w / vp1.width, h / vp1.height)))
    fitRef.current = 'page'
    setFit('page')
    setScale(s)
  }, [])

  const goTo = (n: number) => {
    const m = Math.max(1, Math.min(numPages, n))
    pageRef.current = m
    setPage(m)
  }
  const prev = () => goTo(pageRef.current - 1)
  const next = () => goTo(pageRef.current + 1)

  // ———————————— Chargement PDF ————————————
  useEffect(() => {
    let cancelled = false
    const runId = ++runRef.current

    ;(async () => {
      await ensureWorker()
      cancelRender(); destroyPdf()

      const task = (pdfjsLib as any).getDocument({ url })
      const pdf  = await task.promise
      if (cancelled || runId !== runRef.current) { try { task.destroy() } catch {}; return }

      pdfRef.current = pdf
      setNum(pdf.numPages)
      pageRef.current = 1
      setPage(1)

      if (fitRef.current === 'page') await fitPage()
      else setScale(initialScale)

      await renderPage()
    })().catch(console.error)

    return () => { cancelled = true; cancelRender(); destroyPdf() }
  }, [url])

  // Re-render quand page/zoom changent
  useEffect(() => { renderPage() }, [page, scale, renderPage])

  // Refit en mode page sur resize
  useEffect(() => {
    if (fitMode !== 'page') return
    const ro = new ResizeObserver(() => fitPage())
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [fitMode, fitPage])

  // Molette (zoom + pagination aux bords)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const EDGE = 4
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setFit('none'); fitRef.current = 'none'
        setScale(s => Math.max(0.25, Math.min(4, s * (e.deltaY > 0 ? 0.9 : 1.1))))
        return
      }
      if (renderingRef.current) return
      const atTop = el.scrollTop <= EDGE
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE
      if (e.deltaY > 0 && atBottom && pageRef.current < numPages) {
        e.preventDefault(); next(); pendingScroll.current = 0
      } else if (e.deltaY < 0 && atTop && pageRef.current > 1) {
        e.preventDefault(); prev(); pendingScroll.current = Number.MAX_SAFE_INTEGER
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [numPages])

  // Télécharger
  const downloadPdf = async () => {
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()

      let filename = 'document.pdf'
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)
      if (m?.[1]) {
        try { filename = decodeURIComponent(m[1]) } catch { filename = m[1] }
      } else {
        const u = new URL(url, window.location.href)
        const last = u.pathname.split('/').filter(Boolean).pop()
        if (last) filename = last.includes('.') ? last : `${last}.pdf`
      }

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      console.error('Download failed:', err)
      alert("Impossible de télécharger le fichier.")
    }
  }

  return (
    <div className="pdfviewer">
      {/* Toolbar */}
      <div className="pdfbar" role="toolbar" aria-label="Contrôles du document">
        <div className="pdfnav">
          <button className="pdfbtn" onClick={prev} disabled={page <= 1} aria-label="Page précédente">‹</button>
          <button className="pdfbtn" onClick={next} disabled={page >= numPages} aria-label="Page suivante">›</button>

          <span className="pdfpage">
            Page{' '}
            <input
              className="pdfpage-input"
              type="number"
              min={1}
              max={numPages}
              value={page}
              onChange={(e) => goTo(Number(e.target.value || 1))}
            />{' '}
            / {numPages}
          </span>
        </div>

        <div className="pdfactions">
          <button
            className="pdfbtn"
            onClick={() => { setFit('none'); fitRef.current = 'none'; setScale(s => Math.max(0.25, s - 0.1)) }}
            aria-label="Zoom -"
            title="Zoom -"
          >-</button>

          <button
            className="pdfbtn"
            onClick={() => { setFit('none'); fitRef.current = 'none'; setScale(s => Math.min(4, s + 0.1)) }}
            aria-label="Zoom +"
            title="Zoom +"
          >+</button>

          <button className="pdfbtn pdfbtn-primary" onClick={downloadPdf} title="Télécharger le PDF">
            ⭳ Télécharger
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div ref={wrapRef} className="pdfwrap" style={{ height }}>
        <canvas ref={canvasRef} className="pdfcanvas" />
      </div>
    </div>
  )
}
