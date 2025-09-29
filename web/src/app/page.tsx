'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

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

export default function HomePage() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [service, setService] = useState('')
  const [dateMin, setDateMin] = useState('')
  const [dateMax, setDateMax] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Acte[]>([])

  async function search(p = page) {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (type) params.set('type', type)
    if (service) params.set('service', service)
    if (dateMin) params.set('date_min', dateMin)
    if (dateMax) params.set('date_max', dateMax)
    params.set('page', String(p))
    params.set('size', '10')
    const res = await fetch(`${API}/actes?` + params.toString())
    const data = await res.json()
    setItems(data)
    setPage(p)
  }

  useEffect(() => { search(1) }, [])

  return (
    <main style={{padding: 24, maxWidth: 980, margin: '0 auto'}}>
      <h1>Portail des actes</h1>
      <div style={{display:'grid', gap:12, gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto', alignItems:'end', marginTop: 16}}>
        <div>
          <label htmlFor="q">Recherche</label>
          <input id="q" value={q} onChange={e=>setQ(e.target.value)} placeholder="mots-clés..." style={{width:'100%'}}/>
        </div>
        <div>
          <label htmlFor="type">Type</label>
          <input id="type" value={type} onChange={e=>setType(e.target.value)} placeholder="arrêté, délibération..."/>
        </div>
        <div>
          <label htmlFor="service">Service</label>
          <input id="service" value={service} onChange={e=>setService(e.target.value)} placeholder="Voirie, Culture..."/>
        </div>
        <div>
          <label htmlFor="dateMin">Date min</label>
          <input id="dateMin" type="date" value={dateMin} onChange={e=>setDateMin(e.target.value)} />
        </div>
        <div>
          <label htmlFor="dateMax">Date max</label>
          <input id="dateMax" type="date" value={dateMax} onChange={e=>setDateMax(e.target.value)} />
        </div>
        <button onClick={()=>search(1)}>Rechercher</button>
      </div>

      <ul style={{marginTop: 24, listStyle:'none', padding:0}}>
        {items.map(it => (
          <li key={it.id} style={{border:'1px solid #ddd', padding:16, borderRadius:8, marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap'}}>
              <strong>{it.titre}</strong>
              <span style={{opacity:.8}}>{it.type || ''} {it.service ? '· ' + it.service : ''}</span>
            </div>
            <p style={{opacity:.85}}>{it.resume}</p>
            <Link href={`/acte/${it.id}`}>Ouvrir</Link>
          </li>
        ))}
      </ul>

      <div style={{display:'flex', gap:8, justifyContent:'center', marginTop:16}}>
        <button onClick={()=>{ if(page>1) search(page-1) }} disabled={page<=1}>← Précédent</button>
        <span>Page {page}</span>
        <button onClick={()=>search(page+1)}>Suivant →</button>
      </div>
    </main>
  )
}
