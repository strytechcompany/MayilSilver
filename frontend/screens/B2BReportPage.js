import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { fetchB2BReport } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { getDueBalanceDisplay } from '../utils/balanceDisplay';

// ── helpers ───────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmtDate = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtWeight = (v) => `${Number(v || 0).toFixed(3)}g`;
const fmtCash   = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ── Stat cell ─────────────────────────────────────────────────
const StatCell = ({ label, value, color = '#374151', icon }) => (
  <View style={cellStyles.wrap}>
    {icon && <MaterialCommunityIcons name={icon} size={13} color={color} />}
    <Text style={[cellStyles.value, { color }]} numberOfLines={1}>{value}</Text>
    <Text style={cellStyles.label}>{label}</Text>
  </View>
);

const cellStyles = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 },
  value: { fontSize: moderateScale(11), fontWeight: '800', textAlign: 'center' },
  label: { fontSize: moderateScale(9),  color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
});

// ── Summary top card ──────────────────────────────────────────
const TopCard = ({ label, value, icon, color, bg }) => (
  <View style={[topStyles.card, { backgroundColor: bg, borderColor: color + '33' }]}>
    <MaterialCommunityIcons name={icon} size={18} color={color} />
    <Text style={[topStyles.value, { color }]} numberOfLines={1}>{value}</Text>
    <Text style={topStyles.label}>{label}</Text>
  </View>
);

