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
import { fetchAllCustomers, fetchRecentTransactions, saveTransaction } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import { AppContext } from '../context/AppContext';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { getCustomerBalanceDisplay, getDueBalanceDisplay } from '../utils/balanceDisplay';

const buildItemHistory = (transactions = []) => {
  const seen = new Set();
  const names = [];

  transactions.forEach((txn) => {
    [...(txn.issueItems || []), ...(txn.receiptItems || [])].forEach((item) => {
      const trimmed = String(item?.itemName || '').trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) return;
      seen.add(key);
      names.push(trimmed);
    });
  });

  return names;
};

const filterSuggestions = (items, query) => {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return [];

  return items
    .filter((name) => name.toLowerCase().includes(normalized))
    .slice(0, 6);
};

const B2BCalculationPage = ({ navigation }) => {
  const { ftRate } = useContext(AppContext);
  // State for Customer Management
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [itemHistory, setItemHistory] = useState([]);

  // State for Transaction
  const [issueItems, setIssueItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [cashEntries, setCashEntries] = useState([]);
  const [enableGst, setEnableGst] = useState(false);

  // State for Row Inputs
  const [issueInput, setIssueInput] = useState({ itemName: '', grossWeight: '', touch: '' });
  const [receiptInput, setReceiptInput] = useState({ itemName: '', weight: '', result: '', touch: '' });
  const [cashInput, setCashInput] = useState({ amount: '', ftRate: '', cashType: 'Cash', notes: '' });
  const [issueAdvInput, setIssueAdvInput] = useState({ itemName: '', weight: '', touch: '' });
  const [receiptAdvInput, setReceiptAdvInput] = useState({ itemName: '', weight: '', sub: '', touch: '' });
  const [issueSuggestOpen, setIssueSuggestOpen] = useState(false);
  const [receiptSuggestOpen, setReceiptSuggestOpen] = useState(false);
  const [issueAdvSuggestOpen, setIssueAdvSuggestOpen] = useState(false);
  const [receiptAdvSuggestOpen, setReceiptAdvSuggestOpen] = useState(false);

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

  const updateIssueAdvInput = (field, value) => setIssueAdvInput(prev => ({ ...prev, [field]: value }));
  const updateReceiptAdvInput = (field, value) => setReceiptAdvInput(prev => ({ ...prev, [field]: value }));

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
      const [data, transactions] = await Promise.all([
        fetchAllCustomers(),
        fetchRecentTransactions(200),
      ]);
      const normalized = (data || []).map(c => ({ ...c, name: c.name || c.customerName || '' }));
      setCustomers(normalized);
      setFilteredCustomers(normalized);
      setItemHistory(buildItemHistory(transactions));
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

  const addAdvIssueItem = () => {
    const weight = parseFloat(issueAdvInput.weight) || 0;
    const rate = parseFloat(ftRate) || 1;
    const touch = parseFloat(issueAdvInput.touch) || 0;
    if (!issueAdvInput.itemName || weight === 0) return;
    const gross = weight / rate;
    const purity = (gross * touch) / 100;
    setIssueItems([...issueItems, {
      itemName: issueAdvInput.itemName,
      id: Date.now(),
      grossWeight: parseFloat(gross.toFixed(3)),
      touch,
      purity: parseFloat(purity.toFixed(3)),
      netWeight: parseFloat(gross.toFixed(3)),
    }]);
    setIssueAdvInput({ itemName: '', weight: '', touch: '' });
  };

  const addAdvReceiptItem = () => {
    const weight = parseFloat(receiptAdvInput.weight) || 0;
    const sub = parseFloat(receiptAdvInput.sub) || 0;
    const touch = parseFloat(receiptAdvInput.touch) || 0;
    if (!receiptAdvInput.itemName || weight === 0) return;
    const result = weight - sub;
    const purity = (result * touch) / 100;
    setReceiptItems([...receiptItems, {
      itemName: receiptAdvInput.itemName,
      id: Date.now(),
      weight,
      result: parseFloat(result.toFixed(3)),
      touch,
      purity: parseFloat(purity.toFixed(3)),
    }]);
    setReceiptAdvInput({ itemName: '', weight: '', sub: '', touch: '' });
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
      balanceDisplay: getDueBalanceDisplay(finalBalance)
    };
  }, [issueItems, receiptItems, cashEntries, selectedCustomer]);

  const issueSuggestions = useMemo(
    () => filterSuggestions(itemHistory, issueInput.itemName),
    [itemHistory, issueInput.itemName]
  );
  const receiptSuggestions = useMemo(
    () => filterSuggestions(itemHistory, receiptInput.itemName),
    [itemHistory, receiptInput.itemName]
  );
  const issueAdvSuggestions = useMemo(
    () => filterSuggestions(itemHistory, issueAdvInput.itemName),
    [itemHistory, issueAdvInput.itemName]
  );
  const receiptAdvSuggestions = useMemo(
    () => filterSuggestions(itemHistory, receiptAdvInput.itemName),
    [itemHistory, receiptAdvInput.itemName]
  );
  const issueAdvCalc = useMemo(() => {
    const w = parseFloat(issueAdvInput.weight) || 0;
    const rate = parseFloat(ftRate) || 1;
    const t = parseFloat(issueAdvInput.touch) || 0;
    if (!w) return null;
    const gross = w / rate;
    return { gross: gross.toFixed(3), purity: ((gross * t) / 100).toFixed(3) };
  }, [issueAdvInput, ftRate]);
  const receiptAdvCalc = useMemo(() => {
    const w = parseFloat(receiptAdvInput.weight) || 0;
    const s = parseFloat(receiptAdvInput.sub) || 0;
    const t = parseFloat(receiptAdvInput.touch) || 0;
    if (!w) return null;
    const result = w - s;
    return { result: result.toFixed(3), purity: ((result * t) / 100).toFixed(3) };
  }, [receiptAdvInput]);

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
        const savedBalanceDisplay = getDueBalanceDisplay(data.bill?.finalBalance ?? totals.finalBalance);
        Alert.alert(
          '✅ Transaction Saved',
          `Bill No: #${data.billNo}\nFinal Balance: ${savedBalanceDisplay.label} : ${savedBalanceDisplay.value}`,
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
                filteredCustomers.map((item) => {
                  const balanceDisplay = getCustomerBalanceDisplay(item);

                  return (
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
                      <View
                        style={[
                          styles.customerCardBalance,
                          { backgroundColor: balanceDisplay.bg, borderColor: balanceDisplay.border }
                        ]}
                      >
                        <Text style={[styles.balanceText, { color: balanceDisplay.color }]}>
                          {balanceDisplay.label} : {balanceDisplay.value}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
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
                    balanceDisplay={getCustomerBalanceDisplay(selectedCustomer)}
                  />
                </View>
              </Card>

              {/* Issue Entry Table */}
              <Card style={styles.tableCard}>
                <Text style={styles.tableTitle}>Issue Entry</Text>
                <View style={styles.inputRow}>
                  <View style={styles.itemSuggestWrap}>
                    <TextInput style={styles.input} placeholder="Item" placeholderTextColor="#9CA3AF" value={issueInput.itemName} onChangeText={t => { updateIssueInput('itemName', t); setIssueSuggestOpen(true); }} autoCorrect={false} />
                    <SuggestionDropdown
                      suggestions={issueSuggestions}
                      visible={issueSuggestOpen}
                      onSelect={(name) => { updateIssueInput('itemName', name); setIssueSuggestOpen(false); }}
                    />
                  </View>
                  <TextInput style={styles.input} placeholder="Weight" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueInput.grossWeight} onChangeText={t => updateIssueInput('grossWeight', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueInput.touch} onChangeText={t => updateIssueInput('touch', t)} />
                  <TouchableOpacity style={styles.addRowBtn} onPress={addIssueItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {/* Advanced Row: Weight ÷ FT Rate */}
                <View style={styles.advRowDivider}>
                  <View style={styles.advDividerLine} />
                  <Text style={styles.advDividerLabel}>W ÷ FT Rate</Text>
                  <View style={styles.advDividerLine} />
                </View>
                <View style={[styles.inputRow, { zIndex: 4 }]}>
                  <View style={[styles.itemSuggestWrap, { zIndex: 8 }]}>
                    <TextInput style={styles.input} placeholder="Item" placeholderTextColor="#9CA3AF" value={issueAdvInput.itemName} onChangeText={t => { updateIssueAdvInput('itemName', t); setIssueAdvSuggestOpen(true); }} autoCorrect={false} />
                    <SuggestionDropdown suggestions={issueAdvSuggestions} visible={issueAdvSuggestOpen} onSelect={name => { updateIssueAdvInput('itemName', name); setIssueAdvSuggestOpen(false); }} />
                  </View>
                  <TextInput style={styles.input} placeholder="Weight" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueAdvInput.weight} onChangeText={t => updateIssueAdvInput('weight', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={issueAdvInput.touch} onChangeText={t => updateIssueAdvInput('touch', t)} />
                  <TouchableOpacity style={styles.addRowBtn} onPress={addAdvIssueItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {issueAdvInput.weight ? (
                  <View style={styles.advCalcHint}>
                    <Text style={styles.advCalcText}>
                      {issueAdvInput.weight} ÷ ₹{ftRate} = {issueAdvCalc?.gross ?? '0'}g{issueAdvInput.touch ? `  ×  ${issueAdvInput.touch}%  →  Pure: ${issueAdvCalc?.purity ?? '0'}g` : ''}
                    </Text>
                  </View>
                ) : null}
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
                  <View style={styles.itemSuggestWrap}>
                    <TextInput style={styles.input} placeholder="Item" placeholderTextColor="#9CA3AF" value={receiptInput.itemName} onChangeText={t => { updateReceiptInput('itemName', t); setReceiptSuggestOpen(true); }} autoCorrect={false} />
                    <SuggestionDropdown
                      suggestions={receiptSuggestions}
                      visible={receiptSuggestOpen}
                      onSelect={(name) => { updateReceiptInput('itemName', name); setReceiptSuggestOpen(false); }}
                    />
                  </View>
                  <TextInput style={styles.input} placeholder="Weight" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptInput.result} onChangeText={t => updateReceiptInput('result', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptInput.touch} onChangeText={t => updateReceiptInput('touch', t)} />
                  <TouchableOpacity style={styles.addRowBtn} onPress={addReceiptItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {/* Advanced Row: Weight − Sub */}
                <View style={styles.advRowDivider}>
                  <View style={styles.advDividerLine} />
                  <Text style={styles.advDividerLabel}>W − Sub</Text>
                  <View style={styles.advDividerLine} />
                </View>
                <View style={[styles.inputRow, { zIndex: 4 }]}>
                  <View style={[styles.itemSuggestWrap, { flex: 3, zIndex: 8 }]}>
                    <TextInput style={styles.input} placeholder="Item" placeholderTextColor="#9CA3AF" value={receiptAdvInput.itemName} onChangeText={t => { updateReceiptAdvInput('itemName', t); setReceiptAdvSuggestOpen(true); }} autoCorrect={false} />
                    <SuggestionDropdown suggestions={receiptAdvSuggestions} visible={receiptAdvSuggestOpen} onSelect={name => { updateReceiptAdvInput('itemName', name); setReceiptAdvSuggestOpen(false); }} />
                  </View>
                  <TextInput style={styles.input} placeholder="Weight" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptAdvInput.weight} onChangeText={t => updateReceiptAdvInput('weight', t)} />
                </View>
                <View style={[styles.inputRow, { zIndex: 3, marginTop: -4 }]}>
                  <TextInput style={styles.input} placeholder="Sub" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptAdvInput.sub} onChangeText={t => updateReceiptAdvInput('sub', t)} />
                  <TextInput style={styles.input} placeholder="Touch%" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={receiptAdvInput.touch} onChangeText={t => updateReceiptAdvInput('touch', t)} />
                  <View style={[styles.input, { flex: 1.5, backgroundColor: '#F3F4F6', justifyContent: 'center' }]}>
                    <Text style={{ color: receiptAdvCalc ? '#10B981' : '#9CA3AF', fontWeight: receiptAdvCalc ? 'bold' : 'normal', fontSize: 13 }}>
                      {receiptAdvCalc ? `${receiptAdvCalc.purity}g` : 'Pure'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.addRowBtn} onPress={addAdvReceiptItem}>
                    <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {receiptAdvInput.weight ? (
                  <View style={styles.advCalcHint}>
                    <Text style={styles.advCalcText}>
                      {receiptAdvInput.weight} − {receiptAdvInput.sub || '0'} = {receiptAdvCalc?.result ?? '0'}g{receiptAdvInput.touch ? `  ×  ${receiptAdvInput.touch}%  →  Pure: ${receiptAdvCalc?.purity ?? '0'}g` : ''}
                    </Text>
                  </View>
                ) : null}
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
                  <Text style={[styles.summaryLabel, { color: totals.balanceDisplay.color }]}>
                    {totals.balanceDisplay.label} :
                  </Text>
                  <Text style={[styles.summaryValue, { color: totals.balanceDisplay.color }]}>
                    {totals.balanceDisplay.value}
                  </Text>
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

const InfoItem = ({ label, value, color, balanceDisplay }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    {balanceDisplay ? (
      <View
        style={[
          styles.infoBalancePill,
          { backgroundColor: balanceDisplay.bg, borderColor: balanceDisplay.border }
        ]}
      >
        <Text style={[styles.infoBalanceText, { color: balanceDisplay.color }]}>
          {balanceDisplay.label} : {balanceDisplay.value}
        </Text>
      </View>
    ) : (
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
    )}
  </View>
);

const SuggestionDropdown = ({ suggestions, visible, onSelect }) => {
  if (!visible || !suggestions.length) return null;

  return (
    <View style={styles.suggestionMenu}>
      {suggestions.map((name) => (
        <TouchableOpacity
          key={name}
          style={styles.suggestionItem}
          onPress={() => onSelect(name)}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="history" size={14} color="#64748B" />
          <Text style={styles.suggestionText}>{name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

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
  customerCardBalance: {
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 126,
    alignItems: 'center',
  },
  balanceText: {
    fontWeight: '900',
    fontSize: moderateScale(12),
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
  infoBalancePill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoBalanceText: {
    fontSize: moderateScale(13),
    fontWeight: '900',
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
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: 8,
    zIndex: 5,
  },
  itemSuggestWrap: {
    flex: 2,
    minWidth: 0,
    position: 'relative',
    zIndex: 10,
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
  suggestionMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 20,
  },
  suggestionItem: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: {
    flex: 1,
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#1F2937',
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
  advRowDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  advDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  advDividerLabel: {
    marginHorizontal: 8,
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  advCalcHint: {
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  advCalcText: {
    fontSize: moderateScale(12),
    color: '#065F46',
    fontWeight: '500',
  },
});

export default B2BCalculationPage;
