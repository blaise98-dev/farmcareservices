import { createContext, useContext, useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

const RealtimeCtx = createContext(null);

export function RealtimeProvider({ children }) {
  const { connected, on } = useWebSocket();
  const [env, setEnv] = useState(null);
  const [collar, setCollar] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [alertsCount, setAlertsCount] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => on('env_live', setEnv), [on]);
  useEffect(() => on('env_update', setEnv), [on]);
  useEffect(() => on('wearable_collar_live', setCollar), [on]);
  useEffect(() => on('wearable_vitals_live', setVitals), [on]);
  useEffect(() => on('alerts_count', d => setAlertsCount(d.count)), [on]);
  useEffect(() => on('snapshot', d => {
    setSnapshot(d);
    if (d.environment) setEnv(d.environment);
    if (d.active_alerts !== undefined) setAlertsCount(d.active_alerts);
  }), [on]);

  useEffect(() => on('new_alert', d => {
    setNotifications(prev => [{ ...d, id: Date.now() }, ...prev.slice(0, 9)]);
    setAlertsCount(c => c + 1);
  }), [on]);

  useEffect(() => on('alert_resolved', () => {
    setAlertsCount(c => Math.max(0, c - 1));
  }), [on]);

  return (
    <RealtimeCtx.Provider value={{ connected, env, collar, vitals, alertsCount, snapshot, notifications }}>
      {children}
    </RealtimeCtx.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeCtx);
