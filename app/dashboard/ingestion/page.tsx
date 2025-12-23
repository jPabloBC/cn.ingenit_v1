"use client"
import React, { useState, useEffect, useRef } from 'react'

// Componente simplificado: muestra un navegador incrustado mediante iframe.
export default function IngestionPage() {
  const [url, setUrl] = useState('https://homer.sii.cl/')
  const [inputValue, setInputValue] = useState(url)
  const [embed, setEmbed] = useState(true)
  const [useServerBrowser, setUseServerBrowser] = useState(false)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [history, setHistory] = useState<string[]>(['https://homer.sii.cl/'])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  // expose streamer token to the page runtime (populated from NEXT_PUBLIC_STREAMER_TOKEN)
  useEffect(() => {
    try {
      ;(window as any).__STREAMER_TOKEN = (process.env.NEXT_PUBLIC_STREAMER_TOKEN as string) || ''
    } catch (e) {}
  }, [])

  function sendWS(obj: any) {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(obj))
      }
    } catch (e) {
      // ignore
    }
  }

  function mapCanvasPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * (canvas.width / rect.width)
    const y = (clientY - rect.top) * (canvas.height / rect.height)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x: Math.max(0, Math.min(canvas.width, x)), y: Math.max(0, Math.min(canvas.height, y)) }
  }

  function toButton(btn: number) {
    if (btn === 2) return 'right'
    if (btn === 1) return 'middle'
    return 'left'
  }

  function navigateTo(raw: string) {
    const target = raw.trim()
    if (!target) return
    const normalized = target.match(/^https?:\/\//) ? target : `https://${target}`
    const nextHistory = history.slice(0, historyIndex + 1).concat([normalized])
    setHistory(nextHistory)
    setHistoryIndex(nextHistory.length - 1)
    setUrl(normalized)
    setInputValue(normalized)
    setReloadKey((k) => k + 1)
    // if server browser is active, instruct it to navigate as well
    try {
      if (useServerBrowser && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'goto', url: normalized }))
      }
    } catch (e) { /* ignore */ }
  }

  function goBack() {
    if (historyIndex <= 0) return
    const idx = historyIndex - 1
    setHistoryIndex(idx)
    const normalized = history[idx]
    setUrl(normalized)
    setInputValue(normalized)
    setReloadKey((k) => k + 1)
    try {
      if (useServerBrowser && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'goto', url: normalized }))
      }
    } catch (e) {}
  }

  function goForward() {
    if (historyIndex >= history.length - 1) return
    const idx = historyIndex + 1
    setHistoryIndex(idx)
    const normalized = history[idx]
    setUrl(normalized)
    setInputValue(normalized)
    setReloadKey((k) => k + 1)
    try {
      if (useServerBrowser && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'goto', url: normalized }))
      }
    } catch (e) {}
  }

  function reload() {
    setReloadKey((k) => k + 1)
  }

  useEffect(() => {
    if (!useServerBrowser) {
      // ensure any existing connection is closed
      try { wsRef.current?.close() } catch (e) {}
      wsRef.current = null
      setWsStatus('disconnected')
      return
    }
    // ensure streamer is running (on-demand start) then fetch ephemeral token and open WebSocket
    ;(async () => {
      try {
        await fetch('/api/streamer/start')
      } catch (e) {
        // ignore - we'll surface ws errors below
      }
      
      // proceed to get token and open WS
      
      setWsStatus('connecting')
      try {
        const tRes = await fetch('/api/stream-token')
        const tJson = await tRes.json()
        const token = tJson && tJson.token ? String(tJson.token) : ''
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
        const url = `${proto}://${window.location.hostname}:4000`
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.addEventListener('open', () => {
          setWsStatus('connected')
          try { if (token) ws.send(JSON.stringify({ type: 'auth', token })) } catch (e) {}
        })

        ws.addEventListener('close', () => setWsStatus('disconnected'))
        ws.addEventListener('error', () => setWsStatus('error'))

        ws.addEventListener('message', async (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data)
            if (data.type === 'navigated' && data.url) {
              const normalized = String(data.url)
              setUrl(normalized)
              setInputValue(normalized)
            } else if (data.type === 'frame' && data.image) {
              const b64 = data.image
              const blob = await (await fetch('data:image/png;base64,' + b64)).blob()
              const bitmap = await createImageBitmap(blob)
              const canvas = canvasRef.current
              if (!canvas) return
              canvas.width = bitmap.width
              canvas.height = bitmap.height
              const ctx = canvas.getContext('2d')
              if (!ctx) return
              ctx.drawImage(bitmap, 0, 0)
            }
          } catch (e) {
            console.error('ws message error', e)
          }
        })
      } catch (e) {
        setWsStatus('error')
      }
    })()
    

    return () => {
      try { wsRef.current?.close() } catch (e) {}
      wsRef.current = null
      setWsStatus('disconnected')
    }
  }, [useServerBrowser])

  // listen for navigation messages from proxied iframe so clicks update our address bar and history
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      try {
        const data = e.data || {}
        if (data && data.type === 'proxy-navigate' && data.url) {
          const normalized = String(data.url)
          const nextHistory = history.slice(0, historyIndex + 1).concat([normalized])
          setHistory(nextHistory)
          setHistoryIndex(nextHistory.length - 1)
          setUrl(normalized)
          setInputValue(normalized)
          setReloadKey((k) => k + 1)
        } else if (data && data.type === 'proxy-popstate' && data.url) {
          const normalized = String(data.url)
          setUrl(normalized)
          setInputValue(normalized)
        }
      } catch (e) {
        // ignore
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [history, historyIndex])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #e6e6e6', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={goBack} disabled={historyIndex === 0} style={{ padding: '6px 10px' }}>←</button>
        <button onClick={goForward} disabled={historyIndex >= history.length - 1} style={{ padding: '6px 10px' }}>→</button>
        <button onClick={reload} style={{ padding: '6px 10px' }}>⟳</button>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(inputValue) }}
          style={{ flex: 1, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          placeholder="https://ejemplo.com"
        />
        <button onClick={() => navigateTo(inputValue)} style={{ padding: '6px 12px' }}>Ir</button>
        <label style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} /> Mostrar en página
        </label>
        <label style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={useServerBrowser}
            onChange={(e) => setUseServerBrowser(e.target.checked)}
          />
          Usar navegador en servidor
        </label>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {embed && !useServerBrowser ? (
          <iframe
            key={reloadKey}
            title="Ingestion preview"
            src={`/api/proxy?url=${encodeURIComponent(url)}`}
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        ) : embed && useServerBrowser ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8 }}>
              <strong>Servidor:</strong> <span>{wsStatus}</span>
              <button style={{ marginLeft: 8 }} onClick={() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'goto', url }))
                }
              }}>Ir en servidor</button>
              <button style={{ marginLeft: 8 }} onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (!text) return
                  sendWS({ type: 'type', text })
                } catch (e) {
                  console.error('clipboard read error', e)
                }
              }}>Pegar portapapeles</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <canvas
                ref={canvasRef}
                tabIndex={0}
                style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  const pt = mapCanvasPoint(e.clientX, e.clientY)
                  if (!pt) return
                  ;(e.currentTarget as HTMLCanvasElement).focus()
                  try { (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId) } catch {}
                  sendWS({ type: 'mouseMove', x: pt.x, y: pt.y })
                  sendWS({ type: 'mouseDown', button: toButton(e.button) })
                  e.preventDefault()
                }}
                onPointerUp={(e) => {
                  const pt = mapCanvasPoint(e.clientX, e.clientY)
                  if (!pt) return
                  sendWS({ type: 'mouseMove', x: pt.x, y: pt.y })
                  sendWS({ type: 'mouseUp', button: toButton(e.button) })
                  e.preventDefault()
                }}
                onPointerMove={(e) => {
                  const pt = mapCanvasPoint(e.clientX, e.clientY)
                  if (!pt) return
                  sendWS({ type: 'mouseMove', x: pt.x, y: pt.y })
                }}
                onWheel={(e) => {
                  sendWS({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY })
                  e.preventDefault()
                }}
                onKeyDown={(e) => {
                  // shortcuts
                  if (e.ctrlKey || e.metaKey || e.altKey) {
                    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
                    sendWS({ type: 'shortcut', key, mods: { ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey } })
                    e.preventDefault()
                    return
                  }

                  // printable characters
                  if (e.key.length === 1 && !e.shiftKey) {
                    sendWS({ type: 'type', text: e.key })
                    e.preventDefault()
                    return
                  }
                  if (e.key.length === 1 && e.shiftKey) {
                    // for shifted characters, send as typed text as well
                    sendWS({ type: 'type', text: e.key })
                    e.preventDefault()
                    return
                  }

                  // special keys
                  sendWS({ type: 'press', key: e.key })
                  e.preventDefault()
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            <div>Vista previa deshabilitada. Marca "Mostrar en página".</div>
          </div>
        )}
      </div>
    </div>
  )
}
