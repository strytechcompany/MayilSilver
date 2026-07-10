import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, DeviceEventEmitter, FlatList, Modal, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import Header from '../components/Header';
import { fetchGstCustomers, deleteGstCustomer } from '../services/api';
import { loadGstSettings } from '../services/gstSettings';
import { loadShopProfile } from '../services/shopProfile';
import { AppContext } from '../context/AppContext';
import { computeInvoiceSummary, buildCombinedInvoiceHtml } from '../utils/gstInvoiceBuilder';
import { getLogoDataUri as loadLogoSrc, getSignatureDataUri as loadSignatureSrc } from '../utils/shopBranding';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const buildProfileObj = (sp) => ({
  name: sp?.shopName || '',
  tagline: sp?.tagline || '',
  gst: sp?.gstin || '',
  phone: sp?.phone || '',
  address: sp?.address || '',
  city: sp?.city || '',
  stateName: sp?.stateName || '',
  stateCode: sp?.stateCode || '',
  email: sp?.email || '',
  logoBase64: sp?.logoBase64 || '',
  financialYear: sp?.financialYear || '2025-2026',
  bankName: sp?.bankName || '',
  accountNumber: sp?.accountNumber || '',
  ifscCode: sp?.ifscCode || '',
  branch: sp?.branch || '',
  termsAndConditions: sp?.termsAndConditions || '',
});

