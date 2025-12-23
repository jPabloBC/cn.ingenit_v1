"use client"
import Link from 'next/link'
import React from 'react'

export default function Sidebar() {
  return (
    <aside style={{ width: 220, borderRight: '1px solid #eee', padding: 12 }}>
      <nav>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <Link href="/dashboard/ingestion">Automatización</Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/dashboard">Inicio</Link>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
