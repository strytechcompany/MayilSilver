import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAllCustomers, saveTransaction } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import { AppContext } from '../context/AppContext';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const B2BCalculationPage = ({ navigation }) => {
  const { ftRate } = useContext(AppContext);
  // State for Customer Management
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

  // State for Transaction
  const [issueItems, setIssueItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [cashEntries, setCashEntries] = useState([]);
  const [enableGst, setEnableGst] = useState(false);

  // State for Row Inputs
  const [issueInput, setIssueInput] = useState({ itemName: '', grossWeight: '', touch: '' });
  const [receiptInput, setReceiptInput] = useState({ itemName: '', weight: '', result: '', touch: '' });
  const [cashInput, setCashInput] = useState({ amount: '', ftRate: '', cashType: 'Cash', notes: '' });

  const updateIssueInput = (field, value) => {
    setIssueInput((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateReceiptInput = (field, value) => {
    setReceiptInput((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateCashInput = (field, value) => {
    setCashInput((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // Sync ftRate from context to cashInput when it changes or on mount
  useEffect(() => {
    setCashInput(prev => ({ ...prev, ftRate: ftRate }));
  }, [ftRate]);

  // Fetch Customers on Mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllCustomers();
      const normalized = (data || []).map(c => ({ ...c, name: c.name || c.customerName || '' }));
      setCustomers(normalized);
      setFilteredCustomers(normalized);
    } catch (error) {
      console.error('Fetch Error:', error);
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  // Realtime Search Filtering
  useEffect(() => {
    const filtered = customers.filter(c => 
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || '').includes(searchQuery)
    );
    setFilteredCustomers(filtered);
  }, [searchQuery, customers]);

  // Transaction Logic: Add Issue Item
  const addIssueItem = () => {
    const gross = parseFloat(issueInput.grossWeight) || 0;
    const touch = parseFloat(issueInput.touch) || 0;
    if (!issueInput.itemName || gross === 0) return;

    const purity = (gross * touch) / 100;
    const newItem = {
      ...issueInput,
      id: Date.now(),
      grossWeight: gross,
      touch,
      purity: parseFloat(purity.toFixed(3)),
      netWeight: gross 
    };
    setIssueItems([...issueItems, newItem]);
    setIssueInput({ itemName: '', grossWeight: '', touch: '' });
  };

  // Transaction Logic: Add Receipt Item
  const addReceiptItem = () => {
    const result = parseFloat(receiptInput.result) || 0;
    const touch = parseFloat(receiptInput.touch) || 0;
    if (!receiptInput.itemName || result === 0) return;

    const purity = (result * touch) / 100;
    const newItem = {
      ...receiptInput,
      id: Date.now(),
      weight: parseFloat(receiptInput.weight) || 0,
      result,
      touch,
      purity: parseFloat(purity.toFixed(3))
    };
    setReceiptItems([...receiptItems, newItem]);
    setReceiptInput({ itemName: '', weight: '', result: '', touch: '' });
  };

  // Transaction Logic: Add Cash Entry
  const addCashEntry = () => {
    const amount = parseFloat(cashInput.amount) || 0;
    const rate = parseFloat(cashInput.ftRate) || parseFloat(ftRate) || 1; // avoid div by 0
    if (amount === 0) return;

    const pure = parseFloat((amount / rate).toFixed(3));
    const newEntry = { ...cashInput, id: Date.now(), amount, ftRate: rate, pure };
    setCashEntries([...cashEntries, newEntry]);
    setCashInput({ amount: '', ftRate: ftRate, cashType: 'Cash', notes: '' });
  };

  // Calculations
  const totals = useMemo(() => {
    const issueTotal = issueItems.reduce((acc, item) => acc + item.purity, 0);
    const receiptTotal = receiptItems.reduce((acc, item) => acc + item.purity, 0);
    const cashTotal = cashEntries.reduce((acc, item) => acc + item.amount, 0);
    const cashTotalPurity = cashEntries.reduce((acc, item) => acc + item.pure, 0);
    
    const prevBalance = selectedCustomer ? (selectedCustomer.ob - selectedCustomer.ab) : 0;
    const finalBalance = prevBalance + issueTotal - receiptTotal - cashTotalPurity;

    return {
      issueTotal: issueTotal.toFixed(3),
      receiptTotal: receiptTotal.toFixed(3),
      cashTotal: cashTotal.toFixed(2),
      cashTotalPurity: cashTotalPurity.toFixed(3),
      finalBalance: finalBalance.toFixed(3),
      balanceLabel: finalBalance >= 0 ? 'Old Balance (OB)' : 'Advance Balance (AB)',
      balanceValue: Math.abs(finalBalance).toFixed(3),
      balanceColor: finalBalance >= 0 ? '#EF4444' : '#10B981'
    };
  }, [issueItems, receiptItems, cashEntries, selectedCustomer]);

  // Save Transaction
  const handleSaveTransaction = async () => {
    if (!selectedCustomer) {
      Alert.alert('Error', 'Please select a customer first');
      return;
    }
    if (issueItems.length === 0 && receiptItems.length === 0 && cashEntries.length === 0) {
      Alert.alert('Error', 'Please add at least one entry before saving');
      return;
    }

    try {
      const prevBalance = selectedCustomer.ob - selectedCustomer.ab;

      const mappedCash = cashEntries.map(e => ({
        cashAmount: e.amount,
        cashType: e.cashType,
        notes: e.notes || '',
        ftRate: e.ftRate,
        pure: e.pure
      }));

      const data = await saveTransaction({
        customerId: selectedCustomer._id,
        issueItems,
        receiptItems,
        cashEntries: mappedCash,
        previousBalance: prevBalance,
        transactionType: 'B2B',
        enableGst,
        gstDraft: enableGst ? {
          customerName: selectedCustomer.name || selectedCustomer.customerName || '',
          phone: selectedCustomer.phone || '',
          address: selectedCustomer.address || '',
          gstNumber: selectedCustomer.gstin || '',
          invoiceDate: new Date(),
          totalInvoiceValue: parseFloat(totals.cashTotal) || 0
        } : null
      });

      if (data.success) {
        Alert.alert(
          '✅ Transaction Saved',
          `Bill No: #${data.billNo}\nFinal Balance: ${data.balanceLabel} ${parseFloat(data.balanceValue).toFixed(3)}g`,
          [{ text: 'OK', onPress: () => {
              navigation.navigate('BillPreview', { billId: data.bill._id, billData: data.bill, customer: selectedCustomer });
              setSelectedCustomer(null);
              setIssueItems([]);
              setReceiptItems([]);
              setCashEntries([]);
              setEnableGst(false);
              fetchCustomers();
          } }]
        );
      } else {
        Alert.alert('Error', data.message || 'Failed to save transaction');
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save transaction');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header 
        title="B2B Customer"
        showBack={true}
        onBackPress={() => navigation.goBack()}
        rightIcon="account-plus"
        onRightPress={() => navigation.navigate('CustomerDataList')}
      />

      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always">
          
          {/* Search Bar */}
          {!selectedCustomer && (
            <View style={styles.searchSection}>
              <View style={styles.searchInputWrap}>
                <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search customers..."
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {/* All Customers Table/List */}
          {!selectedCustomer && (
            <View style={styles.customerListSection}>
              {loading ? (
                <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
              ) : (
                filteredCustomers.map((item) => (
                  <TouchableOpacity 
                    key={item._id} 
                    style={styles.customerCard}
                    onPress={() => setSelectedCustomer(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.customerCardInfo}>
                      <Text style={styles.customerName}>{item.name}</Text>
                      <Text style={styles.customerPhone}>{item.phone}</Text>
                    </View>
                    <View style={styles.customerCardBalance}>
                      {item.ob > 0 ? (
                        <Text style={[styles.balanceText, { color: '#EF4444' }]}>OB: {item.ob.toFixed(3)}g</Text>
                      ) : item.ab > 0 ? (
                        <Text style={[styles.balanceText, { color: '#10B981' }]}>AB: {item.ab.toFixed(3)}g</Text>
                      ) : (
                        <Text style={[styles.balanceText, { color: '#6B7280' }]}>NIL</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Customer Info Section */}
          {selectedCustomer && (
            <View style={styles.selectedSection}>
              <Card style={styles.infoCard}>
                <View style={styles.infoHeader}>
                  <View>
                    <Text style={styles.infoName}>{selectedCustomer.name}</Text>
                    <Text style={styles.infoPhone}>{selectedCustomer.phone}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedCustomer(null)} style={styles.changeBtn}>
                    <Text style={styles.changeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.infoDivider} />
                
                <View style={styles.infoGrid}>
                  <InfoItem label="Address" value={selectedCustomer.address || 'N/A'} />
                  <InfoItem label="GSTIN" value={selectedCustomer.gstin || 'N/A'} />
                  <InfoItem 
                    label="Current Balance" 
                    value={selectedCustomer.ob > 0 ? `OB: ${selectedCustomer.ob.toFixed(3)}g` : `AB: ${selectedCustomer.ab.toFixed(3)}g`}
                    color={selectedCustomer.ob > 0 ? '#EF4444' : '#10B981'}
                  />
                </View>
              </Card>

              {/* Issue Entry Table */}
              <Card style={styles.tableCard}>
                <Text style={styles.tableTitle}>Issue Entry</Text>
                <View style={styles.inputRow}>
                  <TextInput style={[styles.input, {flex: 2}]} placeholder="Item" placeholderTextColor="#9CA3AF" value={issueInput.itemName} onChangeText={t => updateIssueInput('itemName', t)} autoCorrect={false} />
                  <TextInput style={styles.input} placeholder="Gross" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueInput.grossWeight} onChangeText={t => updateIssueInput('grossWeight', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueInput.touch} onChangeText={t => updateIssueInput('touch', t)} />
                  <TouchableOpacity style={styles.addRowBtn} onPress={addIssueItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {issueItems.map(item => (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, {flex: 2}]}>{item.itemName}</Text>
                    <Text style={styles.cell}>{item.grossWeight}</Text>
                    <Text style={styles.cell}>{item.touch}%</Text>
                    <Text style={styles.cellBold}>{item.purity}</Text>
                    <TouchableOpacity onPress={() => setIssueItems(issueItems.filter(i => i.id !== item.id))}>
                      <MaterialCommunityIcons name="close" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.runningTotal}>Total Issue: {totals.issueTotal}g</Text>
              </Card>

              {/* Receipt Entry Table */}
              <Card style={styles.tableCard}>
                <Text style={styles.tableTitle}>Receipt Entry</Text>
                <View style={styles.inputRow}>
                  <TextInput style={[styles.input, {flex: 2}]} placeholder="Item" placeholderTextColor="#9CA3AF" value={receiptInput.itemName} onChangeText={t => updateReceiptInput('itemName', t)} autoCorrect={false} />
                  <TextInput style={styles.input} placeholder="Result" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptInput.result} onChangeText={t => updateReceiptInput('result', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptInput.touch} onChangeText={t => updateReceiptInput('touch', t)} />
                  <TouchableOpacity style={styles.addRowBtn} onPress={addReceiptItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {receiptItems.map(item => (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, {flex: 2}]}>{item.itemName}</Text>
                    <Text style={styles.cell}>{item.result}</Text>
                    <Text style={styles.cell}>{item.touch}%</Text>
                    <Text style={styles.cellBold}>{item.purity}</Text>
                    <TouchableOpacity onPress={() => setReceiptItems(receiptItems.filter(i => i.id !== item.id))}>
                      <MaterialCommunityIcons name="close" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.runningTotal}>Total Receipt: {totals.receiptTotal}g</Text>
              </Card>

              {/* Cash Received Table */}
              <Card style={styles.tableCard}>
                <Text style={styles.tableTitle}>Cash Received</Text>
                <View style={styles.inputRow}>
                  <TextInput style={[styles.input, {flex: 2}]} placeholder="Amount" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={cashInput.amount} onChangeText={t => updateCashInput('amount', t)} />
                  <TextInput style={[styles.input, {flex: 1.5}]} placeholder="FT Rate" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={cashInput.ftRate} onChangeText={t => updateCashInput('ftRate', t)} />
                  <View style={[styles.input, {flex: 1.5, backgroundColor: '#F3F4F6', justifyContent: 'center'}]}>
                    <Text style={{color: '#10B981', fontWeight: 'bold'}}>
                      {cashInput.amount && cashInput.ftRate ? (parseFloat(cashInput.amount) / parseFloat(cashInput.ftRate)).toFixed(3) : 'Pure'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.addRowBtn} onPress={addCashEntry}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {cashEntries.map(item => (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, {flex: 2}]}>₹{item.amount}</Text>
                    <Text style={[styles.cell, {color: '#2563EB'}]}>{item.ftRate}</Text>
                    <Text style={[styles.cellBold, {color: '#10B981'}]}>{item.pure}g</Text>
                    <TouchableOpacity onPress={() => setCashEntries(cashEntries.filter(i => i.id !== item.id))}>
                      <MaterialCommunityIcons name="close" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.runningTotal}>Total Cash Pure: {totals.cashTotalPurity}g</Text>
              </Card>

              {/* Balance Summary */}
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Final Settlement</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{totals.balanceLabel}</Text>
                  <Text style={[styles.summaryValue, { color: totals.balanceColor }]}>{totals.balanceValue}g</Text>
                </View>
                <TouchableOpacity
                  style={[styles.gstToggle, enableGst && styles.gstToggleActive]}
                  onPress={() => setEnableGst(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={enableGst ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={22}
                    color={enableGst ? '#166534' : '#4B5563'}
                  />
                  <View style={styles.gstToggleTextWrap}>
                    <Text style={styles.gstToggleTitle}>Enable GST</Text>
                    <Text style={styles.gstToggleSubtitle}>
                      Save this B2B transaction and copy it to the GST customer page
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.saveBtn}
                  onPress={handleSaveTransaction}
                >
                  <Text style={styles.saveBtnText}>Save Transaction</Text>
                </TouchableOpacity>
              </Card>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const InfoItem = ({ label, value, color }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  searchSection: {
    padding: horizontalPadding,
    paddingBottom: 0,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    minHeight: moderateScale(48),
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(15),
    color: '#111827',
  },
  customerListSection: {
    paddingHorizontal: horizontalPadding,
    paddingTop: spacing.sm,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  customerCardInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: moderateScale(15),
    fontWeight: 'bold',
    color: '#111827',
  },
  customerPhone: {
    fontSize: moderateScale(13),
    color: '#6B7280',
    marginTop: 4,
  },
  balanceText: {
    fontWeight: 'bold',
    fontSize: moderateScale(14),
  },
  selectedSection: {
    padding: horizontalPadding,
  },
  infoCard: {
    marginBottom: spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoName: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: '#111827',
  },
  infoPhone: {
    fontSize: moderateScale(14),
    color: '#6B7280',
    marginTop: 2,
  },
  changeBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
  },
  changeBtnText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: moderateScale(12),
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: moderateScale(14),
    fontWeight: '600',
    color: '#111827',
  },
  tableCard: {
    marginBottom: spacing.lg,
  },
  tableTitle: {
    fontSize: moderateScale(15),
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    marginBottom: spacing.md,
    gap: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    flex: 1,
    minWidth: 0,
    fontSize: moderateScale(14),
    color: '#111827',
  },
  addRowBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    width: 46,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cell: {
    flex: 1,
    fontSize: moderateScale(13),
    color: '#4B5563',
  },
  cellBold: {
    flex: 1,
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: '#111827',
  },
  runningTotal: {
    textAlign: 'right',
    marginTop: spacing.md,
    fontWeight: 'bold',
    color: '#111827',
    fontSize: moderateScale(14),
  },
  summaryCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  summaryTitle: {
    fontSize: moderateScale(16),
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.xl,
  },
  gstToggle: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  gstToggleActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  gstToggleTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  gstToggleTitle: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#111827',
  },
  gstToggleSubtitle: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: moderateScale(15),
    color: '#4B5563',
  },
  summaryValue: {
    fontSize: moderateScale(22),
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    width: '100%',
    maxWidth: 360,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16),
    fontWeight: 'bold',
  },
});

export default B2BCalculationPage;
