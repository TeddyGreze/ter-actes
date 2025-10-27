'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import '../app/styles/acte.css'

// ----------------------------------------------------
// Worker pdf.js (obligatoire pour pdfjs-dist en browser)
// ----------------------------------------------------
async function ensureWorker() {
  if (typeof window === 'undefined') return
  const g = (pdfjsLib as any).GlobalWorkerOptions
  if (g?.workerSrc) return

  try {
    // On essaie d'importer le worker packagé par Next (url statique)
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
      .default as string
    ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc
  } catch {
    // Fallback CDN (secours)
    ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${(pdfjsLib as any).version}/build/pdf.worker.min.mjs`
  }
}

type FitMode = 'page' | 'none'

type Props = {
  /**
   * Cas 1 : PDF distant déjà hébergé (ex: http://localhost:8000/actes/12/pdf)
   */
  url?: string

  /**
   * Cas 2 : PDF local pas encore upload (File depuis l'<input type="file" />)
   */
  file?: File | Blob | null

  height?: number
  initialScale?: number
  fitModeDefault?: FitMode
}

export default function PDFViewer({
  url,
  file,
  height = 900,
  initialScale = 1.25,
  fitModeDefault = 'page',
}: Props) {
  const wrapRef   = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const pdfRef    = useRef<any | null>(null)
  const taskRef   = useRef<any | null>(null)

  const pageRef       = useRef<number>(1)
  const runRef        = useRef(0)
  const fitRef        = useRef<FitMode>(fitModeDefault)
  const renderingRef  = useRef(false)
  const pendingScroll = useRef<number | null>(null)

  const [page, setPage]     = useState(1)
  const [numPages, setNum]  = useState(1)
  const [scale, setScale]   = useState(initialScale)
  const [fitMode, setFit]   = useState<FitMode>(fitModeDefault)

  // Annuler un rendu en cours
  const cancelRender = () => {
    try { taskRef.current?.cancel() } catch {}
    taskRef.current = null
  }

  // Détruire complètement le PDF courant
  const destroyPdf = () => {
    try { pdfRef.current?.destroy() } catch {}
    pdfRef.current = null
  }

  // --------- Rendu d'UNE page sur le <canvas> ---------
  const renderPage = useCallback(async () => {
    const pdf    = pdfRef.current
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!pdf || !canvas || !wrap) return

    cancelRender()
    renderingRef.current = true

    const p  = await pdf.getPage(pageRef.current)
    const vp = p.getViewport({ scale })

    canvas.width  = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)

    const ctx = canvas.getContext('2d')!
    taskRef.current = p.render({ canvasContext: ctx, viewport: vp })

    try {
      await taskRef.current.promise
    } catch {
      /* ignore cancel errors */
    }
    taskRef.current = null
    renderingRef.current = false

    // si on a demandé de scroller automatiquement (chgt de page via molette)
    if (pendingScroll.current !== null) {
      wrap.scrollTop =
        pendingScroll.current === Number.MAX_SAFE_INTEGER
          ? wrap.scrollHeight
          : pendingScroll.current
      pendingScroll.current = null
    }
  }, [scale])

  // --------- Ajuster le zoom pour "tenir dans la zone d'affichage" ---------
  const fitPage = useCallback(async () => {
    if (!pdfRef.current || !wrapRef.current) return
    const p = await pdfRef.current.getPage(pageRef.current)

    const vp1 = p.getViewport({ scale: 1 })
    const w   = wrapRef.current.clientWidth
    const h   = wrapRef.current.clientHeight

    // on calcule le plus grand zoom qui rentre dans (w,h)
    const s = Math.max(
      0.25,
      Math.min(4, Math.min(w / vp1.width, h / vp1.height))
    )

    fitRef.current = 'page'
    setFit('page')
    setScale(s)
  }, [])

  // --------- Navigation pages ---------
  const goTo = (n: number) => {
    const m = Math.max(1, Math.min(numPages, n))
    pageRef.current = m
    setPage(m)
  }
  const prev = () => goTo(pageRef.current - 1)
  const next = () => goTo(pageRef.current + 1)

  // ----------------------------------------------------
  // Chargement / parsing du PDF quand `url` ou `file` change
  // ----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const runId = ++runRef.current

    ;(async () => {
      await ensureWorker()

      // reset rendu en cours + ancien PDF
      cancelRender()
      destroyPdf()

      // On prépare le "loadingTask" pour pdf.js
      // - si on a un File/Blob local : on lit son ArrayBuffer nous-mêmes
      //   et on passe { data } -> pas de requête réseau (évite l'erreur Headers)
      // - sinon on passe { url } pour laisser pdf.js fetcher via HTTP
      let loadingTask: any | null = null

      if (file) {
        const buf = await file.arrayBuffer()
        loadingTask = (pdfjsLib as any).getDocument({ data: buf })
      } else if (url) {
        loadingTask = (pdfjsLib as any).getDocument({ url })
      } else {
        // rien à afficher
        return
      }

      const pdf  = await loadingTask.promise

      // si entre temps on a rechargé un autre PDF → on nettoie et on arrête
      if (cancelled || runId !== runRef.current) {
        try { loadingTask.destroy?.() } catch {}
        return
      }

      pdfRef.current = pdf
      setNum(pdf.numPages)

      pageRef.current = 1
      setPage(1)

      // premier zoom
      if (fitRef.current === 'page') {
        await fitPage()
      } else {
        setScale(initialScale)
      }

      // premier rendu
      await renderPage()
    })().catch(err => {
      console.error('PDF load error:', err)
    })

    return () => {
      cancelled = true
      cancelRender()
      destroyPdf()
    }
  }, [url, file, fitPage, renderPage, initialScale])

  // Re-render quand la page ou le zoom changent
  useEffect(() => {
    renderPage()
  }, [page, scale, renderPage])

  // Si on est en mode "page", on recalcule le zoom quand la zone de preview est redimensionnée
  useEffect(() => {
    if (fitMode !== 'page') return
    const ro = new ResizeObserver(() => {
      fitPage().then(() => {
        // après avoir recalculé le zoom, on rerend la page
        renderPage()
      })
    })

    if (wrapRef.current) {
      ro.observe(wrapRef.current)
    }
    return () => {
      ro.disconnect()
    }
  }, [fitMode, fitPage, renderPage])

  // Navigation à la molette :
  // - Ctrl/⌘ + molette = zoom
  // - molette en haut/bas du conteneur => page suivante/précédente
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const EDGE = 4
    const onWheel = (e: WheelEvent) => {
      // zoom avec Ctrl/Maj/Cmd
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setFit('none')
        fitRef.current = 'none'
        setScale(s => Math.max(0.25, Math.min(4, s * (e.deltaY > 0 ? 0.9 : 1.1))))
        return
      }

      if (renderingRef.current) return
      const atTop = el.scrollTop <= EDGE
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE

      if (e.deltaY > 0 && atBottom && pageRef.current < numPages) {
        e.preventDefault()
        next()
        pendingScroll.current = 0
      } else if (e.deltaY < 0 && atTop && pageRef.current > 1) {
        e.preventDefault()
        prev()
        pendingScroll.current = Number.MAX_SAFE_INTEGER
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [numPages])

  // ----------------------------------------------------
  // Télécharger le PDF avec le bon nom
  // ----------------------------------------------------
  const downloadPdf = async () => {
    try {
      // Cas 1 : fichier local pas encore uploadé
      if (file) {
        const blob = file instanceof Blob ? file : new Blob([file])
        const filename = (file as File).name || 'document.pdf'

        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(link.href)
        return
      }

      // Cas 2 : PDF distant via URL API
      if (!url) return
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()

      // essaie de prendre le nom depuis Content-Disposition
      let filename = 'document.pdf'
      const cd = res.headers.get('content-disposition') || ''
      // ex: inline; filename="Mon_Fichier.pdf"
      const m = cd.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1])
        } catch {
          filename = m[1]
        }
      } else {
        // fallback: dernier segment de l'URL
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
      alert('Impossible de télécharger le fichier.')
    }
  }

  return (
    <div className="pdfviewer">
      {/* Barre d’outils */}
      <div className="pdfbar" role="toolbar" aria-label="Contrôles du document">
        <div className="pdfnav">
          <button
            className="pdfbtn"
            onClick={prev}
            disabled={page <= 1}
            aria-label="Page précédente"
          >
            ‹
          </button>
          <button
            className="pdfbtn"
            onClick={next}
            disabled={page >= numPages}
            aria-label="Page suivante"
          >
            ›
          </button>

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
            onClick={() => {
              setFit('none')
              fitRef.current = 'none'
              setScale(s => Math.max(0.25, s - 0.1))
            }}
            aria-label="Zoom -"
            title="Zoom -"
          >
            -
          </button>

          <button
            className="pdfbtn"
            onClick={() => {
              setFit('none')
              fitRef.current = 'none'
              setScale(s => Math.min(4, s + 0.1))
            }}
            aria-label="Zoom +"
            title="Zoom +"
          >
            +
          </button>

          <button
            className="pdfbtn pdfbtn-primary"
            onClick={downloadPdf}
            title="Télécharger le PDF"
          >
            ⭳ Télécharger
          </button>
        </div>
      </div>

      {/* Zone de rendu */}
      <div ref={wrapRef} className="pdfwrap" style={{ height }}>
        <canvas ref={canvasRef} className="pdfcanvas" />
      </div>
    </div>
  )
}
