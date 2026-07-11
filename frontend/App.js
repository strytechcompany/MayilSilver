import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import { AppProvider } from './context/AppContext';
import { getLogoDataUri } from './utils/shopBranding';

export default function App() {
  // Warm the Company Logo cache as early as possible so it's already
  // resolved (or has logged exactly why it failed) well before any bill
  // screen tries to generate a PDF — most useful in production APK builds
  // where the first asset resolution can be slower than in dev.
  useEffect(() => {
    getLogoDataUri();
  }, []);

  return (
    <AppProvider>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <AppNavigator />
      </SafeAreaProvider>
    </AppProvider>
  );
}
