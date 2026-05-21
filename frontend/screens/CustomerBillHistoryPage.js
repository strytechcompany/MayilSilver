import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import {
  fetchBillHistory,
  fetchPaymentHistoryFromDb,
  fetchGstCustomers,
} from '../services/api';
import { getDueBalanceDisplay } from '../utils/balanceDisplay';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

// ── Helpers ───────────────────────────────────────────────────
const normalizePhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const fmtCurrency = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtWeight = (n) =>
  `${Number(n || 0).toFixed(3)}g`;

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const billDate = (b) => b.createdAt || b.updatedAt || b.invoiceDate;

const TYPE_FILTERS = [
  { key: 'all',     label: 'All',     icon: 'format-list-bulleted', color: '#1C2B3A' },
  { key: 'b2b',     label: 'B2B',     icon: 'scale-balance',        color: '#2563EB' },
  { key: 'gst',     label: 'GST',     icon: 'receipt',              color: '#7C3AED' },
  { key: 'payment', label: 'Payment', icon: 'cash',                 color: '#059669' },
];

// ── Type chip ─────────────────────────────────────────────────
const TYPE_META = {
  b2b:     { label: 'B2B',     bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  gst:     { label: 'GST',     bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  payment: { label: 'PAYMENT', bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
};

// ── Bill card ─────────────────────────────────────────────────
const BillCard = ({ item, onPress }) => {
  const meta = TYPE_META[item._type] || TYPE_META.b2b;

  const renderBody = () => {
    if (item._type === 'b2b') {
      const balDisplay = getDueBalanceDisplay(item.finalBalance);
      const issueTotal = (item.issueItems || []).reduce((s, i) => s + (Number(i.purity) || 0), 0);
      const receiptTotal = (item.receiptItems || []).reduce((s, r) => s + (Number(r.result) || 0), 0);
      const cashTotal = (item.cashEntries || []).reduce((s, c) => s + (Number(c.cashAmount || c.amount) || 0), 0);
      return (
        <>
          <View style={styles.billMetaRow}>
            <MaterialCommunityIcons name="tag-outline" size={12} color="#9CA3AF" />
            <Text style={styles.billMetaText}>Bill #{String(item.billNo || '').padStart(5, '0')}</Text>
            <Text style={styles.billMetaDot}>·</Text>
            <MaterialCommunityIcons name="clock-outline" size={12} color="#9CA3AF" />
            <Text style={styles.billMetaText}>{fmtDateTime(billDate(item))}</Text>
          </View>
          <View style={styles.b2bRow}>
            <View style={styles.b2bCell}>
              <Text style={styles.b2bCellLabel}>Issue</Text>
              <Text style={styles.b2bCellValue}>{fmtWeight(issueTotal)}</Text>
            </View>
            <View style={styles.b2bDivider} />
            <View style={styles.b2bCell}>
              <Text style={styles.b2bCellLabel}>Receipt</Text>
              <Text style={styles.b2bCellValue}>{fmtWeight(receiptTotal)}</Text>
            </View>
            <View style={styles.b2bDivider} />
            <View style={styles.b2bCell}>
              <Text style={styles.b2bCellLabel}>Cash</Text>
              <Text style={styles.b2bCellValue}>Rs {fmtCurrency(cashTotal)}</Text>
            </View>
            <View style={styles.b2bDivider} />
            <View style={[styles.b2bCell, { flex: 1.4 }]}>
              <Text style={styles.b2bCellLabel}>{balDisplay.label}</Text>
              <Text style={[styles.b2bCellValue, { color: balDisplay.color, fontWeight: '800' }]}>
                {balDisplay.value}
              </Text>
            </View>
          </View>
        </>
      );
    }

    if (item._type === 'gst') {
      return (
        <>
          <View style={styles.billMetaRow}>
            <MaterialCommunityIcons name="tag-outline" size={12} color="#9CA3AF" />
            <Text style={styles.billMetaText}>{item.invoiceNumber || '-'}</Text>
            <Text style={styles.billMetaDot}>·</Text>
            <MaterialCommunityIcons name="clock-outline" size={12} color="#9CA3AF" />
            <Text style={styles.billMetaText}>{fmtDateTime(billDate(item))}</Text>
          </View>
          <View style={styles.singleAmountRow}>
            <Text style={styles.singleAmountLabel}>Total Invoice</Text>
            <Text style={[styles.singleAmountValue, { color: '#7C3AED' }]}>
              Rs {fmtCurrency(item.totalInvoiceValue)}
            </Text>
          </View>
        </>
      );
    }

    // payment
    return (
      <>
        <View style={styles.billMetaRow}>
          <MaterialCommunityIcons name="tag-outline" size={12} color="#9CA3AF" />
          <Text style={styles.billMetaText}>{item.invoiceNumber || '-'}</Text>
          <Text style={styles.billMetaDot}>·</Text>
          <MaterialCommunityIcons name="clock-outline" size={12} color="#9CA3AF" />
          <Text style={styles.billMetaText}>{fmtDateTime(billDate(item))}</Text>
        </View>
        <View style={styles.singleAmountRow}>
          <View>
            <Text style={styles.singleAmountLabel}>{item.itemName || 'Silver Article'}</Text>
            <Text style={[styles.singleAmountValue, { color: '#059669' }]}>
              Rs {fmtCurrency(item.cash || item.total)}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            item.status === 'final' ? styles.finalBadge : styles.draftBadge,
          ]}>
            <Text style={[
              styles.statusText,
              item.status === 'final' ? styles.finalText : styles.draftText,
            ]}>
              {(item.status || 'DRAFT').toUpperCase()}
            </Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.86}>
      <View style={styles.cardTopRow}>
        <View style={[styles.typeChip, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <Text style={[styles.typeChipText, { color: meta.text }]}>{meta.label}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
      </View>
      {renderBody()}
    </TouchableOpacity>
  );
};

// ── Main component ────────────────────────────────────────────
const CustomerBillHistoryPage = ({ navigation, route }) => {
  const customer = route.params?.customer;
  const [bills, setBills]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadBills = useCallback(async () => {
    if (!customer) { setLoading(false); return; }
    try {
      const custPhone = normalizePhone(customer.phone);
      const custName  = (customer.customerName || '').toLowerCase().trim();
      const custId    = customer._id;

      const [b2bBills, allPayments, allGst] = await Promise.all([
        fetchBillHistory(custId),
        fetchPaymentHistoryFromDb(),
        fetchGstCustomers(),
      ]);

      const matchesCustomer = (phone, name) => {
        const p = normalizePhone(phone);
        const n = (name || '').toLowerCase().trim();
        return (custPhone && p === custPhone) || (custName && n === custName);
      };

      const payments = allPayments.filter((p) => matchesCustomer(p.phone, p.customerName));
      const gstBills = allGst.filter((g) => matchesCustomer(g.phone, g.customerName));

      const combined = [
        ...b2bBills.map((b) => ({ ...b, _type: 'b2b',     _date: b.createdAt })),
        ...payments.map((p) => ({ ...p, _type: 'payment', _date: p.updatedAt || p.createdAt })),
        ...gstBills.map((g) => ({ ...g, _type: 'gst',     _date: g.createdAt })),
      ].sort((a, b) => new Date(b._date) - new Date(a._date));

      setBills(combined);
    } catch (e) {
      console.error('CustomerBillHistory load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customer]);

  useEffect(() => {
    loadBills();
    const unsub = navigation.addListener('focus', loadBills);
    return unsub;
  }, [navigation, loadBills]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBills();
  }, [loadBills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((b) => {
      if (typeFilter !== 'all' && b._type !== typeFilter) return false;
      if (!q) return true;
      const fields = [
        b.billNo ? `#${b.billNo}` : '',
        b.invoiceNumber || '',
        b.itemName || '',
      ];
      return fields.some((f) => String(f).toLowerCase().includes(q));
    });
  }, [bills, typeFilter, search]);

  const stats = useMemo(() => {
    const totalPayment = filtered
      .filter((b) => b._type === 'payment')
      .reduce((s, b) => s + Number(b.cash || b.total || 0), 0);
    const totalGst = filtered
      .filter((b) => b._type === 'gst')
      .reduce((s, b) => s + Number(b.totalInvoiceValue || 0), 0);
    return { count: filtered.length, totalPayment, totalGst };
  }, [filtered]);

  const handleCardPress = useCallback((bill) => {
    if (bill._type === 'b2b') {
      navigation.navigate('BillPreview', { billData: bill });
    } else if (bill._type === 'payment') {
      navigation.navigate('PaymentBillPreview', { paymentData: bill });
    } else if (bill._type === 'gst') {
      navigation.navigate('GSTBillPreview', { transactionId: bill._id });
    }
  }, [navigation]);

  const renderItem = useCallback(({ item }) => (
    <BillCard item={item} onPress={() => handleCardPress(item)} />
  ), [handleCardPress]);

  const keyExtractor = (item) =>
    `${item._type}-${item._id || item.billNo || item.invoiceNumber}`;

  if (!customer) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="Bill History" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-off-outline" size={54} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No customer selected</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title={customer.customerName}
        subtitle="Customer Bill History"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      {/* Type filter tabs */}
      <View style={styles.tabRow}>
        {TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.tab, typeFilter === f.key && styles.tabActive]}
            onPress={() => setTypeFilter(f.key)}
          >
            <MaterialCommunityIcons
              name={f.icon}
              size={13}
              color={typeFilter === f.key ? '#FFF' : '#6B7280'}
            />
            <Text style={[styles.tabText, typeFilter === f.key && styles.tabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={17} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by bill no, invoice no..."
          placeholderTextColor="#94A3B8"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Summary strip */}
      {!loading && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <MaterialCommunityIcons name="receipt-text" size={16} color="#2563EB" />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.summaryValue}>{stats.count}</Text>
              <Text style={styles.summaryLabel}>Bills</Text>
            </View>
          </View>
          {stats.totalPayment > 0 && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <MaterialCommunityIcons name="cash" size={16} color="#059669" />
                <View style={{ marginLeft: 6 }}>
                  <Text style={[styles.summaryValue, { color: '#059669' }]}>
                    Rs {fmtCurrency(stats.totalPayment)}
                  </Text>
                  <Text style={styles.summaryLabel}>Payments</Text>
                </View>
              </View>
            </>
          )}
          {stats.totalGst > 0 && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <MaterialCommunityIcons name="receipt" size={16} color="#7C3AED" />
                <View style={{ marginLeft: 6 }}>
                  <Text style={[styles.summaryValue, { color: '#7C3AED' }]}>
                    Rs {fmtCurrency(stats.totalGst)}
                  </Text>
                  <Text style={styles.summaryLabel}>GST Bills</Text>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="file-document-outline" size={54} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No bills found</Text>
          <Text style={styles.emptySub}>
            {bills.length === 0
              ? `No bills saved for ${customer.customerName}`
              : 'Try changing the filter or search'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
          }
        />
      )}
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

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: horizontalPadding, marginTop: 10,
    paddingHorizontal: 12, minHeight: 44,
    backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: moderateScale(13), color: '#1C2B3A', paddingVertical: 0 },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: horizontalPadding, marginTop: 10, marginBottom: 2,
    backgroundColor: '#FFF', borderRadius: 12, padding: spacing.md,
    borderWidth: 1, borderColor: '#E5E7EB', elevation: 1,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center' },
  summaryDivider: { width: 1, height: 28, backgroundColor: '#E5E7EB', marginHorizontal: 12 },
  summaryValue: { fontSize: moderateScale(14), fontWeight: '800', color: '#1C2B3A' },
  summaryLabel: { fontSize: moderateScale(10), color: '#9CA3AF', fontWeight: '500' },

  list: {
    padding: horizontalPadding, paddingTop: 10, paddingBottom: spacing.xl * 2,
  },

  // Card
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: spacing.md,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10,
    shadowColor: '#111827', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  typeChipText: { fontSize: moderateScale(10), fontWeight: '800', letterSpacing: 0.5 },

  billMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10,
  },
  billMetaText: { fontSize: moderateScale(11), color: '#6B7280', fontWeight: '500' },
  billMetaDot: { color: '#CBD5E1', fontWeight: '700', marginHorizontal: 2 },

  // B2B row
  b2bRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  b2bCell: { flex: 1, alignItems: 'center' },
  b2bDivider: { width: 1, height: 32, backgroundColor: '#E5E7EB' },
  b2bCellLabel: { fontSize: moderateScale(9), color: '#9CA3AF', fontWeight: '600', marginBottom: 3 },
  b2bCellValue: { fontSize: moderateScale(11), fontWeight: '700', color: '#1C2B3A' },

  // GST / Payment
  singleAmountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  singleAmountLabel: { fontSize: moderateScale(11), color: '#6B7280', marginBottom: 2 },
  singleAmountValue: { fontSize: moderateScale(15), fontWeight: '800' },

  // Status badge
  statusBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  finalBadge: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  draftBadge: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  statusText: { fontSize: moderateScale(9), fontWeight: '800' },
  finalText: { color: '#047857' },
  draftText: { color: '#B45309' },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 40 },
  emptyTitle: { fontSize: moderateScale(16), fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: moderateScale(12), color: '#9CA3AF', textAlign: 'center' },
});

export default CustomerBillHistoryPage;
