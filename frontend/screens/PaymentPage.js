import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert, StyleSheet, Text, View, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import QRCode from 'qrcode';
import Header from '../components/Header';
import { AppContext } from '../context/AppContext';
import { createCustomer, fetchPaymentHistoryFromDb, fetchPaymentItemSuggestions, searchCustomers, savePaymentRecord } from '../services/api';
import { loadGstSettings } from '../services/gstSettings';
import { loadShopProfile } from '../services/shopProfile';
import {
  buildPaymentBillHtml,
  buildSummary,
  getStoredInvoiceSequence,
  getLogoDataUri,
  loadPaymentItemHistory,
  PAYMENT_EDITABLE_INVOICE_KEY,
  reserveNextInvoiceNumber,
  savePaymentItemName,
} from '../utils/paymentUtils';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const createEmptyForm = (invoiceNumber = '') => ({
  userName: '',
  phoneNumber: '',
  address: '',
  gstNo: '',
  invoiceNumber,
  itemName: '',
  weight: '',
  cash: '',
});

const emptyCustomerForm = {
  name: '',
  phone: '',
  address: '',
  gstin: '',
};

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatWeight = (value) => {
  const numeric = toNumber(value);
  if (!numeric) return '';
  return numeric.toFixed(3).replace(/\.?0+$/, '');
};

