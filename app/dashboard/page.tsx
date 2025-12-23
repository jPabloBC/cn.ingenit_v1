"use client"
import React from 'react'
import Link from 'next/link'

export default function DashboardHome() {
  return (
    <div>
      <h1>Panel de control</h1>
      <p>Bienvenido al dashboard. En el menú lateral selecciona <strong>Automatización</strong> para comenzar la carga de facturas.</p>
      <div style={{ marginTop: 16 }}>
        <Link href="/dashboard/ingestion"><button>Ir a Automatización</button></Link>
      </div>
    </div>
  )
}
