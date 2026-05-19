import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchShopProfileFromDb, saveShopProfileToDb } from './api';

const SHOP_PROFILE_KEY = 'shopProfile';

export const DEFAULT_SHOP_PROFILE = {
  shopName:           '',
  gstin:              '',
  phone:              '',
  altPhone:           '',
  address:            '',
  city:               '',
  stateName:          '',
  stateCode:          '',
  email:              '',
  website:            '',
  tagline:            '',
  logoBase64:         '',
  bankName:           '',
  accountNumber:      '',
  ifscCode:           '',
  branch:             '',
  termsAndConditions: '',
  footerNotes:        '',
  financialYear:      '2025-2026',
};

const normalize = (v = {}) => {
  const d = DEFAULT_SHOP_PROFILE;
  return {
    shopName:           v.shopName           ?? d.shopName,
    gstin:              v.gstin              ?? d.gstin,
    phone:              v.phone              ?? d.phone,
    altPhone:           v.altPhone           ?? d.altPhone,
    address:            v.address            ?? d.address,
    city:               v.city               ?? d.city,
    stateName:          v.stateName          ?? d.stateName,
    stateCode:          v.stateCode          ?? d.stateCode,
    email:              v.email              ?? d.email,
    website:            v.website            ?? d.website,
    tagline:            v.tagline            ?? d.tagline,
    logoBase64:         v.logoBase64         ?? d.logoBase64,
    bankName:           v.bankName           ?? d.bankName,
    accountNumber:      v.accountNumber      ?? d.accountNumber,
    ifscCode:           v.ifscCode           ?? d.ifscCode,
    branch:             v.branch             ?? d.branch,
    termsAndConditions: v.termsAndConditions ?? d.termsAndConditions,
    footerNotes:        v.footerNotes        ?? d.footerNotes,
    financialYear:      v.financialYear      ?? d.financialYear,
  };
};

export const loadShopProfile = async () => {
  try {
    const dbProfile = await fetchShopProfileFromDb();
    if (dbProfile) {
      const normalized = normalize(dbProfile);
      await AsyncStorage.setItem(SHOP_PROFILE_KEY, JSON.stringify(normalized)).catch(() => {});
      return normalized;
    }
  } catch {
    // fall through to cache
  }
  try {
    const raw = await AsyncStorage.getItem(SHOP_PROFILE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // fall through to defaults
  }
  return normalize();
};

export const saveShopProfile = async (profile) => {
  const normalized = normalize(profile);
  let dbResult = { success: false };
  try {
    dbResult = await saveShopProfileToDb(normalized);
  } catch (error) {
    console.error('saveShopProfile: DB save failed', error);
  }
  try {
    await AsyncStorage.setItem(SHOP_PROFILE_KEY, JSON.stringify(normalized));
  } catch {
    // non-fatal
  }
  if (dbResult.success) return { success: true, profile: normalized };
  return { success: false, profile: normalized, message: 'Saved locally only. Check server connection.' };
};