const PaymentPage = ({ navigation }) => {
  const { ftRate, goldRate } = useContext(AppContext);
  const [form, setForm] = useState(() => createEmptyForm(''));
  const [selectedRateType, setSelectedRateType] = useState('ft');
  const [customers, setCustomers] = useState([]);
  const [itemSuggestions, setItemSuggestions] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [paymentMeta, setPaymentMeta] = useState({ paymentId: '', invoiceNumber: '' });
  const [previousInvoiceNumber, setPreviousInvoiceNumber] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiQrSvg, setUpiQrSvg] = useState('');
  const [loadingQr, setLoadingQr] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingItemSuggestions, setLoadingItemSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerCreateForm, setCustomerCreateForm] = useState(emptyCustomerForm);

  const prepareNextPaymentForm = useCallback(async () => {
    try {
      const payments = await fetchPaymentHistoryFromDb();
      const { currentInvoiceNumber, previousInvoiceNumber: lastInvoiceNumber } = await getStoredInvoiceSequence(
        PAYMENT_EDITABLE_INVOICE_KEY,
        (payments || []).map((item) => item?.invoiceNumber)
      );
      setForm(createEmptyForm(currentInvoiceNumber));
      setPreviousInvoiceNumber(lastInvoiceNumber);
      setSelectedCustomerId('');
      setShowSuggestions(false);
      setShowItemSuggestions(false);
      setPaymentMeta({ paymentId: '', invoiceNumber: '' });
    } catch (error) {
      console.error('prepareNextPaymentForm:', error);
      setForm(createEmptyForm('1'));
      setPreviousInvoiceNumber('');
      setSelectedCustomerId('');
      setShowSuggestions(false);
      setShowItemSuggestions(false);
      setPaymentMeta({ paymentId: '', invoiceNumber: '' });
    }
  }, []);

  const generateQr = useCallback(async (id, amount) => {
    if (!id) { setUpiQrSvg(''); return; }
    const amParam = amount && !Number.isNaN(Number(amount)) && Number(amount) > 0
      ? `&am=${Number(amount).toFixed(2)}`
      : '';
    const upiUrl = `upi://pay?pa=${encodeURIComponent(id)}&pn=Payment${amParam}&cu=INR`;
    try {
      const svg = await QRCode.toString(upiUrl, { type: 'svg', width: 220, margin: 1 });
      setUpiQrSvg(svg);
    } catch {
      setUpiQrSvg('');
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const results = await searchCustomers('');
      setCustomers(Array.isArray(results) ? results : []);
    } catch (error) {
      console.error('loadCustomers:', error);
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  const loadItemSuggestions = useCallback(async (search = '') => {
    setLoadingItemSuggestions(true);
    try {
      const [remoteResults, localResults] = await Promise.all([
        fetchPaymentItemSuggestions(search),
        loadPaymentItemHistory(),
      ]);

      const normalizedSearch = String(search || '').trim().toLowerCase();
      const merged = [...(localResults || []), ...(remoteResults || [])];
      const seen = new Set();
      const unique = merged.filter((name) => {
        const trimmed = String(name || '').trim();
        const normalized = trimmed.toLowerCase();
        if (!trimmed) return false;
        if (normalizedSearch && !normalized.startsWith(normalizedSearch)) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });

      setItemSuggestions(unique.slice(0, 20));
    } catch (error) {
      console.error('loadItemSuggestions:', error);
      setItemSuggestions([]);
    } finally {
      setLoadingItemSuggestions(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingQr(true);
      try {
        const settings = await loadGstSettings();
        const id = settings?.bankDetails?.upiId || '';
        setUpiId(id);
        await generateQr(id, '');
      } catch (error) {
        console.error('PaymentPage load:', error);
      } finally {
        setLoadingQr(false);
      }
    })();
    loadCustomers();
    loadItemSuggestions('');
    prepareNextPaymentForm();
  }, [generateQr, loadCustomers, loadItemSuggestions, prepareNextPaymentForm]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadCustomers);
    return unsubscribe;
  }, [navigation, loadCustomers]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => loadItemSuggestions(''));
    return unsubscribe;
  }, [navigation, loadItemSuggestions]);

  useEffect(() => {
    if (!upiId) return;
    generateQr(upiId, form.cash);
  }, [form.cash, upiId, generateQr]);

  useEffect(() => {
    const rateValue = toNumber(selectedRateType === 'gold' ? goldRate : ftRate);
    const cashValue = toNumber(form.cash);

    if (!form.cash || cashValue <= 0 || rateValue <= 0) {
      if (form.weight !== '') {
        setForm((prev) => ({ ...prev, weight: '' }));
      }
      return;
    }

    const nextWeight = formatWeight(cashValue / rateValue);
    if (nextWeight && form.weight !== nextWeight) {
      setForm((prev) => ({ ...prev, weight: nextWeight }));
    }
  }, [form.cash, form.weight, ftRate, goldRate, selectedRateType]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = form.userName.trim().toLowerCase();
    if (!query) return [];
    return customers
      .filter((customer) => (customer.customerName || '').toLowerCase().startsWith(query))
      .slice(0, 8);
  }, [customers, form.userName]);

  const filteredItemSuggestions = useMemo(() => {
    const query = form.itemName.trim().toLowerCase();
    if (!query) return [];
    return itemSuggestions
      .filter((itemName) => itemName.toLowerCase().startsWith(query))
      .slice(0, 8);
  }, [itemSuggestions, form.itemName]);

  const summaryPreview = useMemo(
    () => buildSummary(form.cash, form.weight, null),
    [form.cash, form.weight]
  );

  const selectedRateValue = selectedRateType === 'gold' ? goldRate : ftRate;
  const selectedRateLabel = selectedRateType === 'gold' ? 'Gold Rate' : 'FT Rate';

  const resetForm = useCallback(() => {
    void prepareNextPaymentForm();
  }, [prepareNextPaymentForm]);

  const handleCustomerNameChange = (value) => {
    setField('userName', value);
    setShowSuggestions(true);
    const matchedCustomer = customers.find((customer) => customer._id === selectedCustomerId);
    if (!matchedCustomer || matchedCustomer.customerName !== value) {
      setSelectedCustomerId('');
    }
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomerId(customer._id || '');
    setForm((prev) => ({
      ...prev,
      userName: customer.customerName || '',
      phoneNumber: customer.phone || '',
      address: customer.address || '',
      gstNo: customer.gstin || '',
    }));
    setShowSuggestions(false);
  };

  const handleItemNameChange = async (value) => {
    setField('itemName', value);
    setShowItemSuggestions(true);
    await loadItemSuggestions(value.trim());
  };

  const handleSelectItemSuggestion = (itemName) => {
    setField('itemName', itemName);
    setShowItemSuggestions(false);
  };

  const openCreateCustomerModal = () => {
    setCustomerCreateForm({
      name: form.userName || '',
      phone: form.phoneNumber || '',
      address: form.address || '',
      gstin: form.gstNo || '',
    });
    setShowCreateCustomerModal(true);
  };

  const closeCreateCustomerModal = () => {
    if (creatingCustomer) return;
    setShowCreateCustomerModal(false);
    setCustomerCreateForm(emptyCustomerForm);
  };

  const setCreateCustomerField = useCallback((key, value) => {
    setCustomerCreateForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleCreateCustomer = async () => {
    if (!customerCreateForm.name.trim() || !customerCreateForm.phone.trim()) {
      Alert.alert('Required', 'Customer name and phone number are required');
      return;
    }

    setCreatingCustomer(true);
    try {
      const response = await createCustomer({
        customerName: customerCreateForm.name.trim(),
        phone: customerCreateForm.phone.trim(),
        address: customerCreateForm.address.trim(),
        gstin: customerCreateForm.gstin.trim(),
        ob: 0,
        ab: 0,
      });

      if (!response?.success || !response.customer) {
        throw new Error(response?.message || 'Failed to create customer');
      }

      await loadCustomers();
      handleSelectCustomer(response.customer);
      setShowCreateCustomerModal(false);
      setCustomerCreateForm(emptyCustomerForm);
      Alert.alert('Success', 'Customer created successfully');
    } catch (error) {
      console.error('handleCreateCustomer error:', error);
      Alert.alert('Error', error.message || 'Failed to create customer.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const validateForm = () => {
    if (!form.userName.trim()) { Alert.alert('Required', 'Enter customer name'); return false; }
    if (!form.phoneNumber.trim()) { Alert.alert('Required', 'Enter phone number'); return false; }
    if (!form.itemName.trim()) { Alert.alert('Required', 'Enter item name'); return false; }
    if (!form.invoiceNumber.trim()) { Alert.alert('Required', 'Enter invoice number'); return false; }
    if (!form.weight || Number.isNaN(Number(form.weight)) || Number(form.weight) <= 0) {
      Alert.alert('Required', 'Enter a valid weight');
      return false;
    }
    if (!form.cash || Number.isNaN(Number(form.cash)) || Number(form.cash) <= 0) {
      Alert.alert('Required', 'Enter a valid cash amount');
      return false;
    }
    return true;
  };

  const persistPayment = async (status) => {
    const gstSettings = await loadGstSettings();
    const summary = buildSummary(form.cash, form.weight, gstSettings);
    summary.rows[0].particular = form.itemName.trim();

    const payload = {
      paymentId: paymentMeta.paymentId || undefined,
      invoiceNumber: form.invoiceNumber.trim(),
      status,
      customerId: selectedCustomerId || undefined,
      customerName: form.userName.trim(),
      phone: form.phoneNumber.trim(),
      address: form.address.trim(),
      gstNo: form.gstNo.trim(),
      itemName: form.itemName.trim(),
      items: [{
        itemName: form.itemName.trim(),
        weight: toNumber(form.weight),
        cash: toNumber(form.cash),
        ftRate: toNumber(selectedRateValue),
      }],
      cash: toNumber(form.cash),
      ftRate: toNumber(selectedRateValue),
      weight: toNumber(form.weight),
      subtotal: toNumber(form.cash),
      cgst: summary.cgst,
      sgst: summary.sgst,
      roundOff: summary.roundOff,
      total: summary.grandTotal,
      invoiceDate: new Date().toISOString(),
    };

    const response = await savePaymentRecord(payload);
    if (!response?.success || !response.payment) {
      throw new Error(response?.message || 'Failed to save payment');
    }

    setPaymentMeta({
      paymentId: response.payment._id || '',
      invoiceNumber: response.payment.invoiceNumber || '',
    });
    setSelectedCustomerId(response.payment.customerId?._id || response.payment.customerId || selectedCustomerId);

    return { payment: response.payment, summary, gstSettings };
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const { payment } = await persistPayment('draft');
      const nextInvoiceNumber = await reserveNextInvoiceNumber(PAYMENT_EDITABLE_INVOICE_KEY, payment.invoiceNumber);
      await savePaymentItemName(form.itemName);
      await loadCustomers();
      await loadItemSuggestions('');
      Alert.alert('Saved', `Payment saved with bill no: ${payment.invoiceNumber}`, [
        {
          text: 'OK',
          onPress: () => {
            setForm(createEmptyForm(nextInvoiceNumber));
            setPreviousInvoiceNumber(payment.invoiceNumber || '');
            setSelectedCustomerId('');
            setShowSuggestions(false);
            setShowItemSuggestions(false);
            setPaymentMeta({ paymentId: '', invoiceNumber: '' });
          }
        }
      ]);
    } catch (error) {
      console.error('handleSave error:', error);
      Alert.alert('Error', error.message || 'Failed to save payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const [{ payment, summary, gstSettings }, profile] = await Promise.all([
        persistPayment('final'),
        loadShopProfile(),
      ]);

      const transaction = {
        customerName: payment.customerName,
        phone: payment.phone,
        address: payment.address,
        gstNo: payment.gstNo,
        invoiceNumber: payment.invoiceNumber,
        invoiceDate: payment.invoiceDate,
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

      const logoSrc = await getLogoDataUri(profile);
      const html = buildPaymentBillHtml(transaction, summary, gstSettings, logoSrc, shopProfileForHtml);

      await reserveNextInvoiceNumber(PAYMENT_EDITABLE_INVOICE_KEY, payment.invoiceNumber);
      await savePaymentItemName(form.itemName);
      await loadCustomers();
      await loadItemSuggestions('');
      await Print.printAsync({ html });

      Alert.alert('Bill Generated', `Invoice: ${payment.invoiceNumber}`, [
        { text: 'OK', onPress: resetForm }
      ]);
    } catch (error) {
      console.error('handleSubmit error:', error);
      Alert.alert('Error', error.message || 'Failed to generate bill. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = saving || submitting;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Payment"
        subtitle="Enter details, save, or generate bill"
        showBack
        onBackPress={() => navigation.goBack()}
        rightIcon="history"
        onRightPress={() => navigation.navigate('PaymentHistory')}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {!!paymentMeta.invoiceNumber && (
            <View style={styles.metaBanner}>
              <MaterialCommunityIcons name="receipt-text-outline" size={18} color="#2563EB" />
              <Text style={styles.metaBannerText}>Current Bill No: {paymentMeta.invoiceNumber}</Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Customer Details</Text>
              <TouchableOpacity style={styles.addBtn} onPress={openCreateCustomerModal}>
                <MaterialCommunityIcons name="plus" size={18} color="#2563EB" />
                <Text style={styles.addBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
            <FormField label="Customer Name">
              <TextInput
                style={styles.input}
                value={form.userName}
                onChangeText={handleCustomerNameChange}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Enter name"
                placeholderTextColor="#9CA3AF"
              />
              {showSuggestions && filteredCustomers.length > 0 && (
                <View style={styles.suggestionList}>
                  {filteredCustomers.map((customer) => (
                    <TouchableOpacity
                      key={customer._id || `${customer.customerName}-${customer.phone}`}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectCustomer(customer)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionTitle}>{customer.customerName}</Text>
                        <Text style={styles.suggestionSub}>
                          {[customer.phone, customer.gstin].filter(Boolean).join('  •  ') || 'Tap to autofill'}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {loadingCustomers && (
                <Text style={styles.helperText}>Loading customer suggestions...</Text>
              )}
            </FormField>
            <FormField label="Phone Number">
              <TextInput
                style={styles.input}
                value={form.phoneNumber}
                onChangeText={(value) => setField('phoneNumber', value)}
                placeholder="Enter phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </FormField>
            <FormField label="Address">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.address}
                onChangeText={(value) => setField('address', value)}
                placeholder="Enter address"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </FormField>
            <FormField label="GST No">
              <TextInput
                style={styles.input}
                value={form.gstNo}
                onChangeText={(value) => setField('gstNo', value)}
                placeholder="Enter GST number"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
              />
            </FormField>
            <FormField label="Invoice No">
              <TextInput
                style={styles.input}
                value={form.invoiceNumber}
                onChangeText={(value) => setField('invoiceNumber', value)}
                placeholder="Enter invoice number"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
              />
              {!!previousInvoiceNumber && (
                <Text style={styles.previousInvoiceText}>
                  Previous Invoice No : {previousInvoiceNumber}
                </Text>
              )}
            </FormField>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Item Details</Text>
              <View style={styles.ratePill}>
                <MaterialCommunityIcons name={selectedRateType === 'gold' ? 'cash-multiple' : 'gold'} size={14} color="#D97706" />
                <Text style={styles.ratePillText}>{selectedRateLabel}: {selectedRateValue}</Text>
              </View>
            </View>
            <View style={styles.rateSelector}>
              <TouchableOpacity
                style={[styles.rateSelectCard, selectedRateType === 'ft' && styles.rateSelectCardActive]}
                onPress={() => setSelectedRateType('ft')}
                activeOpacity={0.85}
              >
                <View style={[styles.rateSelectIcon, selectedRateType === 'ft' && styles.rateSelectIconActive]}>
                  <MaterialCommunityIcons name="gold" size={18} color={selectedRateType === 'ft' ? '#FFFFFF' : '#D97706'} />
                </View>
                <View style={styles.rateSelectTextWrap}>
                  <Text style={[styles.rateSelectLabel, selectedRateType === 'ft' && styles.rateSelectLabelActive]}>FT Rate</Text>
                  <Text style={[styles.rateSelectValue, selectedRateType === 'ft' && styles.rateSelectValueActive]}>Rs {ftRate}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rateSelectCard, selectedRateType === 'gold' && styles.rateSelectCardActive]}
                onPress={() => setSelectedRateType('gold')}
                activeOpacity={0.85}
              >
                <View style={[styles.rateSelectIcon, selectedRateType === 'gold' && styles.rateSelectIconActive]}>
                  <MaterialCommunityIcons name="cash-multiple" size={18} color={selectedRateType === 'gold' ? '#FFFFFF' : '#B45309'} />
                </View>
                <View style={styles.rateSelectTextWrap}>
                  <Text style={[styles.rateSelectLabel, selectedRateType === 'gold' && styles.rateSelectLabelActive]}>Silver Rate</Text>
                  <Text style={[styles.rateSelectValue, selectedRateType === 'gold' && styles.rateSelectValueActive]}>Rs {goldRate}</Text>
                </View>
              </TouchableOpacity>
            </View>
            <FormField label="Item Name">
              <TextInput
                style={styles.input}
                value={form.itemName}
                onChangeText={handleItemNameChange}
                onFocus={() => setShowItemSuggestions(true)}
                placeholder="Enter item name"
                placeholderTextColor="#9CA3AF"
              />
              {showItemSuggestions && filteredItemSuggestions.length > 0 && (
                <View style={styles.suggestionList}>
                  {filteredItemSuggestions.map((itemName) => (
                    <TouchableOpacity
                      key={itemName}
                      style={styles.suggestionItem}
                      onPress={() => handleSelectItemSuggestion(itemName)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionTitle}>{itemName}</Text>
                        <Text style={styles.suggestionSub}>Tap to reuse previous item name</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {loadingItemSuggestions && (
                <Text style={styles.helperText}>Loading item suggestions...</Text>
              )}
            </FormField>
            <View style={styles.row}>
              <View style={styles.rowColLeft}>
                <FormField label="Weight (g)">
                  <TextInput
                    style={[styles.input, styles.readonlyInput]}
                    value={form.weight}
                    placeholder="Auto calculated"
                    placeholderTextColor="#9CA3AF"
                    editable={false}
                  />
                  <Text style={styles.helperText}>Auto calculated as Cash / {selectedRateLabel}</Text>
                </FormField>
              </View>
              <View style={styles.rowColRight}>
                <FormField label="Cash (Rs)">
                  <TextInput
                    style={[styles.input, styles.cashInput]}
                    value={form.cash}
                    onChangeText={(value) => setField('cash', value)}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                  />
                </FormField>
              </View>
            </View>

            <View style={styles.totalPreview}>
              <Text style={styles.totalPreviewLabel}>Estimated Total</Text>
              <Text style={styles.totalPreviewValue}>Rs {summaryPreview.grandTotal.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>UPI Payment</Text>
            {loadingQr ? (
              <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 30 }} />
            ) : upiId ? (
              <View style={styles.qrWrapper}>
                {form.cash !== '' && !Number.isNaN(Number(form.cash)) && Number(form.cash) > 0 && (
                  <View style={styles.amountBadge}>
                    <Text style={styles.amountBadgeText}>Rs {Number(form.cash).toFixed(2)}</Text>
                  </View>
                )}
                {upiQrSvg ? (
                  <View style={styles.qrBox}>
                    <WebView
                      source={{ html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:white;display:flex;justify-content:center;align-items:center;">${upiQrSvg}</body></html>` }}
                      style={styles.qrWebView}
                      scrollEnabled={false}
                    />
                  </View>
                ) : null}
                <Text style={styles.upiLabel}>UPI ID</Text>
                <Text style={styles.upiIdText}>{upiId}</Text>
                <Text style={styles.scanHint}>Scan with any UPI app to pay</Text>
              </View>
            ) : (
              <View style={styles.noUpiWrapper}>
                <MaterialCommunityIcons name="qrcode-remove" size={48} color="#D1D5DB" />
                <Text style={styles.noUpiTitle}>No UPI ID configured</Text>
                <Text style={styles.noUpiSub}>Go to Settings GST Settin Bank Details</Text>
              </View>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveBtn, isBusy && styles.submitBtnDisabled]}
              onPress={handleSave}
              disabled={isBusy}
            >
              {saving ? (
                <ActivityIndicator color="#1D4ED8" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-outline" size={20} color="#1D4ED8" style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, isBusy && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={isBusy}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="printer" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Submit &amp; Generate Bill</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showCreateCustomerModal}
        transparent
        animationType="fade"
        onRequestClose={closeCreateCustomerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Customer</Text>
              <TouchableOpacity onPress={closeCreateCustomerModal} disabled={creatingCustomer}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <FormField label="Customer Name">
              <TextInput
                style={styles.input}
                value={customerCreateForm.name}
                onChangeText={(value) => setCreateCustomerField('name', value)}
                placeholder="Enter name"
                placeholderTextColor="#9CA3AF"
              />
            </FormField>

            <FormField label="Phone Number">
              <TextInput
                style={styles.input}
                value={customerCreateForm.phone}
                onChangeText={(value) => setCreateCustomerField('phone', value)}
                placeholder="Enter phone number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </FormField>

            <FormField label="Address">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={customerCreateForm.address}
                onChangeText={(value) => setCreateCustomerField('address', value)}
                placeholder="Enter address"
                placeholderTextColor="#9CA3AF"
                multiline
              />
            </FormField>

            <FormField label="GST No">
              <TextInput
                style={styles.input}
                value={customerCreateForm.gstin}
                onChangeText={(value) => setCreateCustomerField('gstin', value)}
                placeholder="Enter GST number"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
              />
            </FormField>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={closeCreateCustomerModal}
                disabled={creatingCustomer}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleCreateCustomer}
                disabled={creatingCustomer}
              >
                {creatingCustomer ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Customer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const FormField = ({ label, children }) => (
  <View style={styles.fieldBlock}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: horizontalPadding, paddingBottom: spacing.xl * 2, gap: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
  },
  metaBannerText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: moderateScale(13),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: 12,
  },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: '800', color: '#0F172A' },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratePillText: {
    color: '#B45309',
    fontWeight: '700',
    fontSize: moderateScale(11),
  },
  rateSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.md,
  },
  rateSelectCard: {
    flex: 1,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  rateSelectCardActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  rateSelectIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7ED',
  },
  rateSelectIconActive: {
    backgroundColor: '#2563EB',
  },
  rateSelectTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  rateSelectLabel: {
    color: '#64748B',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  rateSelectLabelActive: {
    color: '#1D4ED8',
  },
  rateSelectValue: {
    color: '#0F172A',
    fontSize: moderateScale(15),
    fontWeight: '800',
    marginTop: 4,
  },
  rateSelectValueActive: {
    color: '#1E3A8A',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  addBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: moderateScale(12),
  },
  row: { flexDirection: 'row' },
  rowColLeft: { flex: 1, marginRight: 10 },
  rowColRight: { flex: 1 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: moderateScale(13), fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: moderateScale(14),
    color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  textArea: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  readonlyInput: {
    backgroundColor: '#F1F5F9',
    color: '#0F172A',
    fontWeight: '700',
  },
  cashInput: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    fontWeight: '700',
  },
  helperText: {
    marginTop: 6,
    color: '#64748B',
    fontSize: moderateScale(11),
  },
  previousInvoiceText: {
    marginTop: 6,
    color: '#94A3B8',
    fontSize: moderateScale(11),
    fontWeight: '500',
  },
  suggestionList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionTitle: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#0F172A',
  },
  suggestionSub: {
    marginTop: 2,
    fontSize: moderateScale(11),
    color: '#64748B',
  },
  totalPreview: {
    marginTop: 2,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPreviewLabel: {
    color: '#475569',
    fontWeight: '600',
    fontSize: moderateScale(12),
  },
  totalPreviewValue: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: moderateScale(15),
  },
  qrWrapper: { alignItems: 'center', paddingVertical: 8 },
  amountBadge: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 16,
  },
  amountBadgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(18) },
  qrBox: {
    width: 220,
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  qrWebView: { width: 220, height: 220, backgroundColor: 'white' },
  upiLabel: {
    fontSize: moderateScale(11),
    color: '#9CA3AF',
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  upiIdText: {
    fontSize: moderateScale(15),
    color: '#2563EB',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  scanHint: { fontSize: moderateScale(12), color: '#6B7280', textAlign: 'center' },
  noUpiWrapper: { alignItems: 'center', paddingVertical: 24 },
  noUpiTitle: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#4B5563',
    marginTop: 12,
    marginBottom: 6,
  },
  noUpiSub: { fontSize: moderateScale(13), color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: moderateScale(17),
    fontWeight: '800',
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: moderateScale(14),
  },
  modalSaveBtn: {
    flex: 1.3,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(14),
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: moderateScale(15),
  },
  submitBtn: {
    flex: 1.4,
    backgroundColor: '#1C2B3A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(15) },
});

export default PaymentPage;