// ── Date helpers ──────────────────────────────────────────────
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay   = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const parseInputDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatInputDate   = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (value) => {
  const parsed = parseInputDate(value);
  if (!parsed) return '';
  return `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
};

const formatCardDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const todayPdfLabel = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const MONTH_NAMES   = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── Component ─────────────────────────────────────────────────
const GstBillhistory = ({ navigation }) => {
  const { ftRate } = useContext(AppContext);

  // Data
  const [bills, setBills]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Date filter
  const [fromDate, setFromDate]               = useState('');
  const [toDate, setToDate]                   = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate]     = useState('');
  const [pickerField, setPickerField]         = useState(null); // 'from' | 'to' | null
  const [pickerMonth, setPickerMonth]         = useState(startOfDay(new Date()));

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Per-card loading states
  const [printingId,  setPrintingId]  = useState(null);
  const [sharingId,   setSharingId]   = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);

  // Bulk actions
  const [downloadBusy,       setDownloadBusy]       = useState(false);
  const [viewSelectedVisible, setViewSelectedVisible] = useState(false);
  const [viewSelectedHtml,    setViewSelectedHtml]    = useState('');
  const [viewSelectedLoading, setViewSelectedLoading] = useState(false);

  // Resources cache
  const resourcesRef = useRef(null);

  // ── Data loading ────────────────────────────────────────────
  const loadGstBills = useCallback(async () => {
    try {
      const items = await fetchGstCustomers();
      const sorted = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setBills(sorted);
    } catch {
      Alert.alert('Error', 'Failed to load GST bill history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setLoading(true);
      setSelectedIds(new Set());
      resourcesRef.current = null;
      loadGstBills();
    });
    return unsubscribe;
  }, [navigation, loadGstBills]);

  // Invalidate the cached logo/signature the moment Kadai Profile saves a new
  // one, so it replaces the old one everywhere without needing to leave this screen.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('shopProfileUpdated', () => {
      resourcesRef.current = null;
    });
    return () => subscription.remove();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchQuery('');
    setAppliedFromDate('');
    setAppliedToDate('');
    setFromDate('');
    setToDate('');
    setSelectedIds(new Set());
    resourcesRef.current = null;
    loadGstBills();
  }, [loadGstBills]);

  // ── Filtered list ───────────────────────────────────────────
  const filteredBills = useMemo(() => {
    const parsedFrom = parseInputDate(appliedFromDate);
    const parsedTo   = parseInputDate(appliedToDate);
    const q = searchQuery.trim().toLowerCase();

    return bills.filter((b) => {
      const d = new Date(b.createdAt);
      if (parsedFrom && d < startOfDay(parsedFrom)) return false;
      if (parsedTo   && d > endOfDay(parsedTo))     return false;
      if (q) {
        const match =
          (b.customerName  || '').toLowerCase().includes(q) ||
          (b.invoiceNumber || '').toLowerCase().includes(q) ||
          (b.phone         || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bills, appliedFromDate, appliedToDate, searchQuery]);

  // ── Calendar picker ─────────────────────────────────────────
  const pickerDays = useMemo(() => {
    const year  = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth   = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) cells.push({ key: `e${i}`, empty: true });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      cells.push({ key: formatInputDate(date), empty: false, label: day, date });
    }
    return cells;
  }, [pickerMonth]);

  const openDatePicker = (field) => {
    const src   = field === 'from' ? fromDate : toDate;
    const base  = parseInputDate(src) || new Date();
    setPickerField(field);
    setPickerMonth(startOfDay(base));
  };

  const handlePickDate = (date) => {
    const formatted = formatInputDate(date);
    if (pickerField === 'from') {
      setFromDate(formatted);
      if (parseInputDate(toDate) && parseInputDate(toDate) < startOfDay(date)) setToDate(formatted);
    } else {
      setToDate(formatted);
      if (parseInputDate(fromDate) && parseInputDate(fromDate) > startOfDay(date)) setFromDate(formatted);
    }
    setPickerField(null);
  };

  const hasPendingDateChange = fromDate !== appliedFromDate || toDate !== appliedToDate;
  const hasActiveFilter      = !!(appliedFromDate || appliedToDate || searchQuery.trim());

  // ── Resource loader ─────────────────────────────────────────
  const ensureResources = useCallback(async () => {
    if (resourcesRef.current) return resourcesRef.current;
    const [gstSettings, shopProfile] = await Promise.all([loadGstSettings(), loadShopProfile()]);
    const [logoSrc, signatureSrc] = await Promise.all([
      loadLogoSrc(shopProfile),
      loadSignatureSrc(shopProfile),
    ]);
    resourcesRef.current = { gstSettings, profile: buildProfileObj(shopProfile), logoSrc, signatureSrc };
    return resourcesRef.current;
  }, []);

  const buildBillHtmlData = useCallback((item, res) => ({
    transaction: item,
    summary:     computeInvoiceSummary(item, ftRate, res.gstSettings),
    settings:    res.gstSettings,
    logoSrc:     res.logoSrc,
    profile:     res.profile,
    signatureSrc: res.signatureSrc,
  }), [ftRate]);

  // ── Selection ───────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredBills.length && filteredBills.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBills.map(b => b._id)));
    }
  };

  // ── Per-card actions ────────────────────────────────────────
  const handlePrintCard = async (item) => {
    setPrintingId(item._id);
    try {
      const res = await ensureResources();
      const html = buildCombinedInvoiceHtml([buildBillHtmlData(item, res)]);
      await Print.printAsync({ html });
    } catch (err) {
      console.error('handlePrintCard:', err);
      Alert.alert('Error', 'Failed to print bill.');
    } finally {
      setPrintingId(null);
    }
  };

  const handleShareCard = async (item) => {
    setSharingId(item._id);
    try {
      const res = await ensureResources();
      const html = buildCombinedInvoiceHtml([buildBillHtmlData(item, res)]);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { Alert.alert('Sharing Unavailable', `PDF at:\n${uri}`); return; }
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Share GST Invoice via WhatsApp',
      });
    } catch (err) {
      console.error('handleShareCard:', err);
      Alert.alert('Error', 'Failed to share bill.');
    } finally {
      setSharingId(null);
    }
  };

  const handleDeleteCard = (item) => {
    Alert.alert(
      'Delete GST Bill',
      `Remove invoice ${item.invoiceNumber || ''}\n${item.customerName || 'Unknown'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingId(item._id);
            try {
              const response = await deleteGstCustomer(item._id);
              if (!response?.success) {
                Alert.alert('Error', response?.message || 'Failed to delete.');
                return;
              }
              setBills(prev => prev.filter(b => b._id !== item._id));
              setSelectedIds(prev => { const n = new Set(prev); n.delete(item._id); return n; });
            } catch (err) {
              console.error('handleDeleteCard:', err);
              Alert.alert('Error', 'Failed to delete bill.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // ── Bulk: View Selected ──────────────────────────────────────
  const handleViewSelected = async () => {
    if (!selectedIds.size) return;
    setViewSelectedVisible(true);
    setViewSelectedHtml('');
    setViewSelectedLoading(true);
    try {
      const res = await ensureResources();
      const selected = Array.from(selectedIds)
        .map(id => bills.find(b => b._id === id))
        .filter(Boolean);
      const html = buildCombinedInvoiceHtml(selected.map(item => buildBillHtmlData(item, res)));
      setViewSelectedHtml(html);
    } catch (err) {
      console.error('handleViewSelected:', err);
      Alert.alert('Error', 'Failed to generate preview.');
      setViewSelectedVisible(false);
    } finally {
      setViewSelectedLoading(false);
    }
  };

  // ── Bulk: Download PDF ───────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!selectedIds.size) return;
    setDownloadBusy(true);
    try {
      const res = await ensureResources();
      const selected = Array.from(selectedIds)
        .map(id => bills.find(b => b._id === id))
        .filter(Boolean);
      const html = buildCombinedInvoiceHtml(selected.map(item => buildBillHtmlData(item, res)));
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const filename = `GST_Bills_${todayPdfLabel()}.pdf`;
      const destUri  = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });

      const ok = await Sharing.isAvailableAsync();
      if (!ok) { Alert.alert('PDF Ready', `Saved as:\n${filename}`); return; }
      await Sharing.shareAsync(destUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Save / Share ${filename}`,
      });
    } catch (err) {
      console.error('handleDownloadPdf:', err);
      Alert.alert('Error', 'Failed to generate PDF.');
    } finally {
      setDownloadBusy(false);
    }
  };

  // ── Render card ──────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const isSelected = selectedIds.has(item._id);
    const isPrinting = printingId === item._id;
    const isSharing  = sharingId  === item._id;
    const isDeleting = deletingId === item._id;
    const isBusy     = isPrinting || isSharing || isDeleting;

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        {/* Checkbox */}
        <TouchableOpacity
          style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}
          onPress={() => toggleSelect(item._id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isSelected && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />}
        </TouchableOpacity>

        {/* Card body — tapping navigates to preview */}
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => navigation.navigate('GSTBillPreview', { transactionId: item._id })}
          activeOpacity={0.75}
        >
          <View style={styles.cardTop}>
            <View style={styles.invoiceBadge}>
              <MaterialCommunityIcons name="receipt-text" size={13} color="#7C3AED" />
              <Text style={styles.invoiceNo}>{item.invoiceNumber || '—'}</Text>
            </View>
            <View style={styles.cardTopRight}>
              <Text style={styles.dateText}>{formatCardDate(item.createdAt)}</Text>
              {/* WhatsApp share — prominent in header */}
              <TouchableOpacity
                style={styles.waBtn}
                onPress={() => handleShareCard(item)}
                disabled={isBusy}
              >
                {isSharing
                  ? <ActivityIndicator size="small" color="#25D366" />
                  : <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
                }
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.customerName} numberOfLines={1}>{item.customerName || 'Unknown'}</Text>
          {!!item.phone && <Text style={styles.phoneText}>{item.phone}</Text>}

          <View style={styles.cardFooter}>
            <View style={styles.gstBadge}>
              <Text style={styles.gstBadgeText}>GST BILL</Text>
            </View>
            <Text style={styles.totalAmount}>
              ₹{Number(item.totalInvoiceValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          {/* Card actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.printBtn]}
              onPress={() => handlePrintCard(item)}
              disabled={isBusy}
            >
              {isPrinting
                ? <ActivityIndicator size="small" color="#2563EB" />
                : <><MaterialCommunityIcons name="printer" size={13} color="#2563EB" /><Text style={[styles.actionText, { color: '#2563EB' }]}>Print</Text></>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.viewBtn]}
              onPress={() => navigation.navigate('GSTBillPreview', { transactionId: item._id })}
            >
              <MaterialCommunityIcons name="eye-outline" size={13} color="#7C3AED" />
              <Text style={[styles.actionText, { color: '#7C3AED' }]}>View</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDeleteCard(item)}
              disabled={isBusy}
            >
              {isDeleting
                ? <ActivityIndicator size="small" color="#EF4444" />
                : <><MaterialCommunityIcons name="trash-can-outline" size={13} color="#EF4444" /><Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text></>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const allFilteredSelected =
    filteredBills.length > 0 && filteredBills.every(b => selectedIds.has(b._id));
  const selectedCount = selectedIds.size;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="GST Bill History"
        subtitle={`${bills.length} invoice${bills.length !== 1 ? 's' : ''}`}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      {/* ── Date filter ───────────────────────────────────────── */}
      <View style={styles.filterCard}>
        <View style={styles.filterRow}>
          {/* From date */}
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>From</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => openDatePicker('from')}>
              <Text style={[styles.dateInputText, !fromDate && styles.dateInputPlaceholder]}>
                {formatDisplayDate(fromDate) || 'DD-MM-YYYY'}
              </Text>
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#7C3AED" />
            </TouchableOpacity>
          </View>

          {/* To date */}
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>To</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => openDatePicker('to')}>
              <Text style={[styles.dateInputText, !toDate && styles.dateInputPlaceholder]}>
                {formatDisplayDate(toDate) || 'DD-MM-YYYY'}
              </Text>
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#7C3AED" />
            </TouchableOpacity>
          </View>

          {/* Apply */}
          <TouchableOpacity
            style={[styles.applyBtn, !hasPendingDateChange && styles.applyBtnDisabled]}
            onPress={() => { setAppliedFromDate(fromDate); setAppliedToDate(toDate); }}
            disabled={!hasPendingDateChange}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, invoice, phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {(searchQuery.length > 0 || hasActiveFilter) && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setAppliedFromDate(''); setAppliedToDate('');
              setFromDate(''); setToDate('');
            }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Select all + bulk actions */}
        <View style={styles.selectRow}>
          <TouchableOpacity style={styles.selectAllBtn} onPress={handleSelectAll}>
            <MaterialCommunityIcons
              name={allFilteredSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={18}
              color="#7C3AED"
            />
            <Text style={styles.selectAllText}>
              {allFilteredSelected ? 'Deselect All' : 'Select All'}
              {filteredBills.length > 0 && ` (${filteredBills.length})`}
            </Text>
          </TouchableOpacity>

          {selectedCount > 0 && (
            <View style={styles.bulkActions}>
              <TouchableOpacity
                style={[styles.bulkBtn, styles.viewSelBtn]}
                onPress={handleViewSelected}
                disabled={viewSelectedLoading}
              >
                {viewSelectedLoading
                  ? <ActivityIndicator size="small" color="#7C3AED" />
                  : <><MaterialCommunityIcons name="eye" size={14} color="#7C3AED" /><Text style={[styles.bulkBtnText, { color: '#7C3AED' }]}>View ({selectedCount})</Text></>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bulkBtn, styles.dlBtn, downloadBusy && styles.bulkBtnBusy]}
                onPress={handleDownloadPdf}
                disabled={downloadBusy}
              >
                {downloadBusy
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <><MaterialCommunityIcons name="file-download" size={14} color="#FFFFFF" /><Text style={[styles.bulkBtnText, { color: '#FFFFFF' }]}>PDF ({selectedCount})</Text></>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ── Bill list ─────────────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator size="large" color="#7C3AED" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredBills}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7C3AED']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="receipt-text-outline" size={64} color="#C4B5FD" />
              <Text style={styles.emptyText}>
                {hasActiveFilter ? 'No bills match the filter' : 'No GST bills found'}
              </Text>
              <Text style={styles.emptySubText}>
                {hasActiveFilter ? 'Try clearing the filter' : 'GST invoices will appear here.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Calendar picker modal ─────────────────────────────── */}
      <Modal visible={!!pickerField} transparent animationType="fade" onRequestClose={() => setPickerField(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.calCard}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>
                {pickerField === 'from' ? 'Select From Date' : 'Select To Date'}
              </Text>
              <TouchableOpacity onPress={() => setPickerField(null)}>
                <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.calMonthRow}>
              <TouchableOpacity
                style={styles.calNavBtn}
                onPress={() => setPickerMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#1C2B3A" />
              </TouchableOpacity>
              <Text style={styles.calMonthText}>
                {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                style={styles.calNavBtn}
                onPress={() => setPickerMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#1C2B3A" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map(l => (
                <Text key={l} style={styles.weekdayText}>{l}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {pickerDays.map((cell) => {
                if (cell.empty) return <View key={cell.key} style={styles.dayCell} />;
                const currentVal = pickerField === 'from' ? fromDate : toDate;
                const isSelected = formatInputDate(cell.date) === currentVal;
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[styles.dayCell, styles.dayBtn, isSelected && styles.dayBtnActive]}
                    onPress={() => handlePickDate(cell.date)}
                  >
                    <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>
                      {cell.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── View Selected modal ───────────────────────────────── */}
      <Modal
        visible={viewSelectedVisible}
        animationType="slide"
        onRequestClose={() => setViewSelectedVisible(false)}
      >
        <SafeAreaView style={styles.previewContainer} edges={['top', 'left', 'right', 'bottom']}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewTitle}>Selected GST Bills</Text>
              <Text style={styles.previewSubtitle}>{selectedCount} invoice{selectedCount !== 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.previewDlBtn, downloadBusy && styles.bulkBtnBusy]}
                onPress={handleDownloadPdf}
                disabled={downloadBusy || viewSelectedLoading}
              >
                {downloadBusy
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <><MaterialCommunityIcons name="file-download" size={15} color="#FFFFFF" /><Text style={styles.previewDlBtnText}>Download</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setViewSelectedVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
          </View>

          {viewSelectedLoading ? (
            <View style={styles.previewLoader}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.previewLoaderText}>Generating preview…</Text>
            </View>
          ) : viewSelectedHtml ? (
            <WebView
              source={{ html: viewSelectedHtml }}
              originWhitelist={['*']}
              style={{ flex: 1, backgroundColor: '#FFFFFF' }}
              scrollEnabled
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },

  // ── Filter card ───────────────────────────────────────────────
  filterCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: horizontalPadding,
    marginTop: 10,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  filterField: { flex: 1 },
  filterLabel: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 5,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FAF5FF',
  },
  dateInputText: { fontSize: moderateScale(12), color: '#1C2B3A', fontWeight: '600' },
  dateInputPlaceholder: { color: '#9CA3AF', fontWeight: '400' },
  applyBtn: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  applyBtnDisabled: { opacity: 0.45 },
  applyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(13) },

  // ── Search ────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#FAF5FF',
    minHeight: 42,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: moderateScale(13), color: '#111827', paddingVertical: 0 },

  // ── Select row ────────────────────────────────────────────────
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectAllText: { fontSize: moderateScale(12), fontWeight: '700', color: '#7C3AED' },

  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 90,
    justifyContent: 'center',
  },
  bulkBtnBusy: { opacity: 0.55 },
  viewSelBtn: { backgroundColor: '#EDE9FE', borderWidth: 1, borderColor: '#DDD6FE' },
  dlBtn:      { backgroundColor: '#7C3AED' },
  bulkBtnText: { fontSize: moderateScale(12), fontWeight: '800' },

  // ── List ──────────────────────────────────────────────────────
  listContent: { padding: horizontalPadding, paddingTop: 10, paddingBottom: 40 },

  // ── Card ──────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 3,
  },
  cardSelected: { borderColor: '#7C3AED', backgroundColor: '#FAF5FF' },

  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C4B5FD',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  checkCircleSelected: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },

  cardContent: { flex: 1 },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  invoiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  invoiceNo: { fontSize: moderateScale(11), fontWeight: '700', color: '#7C3AED' },

  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { fontSize: moderateScale(11), color: '#6B7280', fontWeight: '500' },
  waBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  customerName: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827', marginBottom: 2 },
  phoneText:    { fontSize: moderateScale(12), color: '#6B7280', marginBottom: 5 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: '#F3F0FF',
  },
  gstBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  gstBadgeText: { fontSize: moderateScale(10), fontWeight: '800', color: '#065F46', letterSpacing: 0.5 },
  totalAmount:  { fontSize: moderateScale(15), fontWeight: '800', color: '#7C3AED' },

  cardActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F3F0FF',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 30,
  },
  printBtn:  { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  viewBtn:   { borderColor: '#DDD6FE', backgroundColor: '#FAF5FF' },
  deleteBtn: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  actionText: { fontSize: moderateScale(11), fontWeight: '700' },

  // ── Empty ─────────────────────────────────────────────────────
  emptyState:   { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText:    { fontSize: moderateScale(17), fontWeight: '800', color: '#7C3AED', marginTop: 16 },
  emptySubText: { fontSize: moderateScale(13), color: '#9CA3AF', marginTop: 6, textAlign: 'center' },

  // ── Calendar modal ────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  calCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  calTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827' },
  calMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calNavBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F0FF',
  },
  calMonthText: { fontSize: moderateScale(15), fontWeight: '700', color: '#1C2B3A' },
  weekdayRow: { flexDirection: 'row', marginBottom: 8 },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: moderateScale(11),
    fontWeight: '700',
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  dayBtn:       { borderRadius: 10 },
  dayBtnActive: { backgroundColor: '#7C3AED' },
  dayText:       { fontSize: moderateScale(13), color: '#1C2B3A', fontWeight: '600' },
  dayTextActive: { color: '#FFFFFF' },

  // ── Preview modal ─────────────────────────────────────────────
  previewContainer: { flex: 1, backgroundColor: '#F5F3FF' },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalPadding,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
  },
  previewTitle:    { fontSize: moderateScale(17), fontWeight: '800', color: '#111827' },
  previewSubtitle: { fontSize: moderateScale(12), color: '#7C3AED', fontWeight: '600', marginTop: 2 },
  previewActions:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewDlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  previewDlBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(13) },
  previewCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  previewLoader:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  previewLoaderText: { fontSize: moderateScale(14), color: '#7C3AED', fontWeight: '600' },
});

export default GstBillhistory;
