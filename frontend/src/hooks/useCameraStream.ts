import { useState, useEffect, useRef } from 'react';

const WS_BASE = 'ws://localhost:8000/ws';

export interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
  track_id: number;
  model_used: string;
  zone: string;
}

export interface StreamData {
  frame: string; // base64
  stats: any;
  alerts: any[];
  detections: Detection[];
}

export function useCameraStream(cameraId: string | null) {
  const [data, setData] = useState<StreamData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!cameraId) {
      setData(null);
      setIsConnected(false);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/camera/${cameraId}`);
      
      ws.onopen = () => setIsConnected(true);
      
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'frame') {
            setData(parsed);
          }
        } catch (e) {
          console.error("Failed to parse WS message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [cameraId]);

  return { data, isConnected };
}
