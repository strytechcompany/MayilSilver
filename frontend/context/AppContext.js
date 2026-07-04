import React, { createContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAppSettings, saveAppSettings } from '../services/api';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [ftRate, setFtRate]           = useState('75.20');
  const [goldRate, setGoldRate]       = useState('9850');
  const [customers, setCustomers]     = useState([]);
  const [transactions, setTransactions] = useState([]);
  const appStateRef = useRef(AppState.currentState);

  // Single DB fetch that updates both rates and refreshes the local cache
  const syncRatesFromDB = async () => {
    try {
      const res = await fetchAppSettings();
      const s = res?.settings;
      if (!s) return;

      if (s.ftRate !== undefined && s.ftRate !== null && String(s.ftRate) !== '') {
        const r = String(s.ftRate);
        setFtRate(r);
        await AsyncStorage.setItem('ftRate', r);
      }

      if (s.goldRate !== undefined && s.goldRate !== null && String(s.goldRate) !== '') {
        const r = String(s.goldRate);
        setGoldRate(r);
        await AsyncStorage.setItem('goldRate', r);
      }
    } catch (e) {
      console.error('syncRatesFromDB failed:', e);
    }
  };

  useEffect(() => {
    // Show cached values instantly while DB fetch is in flight
    const initRates = async () => {
      try {
        const [[, cachedFt], [, cachedGold]] = await AsyncStorage.multiGet(['ftRate', 'goldRate']);
        if (cachedFt)   setFtRate(cachedFt);
        if (cachedGold) setGoldRate(cachedGold);
      } catch {}
      // Always sync from DB so every device gets the authoritative value
      await syncRatesFromDB();
    };
    initRates();

    // Re-sync when app comes back to foreground so all devices stay current
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        syncRatesFromDB();
      }
      appStateRef.current = next;
    });

    return () => sub.remove();
  }, []);

  const updateFtRate = async (newRate) => {
    try {
      setFtRate(newRate);
      await AsyncStorage.setItem('ftRate', newRate);
      await saveAppSettings({ ftRate: Number(newRate) });
    } catch (e) {
      console.error('updateFtRate failed:', e);
    }
  };

  const updateGoldRate = async (newRate) => {
    try {
      setGoldRate(newRate);
      await AsyncStorage.setItem('goldRate', newRate);
      await saveAppSettings({ goldRate: Number(newRate) });
    } catch (e) {
      console.error('updateGoldRate failed:', e);
    }
  };

  // Exposed so any screen can trigger a DB re-sync (e.g. HomeScreen focus, pull-to-refresh)
  const refreshRates = () => syncRatesFromDB();

  return (
    <AppContext.Provider value={{
      ftRate, updateFtRate,
      goldRate, updateGoldRate,
      refreshRates,
      customers, setCustomers,
      transactions, setTransactions,
    }}>
      {children}
    </AppContext.Provider>
  );
};
