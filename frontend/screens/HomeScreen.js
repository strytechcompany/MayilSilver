import { useState, useEffect, useCallback, useContext } from 'react';
import {
  Dimensions, Image, StyleSheet, Text, View, ScrollView,
  TouchableOpacity, StatusBar, RefreshControl, ActivityIndicator,
  Modal, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DashboardCard from '../components/DashboardCard';
import ActionCard from '../components/ActionCard';
import { fetchRecentTransactions, fetchAllCustomers } from '../services/api';
import { loadShopProfile } from '../services/shopProfile';
import { base_url } from '../config';
import { AppContext } from '../context/AppContext';
import { AuthContext } from '../context/AuthContext';
import { contentWidth, horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { getDueBalanceDisplay } from '../utils/balanceDisplay';

const { width, height } = Dimensions.get('window');
const RUPEE = '\u20B9';

const BACKEND_URL = base_url.replace(/\/api\/?$/, '');

const HomeScreen = ({ navigation }) => {
  const { ftRate, updateFtRate, goldRate, updateGoldRate, refreshRates } = useContext(AppContext);
  const { logout, gstBillEnabled, isAdmin, allowedPages } = useContext(AuthContext);

  // Migration: old 6-module keys → granular page keys for backward compat
  const OLD_MODULE_MIGRATION = {
    b2b:           ['b2b_calculation', 'customer_list', 'bill_history', 'mini_statement', 'b2b_reports'],
    gst:           ['gst_customer', 'gst_settings', 'gst_history'],
    payment:       ['payment', 'payment_history'],
    daily_expense: ['daily_expense'],
    kadai_document:['kadai_document'],
    settings:      ['settings'],
  };

  // canAccess:
  //   isAdmin           → always true (all pages)
  //   allowedPages=null → legacy user: use gstBillEnabled fallback
  //   allowedPages=[]   → explicitly zero pages granted → nothing visible
  //   allowedPages=[…]  → granular page key check (old module keys are expanded)
  const canAccess = useCallback((pageKey) => {
    if (isAdmin) return true;
    if (allowedPages === null || allowedPages === undefined) {
      // Legacy fallback for accounts created before the permission system
      const GST_KEYS = ['gst_customer', 'gst_settings', 'gst_history'];
      const B2B_KEYS = ['b2b_calculation', 'customer_list', 'bill_history', 'mini_statement', 'b2b_reports'];
      if (GST_KEYS.includes(pageKey)) return !!gstBillEnabled;
      if (pageKey === 'payment' || pageKey === 'payment_history' || pageKey === 'settings') return true;
      if (B2B_KEYS.includes(pageKey)) return !gstBillEnabled;
      return !gstBillEnabled;
    }
    // Expand old module keys so workers created before the granular system still work
    const expanded = new Set(allowedPages);
    allowedPages.forEach((k) => {
      if (OLD_MODULE_MIGRATION[k]) OLD_MODULE_MIGRATION[k].forEach((gk) => expanded.add(gk));
    });
    return expanded.has(pageKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, allowedPages, gstBillEnabled]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shopLogo, setShopLogo] = useState(null);

  useEffect(() => {
    loadShopProfile().then((profile) => {
      if (profile?.logoBase64) {
        const b64 = profile.logoBase64;
        setShopLogo({ uri: b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}` });
      } else if (profile?.logoUrl) {
        const fullUrl = profile.logoUrl.startsWith('http')
          ? profile.logoUrl
          : `${BACKEND_URL}${profile.logoUrl}`;
        setShopLogo({ uri: fullUrl });
      }
    });
  }, []);
  
  // FT Rate Edit Modal State
  const [isFtModalVisible, setIsFtModalVisible] = useState(false);
  const [tempFtRate, setTempFtRate] = useState('');
  const [isGoldModalVisible, setIsGoldModalVisible] = useState(false);
  const [tempGoldRate, setTempGoldRate] = useState('');


  useEffect(() => {
    loadData();
  }, []);

  // Reload data and re-sync rates every time this screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
      refreshRates();
    });
    return unsubscribe;
  }, [navigation, refreshRates]);

  const loadData = async () => {
    setLoadingTxns(true);
    try {
      const [txns, customers] = await Promise.all([
        fetchRecentTransactions(3),
        fetchAllCustomers()
      ]);
      setRecentTransactions(txns);
      setCustomerCount(customers.length);
    } catch (e) {
      console.error('Data load error:', e);
    } finally {
      setLoadingTxns(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshRates()]);
    setRefreshing(false);
  }, [refreshRates]);

  const navigateTo = (screenName) => {
    navigation.navigate(screenName);
  };

  const handleLogout = async () => {
    await logout();
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  // Format current date for summary card
  const now = new Date();
  const currentDateStr = `${now.getDate().toString().padStart(2, '0')} ${now.toLocaleString('en-IN', { month: 'short' })}`;

  const handleSaveFtRate = () => {
    if (tempFtRate && !isNaN(tempFtRate) && Number(tempFtRate) > 0) {
      updateFtRate(tempFtRate);
      setIsFtModalVisible(false);
    }
  };

  const handleSaveGoldRate = () => {
    if (tempGoldRate && !isNaN(tempGoldRate) && Number(tempGoldRate) > 0) {
      updateGoldRate(tempGoldRate);
      setIsGoldModalVisible(false);
    }
  };

  const openFtEditModal = () => {
    setTempFtRate(ftRate);
    setIsFtModalVisible(true);
  };

  const openGoldEditModal = () => {
    setTempGoldRate(goldRate);
    setIsGoldModalVisible(true);
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Image
              source={shopLogo || require('../assets/logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>

          <TouchableOpacity style={styles.headerAction} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={22} color="#4B5563" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />}
      >
        {/* Summary Cards Row */}
        <View style={styles.summarySection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.summaryScroll}
          >
            <DashboardCard 
              title="Today" 
              value={currentDateStr} 
              icon="calendar-today" 
              color="#2563EB"
            />
            <DashboardCard 
              title="FT Rate" 
              value={`₹${ftRate}`} 
              icon="gold" 
              color="#D97706"
              subtitle="Current live rate"
              rightIcon="pencil"
              onRightIconPress={openFtEditModal}
            />
            <DashboardCard
              title="Silver Rate"
              value={`${RUPEE}${goldRate}`}
              icon="cash-multiple"
              color="#B45309"
              subtitle="Current silver rate"
              rightIcon="pencil"
              onRightIconPress={openGoldEditModal}
            />
            <DashboardCard 
              title="Customers" 
              value={customerCount.toString()} 
              icon="account-group" 
              color="#10B981"
              subtitle="Active accounts"
            />
          </ScrollView>
        </View>

        {/* Main Actions Section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Main Actions</Text>
          <View style={styles.gridContainer}>
            {/* ── B2B pages (granular keys) ─────────────────────── */}
            {canAccess('b2b_calculation') && (
              <ActionCard title="B2B Calculation" icon="calculator-variant" onPress={() => navigateTo('B2BCalculation')} />
            )}
            {canAccess('customer_list') && (
              <ActionCard title="Customer List" icon="account-multiple" onPress={() => navigateTo('CustomerDataList')} />
            )}
            {canAccess('bill_history') && (
              <ActionCard title="Bill History" icon="receipt" onPress={() => navigateTo('BillHistory')} />
            )}
            {canAccess('mini_statement') && (
              <ActionCard title="Mini Statement" icon="file-chart" onPress={() => navigateTo('MiniStatement')} />
            )}
            {canAccess('b2b_reports') && (
              <ActionCard title="B2B Reports" icon="chart-bar" onPress={() => navigateTo('Report')} />
            )}

            {/* ── Payment pages ─────────────────────────────────── */}
            {canAccess('payment') && (
              <ActionCard title="Payment" icon="qrcode-scan" onPress={() => navigateTo('Payment')} />
            )}
            {canAccess('payment_history') && (
              <ActionCard title="Payment History" icon="history" onPress={() => navigateTo('PaymentHistory')} />
            )}

            {/* ── GST pages ─────────────────────────────────────── */}
            {canAccess('gst_customer') && (
              <ActionCard title="GST Customer" icon="account-tie" onPress={() => navigateTo('GSTCustomer')} />
            )}
            {canAccess('gst_settings') && (
              <ActionCard title="GST Settings" icon="file-cog" onPress={() => navigateTo('GSTSettings')} />
            )}
            {canAccess('gst_history') && (
              <ActionCard title="GST History" icon="receipt-clock" onPress={() => navigateTo('GSTBillHistory')} />
            )}

            {/* ── Tools ─────────────────────────────────────────── */}
            {canAccess('daily_expense') && (
              <ActionCard title="Daily Expense" icon="cash-multiple" onPress={() => navigateTo('DailyExpense')} />
            )}
            {canAccess('kadai_document') && (
              <ActionCard title="Kadai Document" icon="file-document" onPress={() => navigateTo('KadaiDocument')} />
            )}
            {canAccess('settings') && (
              <ActionCard title="Settings" icon="cog" onPress={() => navigateTo('Settings')} />
            )}

            {/* ── Admin-only ────────────────────────────────────── */}
            {isAdmin && (
              <ActionCard title="Work List" icon="clipboard-list" onPress={() => navigateTo('WorkList')} />
            )}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.sectionContainer}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {canAccess('bill_history') && (
              <TouchableOpacity onPress={() => navigateTo('BillHistory')}>
                <Text style={styles.seeAllText}>View All</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingTxns ? (
            <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 20 }} />
          ) : recentTransactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="text-box-search-outline" size={32} color="#9CA3AF" />
              <Text style={styles.emptyText}>No recent activity found</Text>
            </View>
          ) : (
            recentTransactions.map((txn) => {
              const balanceDisplay = getDueBalanceDisplay(txn.finalBalance);

              return (
              <TouchableOpacity
                key={txn._id}
                style={styles.activityRow}
                onPress={() => {
                  const customer = {
                    phone: txn.customerId?.phone || txn.phone || '',
                    customerName: txn.customerId?.customerName || txn.customerName || '',
                  };
                  navigation.push('BillPreview', { billData: txn, customer });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.activityIcon}>
                  <MaterialCommunityIcons name="swap-horizontal" size={20} color="#4B5563" />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>
                    {txn.customerId?.customerName || txn.customerName || 'Unknown Customer'}
                  </Text>
                  <Text style={styles.activitySubtitle}>
                    Bill #{txn.billNo} • {formatDate(txn.createdAt)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.activityValue,
                    { backgroundColor: balanceDisplay.bg, borderColor: balanceDisplay.border }
                  ]}
                >
                  <Text style={[styles.balanceAmount, { color: balanceDisplay.color }]}>
                    {balanceDisplay.text}
                  </Text>
                </View>
              </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 Mayil Silver App</Text>
        </View>
      </ScrollView>

      {/* FT Rate Edit Modal */}
      <Modal visible={isFtModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit FT Rate</Text>
            <View style={styles.modalInputWrapper}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={tempFtRate}
                onChangeText={setTempFtRate}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsFtModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveFtRate}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Gold Rate Edit Modal */}
      <Modal visible={isGoldModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Silver Rate</Text>
            <View style={styles.modalInputWrapper}>
              <Text style={styles.currencySymbol}>{RUPEE}</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={tempGoldRate}
                onChangeText={setTempGoldRate}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsGoldModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveGoldRate}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  headerSafeArea: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    minHeight: Math.max(height * 0.06, 54),
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  headerLogo: {
    width: Math.min(width * 0.5 , 100),
    aspectRatio: 1,
    marginRight: spacing.xs,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: moderateScale(21),
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: moderateScale(12),
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  headerAction: {
    width: Math.min(width * 0.11, 44),
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { 
    flex: 1 
  },
  
  // Summary Section
  summarySection: {
    paddingVertical: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryScroll: {
    paddingHorizontal: horizontalPadding,
  },
  
  // Sections common
  sectionContainer: {
    paddingHorizontal: horizontalPadding,
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.md,
  },
  
  // Grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  
  // Recent Activity
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activityIcon: {
    width: Math.min(width * 0.11, 44),
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#111827',
  },
  activitySubtitle: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginTop: 4,
  },
  balanceAmount: {
    fontSize: moderateScale(12),
    fontWeight: '900',
  },
  activityValue: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginLeft: spacing.sm,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: moderateScale(14),
    marginTop: 8,
  },
  
  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  footerText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.xl,
    width: contentWidth,
    maxWidth: 360,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 18,
    color: '#6B7280',
    marginRight: 8,
  },
  modalInput: {
    flex: 1,
    fontSize: 18,
    color: '#2563EB',
    fontWeight: 'bold',
    paddingVertical: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  modalCancelText: {
    color: '#4B5563',
    fontWeight: '600',
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default HomeScreen;
