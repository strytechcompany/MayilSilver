import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import Header from '../components/Header';
import { fetchPaymentHistoryFromDb, deletePaymentRecord, updatePaymentRecord } from '../services/api';
import { loadGstSettings } from '../services/gstSettings';
import { loadShopProfile } from '../services/shopProfile';
import { buildPaymentBillHtml, buildSummary, getLogoDataUri } from '../utils/paymentUtils';
import { base_url } from '../config';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

// ── Logo helper ───────────────────────────────────────────────
const BACKEND_URL = base_url.replace(/\/api\/?$/, '');

const loadSignatureSrc = async (profile) => {
  const b64 = profile?.signatureBase64;
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = profile?.signatureUrl;
  if (url) {
    try {
      const fullUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
      const cacheFile = `${FileSystem.cacheDirectory}history_sig_pdf.png`;
      const { uri: dl } = await FileSystem.downloadAsync(fullUrl, cacheFile);
      const base64 = await FileSystem.readAsStringAsync(dl, { encoding: 'base64' });
      if (base64) return `data:image/png;base64,${base64}`;
    } catch {}
  }
  return '';
};

// ── Combined HTML builder ─────────────────────────────────────
const buildRecordHtml = (record, gstSettings, logoSrc, shopHtmlProfile) => {
  const summary = buildSummary(record.cash, record.weight, gstSettings);
  summary.rows[0].particular = record.itemName || 'SILVER ARTICLES';
  const silverRate = parseFloat(record.ftRate) || 0;
  if (silverRate > 0) summary.rows[0].rateNumeric = silverRate;
  const tx = {
    customerName: record.customerName,
    phone: record.phone,
    address: record.address,
    gstNo: record.gstNo,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: record.invoiceDate || record.updatedAt || record.createdAt,
  };
  return buildPaymentBillHtml(tx, summary, gstSettings, logoSrc, shopHtmlProfile);
};

const MOBILE_PREVIEW_CSS = `<style>
  @page { size: auto !important; margin: 2mm !important; }
  html, body { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
  .banner-logo { width: 55px !important; height: auto !important; }
  .banner-name { font-size: 18px !important; letter-spacing: 0.5px !important; }
  .banner-top { font-size: 10px !important; }
  .addr-strip { font-size: 11px !important; padding: 5px 8px !important; }
  .details-grid { display: flex !important; flex-direction: column !important; }
  .detail-box.left { border-right: none !important; border-bottom: 1px solid #C8D4DC !important; }
  .d-lbl { min-width: 85px !important; }
  .footer-grid { display: flex !important; flex-direction: column !important; }
  .footer-box.left { border-right: none !important; border-bottom: 1px solid #C8D4DC !important; }
  .b-lbl { min-width: 85px !important; }
  .bottom-bar { display: flex !important; flex-direction: column !important; gap: 2px !important; }
  .bb-cell.mid { border-left: none !important; border-right: none !important; justify-content: flex-start !important; padding: 0 !important; }
  .bb-cell.right { justify-content: flex-start !important; }
  .tax-summary { justify-content: flex-start !important; }
  .tax-tbl { width: 100% !important; border-left: none !important; }
  .tax-tbl td { padding: 6px 10px !important; font-size: 12px !important; }
  table.items th, table.items td { padding: 5px 3px !important; font-size: 10.5px !important; }
  .gt-label { font-size: 14px !important; }
  .gt-value { font-size: 16px !important; }
  .words-body { font-size: 13px !important; }
</style>`;

const buildCombinedHtml = (records, gstSettings, logoSrc, shopHtmlProfile, forPreview = false) => {
  if (!records.length) return '<html><body><p>No bills selected.</p></body></html>';
  const headInject = forPreview
    ? `<meta name="viewport" content="width=device-width, initial-scale=1.0">${MOBILE_PREVIEW_CSS}`
    : '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  if (records.length === 1) {
    const html = buildRecordHtml(records[0], gstSettings, logoSrc, shopHtmlProfile);
    return html.replace('<head>', `<head>${headInject}`);
  }

  const htmlParts = records.map((r) => buildRecordHtml(r, gstSettings, logoSrc, shopHtmlProfile));
  const bodies = htmlParts.map((html) => {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
    return m ? m[1].trim() : html;
  });

  const headSection = htmlParts[0]
    .replace('<head>', `<head>${headInject}`)
    .replace(/<body[\s\S]*$/i, '');

  const separator = forPreview
    ? '<div style="border-top:3px solid #CBD5E1;margin:32px 0;"></div>'
    : '<div style="page-break-after:always;height:0;"></div>';

  const combinedBody = bodies.map((body, i) =>
    i < bodies.length - 1 ? `${body}${separator}` : body
  ).join('');

  return `${headSection}<body>${combinedBody}</body></html>`;
};

// ── Date / filter helpers ─────────────────────────────────────
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const weekStart = () => {
  const now = new Date();
  const start = startOfDay(now);
  start.setDate(start.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  return start;
};
const monthStart = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); };
const recordDate = (r) => r.updatedAt || r.createdAt || r.invoiceDate;
const recordKey = (r) => r._id || r.invoiceNumber;

