import { useState, useCallback, useContext, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { fetchDailyReport } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { getDueBalanceDisplay } from '../utils/balanceDisplay';

// ── Date helpers ──────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

const toISODate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const toDisplayDate = (d) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const isToday = (d) => {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// ── Date Picker Modal ─────────────────────────────────────────
const DatePickerModal = ({ visible, value, onConfirm, onClose }) => {
  const [dd, setDd] = useState(pad(value.getDate()));
  const [mm, setMm] = useState(pad(value.getMonth() + 1));
  const [yyyy, setYyyy] = useState(String(value.getFullYear()));

  useEffect(() => {
    setDd(pad(value.getDate()));
    setMm(pad(value.getMonth() + 1));
    setYyyy(String(value.getFullYear()));
  }, [value]);

  const handleConfirm = () => {
    const [d, m, y] = [Number(dd), Number(mm), Number(yyyy)];
    if (!d || !m || !y || y < 2000) {
      Alert.alert('Invalid Date', 'Please enter a valid date.');
      return;
    }
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) {
      Alert.alert('Invalid Date', 'Please enter a valid date.');
      return;
    }
    onConfirm(date);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dpStyles.overlay}>
        <View style={dpStyles.sheet}>
          <Text style={dpStyles.title}>Select Date</Text>
          <View style={dpStyles.row}>
            <View style={dpStyles.field}>
              <Text style={dpStyles.label}>DD</Text>
              <TextInput
                style={dpStyles.input}
                value={dd}
                onChangeText={setDd}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <Text style={dpStyles.sep}>/</Text>
            <View style={dpStyles.field}>
              <Text style={dpStyles.label}>MM</Text>
              <TextInput
                style={dpStyles.input}
                value={mm}
                onChangeText={setMm}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <Text style={dpStyles.sep}>/</Text>
            <View style={[dpStyles.field, { flex: 1.5 }]}>
              <Text style={dpStyles.label}>YYYY</Text>
              <TextInput
                style={dpStyles.input}
                value={yyyy}
                onChangeText={setYyyy}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="2026"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
          <View style={dpStyles.actions}>
            <TouchableOpacity style={dpStyles.cancelBtn} onPress={onClose}>
              <Text style={dpStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dpStyles.confirmBtn} onPress={handleConfirm}>
              <Text style={dpStyles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  title: {
    fontSize: moderateScale(16), fontWeight: '800', color: '#111827',
    marginBottom: 20, textAlign: 'center',
  },
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
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cancelText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  confirmBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

// ── Summary Card ──────────────────────────────────────────────
const SummaryCard = ({ label, value, icon, color, bg }) => (
  <View style={[sumStyles.card, { backgroundColor: bg, borderColor: color + '40' }]}>
    <MaterialCommunityIcons name={icon} size={20} color={color} />
    <Text style={[sumStyles.value, { color }]}>{value}</Text>
    <Text style={sumStyles.label}>{label}</Text>
  </View>
);

const sumStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '30%', borderRadius: 14, padding: 10,
    alignItems: 'center', borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  value: { fontSize: moderateScale(14), fontWeight: '800', marginTop: 5, marginBottom: 2 },
  label: { fontSize: moderateScale(10), color: '#6B7280', fontWeight: '600', textAlign: 'center' },
});

// ── Main Component ────────────────────────────────────────────
const ReportScreen = ({ navigation }) => {
  const { gstBillEnabled, isAdmin } = useContext(AuthContext);
  const isGstUser = gstBillEnabled && !isAdmin;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [activeTab, setActiveTab] = useState(isGstUser ? 'gst' : 'b2b');

  const loadReport = useCallback(async (date) => {
    setLoading(true);
    setReportData(null);
    try {
      const res = await fetchDailyReport(toISODate(date));
      if (res.success) setReportData(res);
      else Alert.alert('Error', res.message || 'Failed to load report');
    } catch {
      Alert.alert('Error', 'Failed to load. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load when date changes
  useEffect(() => {
    loadReport(selectedDate);
  }, [selectedDate, loadReport]);

  // Reload on screen focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => loadReport(selectedDate));
    return unsub;
  }, [navigation, selectedDate, loadReport]);

  const canGoForward = !isToday(selectedDate) && addDays(selectedDate, 1) <= new Date();

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const summary = reportData?.summary || {};
  const bills = reportData?.bills || [];
  const gstBills = reportData?.gstBills || [];

  // ── B2B Transaction Card ──────────────────────────────────
  const renderB2BCard = (item, idx) => {
    const balanceDisplay = getDueBalanceDisplay(item.finalBalance);

    return (
    <View key={item._id || idx} style={styles.txnCard}>
      <View style={styles.txnHeader}>
        <View style={styles.billBadge}>
          <Text style={styles.billBadgeText}>#{String(item.billNo || 0).padStart(5, '0')}</Text>
        </View>
        <Text style={styles.txnTime}>{formatTime(item.createdAt)}</Text>
        <View style={styles.b2bTag}>
          <Text style={styles.b2bTagText}>B2B</Text>
        </View>
      </View>

      <Text style={styles.txnCustomer}>{item.customerName || 'Unknown Customer'}</Text>
      {item.transactionType ? (
        <Text style={styles.txnSubtype}>{item.transactionType}</Text>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="arrow-up-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.statLabel}>Issue</Text>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>
            {(item.issueTotalPurity || 0).toFixed(3)}g
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="arrow-down-circle-outline" size={16} color="#10B981" />
          <Text style={styles.statLabel}>Receipt</Text>
          <Text style={[styles.statValue, { color: '#10B981' }]}>
            {(item.receiptTotalPurity || 0).toFixed(3)}g
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="cash-outline" size={16} color="#D97706" />
          <Text style={styles.statLabel}>Cash</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>
            ₹{(item.cashTotalAmount || 0).toFixed(0)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <MaterialCommunityIcons
            name="scale-balance"
            size={16}
            color={balanceDisplay.color}
          />
          <Text style={styles.statLabel}>Balance</Text>
          <Text style={[styles.statValue, { color: balanceDisplay.color }]}>
            {balanceDisplay.text}
          </Text>
        </View>
      </View>
    </View>
    );
  };

  // ── GST Transaction Card ──────────────────────────────────
  const renderGSTCard = (item, idx) => (
    <View key={item._id || idx} style={[styles.txnCard, styles.txnCardGst]}>
      <View style={styles.txnHeader}>
        <View style={[styles.billBadge, styles.billBadgeGst]}>
          <Text style={[styles.billBadgeText, { color: '#7C3AED' }]}>
            {item.invoiceNumber || '—'}
          </Text>
        </View>
        <Text style={styles.txnTime}>{formatTime(item.createdAt)}</Text>
        <View style={styles.gstTag}>
          <Text style={styles.gstTagText}>GST</Text>
        </View>
      </View>

      <Text style={styles.txnCustomer}>{item.customerName || 'Unknown Customer'}</Text>
      {item.phone ? <Text style={styles.txnPhone}>{item.phone}</Text> : null}

      <View style={styles.statsRow}>
        <View style={[styles.statBox, { flex: 1.5 }]}>
          <MaterialCommunityIcons name="currency-inr" size={16} color="#7C3AED" />
          <Text style={styles.statLabel}>Invoice Value</Text>
          <Text style={[styles.statValue, { color: '#7C3AED' }]}>
            ₹{Number(item.totalInvoiceValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="percent-outline" size={16} color="#7C3AED" />
          <Text style={styles.statLabel}>GST</Text>
          <Text style={[styles.statValue, { color: '#7C3AED' }]}>
            ₹{Number(item.totalGst || 0).toFixed(0)}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <MaterialCommunityIcons name="package-variant" size={16} color="#7C3AED" />
          <Text style={styles.statLabel}>Items</Text>
          <Text style={[styles.statValue, { color: '#7C3AED' }]}>
            {item.items?.length || 0}
          </Text>
        </View>
      </View>
    </View>
  );

  const today = isToday(selectedDate);
  const weekdayStr = selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title={isGstUser ? 'GST Report' : 'Daily Report'}
        subtitle="Date-wise transaction report"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Date Navigator ── */}
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.navArrow} onPress={() => setSelectedDate(d => addDays(d, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={26} color="#2563EB" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.navCenter} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
            <View style={styles.navTitleRow}>
              {today && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>TODAY</Text>
                </View>
              )}
              <Text style={styles.navDate}>{toDisplayDate(selectedDate)}</Text>
            </View>
            <View style={styles.navSubRow}>
              <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#9CA3AF" />
              <Text style={styles.navWeekday}>{weekdayStr}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navArrow, !canGoForward && styles.navArrowDisabled]}
            onPress={() => canGoForward && setSelectedDate(d => addDays(d, 1))}
            disabled={!canGoForward}
          >
            <MaterialCommunityIcons name="chevron-right" size={26} color={canGoForward ? '#2563EB' : '#D1D5DB'} />
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
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadReport(selectedDate)}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Summary Cards ── */}
            <View style={styles.summarySection}>
              <Text style={styles.sectionLabel}>Summary</Text>
              {isGstUser ? (
                <View style={styles.summaryRow}>
                  <SummaryCard
                    label="GST Bills"
                    value={summary.totalGstBills ?? 0}
                    icon="receipt-text"
                    color="#7C3AED"
                    bg="#F5F3FF"
                  />
                  <SummaryCard
                    label="GST Value"
                    value={`₹${Number(summary.totalGstValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    icon="currency-inr"
                    color="#7C3AED"
                    bg="#F5F3FF"
                  />
                </View>
              ) : (
                <>
                  <View style={styles.summaryRow}>
                    <SummaryCard
                      label="B2B Bills"
                      value={summary.totalBills ?? 0}
                      icon="receipt"
                      color="#2563EB"
                      bg="#EFF6FF"
                    />
                    <SummaryCard
                      label="Total Issue"
                      value={`${(summary.totalIssuePurity || 0).toFixed(3)}g`}
                      icon="arrow-up-circle"
                      color="#EF4444"
                      bg="#FEF2F2"
                    />
                    <SummaryCard
                      label="Total Receipt"
                      value={`${(summary.totalReceiptPurity || 0).toFixed(3)}g`}
                      icon="arrow-down-circle"
                      color="#10B981"
                      bg="#ECFDF5"
                    />
                  </View>
                  <View style={styles.summaryRow}>
                    <SummaryCard
                      label="Cash Amount"
                      value={`₹${(summary.totalCashAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                      icon="cash"
                      color="#D97706"
                      bg="#FFFBEB"
                    />
                    <SummaryCard
                      label="Cash Pure"
                      value={`${(summary.totalCashPurity || 0).toFixed(3)}g`}
                      icon="gold"
                      color="#D97706"
                      bg="#FFFBEB"
                    />
                    {gstBillEnabled && (
                      <SummaryCard
                        label="GST Bills"
                        value={summary.totalGstBills ?? 0}
                        icon="receipt-text"
                        color="#7C3AED"
                        bg="#F5F3FF"
                      />
                    )}
                  </View>
                </>
              )}
            </View>

            {/* ── Tab Bar ── */}
            <View style={styles.tabSection}>
              <View style={styles.tabRow}>
                {!isGstUser && (
                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'b2b' && styles.tabActiveB2B]}
                    onPress={() => setActiveTab('b2b')}
                  >
                    <MaterialCommunityIcons
                      name="receipt"
                      size={15}
                      color={activeTab === 'b2b' ? '#fff' : '#6B7280'}
                    />
                    <Text style={[styles.tabText, activeTab === 'b2b' && styles.tabTextActiveB2B]}>
                      B2B Bills ({bills.length})
                    </Text>
                  </TouchableOpacity>
                )}
                {(isGstUser || isAdmin || gstBillEnabled) && (
                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'gst' && styles.tabActiveGst]}
                    onPress={() => setActiveTab('gst')}
                  >
                    <MaterialCommunityIcons
                      name="receipt-text"
                      size={15}
                      color={activeTab === 'gst' ? '#fff' : '#6B7280'}
                    />
                    <Text style={[styles.tabText, activeTab === 'gst' && styles.tabTextActiveGst]}>
                      GST Bills ({gstBills.length})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── Transaction List ── */}
            <View style={styles.listSection}>
              {activeTab === 'b2b' ? (
                bills.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <MaterialCommunityIcons name="receipt-text-outline" size={52} color="#D1D5DB" />
                    <Text style={styles.emptyTitle}>No B2B Bills</Text>
                    <Text style={styles.emptySubtext}>
                      No transactions on {toDisplayDate(selectedDate)}
                    </Text>
                  </View>
                ) : (
                  bills.map((item, i) => renderB2BCard(item, i))
                )
              ) : (
                gstBills.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <MaterialCommunityIcons name="receipt-text-outline" size={52} color="#C4B5FD" />
                    <Text style={styles.emptyTitle}>No GST Bills</Text>
                    <Text style={styles.emptySubtext}>
                      No GST transactions on {toDisplayDate(selectedDate)}
                    </Text>
                  </View>
                ) : (
                  gstBills.map((item, i) => renderGSTCard(item, i))
                )
              )}
            </View>
          </>
        )}
      </ScrollView>

      {showPicker && (
        <DatePickerModal
          visible={showPicker}
          value={selectedDate}
          onConfirm={(d) => setSelectedDate(d)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { paddingBottom: 48 },

  // ── Date Navigator ──
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: horizontalPadding,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  navArrow: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowDisabled: { opacity: 0.35 },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F3F4F6',
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeText: {
    color: '#fff',
    fontSize: moderateScale(9),
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  navDate: {
    fontSize: moderateScale(20),
    fontWeight: '800',
    color: '#111827',
  },
  navSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  navWeekday: {
    fontSize: moderateScale(12),
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // ── Loading / Error ──
  centerBox: {
    alignItems: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  centerText: {
    fontSize: moderateScale(14),
    color: '#6B7280',
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  retryText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },

  // ── Summary ──
  summarySection: {
    marginHorizontal: horizontalPadding,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  // ── Tabs ──
  tabSection: {
    marginHorizontal: horizontalPadding,
    marginBottom: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabActiveB2B: { backgroundColor: '#2563EB' },
  tabActiveGst: { backgroundColor: '#7C3AED' },
  tabText: { fontSize: moderateScale(13), fontWeight: '700', color: '#6B7280' },
  tabTextActiveB2B: { color: '#fff' },
  tabTextActiveGst: { color: '#fff' },

  // ── Transaction Cards ──
  listSection: {
    marginHorizontal: horizontalPadding,
  },
  txnCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  txnCardGst: {
    borderColor: '#EDE9FE',
    backgroundColor: '#FDFCFF',
  },
  txnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  billBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  billBadgeGst: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  billBadgeText: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: '#2563EB',
  },
  txnTime: {
    flex: 1,
    fontSize: moderateScale(11),
    color: '#9CA3AF',
    fontWeight: '500',
  },
  b2bTag: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  b2bTagText: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },
  gstTag: {
    backgroundColor: '#F5F3FF',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  gstTagText: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.5,
  },
  txnCustomer: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  txnSubtype: {
    fontSize: moderateScale(11),
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  txnPhone: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E5E7EB',
  },
  statLabel: {
    fontSize: moderateScale(9),
    color: '#9CA3AF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },

  // ── Empty State ──
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 52,
    gap: 8,
  },
  emptyTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#4B5563',
  },
  emptySubtext: {
    fontSize: moderateScale(12),
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

export default ReportScreen;