const topStyles = StyleSheet.create({
  card: {
    flex: 1, borderRadius: 12, padding: 10, alignItems: 'center',
    borderWidth: 1, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  value: { fontSize: moderateScale(13), fontWeight: '800' },
  label: { fontSize: moderateScale(9),  color: '#6B7280', fontWeight: '600', textAlign: 'center' },
});

// ── Customer Card ─────────────────────────────────────────────
const CustomerCard = ({ item }) => {
  const balDisplay = getDueBalanceDisplay(item.currentBalance);

  return (
    <View style={cardStyles.card}>
      {/* Header */}
      <View style={cardStyles.header}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarText}>
            {(item.customerName || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.name} numberOfLines={1}>{item.customerName}</Text>
          {item.phone ? (
            <View style={cardStyles.phoneRow}>
              <MaterialCommunityIcons name="phone-outline" size={11} color="#6B7280" />
              <Text style={cardStyles.phone}>{item.phone}</Text>
            </View>
          ) : null}
        </View>
        <View style={cardStyles.billBadge}>
          <MaterialCommunityIcons name="receipt" size={11} color="#2563EB" />
          <Text style={cardStyles.billBadgeText}>{item.billCount} bills</Text>
        </View>
      </View>

      {/* Last bill date */}
      <View style={cardStyles.dateRow}>
        <MaterialCommunityIcons name="calendar-clock" size={12} color="#9CA3AF" />
        <Text style={cardStyles.dateText}>Last Bill: {fmtDate(item.lastBillDate)}</Text>
      </View>

      {/* Row 1: Issue | Receipt | Cash | Balance */}
      <View style={cardStyles.statsBlock}>
        <StatCell label="Issue"   value={fmtWeight(item.totalIssueWeight)}   color="#EF4444" icon="arrow-up-circle-outline" />
        <View style={cardStyles.divider} />
        <StatCell label="Receipt" value={fmtWeight(item.totalReceiptWeight)} color="#10B981" icon="arrow-down-circle-outline" />
        <View style={cardStyles.divider} />
        <StatCell label="Cash"    value={fmtCash(item.totalCash)}            color="#D97706" icon="cash-outline" />
        <View style={cardStyles.divider} />
        <StatCell label="Balance" value={balDisplay.text}                    color={balDisplay.color} icon="scale-balance" />
      </View>

      {/* Row 2: Advance | Old Bal | Monthly | Yearly */}
      <View style={[cardStyles.statsBlock, { backgroundColor: '#F0FDF4', borderRadius: 8, marginTop: 6 }]}>
        <StatCell label="Advance"  value={fmtWeight(item.advanceBalance)}            color="#7C3AED" />
        <View style={cardStyles.divider} />
        <StatCell label="Old Bal"  value={fmtWeight(item.oldBalance)}                color="#6B7280" />
        <View style={cardStyles.divider} />
        <StatCell label="Monthly"  value={fmtWeight(item.monthlyTotal?.issueWeight)} color="#0EA5E9" />
        <View style={cardStyles.divider} />
        <StatCell label="Yearly"   value={fmtWeight(item.yearlyTotal?.issueWeight)}  color="#F59E0B" />
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: spacing.md, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  avatar:     { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: moderateScale(16), fontWeight: '800', color: '#2563EB' },
  name:       { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },
  phoneRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  phone:      { fontSize: moderateScale(11), color: '#6B7280', fontWeight: '500' },
  billBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  billBadgeText: { fontSize: moderateScale(10), fontWeight: '800', color: '#2563EB' },
  dateRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  dateText:   { fontSize: moderateScale(10), color: '#9CA3AF', fontWeight: '500' },
  statsBlock: {
    flexDirection: 'row', backgroundColor: '#F9FAFB',
    borderRadius: 10, paddingVertical: 4, alignItems: 'center',
  },
  divider:    { width: 1, height: 36, backgroundColor: '#E5E7EB' },
});

// ── Month Picker Modal ────────────────────────────────────────
const MonthPickerModal = ({ visible, month, year, onConfirm, onClose }) => {
  const [selMonth, setSelMonth] = useState(month);
  const [selYear,  setSelYear]  = useState(String(year));

  useEffect(() => { setSelMonth(month); setSelYear(String(year)); }, [month, year]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={pickStyles.overlay}>
        <View style={pickStyles.sheet}>
          <Text style={pickStyles.title}>Select Month</Text>
          <View style={pickStyles.monthGrid}>
            {MONTHS.map((m, i) => (
              <TouchableOpacity
                key={m}
                style={[pickStyles.monthBtn, selMonth === i + 1 && pickStyles.monthBtnActive]}
                onPress={() => setSelMonth(i + 1)}
              >
                <Text style={[pickStyles.monthText, selMonth === i + 1 && pickStyles.monthTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={pickStyles.yearRow}>
            <Text style={pickStyles.yearLabel}>Year</Text>
            <TextInput
              style={pickStyles.yearInput}
              value={selYear}
              onChangeText={setSelYear}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          <View style={pickStyles.actions}>
            <TouchableOpacity style={pickStyles.cancelBtn} onPress={onClose}>
              <Text style={pickStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pickStyles.confirmBtn}
              onPress={() => {
                const y = Number(selYear);
                if (!y || y < 2000) { Alert.alert('Invalid Year'); return; }
                onConfirm(selMonth, y);
                onClose();
              }}
            >
              <Text style={pickStyles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const pickStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '100%' },
  title: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  monthBtn: { width: '22%', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  monthBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  monthText: { fontSize: moderateScale(13), fontWeight: '700', color: '#374151' },
  monthTextActive: { color: '#fff' },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  yearLabel: { fontSize: moderateScale(13), fontWeight: '700', color: '#374151' },
  yearInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    fontSize: moderateScale(16), fontWeight: '700', color: '#111827', textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' },
  cancelText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  confirmBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

// ── Date Picker Modal ─────────────────────────────────────────
const DatePickerModal = ({ visible, value, onConfirm, onClose }) => {
  const [dd,   setDd]   = useState(pad(value.getDate()));
  const [mm,   setMm]   = useState(pad(value.getMonth() + 1));
  const [yyyy, setYyyy] = useState(String(value.getFullYear()));

  useEffect(() => {
    setDd(pad(value.getDate()));
    setMm(pad(value.getMonth() + 1));
    setYyyy(String(value.getFullYear()));
  }, [value]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dpStyles.overlay}>
        <View style={dpStyles.sheet}>
          <Text style={dpStyles.title}>Select Date</Text>
          <View style={dpStyles.row}>
            <View style={dpStyles.field}>
              <Text style={dpStyles.label}>DD</Text>
              <TextInput style={dpStyles.input} value={dd} onChangeText={setDd} keyboardType="number-pad" maxLength={2} placeholder="01" placeholderTextColor="#9CA3AF" />
            </View>
            <Text style={dpStyles.sep}>/</Text>
            <View style={dpStyles.field}>
              <Text style={dpStyles.label}>MM</Text>
              <TextInput style={dpStyles.input} value={mm} onChangeText={setMm} keyboardType="number-pad" maxLength={2} placeholder="01" placeholderTextColor="#9CA3AF" />
            </View>
            <Text style={dpStyles.sep}>/</Text>
            <View style={[dpStyles.field, { flex: 1.5 }]}>
              <Text style={dpStyles.label}>YYYY</Text>
              <TextInput style={dpStyles.input} value={yyyy} onChangeText={setYyyy} keyboardType="number-pad" maxLength={4} placeholder="2026" placeholderTextColor="#9CA3AF" />
            </View>
          </View>
          <View style={dpStyles.actions}>
            <TouchableOpacity style={dpStyles.cancelBtn} onPress={onClose}>
              <Text style={dpStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={dpStyles.confirmBtn}
              onPress={() => {
                const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                if (isNaN(d.getTime())) { Alert.alert('Invalid Date'); return; }
                onConfirm(d);
                onClose();
              }}
            >
              <Text style={dpStyles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const dpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  title: { fontSize: moderateScale(16), fontWeight: '800', color: '#111827', marginBottom: 20, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 24 },
  field: { flex: 1 },
  label: { fontSize: moderateScale(11), fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    fontSize: moderateScale(18), fontWeight: '700', color: '#111827', textAlign: 'center',
  },
  sep: { fontSize: 24, fontWeight: '800', color: '#6B7280', paddingBottom: 8 },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  cancelText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  confirmBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

// ── Main Component ────────────────────────────────────────────
const B2BReportPage = ({ navigation }) => {
  const now = new Date();

  const [filterMode, setFilterMode] = useState('month'); // 'date' | 'month' | 'year'

  // Date mode state
  const [selDate, setSelDate] = useState(now);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Month mode state
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Year mode state
  const [selYearOnly, setSelYearOnly] = useState(now.getFullYear());

  const [loading, setLoading]     = useState(true);
  const [reportData, setReportData] = useState(null);
  const [searchText, setSearchText] = useState('');

  // Build filter params from current mode
  const buildFilters = useCallback(() => {
    if (filterMode === 'date') {
      return { date: `${selDate.getFullYear()}-${pad(selDate.getMonth() + 1)}-${pad(selDate.getDate())}` };
    }
    if (filterMode === 'month') {
      return { month: String(selMonth), year: String(selYear) };
    }
    return { year: String(selYearOnly) };
  }, [filterMode, selDate, selMonth, selYear, selYearOnly]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setReportData(null);
    try {
      const res = await fetchB2BReport(buildFilters());
      if (res.success) setReportData(res);
      else Alert.alert('Error', res.message || 'Failed to load report');
    } catch {
      Alert.alert('Error', 'Failed to load. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadReport);
    return unsub;
  }, [navigation, loadReport]);

  // Filtered summaries by search
  const summaries = (reportData?.summaries || []).filter(c =>
    !searchText ||
    c.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
    c.phone.includes(searchText)
  );

  const totals = reportData?.totals || {};

  // ── Filter label ────────────────────────────────────────────
  const filterLabel = () => {
    if (filterMode === 'date') {
      return `${pad(selDate.getDate())} ${MONTHS[selDate.getMonth()]} ${selDate.getFullYear()}`;
    }
    if (filterMode === 'month') {
      return `${MONTHS[selMonth - 1]} ${selYear}`;
    }
    return `Year ${selYearOnly}`;
  };

  // ── Month navigator ─────────────────────────────────────────
  const shiftMonth = (dir) => {
    let m = selMonth + dir;
    let y = selYear;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1)  { m = 12; y -= 1; }
    setSelMonth(m);
    setSelYear(y);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="B2B Report"
        subtitle="Customer-wise summary report"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <FlatList
        data={summaries}
        keyExtractor={(item) => item.customerId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {/* ── Filter Mode Tabs ── */}
            <View style={styles.filterTabs}>
              {['date', 'month', 'year'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.filterTab, filterMode === mode && styles.filterTabActive]}
                  onPress={() => setFilterMode(mode)}
                >
                  <Text style={[styles.filterTabText, filterMode === mode && styles.filterTabTextActive]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Filter Navigator ── */}
            <View style={styles.navBar}>
              {/* Left arrow */}
              <TouchableOpacity
                style={styles.navArrow}
                onPress={() => {
                  if (filterMode === 'date') setSelDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
                  else if (filterMode === 'month') shiftMonth(-1);
                  else setSelYearOnly(y => y - 1);
                }}
              >
                <MaterialCommunityIcons name="chevron-left" size={26} color="#2563EB" />
              </TouchableOpacity>

              {/* Center label (tap to open picker) */}
              <TouchableOpacity
                style={styles.navCenter}
                onPress={() => {
                  if (filterMode === 'date')  setShowDatePicker(true);
                  if (filterMode === 'month') setShowMonthPicker(true);
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={filterMode === 'year' ? 'calendar-blank' : filterMode === 'month' ? 'calendar-month' : 'calendar-today'}
                  size={16}
                  color="#2563EB"
                />
                <Text style={styles.navLabel}>{filterLabel()}</Text>
                {filterMode !== 'year' && (
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#9CA3AF" />
                )}
              </TouchableOpacity>

              {/* Right arrow */}
              <TouchableOpacity
                style={styles.navArrow}
                onPress={() => {
                  if (filterMode === 'date') setSelDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
                  else if (filterMode === 'month') shiftMonth(1);
                  else setSelYearOnly(y => y + 1);
                }}
              >
                <MaterialCommunityIcons name="chevron-right" size={26} color="#2563EB" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.centerText}>Loading report...</Text>
              </View>
            ) : !reportData ? (
              <View style={styles.centerBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={44} color="#EF4444" />
                <Text style={[styles.centerText, { color: '#EF4444' }]}>Could not load data</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadReport}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* ── Top Summary Cards ── */}
                <View style={styles.summarySection}>
                  <Text style={styles.sectionLabel}>Summary</Text>
                  <View style={styles.summaryRow}>
                    <TopCard label="Customers" value={totals.customers ?? 0}           icon="account-group"      color="#2563EB" bg="#EFF6FF" />
                    <TopCard label="Bills"      value={totals.bills ?? 0}               icon="receipt"            color="#7C3AED" bg="#F5F3FF" />
                    <TopCard label="Issue"      value={fmtWeight(totals.issueWeight)}   icon="arrow-up-circle"    color="#EF4444" bg="#FEF2F2" />
                  </View>
                  <View style={styles.summaryRow}>
                    <TopCard label="Receipt"    value={fmtWeight(totals.receiptWeight)} icon="arrow-down-circle"  color="#10B981" bg="#ECFDF5" />
                    <TopCard label="Cash"       value={fmtCash(totals.cash)}            icon="cash"               color="#D97706" bg="#FFFBEB" />
                    <View style={{ flex: 1 }} />
                  </View>
                </View>

                {/* ── Search ── */}
                <View style={styles.searchWrap}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or phone..."
                    placeholderTextColor="#9CA3AF"
                    value={searchText}
                    onChangeText={setSearchText}
                  />
                  {searchText ? (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* ── Customer count ── */}
                <View style={styles.listHeader}>
                  <Text style={styles.sectionLabel}>
                    Customers ({summaries.length}{searchText ? ` of ${reportData.summaries.length}` : ''})
                  </Text>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.legendText}>Issue</Text>
                    <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.legendText}>Receipt</Text>
                  </View>
                </View>
              </>
            )}
          </>
        }
        renderItem={({ item }) => <CustomerCard item={item} />}
        ListEmptyComponent={
          !loading && reportData ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="account-search-outline" size={52} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>
                {searchText ? 'No customers match' : 'No B2B transactions'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchText ? `No results for "${searchText}"` : `No data for ${filterLabel()}`}
              </Text>
            </View>
          ) : null
        }
      />

      {/* ── Modals ── */}
      <DatePickerModal
        visible={showDatePicker}
        value={selDate}
        onConfirm={setSelDate}
        onClose={() => setShowDatePicker(false)}
      />
      <MonthPickerModal
        visible={showMonthPicker}
        month={selMonth}
        year={selYear}
        onConfirm={(m, y) => { setSelMonth(m); setSelYear(y); }}
        onClose={() => setShowMonthPicker(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  listContent: { paddingBottom: 48 },

  // ── Filter tabs ──
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: horizontalPadding,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  filterTab: {
    flex: 1, paddingVertical: 9, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  filterTabActive: { backgroundColor: '#2563EB' },
  filterTabText:   { fontSize: moderateScale(13), fontWeight: '700', color: '#6B7280' },
  filterTabTextActive: { color: '#fff' },

  // ── Nav bar ──
  navBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: horizontalPadding,
    marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
    overflow: 'hidden',
  },
  navArrow: { paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  navCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#F3F4F6',
  },
  navLabel: { fontSize: moderateScale(15), fontWeight: '800', color: '#111827' },

  // ── Loading / error ──
  centerBox: { alignItems: 'center', paddingVertical: 64, gap: 12 },
  centerText: { fontSize: moderateScale(14), color: '#6B7280', fontWeight: '600' },
  retryBtn: {
    backgroundColor: '#EFF6FF', paddingHorizontal: 28, paddingVertical: 11,
    borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
  },
  retryText: { color: '#2563EB', fontWeight: '700', fontSize: moderateScale(14) },

  // ── Summary ──
  summarySection: { marginHorizontal: horizontalPadding, marginBottom: spacing.sm },
  summaryRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  sectionLabel: {
    fontSize: moderateScale(11), fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff',
    marginHorizontal: horizontalPadding,
    marginBottom: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: {
    flex: 1, fontSize: moderateScale(13), color: '#111827', fontWeight: '500',
  },

  // ── List header ──
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: horizontalPadding, marginBottom: 6,
  },
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: moderateScale(10), color: '#6B7280', fontWeight: '600' },

  // ── Customer list ──
  customerList: { paddingHorizontal: horizontalPadding },

  // ── Empty state ──
  emptyBox: { alignItems: 'center', paddingVertical: 52, gap: 8, marginHorizontal: horizontalPadding },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#4B5563' },
  emptySubtext: { fontSize: moderateScale(12), color: '#9CA3AF', textAlign: 'center' },
});

export default B2BReportPage;
