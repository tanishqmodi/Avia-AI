import { useEffect, useRef, useState, useCallback } from 'react'

export function useWebSocket(url, { onMessage, enabled = true } = {}) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimer = useRef(null)

  const connect = useCallback(() => {
    if (!enabled || !url) return

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current)
          reconnectTimer.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type !== 'ping' && onMessage) {
            onMessage(data)
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (enabled) {
          reconnectTimer.current = setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (e) {
      // retry
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [url, enabled, onMessage])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { connected, send, ws: wsRef }
}

export function useBrowserCamera(wsUrl, { cameraName = 'Browser Camera', zone = 'General', enabled = true } = {}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [processedFrame, setProcessedFrame] = useState(null)
  const [stats, setStats] = useState({})
  const [alerts, setAlerts] = useState([])
  const [streaming, setStreaming] = useState(false)
  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'config', name: cameraName, zone }))
        setStreaming(true)

        intervalRef.current = setInterval(() => {
          if (!videoRef.current || !canvasRef.current || ws.readyState !== WebSocket.OPEN) return
          const canvas = canvasRef.current
          const video = videoRef.current
          canvas.width = video.videoWidth || 640
          canvas.height = video.videoHeight || 480
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          const b64 = dataUrl.split(',')[1]
          ws.send(JSON.stringify({ type: 'frame', frame: b64 }))
        }, 1000 / 15) // 15 FPS capture
      }

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'processed') {
            setProcessedFrame(`data:image/jpeg;base64,${data.frame}`)
            setStats(data.stats || {})
            if (data.alerts?.length) {
              setAlerts(prev => [...data.alerts, ...prev].slice(0, 50))
            }
          }
        } catch (err) { /* ignore */ }
      }

      ws.onclose = () => setStreaming(false)
    } catch (err) {
      console.error('Camera access failed:', err)
    }
  }, [wsUrl, cameraName, zone])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (wsRef.current) wsRef.current.close()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setStreaming(false)
    setProcessedFrame(null)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { videoRef, canvasRef, processedFrame, stats, alerts, streaming, start, stop }
}
