import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const WS_BASE = 'ws://localhost:8000/ws';

export function useGlobalAlerts() {
  const { addAlert } = useStore();

  useEffect(() => {
    let ws: WebSocket;
    
    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/alerts`);
      
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.alerts && Array.isArray(parsed.alerts)) {
            parsed.alerts.forEach((alert: any) => {
              addAlert({
                id: Math.random().toString(36).substr(2, 9),
                timestamp: alert.timestamp ? new Date(alert.timestamp).getTime() : Date.now(),
                cameraName: alert.camera_name || 'Unknown',
                confidence: 0,
                severity: alert.priority >= 2 ? 'high' : alert.priority === 1 ? 'medium' : 'low',
                message: alert.message,
              });
            });
          }
        } catch (e) {
          console.error("Failed to parse alerts WS message", e);
        }
      };

      ws.onclose = () => {
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [addAlert]);
}
