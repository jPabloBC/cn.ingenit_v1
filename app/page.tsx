"use client"
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()
  const [tenant, setTenant] = useState('28f63198-9163-4347-b2ee-62177b0c425f')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [authUser, setAuthUser] = useState<any>(null)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('cn_access_token') : null
    if (token) setAccessToken(token)
  }, [])

  async function login() {
    setLoading(true)
    setResult(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setResult('Error de login: ' + error.message)
      } else {
        const token = (data?.session as any)?.access_token
        if (token) {
          localStorage.setItem('cn_access_token', token)
          setAccessToken(token)
        }
        setAuthUser(data?.user ?? null)
        // guardar email para mostrar en el header del dashboard
        if (data?.user?.email) localStorage.setItem('cn_user_email', data.user.email)
        // redirigir al dashboard después del login
        router.push('/dashboard')
      }
    } catch (e: any) {
      setResult(String((e as any)?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('cn_access_token')
    setAccessToken(null)
    setAuthUser(null)
    setResult(null)
  }

  async function generate() {
    setLoading(true)
    setResult(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
      const res = await fetch('/api/generate-folio', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tenant_id: tenant })
      })
      const json = await res.json()
      setResult(JSON.stringify(json))
    } catch (e: any) {
      setResult(String((e as any)?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 800 }}>
      <h1>SII Contabilidad - Scaffold (App Router)</h1>
      <p>API ejemplo en <code>/api/generate-folio</code></p>

      {!accessToken ? (
        <section style={{ marginTop: 20 }}>
          <h2>Iniciar sesión</h2>
          <div>
            <label>Correo</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={login} disabled={loading}>{loading ? 'Iniciando...' : 'Iniciar sesión'}</button>
          </div>
          {result && <pre style={{ background: '#f6f8fa', padding: 12, marginTop: 12 }}>{result}</pre>}
        </section>
      ) : (
        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>Conectado{authUser ? ` como ${authUser.email}` : ''}</div>
            <button onClick={logout}>Cerrar sesión</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Tenant ID</label>
            <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={generate} disabled={loading}>{loading ? 'Generando...' : 'Generar Folio'}</button>
          </div>
          {result && <pre style={{ background: '#f6f8fa', padding: 12, marginTop: 12 }}>{result}</pre>}
        </section>
      )}
    </main>
  )
}
