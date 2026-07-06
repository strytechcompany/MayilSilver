// ─────────────────────────────────────────────────────────────
//  Mayil Silver — API Service Layer
//  All communication with MongoDB backend goes through here.
// ─────────────────────────────────────────────────────────────

import { base_url } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOMER_API_PATH = '/customers';
const unavailableRouteWarnings = new Set();

const apiFetch = (url, options) => {
  console.log('API Request:', url);
  return fetch(url, options);
};

// ── Helpers ──────────────────────────────────────────────────

const handleResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = (await res.text()).trim();
    throw new Error(`HTTP ${res.status} — server returned non-JSON: ${text.slice(0, 120)}`);
  }
  return parseJsonResponse(res);
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = (await res.text()).trim();
    throw new Error(`HTTP ${res.status} - server returned non-JSON${text ? `: ${text.slice(0, 120)}` : ''}`);
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || `HTTP ${res.status}`);
  }

  return data;
};

const postJSON = async (url, body) => {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return parseJsonResponse(res);
};

const putJSON = async (url, body) => {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return parseJsonResponse(res);
};

const getJSON = async (url) => {
  const res = await apiFetch(url);
  return parseJsonResponse(res);
};

const getSessionHeaders = async () => {
  try {
    const entries = await AsyncStorage.multiGet(['userId', 'userRole', 'userEmail']);
    const userId = entries[0][1] || '';
    const role = entries[1][1] || 'user';
    const email = entries[2][1] || '';
    return {
      'Content-Type': 'application/json',
      'x-user-id': userId,
      'x-user-role': role,
      'x-user-email': email,
    };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
};

const isRoute404 = (error) =>
  String(error?.message || '').includes('HTTP 404');

const getSessionIdentity = async () => {
  try {
    const entries = await AsyncStorage.multiGet(['userId', 'userRole', 'userEmail', 'userName']);
    return {
      userId: entries[0][1] || '',
      role: entries[1][1] || 'user',
      email: entries[2][1] || '',
      userName: entries[3][1] || '',
    };
  } catch {
    return { userId: '', role: 'user', email: '', userName: '' };
  }
};

const safeJsonRequest = async (url, options = {}) => {
  try {
    const res = await apiFetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      return {
        ok: false,
        status: res.status,
        nonJson: true,
        text,
      };
    }
    const data = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error,
    };
  }
};

const buildRouteUnavailableMessage = (route) =>
  `Backend route ${route} is unavailable at ${base_url}. Start or restart the Mayil backend.`;

const requestJsonWithSession = async (path, options = {}) => {
  const headers = options.headers || await getSessionHeaders();
  return safeJsonRequest(`${base_url}${path}`, {
    ...options,
    headers,
  });
};

const handleRouteFailure = (label, route, result, fallback) => {
  if (result?.error) {
    console.error(`${label} Error:`, result.error);
  } else if ((result?.status === 404 || result?.nonJson) && !unavailableRouteWarnings.has(route)) {
    unavailableRouteWarnings.add(route);
    console.warn(buildRouteUnavailableMessage(route));
  }
  if (result?.status === 404 || result?.nonJson) {
    return {
      ...fallback,
      message: buildRouteUnavailableMessage(route),
    };
  }
  return fallback;
};

// ── AUTH ─────────────────────────────────────────────────────

export const loginUser = async (email, password) => {
  const payload = { email, password };
  console.log('[LOGIN] request', { url: `${base_url}/login`, email });

  try {
    const response = await postJSON(`${base_url}/login`, payload);
    console.log('[LOGIN] response', response);
    return response;
  } catch (error) {
    console.error('[LOGIN] first attempt error', error);

    const message = String(error?.message || '');
    const shouldRetry =
      message.includes('HTTP 503') ||
      message.includes('HTTP 502') ||
      message.includes('Network request failed') ||
      message.includes('connection failed');

    if (shouldRetry) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        console.log('[LOGIN] retry request', { url: `${base_url}/login`, email });
        const retryResponse = await postJSON(`${base_url}/login`, payload);
        console.log('[LOGIN] retry response', retryResponse);
        return retryResponse;
      } catch (retryError) {
        console.error('[LOGIN] retry error', retryError);
        const retryMessage = String(retryError?.message || '');
        if (retryMessage.includes('HTTP 503')) {
          return { success: false, message: 'Server waking up... Please try again in a few seconds.' };
        }
        return { success: false, message: 'Server connection failed' };
      }
    }

    if (message.includes('HTTP 503')) {
      return { success: false, message: 'Server waking up... Please try again in a few seconds.' };
    }

    return { success: false, message: 'Server connection failed' };
  }
};

