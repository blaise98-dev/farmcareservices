import { useEffect, useRef, useState, useCallback } from 'react';

// In dev the Vite proxy forwards /ws → backend WS on 8000.
// In prod, nginx proxies /ws → backend WS on 127.0.0.1:8000 (same origin as the page).
// Derive the WS URL from the current page's host/scheme so both cases work automatically,
// unless VITE_WS_URL is explicitly set at build time to point elsewhere.
const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/ws`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useWebSocket() {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const listeners = useRef({});
  const pingTimer = useRef(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      // Keep-alive ping every 25s
      pingTimer.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, 25000);
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        setLastEvent(msg);
        const handlers = listeners.current[msg.event] || [];
        handlers.forEach(fn => fn(msg.data));
        // Also call wildcard listeners
        (listeners.current['*'] || []).forEach(fn => fn(msg));
      } catch {}
    };

    socket.onclose = () => {
      setConnected(false);
      clearInterval(pingTimer.current);
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearInterval(pingTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  /** Subscribe to a specific event name (or '*' for all) */
  const on = useCallback((event, fn) => {
    if (!listeners.current[event]) listeners.current[event] = [];
    listeners.current[event].push(fn);
    return () => {
      listeners.current[event] = listeners.current[event].filter(f => f !== fn);
    };
  }, []);

  return { connected, lastEvent, on };
}
