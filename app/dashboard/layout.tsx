import React from 'react'
import '../globals.css'
import Header from '../../components/Header'
import Sidebar from '../../components/Sidebar'

export const metadata = {
  title: 'Dashboard - SII Contabilidad'
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <Header title="SII Contabilidad" />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ padding: 0, flex: 1, overflow: 'hidden' }}>{children}</main>
      </div>
    </div>
  )
}