// ── USER MANAGEMENT ──────────────────────────────────────────

export const fetchUsers = async () => {
  try {
    return await getJSON(`${base_url}/users`);
  } catch (error) {
    console.error('fetchUsers Error:', error);
    return { success: false, users: [] };
  }
};

export const createUser = async (data) => {
  try {
    return await postJSON(`${base_url}/users`, data);
  } catch (error) {
    console.error('createUser Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const updateUser = async (id, data) => {
  try {
    return await putJSON(`${base_url}/users/${id}`, data);
  } catch (error) {
    console.error('updateUser Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const deleteUser = async (id) => {
  try {
    const res = await apiFetch(`${base_url}/users/${id}`, { method: 'DELETE' });
    return handleResponse(res);
  } catch (error) {
    console.error('deleteUser Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const fetchProfile = async () => {
  const result = await requestJsonWithSession('/profile');
  if (result.ok && result.data) return result.data;

  if (result.status === 404 || result.nonJson) {
    try {
      const identity = await getSessionIdentity();
      const usersRes = await getJSON(`${base_url}/users`);
      const matchedUser = (usersRes.users || []).find((user) =>
        (identity.userId && user._id === identity.userId) ||
        (identity.email && user.email === identity.email)
      );

      if (matchedUser) {
        return {
          success: true,
          profile: {
            _id: matchedUser._id,
            userName: matchedUser.userName || identity.userName || '',
            email: matchedUser.email || identity.email || '',
            role: identity.role || 'user',
            gstBillEnabled: matchedUser.gstBillEnabled,
          },
        };
      }

      if (identity.role === 'admin' && identity.email) {
        return {
          success: true,
          profile: {
            _id: identity.userId || '',
            userName: identity.userName || 'Admin',
            email: identity.email,
            role: 'admin',
            gstBillEnabled: true,
          },
        };
      }
    } catch (fallbackError) {
      console.error('fetchProfile Fallback Error:', fallbackError);
    }
  }
  return handleRouteFailure('fetchProfile', '/profile', result, {
    success: false,
    profile: null,
    message: 'Network error',
  });
};

export const updateProfile = async (payload) => {
  const result = await requestJsonWithSession('/profile/update', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (result.ok && result.data) return result.data;

  if (result.status === 404 || result.nonJson) {
    try {
      const identity = await getSessionIdentity();
      if (identity.userId) {
        return await updateUser(identity.userId, payload);
      }
    } catch (fallbackError) {
      console.error('updateProfile Fallback Error:', fallbackError);
    }
  }
  return handleRouteFailure('updateProfile', '/profile/update', result, {
    success: false,
    message: 'Network error',
  });
};

export const changePassword = async (payload) => {
  const result = await requestJsonWithSession('/profile/change-password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('changePassword', '/profile/change-password', result, {
    success: false,
    message: 'Network error',
  });
};

// ── CUSTOMERS ────────────────────────────────────────────────

// Fetch all customers (sorted newest first)
export const fetchAllCustomers = async () => {
  const endpoint = `${base_url}${CUSTOMER_API_PATH}`;
  console.log('[fetchAllCustomers] request', endpoint);
  try {
    const data = await getJSON(endpoint);
    console.log('[fetchAllCustomers] success', Array.isArray(data?.customers) ? data.customers.length : 0);
    return data.customers || [];
  } catch (error) {
    console.error('fetchAllCustomers Error:', error);
    console.warn('[fetchAllCustomers] fallback to empty array', { endpoint, message: error?.message || 'Unknown error' });
    return [];
  }
};

// Fetch single customer by MongoDB _id
export const fetchCustomerById = async (id) => {
  try {
    const data = await getJSON(`${base_url}${CUSTOMER_API_PATH}/${id}`);
    return data.customer || null;
  } catch (error) {
    console.error('fetchCustomerById Error:', error);
    return null;
  }
};

// Create a new customer
// Accepts: { customerName, phone, address, gstin, ob, ab }
export const createCustomer = async (customerData) => {
  try {
    return await postJSON(`${base_url}${CUSTOMER_API_PATH}/create`, customerData);
  } catch (error) {
    console.error('createCustomer Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// Update customer balance manually (e.g. edit screen)
export const updateCustomer = async (id, updateData) => {
  try {
    return await putJSON(`${base_url}${CUSTOMER_API_PATH}/${id}`, updateData);
  } catch (error) {
    console.error('updateCustomer Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const searchCustomers = async (search = '') => {
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await getJSON(`${base_url}${CUSTOMER_API_PATH}${query}`);
    return data.customers || [];
  } catch (error) {
    console.error('searchCustomers Error:', error);
    return [];
  }
};

// ── TRANSACTIONS / BILLS ─────────────────────────────────────

/**
 * Save a full B2B transaction.
 * Backend will:
 *  - Auto-generate billNo
 *  - Calculate finalBalance = prevBalance + issueTotal - receiptTotal - cashTotal
 *  - Update customer's ob/ab in DB
 *
 * Payload:
 * {
 *   customerId,
 *   issueItems: [{ itemName, grossWeight, netWeight, touch, purity, amount }],
 *   receiptItems: [{ itemName, weight, result, touch, purity }],
 *   cashEntries: [{ cashAmount, cashType, notes }],
 *   previousBalance,   // signed due/advance balance
 *   transactionType    // 'B2B'
 * }
 */
export const saveTransaction = async (payload) => {
  try {
    return await postJSON(`${base_url}/transactions/save`, payload);
  } catch (error) {
    console.error('saveTransaction Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// Fetch recent transactions (all customers, newest first)
export const fetchRecentTransactions = async (limit = 20) => {
  try {
    const data = await getJSON(`${base_url}/transactions/recent?limit=${limit}`);
    return data.transactions || [];
  } catch (error) {
    if (!isRoute404(error)) {
      console.error('fetchRecentTransactions Error:', error);
    }
    return [];
  }
};

export const savePaymentRecord = async (payload) => {
  try {
    return await postJSON(`${base_url}/payments/save`, payload);
  } catch (error) {
    console.error('savePaymentRecord Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const fetchPaymentHistoryFromDb = async () => {
  try {
    const data = await getJSON(`${base_url}/payments`);
    return data.payments || [];
  } catch (error) {
    console.error('fetchPaymentHistoryFromDb Error:', error);
    return [];
  }
};

export const fetchPaymentItemSuggestions = async (search = '') => {
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await getJSON(`${base_url}/payments/item-suggestions${query}`);
    return data.items || [];
  } catch (error) {
    if (!isRoute404(error)) {
      console.error('fetchPaymentItemSuggestions Error:', error);
      return [];
    }

    try {
      const data = await getJSON(`${base_url}/payments`);
      const payments = data.payments || [];
      const normalizedSearch = String(search || '').trim().toLowerCase();
      const seen = new Set();
      const suggestions = [];

      payments.forEach((payment) => {
        const names = [
          payment.itemName,
          ...((payment.items || []).map((item) => item?.itemName)),
        ];

        names.forEach((name) => {
          const trimmed = String(name || '').trim();
          const normalized = trimmed.toLowerCase();
          if (!trimmed) return;
          if (normalizedSearch && !normalized.startsWith(normalizedSearch)) return;
          if (seen.has(normalized)) return;
          seen.add(normalized);
          suggestions.push(trimmed);
        });
      });

      return suggestions.slice(0, 20);
    } catch (fallbackError) {
      if (!isRoute404(fallbackError)) {
        console.error('fetchPaymentItemSuggestions Fallback Error:', fallbackError);
      }
      return [];
    }
  }
};

export const deletePaymentRecord = async (id) => {
  try {
    const res = await apiFetch(`${base_url}/payments/${id}`, { method: 'DELETE' });
    return handleResponse(res);
  } catch (error) {
    console.error('deletePaymentRecord Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// ── BILL HISTORY ─────────────────────────────────────────────

// Fetch all bills for a specific customer
export const fetchAllBills = async () => {
  try {
    const data = await getJSON(`${base_url}/bills`);
    return data.bills || [];
  } catch (error) {
    console.error('fetchAllBills Error:', error);
    throw error;
  }
};

export const fetchBillHistory = async (customerId) => {
  try {
    const data = await getJSON(`${base_url}/bills/history/${customerId}`);
    return data.bills || [];
  } catch (error) {
    console.error('fetchBillHistory Error:', error);
    return [];
  }
};

export const deleteBillFromDb = async (billNo) => {
  try {
    const res = await apiFetch(`${base_url}/bills/${billNo}`, { method: 'DELETE' });
    return handleResponse(res);
  } catch (error) {
    console.error('deleteBillFromDb Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// Fetch a single bill by bill number
export const fetchBillByNo = async (billNo) => {
  try {
    const data = await getJSON(`${base_url}/bills/${billNo}`);
    return data.bill || null;
  } catch (error) {
    console.error('fetchBillByNo Error:', error);
    return null;
  }
};

// ── MINI STATEMENT ───────────────────────────────────────────

// Fetch running balance mini statement for a customer
export const fetchMiniStatement = async (customerId) => {
  try {
    const data = await getJSON(`${base_url}/mini-statement/${customerId}`);
    return data;
  } catch (error) {
    console.error('fetchMiniStatement Error:', error);
    return { success: false, customer: null, statement: [] };
  }
};

// GST customer transactions
export const fetchGstCustomers = async (search = '') => {
  try {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await getJSON(`${base_url}/gst-customers${query}`);
    return data.transactions || [];
  } catch (error) {
    console.error('fetchGstCustomers Error:', error);
    return [];
  }
};

export const fetchGstCustomerById = async (id) => {
  try {
    const data = await getJSON(`${base_url}/gst-customers/${id}`);
    return data.transaction || null;
  } catch (error) {
    console.error('fetchGstCustomerById Error:', error);
    return null;
  }
};

export const createGstCustomer = async (payload) => {
  try {
    return await postJSON(`${base_url}/gst-customers`, payload);
  } catch (error) {
    console.error('createGstCustomer Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const updateGstCustomer = async (id, payload) => {
  try {
    return await putJSON(`${base_url}/gst-customers/${id}`, payload);
  } catch (error) {
    console.error('updateGstCustomer Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const deleteGstCustomer = async (id) => {
  try {
    const res = await apiFetch(`${base_url}/gst-customers/${id}`, { method: 'DELETE' });
    return handleResponse(res);
  } catch (error) {
    console.error('deleteGstCustomer Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// ── SHOP PROFILE ─────────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchShopProfileFromDb = async () => {
  // MongoDB Atlas can drop its connection briefly; retry once after a short
  // delay instead of immediately falling back to a possibly-stale local cache.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await getJSON(`${base_url}/shop-profile`);
      console.log('[Signature] fetchShopProfileFromDb response (attempt', attempt, '):', {
        signatureBase64: data?.profile?.signatureBase64 ? '(set)' : '(empty)',
        signatureUrl: data?.profile?.signatureUrl || '(empty)',
      });
      return data.profile || null;
    } catch (error) {
      console.error(`fetchShopProfileFromDb Error (attempt ${attempt}):`, error?.message || error);
      if (attempt < 2) await delay(1500);
    }
  }
  return null;
};

export const saveShopProfileToDb = async (profile) => {
  console.log('[Signature] saveShopProfileToDb request:', {
    signatureBase64: profile?.signatureBase64 ? '(set)' : '(empty)',
    signatureUrl: profile?.signatureUrl || '(empty)',
  });
  try {
    const result = await putJSON(`${base_url}/shop-profile`, profile);
    console.log('[Signature] saveShopProfileToDb response:', {
      success: result?.success,
      signatureBase64: result?.profile?.signatureBase64 ? '(set)' : '(empty)',
      signatureUrl: result?.profile?.signatureUrl || '(empty)',
    });
    return result;
  } catch (error) {
    console.error('saveShopProfileToDb Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const uploadShopLogo = async (base64Data, mimeType) => {
  try {
    return await postJSON(`${base_url}/shop-profile/logo`, { base64Data, mimeType });
  } catch (error) {
    console.error('uploadShopLogo Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const uploadShopSignature = async (base64Data, mimeType) => {
  console.log('[Signature] uploadShopSignature request: mimeType=', mimeType, 'base64 length=', base64Data?.length);
  try {
    const result = await postJSON(`${base_url}/shop-profile/signature`, { base64Data, mimeType });
    console.log('[Signature] uploadShopSignature response:', result);
    return result;
  } catch (error) {
    console.error('uploadShopSignature Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const uploadInvoicePdf = async (transactionId, pdfBase64, filename) => {
  try {
    return await postJSON(`${base_url}/gst-invoice/${transactionId}/pdf`, { pdfBase64, filename });
  } catch (error) {
    console.error('uploadInvoicePdf Error:', error);
    return { success: false };
  }
};

// ── GST SETTINGS ─────────────────────────────────────────────

// Fetch the singleton GST settings document from the database
export const fetchGstSettingsFromDb = async () => {
  try {
    const data = await getJSON(`${base_url}/gst-settings`);
    return data.settings || null;
  } catch (error) {
    console.error('fetchGstSettingsFromDb Error:', error);
    return null;
  }
};

// Save GST settings (tax defaults + bank details) to the database
export const saveGstSettingsToDb = async (settings) => {
  try {
    return await putJSON(`${base_url}/gst-settings`, settings);
  } catch (error) {
    console.error('saveGstSettingsToDb Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// ── DATA MANAGEMENT ───────────────────────────────────────────

export const clearAllData = async () => {
  try {
    const res = await apiFetch(`${base_url}/clear-all-data`, { method: 'DELETE' });
    return handleResponse(res);
  } catch (error) {
    console.error('clearAllData Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// ── REPORTS ───────────────────────────────────────────────────

export const fetchReport = async (fromDate, toDate) => {
  try {
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    return await getJSON(`${base_url}/reports?${params}`);
  } catch (error) {
    console.error('fetchReport Error:', error);
    return { success: false, bills: [], gstBills: [], summary: {} };
  }
};

export const fetchDailyReport = async (date) => {
  try {
    const params = new URLSearchParams({ date });
    return await getJSON(`${base_url}/reports?${params}`);
  } catch (error) {
    console.error('fetchDailyReport Error:', error);
    return { success: false, bills: [], gstBills: [], summary: {} };
  }
};

export const fetchDailyExpenses = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);
  if (filters.month) params.append('month', filters.month);
  const query = params.toString();
  const result = await requestJsonWithSession(`/daily-expenses${query ? `?${query}` : ''}`);
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('fetchDailyExpenses', '/daily-expenses', result, {
    success: false,
    expenses: [],
    message: 'Network error',
  });
};

export const createDailyExpense = async (payload) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/daily-expenses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  } catch (error) {
    console.error('createDailyExpense Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const updateDailyExpense = async (id, payload) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/daily-expenses/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  } catch (error) {
    console.error('updateDailyExpense Error:', error);
    return { success: false, message: 'Network error' };
  }
};

export const deleteDailyExpense = async (id) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/daily-expenses/${id}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse(res);
  } catch (error) {
    console.error('deleteDailyExpense Error:', error);
    return { success: false, message: 'Network error' };
  }
};

// ── APP SETTINGS ─────────────────────────────────────────────

export const fetchAppSettings = async () => {
  const result = await requestJsonWithSession('/app-settings');
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('fetchAppSettings', '/app-settings', result, {
    success: false,
    settings: null,
    message: 'Network error',
  });
};

export const saveAppSettings = async (settings) => {
  const result = await requestJsonWithSession('/app-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('saveAppSettings', '/app-settings', result, {
    success: false,
    message: 'Network error',
  });
};

// ── KADAI DOCUMENTS ───────────────────────────────────────────

export const fetchDocuments = async () => {
  const result = await requestJsonWithSession('/documents');
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('fetchDocuments', '/documents', result, {
    success: false,
    documents: [],
    message: 'Network error',
  });
};

export const createDocument = async (doc) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/documents`, {
      method: 'POST',
      headers,
      body: JSON.stringify(doc),
    });
    return handleResponse(res);
  } catch (error) {
    console.error('createDocument Error:', error);
    return { success: false };
  }
};

export const fetchDocumentById = async (id) => {
  const result = await requestJsonWithSession(`/documents/${id}`);
  if (result.ok && result.data) return result.data;
  return handleRouteFailure('fetchDocumentById', '/documents/:id', result, {
    success: false,
    document: null,
    message: 'Network error',
  });
};

export const updateDocument = async (id, data) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/documents/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  } catch (error) {
    console.error('updateDocument Error:', error);
    return { success: false };
  }
};

export const deleteDocument = async (id) => {
  try {
    const headers = await getSessionHeaders();
    const res = await apiFetch(`${base_url}/documents/${id}`, { method: 'DELETE', headers });
    return handleResponse(res);
  } catch (error) {
    console.error('deleteDocument Error:', error);
    return { success: false };
  }
};
