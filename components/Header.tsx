"use client"
import React, { useEffect, useState } from 'react'

export default function Header({ title = 'SII Contabilidad' }: { title?: string }) {
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    try {
      const e = localStorage.getItem('cn_user_email')
      setEmail(e)
    } catch (e) {
      setEmail(null)
    }
  }, [])

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #eee' }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#333' }}>{mounted && email ? `Conectado como ${email}` : ''}</div>
    </header>
  )
}
