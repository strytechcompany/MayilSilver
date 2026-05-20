import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import Header from '../components/Header';
import { fetchPaymentHistoryFromDb, deletePaymentRecord } from '../services/api';
import { loadGstSettings } from '../services/gstSettings';
import { loadShopProfile } from '../services/shopProfile';
import { buildPaymentBillHtml, buildSummary } from '../utils/paymentUtils';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const LOGO_ASSET = require('../assets/logo.png');
let _cachedHistoryLogoDataUri = '';

const loadLogoSrc = async (profile) => {
  if (profile?.logoBase64) {
    const b = profile.logoBase64;
    return b.startsWith('data:') ? b : `data:image/png;base64,${b}`;
  }
  if (_cachedHistoryLogoDataUri) return _cachedHistoryLogoDataUri;
  try {
    const asset = Asset.fromModule(LOGO_ASSET);
    await asset.downloadAsync();
    const rawUri = asset.localUri || asset.uri || '';
    if (!rawUri) return '';
    let fileUri = rawUri;
    if (!rawUri.startsWith('file://') && !rawUri.startsWith('/')) {
      const cached = `${FileSystem.cacheDirectory}history_logo_pdf.png`;
      const { uri: dl } = await FileSystem.downloadAsync(rawUri, cached);
      fileUri = dl;
    }
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
    _cachedHistoryLogoDataUri = `data:image/png;base64,${base64}`;
    return _cachedHistoryLogoDataUri;
  } catch { return ''; }
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const weekStart = () => {
  const now = new Date();
  const day = now.getDay();
  const start = startOfDay(now);
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
};
const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const recordDate = (record) => record.updatedAt || record.createdAt || record.invoiceDate;

const fmtDateDisplay = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtDateFull = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const fmtCurrency = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatInputDate = (date) => dateKey(date);
const formatFilterDateDisplay = (value) => {
  const parsed = parseInputDate(value);
  if (!parsed) return '';
  return `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
};

const parseInputDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const FILTERS = [
  { key: 'all', label: 'All', icon: 'format-list-bulleted' },
  { key: 'week', label: 'This Week', icon: 'calendar-week' },
  { key: 'month', label: 'This Month', icon: 'calendar-month' },
  { key: 'date', label: 'By Date', icon: 'calendar-today' },
];

const PaymentHistoryPage = ({ navigation }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reprinting, setReprinting] = useState(null);
  const [filter, setFilter] = useState('all');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerField, setPickerField] = useState(null);
  const [pickerMonth, setPickerMonth] = useState(startOfDay(new Date()));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await fetchPaymentHistoryFromDb());
    } catch (error) {
      console.error('fetchPaymentHistoryFromDb:', error);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation, refresh]);

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const parsedFrom = parseInputDate(appliedFromDate);
    const parsedTo = parseInputDate(appliedToDate);

    return history
      .filter((record) => {
        const value = new Date(recordDate(record));

        if (filter === 'week' && value < weekStart()) return false;
        if (filter === 'month' && value < monthStart()) return false;
        if (parsedFrom && value < startOfDay(parsedFrom)) return false;
        if (parsedTo && value > endOfDay(parsedTo)) return false;

        if (!normalizedQuery) return true;

        const haystacks = [
          record.customerName,
          record.phone,
          record.invoiceNumber,
        ];

        return haystacks.some((field) => String(field || '').toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => new Date(recordDate(b)).getTime() - new Date(recordDate(a)).getTime());
  }, [history, filter, appliedFromDate, appliedToDate, searchQuery]);

  const stats = useMemo(() => ({
    count: filtered.length,
    total: filtered.reduce((sum, record) => sum + Number(record.total || 0), 0),
  }), [filtered]);

  const dateSections = useMemo(() => {
    if (filter !== 'date') return [];

    const map = {};
    filtered.forEach((record) => {
      const dateValue = recordDate(record);
      const key = dateKey(dateValue);
      if (!map[key]) {
        map[key] = { key, isoDate: dateValue, items: [], dayTotal: 0, dayCount: 0 };
      }
      map[key].items.push(record);
      map[key].dayTotal += Number(record.total || 0);
      map[key].dayCount += 1;
    });

    const flat = [];
    Object.values(map)
      .sort((a, b) => b.key.localeCompare(a.key))
      .forEach((group) => {
        flat.push({ type: 'header', id: `hdr-${group.key}`, ...group });
        group.items.forEach((item) =>
          flat.push({ type: 'item', id: item._id || item.invoiceNumber, ...item })
        );
      });

    return flat;
  }, [filtered, filter]);

  const activeDayCount = useMemo(() => (
    Object.keys(filtered.reduce((map, record) => {
      map[dateKey(recordDate(record))] = true;
      return map;
    }, {})).length
  ), [filtered]);
  const hasActiveFilters = !!(searchQuery.trim() || appliedFromDate || appliedToDate);
  const hasPendingDateChanges = fromDate !== appliedFromDate || toDate !== appliedToDate;

  const openDatePicker = (field) => {
    const sourceValue = field === 'from' ? fromDate : toDate;
    const parsed = parseInputDate(sourceValue) || new Date();
    setPickerField(field);
    setPickerMonth(startOfDay(parsed));
  };

  const closeDatePicker = () => setPickerField(null);

  const handlePickDate = (date) => {
    const formatted = formatInputDate(date);
    if (pickerField === 'from') {
      setFromDate(formatted);
      const parsedTo = parseInputDate(toDate);
      if (parsedTo && parsedTo < startOfDay(date)) {
        setToDate(formatted);
      }
    } else if (pickerField === 'to') {
      setToDate(formatted);
      const parsedFrom = parseInputDate(fromDate);
      if (parsedFrom && parsedFrom > startOfDay(date)) {
        setFromDate(formatted);
      }
    }
    closeDatePicker();
  };

  const pickerTitle = pickerField === 'from' ? 'Select From Date' : 'Select To Date';
  const pickerMonthLabel = `${MONTH_NAMES[pickerMonth.getMonth()]} ${pickerMonth.getFullYear()}`;
  const pickerDays = useMemo(() => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDayIndex; i += 1) {
      cells.push({ key: `empty-${i}`, empty: true });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      cells.push({
        key: formatInputDate(date),
        empty: false,
        label: day,
        date,
      });
    }
    return cells;
  }, [pickerMonth]);

  const handleReprint = async (record) => {
    setReprinting(record._id || record.invoiceNumber);
    try {
      const [profile, gstSettings] = await Promise.all([loadShopProfile(), loadGstSettings()]);
      const summary = buildSummary(record.cash, record.weight, gstSettings);
      summary.rows[0].particular = record.itemName;
      const silverRate = parseFloat(record.ftRate) || 0;
      if (silverRate > 0) summary.rows[0].rateNumeric = silverRate;

      const transaction = {
        customerName: record.customerName,
        phone: record.phone,
        address: record.address,
        gstNo: record.gstNo,
        invoiceNumber: record.invoiceNumber,
        invoiceDate: record.invoiceDate || recordDate(record),
      };

      const shopProfileForHtml = {
        name: profile.shopName || '',
        tagline: profile.tagline || '',
        gst: profile.gstin || '',
        phone: profile.phone || '',
        address: profile.address || '',
        city: profile.city || '',
        email: profile.email || '',
        stateName: profile.stateName || '',
        stateCode: profile.stateCode || '',
        financialYear: profile.financialYear || '2025-2026',
        termsAndConditions: profile.termsAndConditions || '',
      };

      const html = buildPaymentBillHtml(
        transaction,
        summary,
        gstSettings,
        await loadLogoSrc(profile),
        shopProfileForHtml
      );
      await Print.printAsync({ html });
    } catch (error) {
      console.error('handleReprint:', error);
      Alert.alert('Error', 'Failed to reprint bill.');
    } finally {
      setReprinting(null);
    }
  };

  const handleDelete = (record) => {
    Alert.alert('Delete', 'Remove this payment record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const response = await deletePaymentRecord(record._id);
          if (!response?.success) {
            Alert.alert('Error', response?.message || 'Failed to delete payment.');
            return;
          }
          refresh();
        },
      },
    ]);
  };

  const renderDateHeader = (item) => (
    <View style={styles.dateHeader}>
      <View style={styles.dateHeaderLeft}>
        <MaterialCommunityIcons name="calendar" size={16} color="#2563EB" />
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

  const renderCard = (item) => {
    const currentKey = item._id || item.invoiceNumber;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.card, filter === 'date' && styles.cardIndented]}
        onPress={() => navigation.navigate('PaymentBillPreview', { paymentData: item })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
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

        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="clock-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>{fmtDateDisplay(recordDate(item))}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="cube-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>{item.itemName}  •  {item.weight} g  •  FT {item.ftRate}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialCommunityIcons name="phone-outline" size={13} color="#9CA3AF" />
          <Text style={styles.detailText}>{item.phone || '-'}</Text>
        </View>
        {!!item.gstNo && (
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="file-document-outline" size={13} color="#9CA3AF" />
            <Text style={styles.detailText}>{item.gstNo}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.reprintBtn}
            onPress={() => handleReprint(item)}
            disabled={reprinting === currentKey}
          >
            {reprinting === currentKey ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={15} color="#2563EB" />
                <Text style={styles.reprintText}>Reprint</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <MaterialCommunityIcons name="trash-can-outline" size={15} color="#EF4444" />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }) => {
    if (item.type === 'header') return renderDateHeader(item);
    if (item.type === 'item') return renderCard(item);
    return renderCard(item);
  };

  const listData = filter === 'date' ? dateSections : filtered;
  const listKeyExt = (item) => item.type ? item.id : (item._id || item.invoiceNumber);
  const isEmpty = filter === 'date' ? dateSections.length === 0 : filtered.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Payment History"
        subtitle={loading ? '' : `${history.length} total record${history.length !== 1 ? 's' : ''}`}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.tabRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, filter === f.key && styles.tabActive]}
            onPress={() => setFilter(f.key)}
          >
            <MaterialCommunityIcons
              name={f.icon}
              size={14}
              color={filter === f.key ? '#FFFFFF' : '#6B7280'}
            />
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!loading && (
        <View style={styles.filterPanel}>
          <View style={styles.filterPanelHeader}>
            <Text style={styles.filterPanelTitle}>Filters</Text>
            {hasActiveFilters && (
              <TouchableOpacity
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setSearchQuery('');
                  setAppliedFromDate('');
                  setAppliedToDate('');
                  setFromDate('');
                  setToDate('');
                }}
              >
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
            <View style={styles.dateFilterField}>
              <Text style={styles.dateFilterLabel}>From Date</Text>
              <TouchableOpacity style={styles.dateFilterInput} onPress={() => openDatePicker('from')}>
                <Text style={[styles.dateFilterValue, !fromDate && styles.dateFilterPlaceholder]}>
                  {formatFilterDateDisplay(fromDate) || 'Select from date'}
                </Text>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={styles.dateFilterField}>
              <Text style={styles.dateFilterLabel}>To Date</Text>
              <TouchableOpacity style={styles.dateFilterInput} onPress={() => openDatePicker('to')}>
                <Text style={[styles.dateFilterValue, !toDate && styles.dateFilterPlaceholder]}>
                  {formatFilterDateDisplay(toDate) || 'Select to date'}
                </Text>
                <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.applyBtn, !hasPendingDateChanges && styles.applyBtnDisabled]}
            onPress={() => {
              setAppliedFromDate(fromDate);
              setAppliedToDate(toDate);
            }}
            disabled={!hasPendingDateChanges}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <MaterialCommunityIcons name="receipt-text" size={20} color="#2563EB" />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.summaryValue}>{stats.count}</Text>
              <Text style={styles.summaryLabel}>Payments</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <MaterialCommunityIcons name="currency-inr" size={20} color="#10B981" />
            <View style={{ marginLeft: 8 }}>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>Rs {fmtCurrency(stats.total)}</Text>
              <Text style={styles.summaryLabel}>Total Amount</Text>
            </View>
          </View>
        </View>
      )}

      {!loading && filter === 'date' && !isEmpty && (
        <View style={styles.dateTrackBanner}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={15} color="#2563EB" />
          <Text style={styles.dateTrackText}>
            {activeDayCount} active day{activeDayCount !== 1 ? 's' : ''} tracked
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : isEmpty ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="receipt-text-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>
            {filter === 'all'
              ? 'No payment history'
              : filter === 'date'
                ? 'No payments found'
                : `No payments this ${filter}`}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'all'
              ? 'Saved payments will appear here'
              : 'Try switching to "All" to see all records'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={listKeyExt}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

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
              <TouchableOpacity
                style={styles.datePickerNavBtn}
                onPress={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#1C2B3A" />
              </TouchableOpacity>
              <Text style={styles.datePickerMonthText}>{pickerMonthLabel}</Text>
              <TouchableOpacity
                style={styles.datePickerNavBtn}
                onPress={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#1C2B3A" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.weekdayText}>{label}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {pickerDays.map((cell) => {
                if (cell.empty) {
                  return <View key={cell.key} style={styles.dayCell} />;
                }

                const selectedValue = pickerField === 'from' ? fromDate : toDate;
                const isSelected = formatInputDate(cell.date) === selectedValue;

                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[styles.dayCell, styles.dayBtn, isSelected && styles.dayBtnActive]}
                    onPress={() => handlePickDate(cell.date)}
                  >
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: horizontalPadding,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  tabActive: { backgroundColor: '#1C2B3A', borderColor: '#1C2B3A' },
  tabText: { fontSize: moderateScale(11), fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: horizontalPadding,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
  },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#E5E7EB', marginHorizontal: 12 },
  summaryValue: { fontSize: moderateScale(16), fontWeight: '800', color: '#1C2B3A' },
  summaryLabel: { fontSize: moderateScale(11), color: '#9CA3AF', fontWeight: '500', marginTop: 1 },
  filterPanel: {
    marginHorizontal: horizontalPadding,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterPanelTitle: {
    fontSize: moderateScale(13),
    fontWeight: '800',
    color: '#1C2B3A',
  },
  clearFiltersBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearFiltersText: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#475569',
  },
  searchBar: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(13),
    color: '#1C2B3A',
    paddingVertical: 0,
  },
  dateFilterRow: { flexDirection: 'row', gap: 10 },
  dateFilterField: { flex: 1 },
  dateFilterLabel: {
    marginBottom: 6,
    color: '#64748B',
    fontSize: moderateScale(11),
    fontWeight: '700',
  },
  dateFilterInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFilterValue: { fontSize: moderateScale(13), color: '#1C2B3A', fontWeight: '600' },
  dateFilterPlaceholder: { color: '#94A3B8', fontWeight: '500' },
  applyBtn: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#1C2B3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnDisabled: {
    opacity: 0.5,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: moderateScale(13),
    fontWeight: '700',
  },
  dateTrackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: horizontalPadding,
    marginTop: 8,
    marginBottom: 2,
  },
  dateTrackText: { fontSize: moderateScale(12), color: '#2563EB', fontWeight: '600' },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#2563EB',
    marginTop: 16,
    marginBottom: 8,
  },
  dateHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dateHeaderText: { fontSize: moderateScale(13), fontWeight: '700', color: '#1C2B3A' },
  dateHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  dateBadgeText: { fontSize: moderateScale(11), fontWeight: '700', color: '#2563EB' },
  dateTotalText: { fontSize: moderateScale(14), fontWeight: '800', color: '#10B981' },
  list: { padding: horizontalPadding, paddingTop: 10, paddingBottom: spacing.xl * 2 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 10,
  },
  cardIndented: { marginLeft: 4, borderLeftWidth: 3, borderLeftColor: '#BFDBFE' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  customerName: { fontSize: moderateScale(15), fontWeight: '700', color: '#111827', marginBottom: 2 },
  invoiceNo: { fontSize: moderateScale(12), color: '#6B7280', fontWeight: '500' },
  amountBlock: { alignItems: 'flex-end', gap: 6 },
  amountText: { fontSize: moderateScale(16), fontWeight: '800', color: '#1C2B3A' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  finalBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  draftBadge: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  statusBadgeText: { fontSize: moderateScale(10), fontWeight: '800' },
  finalBadgeText: { color: '#047857' },
  draftBadgeText: { color: '#B45309' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { fontSize: moderateScale(12), color: '#6B7280', flex: 1 },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  reprintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  reprintText: { fontSize: moderateScale(13), fontWeight: '600', color: '#2563EB' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  deleteText: { fontSize: moderateScale(13), fontWeight: '600', color: '#EF4444' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: moderateScale(17), fontWeight: '700', color: '#4B5563', marginTop: 16 },
  emptySub: { fontSize: moderateScale(13), color: '#9CA3AF', marginTop: 6, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  datePickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  datePickerTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#0F172A',
  },
  datePickerMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  datePickerNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  datePickerMonthText: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#1C2B3A',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: moderateScale(11),
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtn: {
    borderRadius: 10,
  },
  dayBtnActive: {
    backgroundColor: '#1C2B3A',
  },
  dayText: {
    fontSize: moderateScale(13),
    color: '#1C2B3A',
    fontWeight: '600',
  },
  dayTextActive: {
    color: '#FFFFFF',
  },
});

export default PaymentHistoryPage;