const fmtDateDisplay = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDateFull = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const fmtCurrency = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatInputDate = (date) => dateKey(date);
const parseInputDate = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatFilterDateDisplay = (value) => {
  const p = parseInputDate(value);
  if (!p) return '';
  return `${String(p.getDate()).padStart(2, '0')}-${String(p.getMonth() + 1).padStart(2, '0')}-${p.getFullYear()}`;
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const FILTERS = [
  { key: 'all',   label: 'All',        icon: 'format-list-bulleted' },
  { key: 'week',  label: 'This Week',  icon: 'calendar-week' },
  { key: 'month', label: 'This Month', icon: 'calendar-month' },
  { key: 'date',  label: 'By Date',    icon: 'calendar-today' },
];

// ── Component ─────────────────────────────────────────────────
const PaymentHistoryPage = ({ navigation }) => {
  const [history, setHistory]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate]     = useState('');
  const [pickerField, setPickerField]   = useState(null);
  const [pickerMonth, setPickerMonth]   = useState(startOfDay(new Date()));

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Preview modal
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml]       = useState('');
  const [previewCount, setPreviewCount]     = useState(1);

  // Action busy
  const [actionBusy, setActionBusy] = useState('');

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord]       = useState(null);
  const [editForm, setEditForm]                 = useState({});
  const [editSaving, setEditSaving]             = useState(false);
  const [editDatePickerVisible, setEditDatePickerVisible] = useState(false);
  const [editPickerMonth, setEditPickerMonth]   = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });

  // Cached settings (loaded once)
  const cachedProfile      = useRef(null);
  const cachedGstSettings  = useRef(null);
  const cachedLogoSrc      = useRef('');
  const cachedSignatureSrc = useRef('');

  // ── Data loading ──────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await fetchPaymentHistoryFromDb());
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = navigation.addListener('focus', refresh);
    return unsub;
  }, [navigation, refresh]);

  // Preload profile + gstSettings once
  useEffect(() => {
    Promise.all([loadShopProfile(), loadGstSettings()]).then(async ([profile, settings]) => {
      cachedProfile.current      = profile;
      cachedGstSettings.current  = settings;
      cachedLogoSrc.current      = await getLogoDataUri(profile);
      cachedSignatureSrc.current = await loadSignatureSrc(profile);
    });
  }, []);

  // ── Settings accessor (loads once, caches) ────────────────
  const getSettings = useCallback(async () => {
    if (cachedProfile.current && cachedGstSettings.current) {
      return {
        profile:      cachedProfile.current,
        gstSettings:  cachedGstSettings.current,
        logoSrc:      cachedLogoSrc.current,
        signatureSrc: cachedSignatureSrc.current,
      };
    }
    const [profile, gstSettings] = await Promise.all([loadShopProfile(), loadGstSettings()]);
    const [logoSrc, signatureSrc] = await Promise.all([getLogoDataUri(profile), loadSignatureSrc(profile)]);
    cachedProfile.current      = profile;
    cachedGstSettings.current  = gstSettings;
    cachedLogoSrc.current      = logoSrc;
    cachedSignatureSrc.current = signatureSrc;
    return { profile, gstSettings, logoSrc, signatureSrc };
  }, []);

  const getShopHtmlProfile = (profile, signatureSrc = '') => ({
    name:               profile?.shopName           || '',
    tagline:            profile?.tagline            || '',
    gst:                profile?.gstin              || '',
    phone:              profile?.phone              || '',
    altPhone:           profile?.altPhone           || '',
    address:            profile?.address            || '',
    city:               profile?.city               || '',
    email:              profile?.email              || '',
    stateName:          profile?.stateName          || '',
    stateCode:          profile?.stateCode          || '',
    financialYear:      profile?.financialYear      || '2025-2026',
    termsAndConditions: profile?.termsAndConditions || '',
    signatureSrc,
  });

  // ── Filtering / derived state ─────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const parsedFrom = parseInputDate(appliedFromDate);
    const parsedTo   = parseInputDate(appliedToDate);
    return history
      .filter((r) => {
        const d = new Date(recordDate(r));
        if (filter === 'week'  && d < weekStart())  return false;
        if (filter === 'month' && d < monthStart()) return false;
        if (parsedFrom && d < startOfDay(parsedFrom)) return false;
        if (parsedTo   && d > endOfDay(parsedTo))   return false;
        if (!q) return true;
        return [r.customerName, r.phone, r.invoiceNumber]
          .some((f) => String(f || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const na = parseInt(a.invoiceNumber, 10) || 0;
        const nb = parseInt(b.invoiceNumber, 10) || 0;
        if (nb !== na) return nb - na;
        return new Date(recordDate(b)) - new Date(recordDate(a));
      });
  }, [history, filter, appliedFromDate, appliedToDate, searchQuery]);

  const stats = useMemo(() => ({
    count: filtered.length,
    total: filtered.reduce((s, r) => s + Number(r.total || 0), 0),
  }), [filtered]);

  const dateSections = useMemo(() => {
    if (filter !== 'date') return [];
    const map = {};
    filtered.forEach((r) => {
      const k = dateKey(recordDate(r));
      if (!map[k]) map[k] = { key: k, isoDate: recordDate(r), items: [], dayTotal: 0, dayCount: 0 };
      map[k].items.push(r);
      map[k].dayTotal += Number(r.total || 0);
      map[k].dayCount += 1;
    });
    const flat = [];
    Object.values(map).sort((a, b) => b.key.localeCompare(a.key)).forEach((g) => {
      flat.push({ type: 'header', id: `hdr-${g.key}`, ...g });
      g.items.forEach((item) => flat.push({ type: 'item', id: recordKey(item), ...item }));
    });
    return flat;
  }, [filtered, filter]);

  const activeDayCount = useMemo(() =>
    Object.keys(filtered.reduce((m, r) => { m[dateKey(recordDate(r))] = true; return m; }, {})).length,
  [filtered]);

  const hasActiveFilters  = !!(searchQuery.trim() || appliedFromDate || appliedToDate);
  const hasPendingChanges = fromDate !== appliedFromDate || toDate !== appliedToDate;

  const editPickerDays = useMemo(() => {
    const y = editPickerMonth.getFullYear(), mo = editPickerMonth.getMonth();
    const firstDay = new Date(y, mo, 1).getDay();
    const daysInMo = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ key: `ep-e-${i}`, empty: true });
    for (let d = 1; d <= daysInMo; d++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ key: iso, empty: false, label: d, iso });
    }
    return cells;
  }, [editPickerMonth]);

  const editPickerMonthLabel = `${MONTH_NAMES[editPickerMonth.getMonth()]} ${editPickerMonth.getFullYear()}`;

  // ── Date picker ───────────────────────────────────────────
  const openDatePicker = (field) => {
    const parsed = parseInputDate(field === 'from' ? fromDate : toDate) || new Date();
    setPickerField(field);
    setPickerMonth(startOfDay(parsed));
  };
  const closeDatePicker = () => setPickerField(null);
  const handlePickDate = (date) => {
    const fmt = formatInputDate(date);
    if (pickerField === 'from') {
      setFromDate(fmt);
      const pt = parseInputDate(toDate);
      if (pt && pt < startOfDay(date)) setToDate(fmt);
    } else {
      setToDate(fmt);
      const pf = parseInputDate(fromDate);
      if (pf && pf > startOfDay(date)) setFromDate(fmt);
    }
    closeDatePicker();
  };

  const pickerTitle      = pickerField === 'from' ? 'Select From Date' : 'Select To Date';
  const pickerMonthLabel = `${MONTH_NAMES[pickerMonth.getMonth()]} ${pickerMonth.getFullYear()}`;
  const pickerDays = useMemo(() => {
    const y = pickerMonth.getFullYear(), mo = pickerMonth.getMonth();
    const firstDay = new Date(y, mo, 1).getDay();
    const daysInMo = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ key: `e-${i}`, empty: true });
    for (let d = 1; d <= daysInMo; d++) {
      const date = new Date(y, mo, d);
      cells.push({ key: formatInputDate(date), empty: false, label: d, date });
    }
    return cells;
  }, [pickerMonth]);

  // ── Selection helpers ─────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll  = useCallback(() => {
    setSelectedIds(new Set(filtered.map(recordKey)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const getSelectedRecords = useCallback(() =>
    filtered.filter((r) => selectedIds.has(recordKey(r))),
  [filtered, selectedIds]);

  // ── Action handlers ───────────────────────────────────────
  const handleView = useCallback(async (records, busyKey = 'view') => {
    if (!records.length) return;
    setActionBusy(busyKey);
    try {
      const { profile, gstSettings, logoSrc, signatureSrc } = await getSettings();
      const html = buildCombinedHtml(records, gstSettings, logoSrc, getShopHtmlProfile(profile, signatureSrc), true);
      setPreviewHtml(html);
      setPreviewCount(records.length);
      setPreviewVisible(true);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to generate preview.');
    } finally {
      setActionBusy('');
    }
  }, [getSettings]);

  const handlePrint = useCallback(async (records, busyKey = 'print') => {
    if (!records.length) return;
    setActionBusy(busyKey);
    try {
      const { profile, gstSettings, logoSrc, signatureSrc } = await getSettings();
      const html = buildCombinedHtml(records, gstSettings, logoSrc, getShopHtmlProfile(profile, signatureSrc), false);
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Print Error', e?.message || 'Failed to print.');
    } finally {
      setActionBusy('');
    }
  }, [getSettings]);

  const handleDownload = useCallback(async (records, busyKey = 'download') => {
    if (!records.length) return;
    setActionBusy(busyKey);
    try {
      const { profile, gstSettings, logoSrc, signatureSrc } = await getSettings();
      const html = buildCombinedHtml(records, gstSettings, logoSrc, getShopHtmlProfile(profile, signatureSrc), false);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Download Payment Bill PDF' });
      } else {
        Alert.alert('PDF Ready', `Saved at:\n${uri}`);
      }
    } catch (e) {
      Alert.alert('Download Error', e?.message || 'Failed to download PDF.');
    } finally {
      setActionBusy('');
    }
  }, [getSettings]);

  const handleWhatsApp = useCallback(async (records, busyKey = 'whatsapp') => {
    if (!records.length) return;
    setActionBusy(busyKey);
    try {
      const { profile, gstSettings, logoSrc, signatureSrc } = await getSettings();
      const html = buildCombinedHtml(records, gstSettings, logoSrc, getShopHtmlProfile(profile, signatureSrc), false);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share via WhatsApp' });
      } else {
        Alert.alert('Sharing Unavailable', `PDF saved at:\n${uri}`);
      }
    } catch (e) {
      Alert.alert('Share Error', e?.message || 'Failed to share.');
    } finally {
      setActionBusy('');
    }
  }, [getSettings]);

  const handleDelete = useCallback((record) => {
    Alert.alert('Delete', 'Remove this payment record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const res = await deletePaymentRecord(record._id);
          if (!res?.success) {
            Alert.alert('Error', res?.message || 'Failed to delete payment.');
            return;
          }
          setSelectedIds((prev) => { const n = new Set(prev); n.delete(recordKey(record)); return n; });
          refresh();
        },
      },
    ]);
  }, [refresh]);

  const handleEdit = useCallback((record) => {
    setEditingRecord(record);
    const rawDate = record.invoiceDate || record.updatedAt || record.createdAt;
    const d = rawDate ? new Date(rawDate) : new Date();
    const isoDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setEditPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setEditForm({
      customerName:  record.customerName  || '',
      phone:         record.phone         || '',
      itemName:      record.itemName      || '',
      weight:        String(record.weight || ''),
      ftRate:        String(record.ftRate || ''),
      cash:          String(record.cash   || ''),
      invoiceNumber: record.invoiceNumber || '',
      status:        record.status        || 'draft',
      invoiceDate:   isoDate,
    });
    setEditModalVisible(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingRecord) return;
    setEditSaving(true);
    try {
      const cashNum   = parseFloat(editForm.cash)   || 0;
      const weightNum = parseFloat(editForm.weight) || 0;
      let total = cashNum, cgst = 0, sgst = 0, roundOff = 0;
      if (cachedGstSettings.current) {
        const summary = buildSummary(cashNum, weightNum, cachedGstSettings.current);
        total    = summary.grandTotal;
        cgst     = summary.cgst;
        sgst     = summary.sgst;
        roundOff = summary.roundOff;
      }
      const payload = {
        customerName:  editForm.customerName.trim(),
        phone:         editForm.phone.trim(),
        itemName:      editForm.itemName.trim(),
        weight:        weightNum,
        ftRate:        parseFloat(editForm.ftRate) || 0,
        cash:          cashNum,
        subtotal:      cashNum,
        cgst,
        sgst,
        roundOff,
        total,
        invoiceNumber: editForm.invoiceNumber.trim(),
        status:        editForm.status,
        invoiceDate:   editForm.invoiceDate
          ? new Date(editForm.invoiceDate + 'T00:00:00').toISOString()
          : editingRecord.invoiceDate,
      };
      const res = await updatePaymentRecord(editingRecord._id, payload);
      if (res?.success) {
        setEditModalVisible(false);
        setEditingRecord(null);
        refresh();
      } else {
        Alert.alert('Error', res?.message || 'Failed to update payment record.');
      }
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update payment record.');
    } finally {
      setEditSaving(false);
    }
  }, [editingRecord, editForm, refresh]);

  // Bulk action wrappers
  const handleBulkView      = () => handleView(getSelectedRecords(), 'bulk-view');
  const handleBulkPrint     = () => handlePrint(getSelectedRecords(), 'bulk-print');
  const handleBulkDownload  = () => handleDownload(getSelectedRecords(), 'bulk-download');
  const handleBulkWhatsApp  = () => handleWhatsApp(getSelectedRecords(), 'bulk-whatsapp');
  const handlePrintAll      = () => handlePrint(filtered, 'printall');

  // Preview modal actions (re-use cached previewHtml)
  const handlePreviewPrint = async () => {
    if (!previewHtml) return;
    setActionBusy('prev-print');
    try { await Print.printAsync({ html: previewHtml }); } catch {}
    setActionBusy('');
  };
  const handlePreviewDownload = async () => {
    if (!previewHtml) return;
    setActionBusy('prev-dl');
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml, base64: false });
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Save PDF' });
      else Alert.alert('PDF Ready', uri);
    } catch {}
    setActionBusy('');
  };
  const handlePreviewWhatsApp = async () => {
    if (!previewHtml) return;
    setActionBusy('prev-wa');
    try {
      const { uri } = await Print.printToFileAsync({ html: previewHtml, base64: false });
      const ok = await Sharing.isAvailableAsync();
      if (ok) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: '.pdf', dialogTitle: 'Share via WhatsApp' });
    } catch {}
    setActionBusy('');
  };

  // ── Card renderer ─────────────────────────────────────────
  const renderCard = (item) => {
    const id       = recordKey(item);
    const selected = selectedIds.has(id);
    const isBusy   = (key) => actionBusy === `${key}-${id}`;

    const ActionBtn = ({ icon, label, color, bgColor, borderColor, onPress, busy }) => (
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: bgColor, borderColor }]}
        onPress={onPress}
        disabled={!!actionBusy}
      >
        {busy ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <>
            <MaterialCommunityIcons name={icon} size={14} color={color} />
            <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    );

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        style={[styles.card, selected && styles.cardSelected, filter === 'date' && styles.cardIndented]}
        onPress={() => navigation.navigate('PaymentBillPreview', { paymentData: item })}
        onLongPress={() => toggleSelect(id)}
      >
        {/* Card top */}
        <View style={styles.cardTop}>
          <TouchableOpacity onPress={() => toggleSelect(id)} style={styles.checkboxBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons
              name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={selected ? '#2563EB' : '#CBD5E1'}
            />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.customerName}>{item.customerName}</Text>
            <Text style={styles.invoiceNo}>{item.invoiceNumber}</Text>
          </View>
          <View style={styles.amountBlock}>
            <Text style={styles.amountText}>Rs {fmtCurrency(item.total)}</Text>
            <View style={[styles.statusBadge, item.status === 'final' ? styles.finalBadge : styles.draftBadge]}>
              <Text style={[styles.statusBadgeText, item.status === 'final' ? styles.finalBadgeText : styles.draftBadgeText]}>
                {(item.status || 'draft').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Detail rows */}
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="clock-outline" size={12} color="#9CA3AF" />
          <Text style={styles.detailText}>{fmtDateDisplay(recordDate(item))}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="cube-outline" size={12} color="#9CA3AF" />
          <Text style={styles.detailText}>{item.itemName}  •  {Number(item.weight || 0).toFixed(1)} g  •  FT {item.ftRate}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="phone-outline" size={12} color="#9CA3AF" />
          <Text style={styles.detailText}>{item.phone || '-'}</Text>
        </View>
        {!!item.gstNo && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="file-document-outline" size={12} color="#9CA3AF" />
            <Text style={styles.detailText}>{item.gstNo}</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.cardActions}>
          <ActionBtn icon="eye-outline"   label="View"  color="#2563EB" bgColor="#EFF6FF" borderColor="#BFDBFE"
            onPress={() => handleView([item], `view-${id}`)}   busy={isBusy('view')} />
          <ActionBtn icon="printer-outline" label="Print" color="#059669" bgColor="#ECFDF5" borderColor="#A7F3D0"
            onPress={() => handlePrint([item], `print-${id}`)} busy={isBusy('print')} />
          <ActionBtn icon="whatsapp"       label="WA"    color="#16A34A" bgColor="#F0FDF4" borderColor="#BBF7D0"
            onPress={() => handleWhatsApp([item], `wa-${id}`)} busy={isBusy('wa')} />
          <ActionBtn icon="download-outline" label="PDF"  color="#7C3AED" bgColor="#F5F3FF" borderColor="#DDD6FE"
            onPress={() => handleDownload([item], `dl-${id}`)} busy={isBusy('dl')} />
          <ActionBtn icon="pencil-outline" label="Edit" color="#D97706" bgColor="#FFFBEB" borderColor="#FDE68A"
            onPress={() => handleEdit(item)} busy={false} />
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtnCard]} onPress={() => handleDelete(item)}>
            <MaterialCommunityIcons name="trash-can-outline" size={14} color="#EF4444" />
            <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>Del</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDateHeader = (item) => (
    <View style={styles.dateHeader}>
      <View style={styles.dateHeaderLeft}>
        <MaterialCommunityIcons name="calendar" size={15} color="#2563EB" />
        <Text style={styles.dateHeaderText}>{fmtDateFull(item.isoDate)}</Text>
      </View>
      <View style={styles.dateHeaderRight}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeText}>{item.dayCount} bill{item.dayCount !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={styles.dateTotalText}>Rs {fmtCurrency(item.dayTotal)}</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }) => {
    if (item.type === 'header') return renderDateHeader(item);
    return renderCard(item);
  };

  const listData   = filter === 'date' ? dateSections : filtered;
  const listKeyExt = (item) => item.type ? item.id : recordKey(item);
  const isEmpty    = filter === 'date' ? dateSections.length === 0 : filtered.length === 0;
  const selCount   = selectedIds.size;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Payment History"
        subtitle={loading ? '' : `${history.length} total record${history.length !== 1 ? 's' : ''}`}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      {/* Filter tabs */}
      <View style={styles.tabRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}
          >
            <MaterialCommunityIcons name={f.icon} size={13} color={filter === f.key ? '#FFF' : '#6B7280'} />
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scrollable list — header contains filters + summary so everything scrolls together */}
      <FlatList
        data={loading ? [] : listData}
        keyExtractor={listKeyExt}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, selCount > 0 && { paddingBottom: 120 }]}
        ListHeaderComponent={
          <View>
            {/* Filter panel */}
            <View style={styles.filterPanel}>
              <View style={styles.filterPanelHeader}>
                <Text style={styles.filterPanelTitle}>Filters</Text>
                {hasActiveFilters && (
                  <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => {
                    setSearchQuery(''); setAppliedFromDate(''); setAppliedToDate('');
                    setFromDate(''); setToDate('');
                  }}>
                    <Text style={styles.clearFiltersText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by Name, Phone, Invoice No"
                  placeholderTextColor="#94A3B8"
                />
                {!!searchQuery && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.dateFilterRow}>
                {(['from', 'to']).map((field) => {
                  const val = field === 'from' ? fromDate : toDate;
                  const label = field === 'from' ? 'From Date' : 'To Date';
                  return (
                    <View key={field} style={styles.dateFilterField}>
                      <Text style={styles.dateFilterLabel}>{label}</Text>
                      <TouchableOpacity style={styles.dateFilterInput} onPress={() => openDatePicker(field)}>
                        <Text style={[styles.dateFilterValue, !val && styles.dateFilterPlaceholder]}>
                          {formatFilterDateDisplay(val) || `Select ${label.toLowerCase()}`}
                        </Text>
                        <MaterialCommunityIcons name="calendar-month-outline" size={17} color="#64748B" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity
                style={[styles.applyBtn, !hasPendingChanges && styles.applyBtnDisabled]}
                onPress={() => { setAppliedFromDate(fromDate); setAppliedToDate(toDate); }}
                disabled={!hasPendingChanges}
              >
                <Text style={styles.applyBtnText}>Apply Filter</Text>
              </TouchableOpacity>
            </View>

            {/* Summary + controls */}
            <View style={styles.summaryStrip}>
              <View style={styles.summaryItem}>
                <MaterialCommunityIcons name="receipt-text" size={18} color="#2563EB" />
                <View style={{ marginLeft: 6 }}>
                  <Text style={styles.summaryValue}>{stats.count}</Text>
                  <Text style={styles.summaryLabel}>Payments</Text>
                </View>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <MaterialCommunityIcons name="currency-inr" size={18} color="#10B981" />
                <View style={{ marginLeft: 6 }}>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>Rs {fmtCurrency(stats.total)}</Text>
                  <Text style={styles.summaryLabel}>Total Amount</Text>
                </View>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryControls}>
                <TouchableOpacity
                  style={styles.selectAllBtn}
                  onPress={selCount === filtered.length ? clearSelection : selectAll}
                >
                  <MaterialCommunityIcons
                    name={selCount === filtered.length && filtered.length > 0 ? 'checkbox-multiple-marked' : 'checkbox-multiple-blank-outline'}
                    size={16}
                    color="#2563EB"
                  />
                  <Text style={styles.selectAllText}>
                    {selCount === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
                {filtered.length > 0 && (
                  <TouchableOpacity
                    style={styles.printAllBtn}
                    onPress={handlePrintAll}
                    disabled={!!actionBusy}
                  >
                    {actionBusy === 'printall' ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="printer-outline" size={14} color="#FFF" />
                        <Text style={styles.printAllText}>Print All</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {filter === 'date' && !isEmpty && (
              <View style={styles.dateTrackBanner}>
                <MaterialCommunityIcons name="chart-timeline-variant" size={14} color="#2563EB" />
                <Text style={styles.dateTrackText}>{activeDayCount} active day{activeDayCount !== 1 ? 's' : ''} tracked</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="receipt-text-outline" size={60} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>
                {filter === 'all' ? 'No payment history' : filter === 'date' ? 'No payments found' : `No payments this ${filter}`}
              </Text>
              <Text style={styles.emptySub}>
                {filter === 'all' ? 'Saved payments will appear here' : 'Try switching to "All" to see all records'}
              </Text>
            </View>
          )
        }
      />

      {/* Bulk action bar */}
      {selCount > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selCount} selected</Text>
          <View style={styles.bulkActions}>
            {[
              { key: 'bulk-view',     icon: 'eye-outline',       label: 'View',  color: '#2563EB', onPress: handleBulkView },
              { key: 'bulk-print',    icon: 'printer-outline',   label: 'Print', color: '#059669', onPress: handleBulkPrint },
              { key: 'bulk-download', icon: 'download-outline',  label: 'PDF',   color: '#7C3AED', onPress: handleBulkDownload },
              { key: 'bulk-whatsapp', icon: 'whatsapp',          label: 'WA',    color: '#16A34A', onPress: handleBulkWhatsApp },
            ].map(({ key, icon, label, color, onPress }) => (
              <TouchableOpacity key={key} style={styles.bulkBtn} onPress={onPress} disabled={!!actionBusy}>
                {actionBusy === key ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <>
                    <MaterialCommunityIcons name={icon} size={18} color={color} />
                    <Text style={[styles.bulkBtnText, { color }]}>{label}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.bulkClearBtn} onPress={clearSelection}>
            <MaterialCommunityIcons name="close" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Date picker modal */}
      <Modal visible={!!pickerField} transparent animationType="fade" onRequestClose={closeDatePicker}>
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerCard}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>{pickerTitle}</Text>
              <TouchableOpacity onPress={closeDatePicker}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerMonthRow}>
              <TouchableOpacity style={styles.datePickerNavBtn}
                onPress={() => setPickerMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}>
                <MaterialCommunityIcons name="chevron-left" size={20} color="#1C2B3A" />
              </TouchableOpacity>
              <Text style={styles.datePickerMonthText}>{pickerMonthLabel}</Text>
              <TouchableOpacity style={styles.datePickerNavBtn}
                onPress={() => setPickerMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#1C2B3A" />
              </TouchableOpacity>
            </View>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((l) => <Text key={l} style={styles.weekdayText}>{l}</Text>)}
            </View>
            <View style={styles.daysGrid}>
              {pickerDays.map((cell) => {
                if (cell.empty) return <View key={cell.key} style={styles.dayCell} />;
                const selectedVal = pickerField === 'from' ? fromDate : toDate;
                const isSelected  = formatInputDate(cell.date) === selectedVal;
                return (
                  <TouchableOpacity key={cell.key} style={[styles.dayCell, styles.dayBtn, isSelected && styles.dayBtnActive]}
                    onPress={() => handlePickDate(cell.date)}>
                    <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{cell.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit payment record modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.editCard}>
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Edit Payment Record</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {[
                  { key: 'customerName',  label: 'Customer Name', placeholder: 'Customer name',  keyboard: 'default' },
                  { key: 'phone',         label: 'Phone',         placeholder: 'Phone number',   keyboard: 'phone-pad' },
                  { key: 'invoiceNumber', label: 'Invoice No',    placeholder: 'Invoice number', keyboard: 'default' },
                  { key: 'itemName',      label: 'Item',          placeholder: 'Item name',      keyboard: 'default' },
                  { key: 'weight',        label: 'Weight (g)',    placeholder: '0',              keyboard: 'numeric' },
                  { key: 'ftRate',        label: 'Silver Rate',   placeholder: '0',              keyboard: 'numeric' },
                  { key: 'cash',          label: 'Amount',        placeholder: '0',              keyboard: 'numeric' },
                ].map(({ key, label, placeholder, keyboard }) => (
                  <View key={key} style={styles.editField}>
                    <Text style={styles.editLabel}>{label}</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editForm[key] || ''}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, [key]: v }))}
                      placeholder={placeholder}
                      placeholderTextColor="#94A3B8"
                      keyboardType={keyboard}
                    />
                  </View>
                ))}

                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Invoice Date</Text>
                  <TouchableOpacity
                    style={[styles.editInput, styles.editDateBtn]}
                    onPress={() => {
                      const d = editForm.invoiceDate ? new Date(editForm.invoiceDate + 'T00:00:00') : new Date();
                      setEditPickerMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      setEditDatePickerVisible(true);
                    }}
                  >
                    <Text style={styles.editDateText}>
                      {editForm.invoiceDate
                        ? editForm.invoiceDate.split('-').reverse().join('-')
                        : 'Select date'}
                    </Text>
                    <MaterialCommunityIcons name="calendar-month-outline" size={17} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.editField}>
                  <Text style={styles.editLabel}>Status</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {['draft', 'final'].map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.statusPickerBtn, editForm.status === s && styles.statusPickerActive]}
                        onPress={() => setEditForm((f) => ({ ...f, status: s }))}
                      >
                        <Text style={[styles.statusPickerText, editForm.status === s && styles.statusPickerTextActive]}>
                          {s.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={styles.editFooter}>
                <TouchableOpacity
                  style={styles.editCancelBtn}
                  onPress={() => setEditModalVisible(false)}
                  disabled={editSaving}
                >
                  <Text style={styles.editCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editSaveBtn, editSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={editSaving}
                >
                  {editSaving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.editSaveText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* In-app bill preview modal */}
      <Modal visible={previewVisible} animationType="slide" statusBarTranslucent onRequestClose={() => setPreviewVisible(false)}>
        <SafeAreaView style={styles.previewContainer} edges={['top', 'left', 'right', 'bottom']}>
          {/* Preview header */}
          <View style={styles.previewHeader}>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewVisible(false)}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.previewTitle} numberOfLines={1}>
              Bill Preview{previewCount > 1 ? ` (${previewCount} bills)` : ''}
            </Text>
            <View style={styles.previewHeaderActions}>
              {[
                { icon: 'printer', key: 'prev-print', onPress: handlePreviewPrint },
                { icon: 'download', key: 'prev-dl',   onPress: handlePreviewDownload },
                { icon: 'whatsapp', key: 'prev-wa',   onPress: handlePreviewWhatsApp },
              ].map(({ icon, key, onPress }) => (
                <TouchableOpacity key={key} style={styles.previewHeaderBtn} onPress={onPress} disabled={!!actionBusy}>
                  {actionBusy === key
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <MaterialCommunityIcons name={icon} size={20} color="#FFF" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* WebView preview */}
          {previewHtml ? (
            <WebView
              source={{ html: previewHtml }}
              style={styles.previewWebView}
              scrollEnabled
              nestedScrollEnabled
              showsVerticalScrollIndicator
              originWhitelist={['*']}
              scalesPageToFit={false}
            />
          ) : (
            <View style={styles.previewLoading}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.previewLoadingText}>Building preview…</Text>
            </View>
          )}

          {/* Preview bottom bar */}
          <View style={styles.previewBottomBar}>
            <TouchableOpacity style={styles.previewBarBtn} onPress={handlePreviewPrint} disabled={!!actionBusy}>
              <MaterialCommunityIcons name="printer-outline" size={20} color="#2563EB" />
              <Text style={[styles.previewBarBtnText, { color: '#2563EB' }]}>Print</Text>
            </TouchableOpacity>
            <View style={styles.previewBarDivider} />
            <TouchableOpacity style={styles.previewBarBtn} onPress={handlePreviewDownload} disabled={!!actionBusy}>
              <MaterialCommunityIcons name="download-outline" size={20} color="#7C3AED" />
              <Text style={[styles.previewBarBtnText, { color: '#7C3AED' }]}>Download</Text>
            </TouchableOpacity>
            <View style={styles.previewBarDivider} />
            <TouchableOpacity style={styles.previewBarBtn} onPress={handlePreviewWhatsApp} disabled={!!actionBusy}>
              <MaterialCommunityIcons name="whatsapp" size={20} color="#16A34A" />
              <Text style={[styles.previewBarBtnText, { color: '#16A34A' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit date picker */}
      <Modal visible={editDatePickerVisible} transparent animationType="fade" onRequestClose={() => setEditDatePickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerCard}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Select Invoice Date</Text>
              <TouchableOpacity onPress={() => setEditDatePickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerMonthRow}>
              <TouchableOpacity style={styles.datePickerNavBtn}
                onPress={() => setEditPickerMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1))}>
                <MaterialCommunityIcons name="chevron-left" size={20} color="#1C2B3A" />
              </TouchableOpacity>
              <Text style={styles.datePickerMonthText}>{editPickerMonthLabel}</Text>
              <TouchableOpacity style={styles.datePickerNavBtn}
                onPress={() => setEditPickerMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1))}>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#1C2B3A" />
              </TouchableOpacity>
            </View>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((l) => <Text key={l} style={styles.weekdayText}>{l}</Text>)}
            </View>
            <View style={styles.daysGrid}>
              {editPickerDays.map((cell) => {
                if (cell.empty) return <View key={cell.key} style={styles.dayCell} />;
                const isSelected = cell.iso === editForm.invoiceDate;
                return (
                  <TouchableOpacity key={cell.key}
                    style={[styles.dayCell, styles.dayBtn, isSelected && styles.dayBtnActive]}
                    onPress={() => { setEditForm((f) => ({ ...f, invoiceDate: cell.iso })); setEditDatePickerVisible(false); }}>
                    <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{cell.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: horizontalPadding,
    paddingVertical: 10, gap: 6, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  tabActive: { backgroundColor: '#1C2B3A', borderColor: '#1C2B3A' },
  tabText: { fontSize: moderateScale(11), fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFF' },

  filterPanel: {
    marginHorizontal: horizontalPadding, marginTop: 10, marginBottom: 2,
    backgroundColor: '#FFF', borderRadius: 14, padding: spacing.md,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  filterPanelTitle: { fontSize: moderateScale(13), fontWeight: '800', color: '#1C2B3A' },
  clearFiltersBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  clearFiltersText: { fontSize: moderateScale(11), fontWeight: '700', color: '#475569' },

  searchBar: {
    minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12,
    paddingHorizontal: 12, backgroundColor: '#F8FAFC',
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: moderateScale(13), color: '#1C2B3A', paddingVertical: 0 },

  dateFilterRow: { flexDirection: 'row', gap: 10 },
  dateFilterField: { flex: 1 },
  dateFilterLabel: { marginBottom: 5, color: '#64748B', fontSize: moderateScale(11), fontWeight: '700' },
  dateFilterInput: {
    minHeight: 44, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10,
    paddingHorizontal: 12, backgroundColor: '#F8FAFC',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateFilterValue: { fontSize: moderateScale(12), color: '#1C2B3A', fontWeight: '600' },
  dateFilterPlaceholder: { color: '#94A3B8', fontWeight: '500' },
  applyBtn: {
    marginTop: 12, minHeight: 44, borderRadius: 10,
    backgroundColor: '#1C2B3A', alignItems: 'center', justifyContent: 'center',
  },
  applyBtnDisabled: { opacity: 0.45 },
  applyBtnText: { color: '#FFF', fontSize: moderateScale(13), fontWeight: '700' },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: horizontalPadding, marginTop: 12, marginBottom: 4,
    backgroundColor: '#FFF', borderRadius: 14, padding: spacing.md,
    borderWidth: 1, borderColor: '#E5E7EB', elevation: 1,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', marginRight: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#E5E7EB', marginHorizontal: 10 },
  summaryValue: { fontSize: moderateScale(14), fontWeight: '800', color: '#1C2B3A' },
  summaryLabel: { fontSize: moderateScale(10), color: '#9CA3AF', fontWeight: '500', marginTop: 1 },
  summaryControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  selectAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
  },
  selectAllText: { fontSize: moderateScale(10), fontWeight: '700', color: '#2563EB' },
  printAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#1C2B3A',
  },
  printAllText: { fontSize: moderateScale(10), fontWeight: '700', color: '#FFF' },

  dateTrackBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: horizontalPadding, marginTop: 6, marginBottom: 2,
  },
  dateTrackText: { fontSize: moderateScale(12), color: '#2563EB', fontWeight: '600' },

  list: { padding: horizontalPadding, paddingTop: 10, paddingBottom: spacing.xl * 2 },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: spacing.md,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#111827', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, marginBottom: 10,
  },
  cardSelected: { borderColor: '#3B82F6', borderWidth: 1.5, backgroundColor: '#F0F7FF' },
  cardIndented: { marginLeft: 4, borderLeftWidth: 3, borderLeftColor: '#BFDBFE' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  checkboxBtn: { paddingTop: 1 },
  customerName: { fontSize: moderateScale(14), fontWeight: '700', color: '#111827', marginBottom: 2 },
  invoiceNo: { fontSize: moderateScale(11), color: '#6B7280', fontWeight: '500' },
  amountBlock: { alignItems: 'flex-end', gap: 5 },
  amountText: { fontSize: moderateScale(15), fontWeight: '800', color: '#1C2B3A' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  finalBadge: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  draftBadge: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  statusBadgeText: { fontSize: moderateScale(9), fontWeight: '800' },
  finalBadgeText: { color: '#047857' },
  draftBadgeText: { color: '#B45309' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  detailText: { fontSize: moderateScale(11), color: '#6B7280', flex: 1 },

  cardActions: {
    flexDirection: 'row', gap: 6, marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, paddingVertical: 7, borderRadius: 8, borderWidth: 1, minHeight: 32,
  },
  actionBtnText: { fontSize: moderateScale(11), fontWeight: '600' },
  deleteBtnCard: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },

  // Date header
  dateHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, paddingHorizontal: 4,
    borderBottomWidth: 2, borderBottomColor: '#2563EB', marginTop: 14, marginBottom: 8,
  },
  dateHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  dateHeaderText: { fontSize: moderateScale(12), fontWeight: '700', color: '#1C2B3A' },
  dateHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 7,
    paddingVertical: 2, borderWidth: 1, borderColor: '#BFDBFE',
  },
  dateBadgeText: { fontSize: moderateScale(10), fontWeight: '700', color: '#2563EB' },
  dateTotalText: { fontSize: moderateScale(13), fontWeight: '800', color: '#10B981' },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#4B5563', marginTop: 14 },
  emptySub: { fontSize: moderateScale(12), color: '#9CA3AF', marginTop: 6, textAlign: 'center' },

  // Bulk bar
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', paddingHorizontal: horizontalPadding,
    paddingVertical: 12, borderTopWidth: 1.5, borderTopColor: '#E5E7EB',
    elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08, shadowRadius: 8,
  },
  bulkCount: { fontSize: moderateScale(12), fontWeight: '800', color: '#1C2B3A', marginRight: 10 },
  bulkActions: { flex: 1, flexDirection: 'row', gap: 8 },
  bulkBtn: {
    flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: 10, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E5E7EB', gap: 2, minHeight: 46,
  },
  bulkBtnText: { fontSize: moderateScale(10), fontWeight: '700' },
  bulkClearBtn: {
    marginLeft: 8, width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },

  // Date picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 20 },
  datePickerCard: {
    backgroundColor: '#FFF', borderRadius: 18, padding: spacing.lg,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  datePickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md,
  },
  datePickerTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#0F172A' },
  datePickerMonthRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  datePickerNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9',
  },
  datePickerMonthText: { fontSize: moderateScale(14), fontWeight: '700', color: '#1C2B3A' },
  weekdayRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayText: { width: `${100 / 7}%`, textAlign: 'center', color: '#94A3B8', fontSize: moderateScale(11), fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayBtn: { borderRadius: 10 },
  dayBtnActive: { backgroundColor: '#1C2B3A' },
  dayText: { fontSize: moderateScale(13), color: '#1C2B3A', fontWeight: '600' },
  dayTextActive: { color: '#FFF' },

  // Preview modal
  previewContainer: { flex: 1, backgroundColor: '#0F172A' },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1C2B3A',
  },
  previewCloseBtn: { padding: 4 },
  previewTitle: { flex: 1, fontSize: moderateScale(15), fontWeight: '700', color: '#FFF', marginHorizontal: 12 },
  previewHeaderActions: { flexDirection: 'row', gap: 6 },
  previewHeaderBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  previewWebView: { flex: 1, backgroundColor: '#F5F7F9' },
  previewLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  previewLoadingText: { color: '#94A3B8', fontSize: moderateScale(14) },
  previewBottomBar: {
    flexDirection: 'row', backgroundColor: '#1C2B3A',
    paddingHorizontal: 8, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  previewBarBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  previewBarDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },
  previewBarBtnText: { fontSize: moderateScale(13), fontWeight: '700' },

  // Edit modal
  editCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: spacing.lg,
    maxHeight: '92%', borderWidth: 1, borderColor: '#E5E7EB',
  },
  editHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  editTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#0F172A' },
  editField: { marginBottom: 14 },
  editLabel: { fontSize: moderateScale(11), fontWeight: '700', color: '#64748B', marginBottom: 6 },
  editInput: {
    minHeight: 46, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10,
    paddingHorizontal: 12, fontSize: moderateScale(13), color: '#1C2B3A',
    backgroundColor: '#F8FAFC',
  },
  editFooter: {
    flexDirection: 'row', gap: 12, marginTop: 20,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  editCancelBtn: {
    flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  editCancelText: { fontSize: moderateScale(14), fontWeight: '700', color: '#475569' },
  editSaveBtn: {
    flex: 2, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1C2B3A',
  },
  editSaveText: { fontSize: moderateScale(14), fontWeight: '800', color: '#FFF' },
  statusPickerBtn: {
    flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
  },
  statusPickerActive: { backgroundColor: '#1C2B3A', borderColor: '#1C2B3A' },
  statusPickerText: { fontSize: moderateScale(12), fontWeight: '700', color: '#475569' },
  statusPickerTextActive: { color: '#FFF' },

  // Edit date button
  editDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editDateText: { fontSize: moderateScale(13), color: '#1C2B3A', fontWeight: '600' },

});

export default PaymentHistoryPage;
