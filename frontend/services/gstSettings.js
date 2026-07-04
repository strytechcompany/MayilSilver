// ─────────────────────────────────────────────────────────────
//  gstSettings.js
//  Loads & saves GST settings (tax defaults + bank details).
//  Primary storage: MongoDB via backend API
//  Fallback / offline cache: AsyncStorage
// ─────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchGstSettingsFromDb, saveGstSettingsToDb } from './api';

const GST_SETTINGS_KEY = 'gstSettings';

export const DEFAULT_GST_SETTINGS = {
  cgstPercent: '1.5',
  sgstPercent: '1.5',
  igstPercent: '3',
  gstPercentage: '3',
  hsnCode: '',
  bankDetails: {
    bankAccountName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    upiId: '',
  },
};

const normalizeSettings = (value = {}) => ({
  cgstPercent: value.cgstPercent ?? DEFAULT_GST_SETTINGS.cgstPercent,
  sgstPercent: value.sgstPercent ?? DEFAULT_GST_SETTINGS.sgstPercent,
  igstPercent: value.igstPercent ?? DEFAULT_GST_SETTINGS.igstPercent,
  gstPercentage: value.gstPercentage ?? DEFAULT_GST_SETTINGS.gstPercentage,
  hsnCode: value.hsnCode ?? DEFAULT_GST_SETTINGS.hsnCode,
  bankDetails: {
    bankAccountName: value.bankDetails?.bankAccountName ?? DEFAULT_GST_SETTINGS.bankDetails.bankAccountName,
    accountNumber: value.bankDetails?.accountNumber ?? DEFAULT_GST_SETTINGS.bankDetails.accountNumber,
    ifscCode: value.bankDetails?.ifscCode ?? DEFAULT_GST_SETTINGS.bankDetails.ifscCode,
    branch: value.bankDetails?.branch ?? DEFAULT_GST_SETTINGS.bankDetails.branch,
    upiId: value.bankDetails?.upiId ?? DEFAULT_GST_SETTINGS.bankDetails.upiId,
  },
});

// ── Load GST Settings ──────────────────────────────────────────
// Tries database first, caches to AsyncStorage, falls back to
// AsyncStorage if the server is unreachable.
export const loadGstSettings = async () => {
  try {
    // 1. Try the database
    const dbSettings = await fetchGstSettingsFromDb();
    if (dbSettings) {
      const normalized = normalizeSettings(dbSettings);
      // Cache locally for offline use
      await AsyncStorage.setItem(GST_SETTINGS_KEY, JSON.stringify(normalized)).catch(() => {});
      return normalized;
    }
  } catch (error) {
    console.warn('loadGstSettings: DB fetch failed, falling back to AsyncStorage', error);
  }

  // 2. Fallback: local AsyncStorage cache
  try {
    const raw = await AsyncStorage.getItem(GST_SETTINGS_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    console.error('loadGstSettings: AsyncStorage read failed', error);
  }

  // 3. Absolute fallback: defaults
  return normalizeSettings();
};

// ── Save GST Settings ──────────────────────────────────────────
// Writes to the database and updates the local AsyncStorage cache
// simultaneously. Returns success/failure.
export const saveGstSettings = async (settings) => {
  const normalized = normalizeSettings(settings);

  // Save to database (primary)
  let dbResult = { success: false };
  try {
    dbResult = await saveGstSettingsToDb(normalized);
  } catch (error) {
    console.error('saveGstSettings: DB save failed', error);
  }

  // Also update the local cache regardless (so offline reads stay fresh)
  try {
    await AsyncStorage.setItem(GST_SETTINGS_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.warn('saveGstSettings: AsyncStorage write failed', error);
  }

  if (dbResult.success) {
    return { success: true, settings: normalized };
  }

  // Even if DB failed, local save succeeded — report partial success
  return { success: false, settings: normalized, message: 'Saved locally only. Check server connection.' };
};
