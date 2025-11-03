// /components/SaveViaApi.tsx
'use client'
import { useState } from 'react'

export default function SaveViaApi() {
  const [text, setText] = useState('')
  const onSave = async () => {
    const r = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: text }),
    })
    const j = await r.json()
    if (!r.ok) return alert(j?.error?.message || 'error')
    alert('저장됨')
  }
  return (
    <>
      <input value={text} onChange={e=>setText(e.target.value)} />
      <button onClick={onSave}>저장(API)</button>
    </>
  )
}
