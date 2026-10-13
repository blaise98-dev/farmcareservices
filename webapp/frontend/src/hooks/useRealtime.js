import { createContext, useContext } from 'react';

export const RealtimeCtx = createContext(null);

export const useRealtime = () => useContext(RealtimeCtx);
