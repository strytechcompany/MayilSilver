import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAppSettings, saveAppSettings } from '../services/api';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [ftRate, setFtRate] = useState('75.20');
  const [goldRate, setGoldRate] = useState('9850');
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    loadFtRate();
    loadGoldRate();
  }, []);

  const loadFtRate = async () => {
    try {
      const savedRate = await AsyncStorage.getItem('ftRate');
      if (savedRate !== null) {
        setFtRate(savedRate);
      }
    } catch (e) {
      console.error('Failed to load FT Rate', e);
    }
  };

  const updateFtRate = async (newRate) => {
    try {
      setFtRate(newRate);
      await AsyncStorage.setItem('ftRate', newRate);
    } catch (e) {
      console.error('Failed to save FT Rate', e);
    }
  };

  const loadGoldRate = async () => {
    try {
      const savedRate = await AsyncStorage.getItem('goldRate');
      if (savedRate !== null) {
        setGoldRate(savedRate);
      }

      const res = await fetchAppSettings();
      const remoteGoldRate = res?.settings?.goldRate;
      if (remoteGoldRate !== undefined && remoteGoldRate !== null && String(remoteGoldRate) !== '') {
        const nextRate = String(remoteGoldRate);
        setGoldRate(nextRate);
        await AsyncStorage.setItem('goldRate', nextRate);
      }
    } catch (e) {
      console.error('Failed to load Gold Rate', e);
    }
  };

  const updateGoldRate = async (newRate) => {
    try {
      setGoldRate(newRate);
      await AsyncStorage.setItem('goldRate', newRate);
      await saveAppSettings({ goldRate: Number(newRate) });
    } catch (e) {
      console.error('Failed to save Gold Rate', e);
    }
  };

  return (
    <AppContext.Provider value={{
      ftRate, updateFtRate,
      goldRate, updateGoldRate,
      customers, setCustomers,
      transactions, setTransactions
    }}>
      {children}
    </AppContext.Provider>
  );
};
