import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import Card from '../components/Card';
import {
  getStoredOrComputedNextInvoice,
  GST_EDITABLE_INVOICE_KEY,
  reserveNextInvoiceNumber,
} from '../utils/paymentUtils';
import {
  createGstCustomer,
  deleteGstCustomer,
  fetchGstCustomerById,
  fetchGstCustomers,
  updateGstCustomer
} from '../services/api';
import { AppContext } from '../context/AppContext';
import { AuthContext } from '../context/AuthContext';
import { loadGstSettings } from '../services/gstSettings';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const createEmptyLineItem = (index = 0) => ({
  sno: index + 1,
  particular: '',
  hsnCode: '',
  weight: '',
  rate: '',
  taxableValue: '',
  cgst: '',
  sgst: '',
  total: ''
});

const createInitialForm = (settings = null, ftRateValue = '', invoiceNumber = '') => applyGstSettingsToForm({
  customerName: '',
  phone: '',
  address: '',
  gstNumber: '',
  invoiceNumber,
  invoiceDate: formatInputDate(new Date()),
  totalInvoiceValue: '',
  billDetails: [createEmptyLineItem(0)],
  bankDetails: {
    bankAccountName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    upiId: ''
  }
}, settings, ftRateValue);

const GSTCustomerPage = ({ navigation }) => {
  const { ftRate } = useContext(AppContext);
  const { gstBillEnabled } = useContext(AuthContext);
  const scrollRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gstCustomers, setGstCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [gstSettings, setGstSettings] = useState(null);
  const [formState, setFormState] = useState(() => createInitialForm(null, ftRate));

  const prepareNextGstForm = useCallback(async (items = gstCustomers) => {
    const nextInvoiceNumber = await getStoredOrComputedNextInvoice(
      GST_EDITABLE_INVOICE_KEY,
      (items || []).map((item) => item?.invoiceNumber)
    );
    setEditingId(null);
    setFormState(createInitialForm(gstSettings, ftRate, nextInvoiceNumber));
  }, [gstCustomers, gstSettings, ftRate]);

  const computedTotal = useMemo(() => (
    formState.billDetails.reduce((sum, item) => sum + toNumber(item.total), 0).toFixed(2)
  ), [formState.billDetails]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return gstCustomers;
    return gstCustomers.filter((item) => (
      (item.customerName || '').toLowerCase().includes(query) ||
      (item.invoiceNumber || '').toLowerCase().includes(query) ||
      (item.phone || '').toLowerCase().includes(query)
    ));
  }, [searchQuery, gstCustomers]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchGstCustomers();
      setGstCustomers(items);
      if (!editingId) {
        const nextInvoiceNumber = await getStoredOrComputedNextInvoice(
          GST_EDITABLE_INVOICE_KEY,
          items.map((item) => item?.invoiceNumber)
        );
        setFormState((prev) => (
          prev.invoiceNumber
            ? prev
            : createInitialForm(gstSettings, ftRate, nextInvoiceNumber)
        ));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load GST customers');
    } finally {
      setLoading(false);
    }
  }, [editingId, ftRate, gstSettings]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadTransactions);
    return unsubscribe;
  }, [navigation, loadTransactions]);

  const loadSettings = useCallback(async () => {
    const settings = await loadGstSettings();
    setGstSettings(settings);
    setFormState((prev) => {
      if (editingId) {
        return prev;
      }
      const next = applyGstSettingsToForm(prev, settings, ftRate);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [editingId, ftRate]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadSettings);
    return unsubscribe;
  }, [navigation, loadSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setFormState((prev) => {
      if (prev.totalInvoiceValue === computedTotal) return prev;
      return { ...prev, totalInvoiceValue: computedTotal };
    });
  }, [computedTotal]);

  useEffect(() => {
    setFormState((prev) => {
      const next = applyGstSettingsToForm(prev, gstSettings, ftRate);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [ftRate, gstSettings]);

  const resetForm = useCallback(() => {
    void prepareNextGstForm();
  }, [prepareNextGstForm]);

  const handleChangeField = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangeBankField = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      bankDetails: {
        ...prev.bankDetails,
        [field]: value
      }
    }));
  };

  const handleLineItemChange = (index, field, value) => {
    setFormState((prev) => {
      const updatedRows = prev.billDetails.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return { ...row, sno: rowIndex + 1 };
        }

        const nextRow = { ...row, [field]: value, sno: rowIndex + 1 };
        return recomputeBillRow(nextRow, field, buildRowFallbacks(gstSettings, ftRate));
      });

      return {
        ...prev,
        billDetails: updatedRows
      };
    });
  };

  const addLineItem = () => {
    setFormState((prev) => ({
      ...prev,
      billDetails: [
        ...prev.billDetails,
        recomputeBillRow(
          {
            ...createEmptyLineItem(prev.billDetails.length),
            rate: ftRate || ''
          },
          'rate',
          buildRowFallbacks(gstSettings, ftRate)
        )
      ]
    }));
  };

  const removeLineItem = (index) => {
    setFormState((prev) => {
      const nextRows = prev.billDetails.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...prev,
        billDetails: nextRows.length > 0 ? nextRows.map((row, rowIndex) => ({ ...row, sno: rowIndex + 1 })) : [createEmptyLineItem(0)]
      };
    });
  };

  const handleSave = async () => {
    if (!formState.customerName.trim()) {
      Alert.alert('Required', 'Customer name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(formState, gstSettings, ftRate);
      const response = editingId
        ? await updateGstCustomer(editingId, payload)
        : await createGstCustomer(payload);

      if (!response.success) {
        Alert.alert('Error', response.message || 'Failed to save GST transaction');
        return;
      }

      await reserveNextInvoiceNumber(GST_EDITABLE_INVOICE_KEY, payload.invoiceNumber);
      Alert.alert('Success', editingId ? 'GST transaction updated' : 'GST transaction saved');
      resetForm();
      loadTransactions();
    } catch (error) {
      Alert.alert('Error', 'Failed to save GST transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id) => {
    try {
      const latestSettings = await loadGstSettings();
      const transaction = await fetchGstCustomerById(id);
      if (!transaction) {
        Alert.alert('Error', 'GST transaction not found');
        return;
      }

      setGstSettings(latestSettings);
      setEditingId(id);
      setExpandedId(id);
      setFormState(applyGstSettingsToForm(mapTransactionToForm(transaction, true), latestSettings, ftRate));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch GST transaction');
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Delete GST Customer', 'Do you want to remove this GST transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const response = await deleteGstCustomer(id);
          if (!response.success) {
            Alert.alert('Error', response.message || 'Failed to delete GST transaction');
            return;
          }
          if (editingId === id) {
            resetForm();
          }
          setExpandedId((prev) => (prev === id ? null : prev));
          loadTransactions();
        }
      }
    ]);
  };

  const handlePrint = (item) => {
    if (!item?._id) {
      Alert.alert('Error', 'GST transaction not found');
      return;
    }
    navigation.navigate('GSTBillPreview', { transactionId: item._id });
  };

  if (!gstBillEnabled) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="GST Customers" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.accessDenied}>
          <MaterialCommunityIcons name="lock-outline" size={52} color="#C4B5FD" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>Your account does not have GST billing access. Contact admin to enable it.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="GST Customers"
        subtitle="Search, edit and print GST-ready transactions"
        showBack={true}
        onBackPress={() => navigation.goBack()}
        rightIcon="refresh"
        onRightPress={loadTransactions}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* <View style={styles.heroCard}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>GST Workspace</Text>
              <Text style={styles.heroSubtitle}>
                Every GST-enabled B2B save lands here with customer snapshot and transaction items ready to edit.
              </Text>
            </View>
            <TouchableOpacity style={styles.heroBadge} onPress={() => navigation.navigate('GSTSettings')}>
              <MaterialCommunityIcons name="file-cog-outline" size={24} color="#166534" />
            </TouchableOpacity>
          </View> */}

          {/* <View style={styles.searchWrap}>
            <View style={styles.searchInputWrap}>
              <MaterialCommunityIcons name="magnify" size={20} color="#6B7280" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search GST customers, invoice or phone"
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View> */}

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Customer Entry</Text>
            <View style={styles.twoColRow}>
              <LabeledInput label="Customer Name *" value={formState.customerName} onChangeText={(value) => handleChangeField('customerName', value)} />
              <LabeledInput label="Phone Number" value={formState.phone} onChangeText={(value) => handleChangeField('phone', value)} keyboardType="phone-pad" />
            </View>
            <LabeledInput
              label="Address"
              value={formState.address}
              onChangeText={(value) => handleChangeField('address', value)}
              multiline={true}
              inputStyle={styles.addressInput}
            />
            <View style={styles.twoColRow}>
              <LabeledInput label="GST Number" value={formState.gstNumber} onChangeText={(value) => handleChangeField('gstNumber', value)} />
              <LabeledInput label="Invoice Number" value={formState.invoiceNumber} onChangeText={(value) => handleChangeField('invoiceNumber', value)} />
            </View>
            <View style={styles.twoColRow}>
              <LabeledInput label="Date" value={formState.invoiceDate} onChangeText={(value) => handleChangeField('invoiceDate', value)} />
              <LabeledInput label="Total Invoice Value" value={formState.totalInvoiceValue} onChangeText={(value) => handleChangeField('totalInvoiceValue', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
            </View>
          </Card>

          <Card style={styles.formCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Bill Details</Text>
              <TouchableOpacity style={styles.pillButton} onPress={addLineItem}>
                <MaterialCommunityIcons name="plus" size={16} color="#166534" />
                <Text style={styles.pillButtonText}>Add Item</Text>
              </TouchableOpacity>
            </View>

            {formState.billDetails.map((row, index) => (
              <View key={`row-${index}`} style={styles.billRowCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle}>Row {index + 1}</Text>
                  {formState.billDetails.length > 1 && (
                    <TouchableOpacity style={styles.removeButton} onPress={() => removeLineItem(index)}>
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.threeColRow}>
                  <LabeledInput label="Sno" value={String(index + 1)} editable={false} />
                  <LabeledInput label="Particular" value={row.particular} onChangeText={(value) => handleLineItemChange(index, 'particular', value)} />
                  <LabeledInput label="HSN Code" value={row.hsnCode} onChangeText={(value) => handleLineItemChange(index, 'hsnCode', value)} />
                </View>
                <View style={styles.threeColRow}>
                  <LabeledInput label="Weight" value={String(row.weight ?? '')} onChangeText={(value) => handleLineItemChange(index, 'weight', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                  <LabeledInput label="Rate" value={String(row.rate ?? '')} onChangeText={(value) => handleLineItemChange(index, 'rate', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                  <LabeledInput label="Taxable Value" value={String(row.taxableValue ?? '')} onChangeText={(value) => handleLineItemChange(index, 'taxableValue', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                </View>
                <View style={styles.threeColRow}>
                  <LabeledInput label={`CGST (${gstSettings?.cgstPercent || '1.5'}%)`} value={String(row.cgst ?? '')} onChangeText={(value) => handleLineItemChange(index, 'cgst', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                  <LabeledInput label={`SGST (${gstSettings?.sgstPercent || '1.5'}%)`} value={String(row.sgst ?? '')} onChangeText={(value) => handleLineItemChange(index, 'sgst', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                  <LabeledInput label="Total" value={String(row.total ?? '')} onChangeText={(value) => handleLineItemChange(index, 'total', value)} keyboardType={DECIMAL_KEYBOARD_TYPE} />
                </View>
              </View>
            ))}
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <View style={styles.twoColRow}>
              <LabeledInput label="Bank Account Name" value={formState.bankDetails.bankAccountName} onChangeText={(value) => handleChangeBankField('bankAccountName', value)} />
              <LabeledInput label="Account Number" value={formState.bankDetails.accountNumber} onChangeText={(value) => handleChangeBankField('accountNumber', value)} />
            </View>
            <View style={styles.twoColRow}>
              <LabeledInput label="IFSC Code" value={formState.bankDetails.ifscCode} onChangeText={(value) => handleChangeBankField('ifscCode', value)} />
              <LabeledInput label="Branch" value={formState.bankDetails.branch} onChangeText={(value) => handleChangeBankField('branch', value)} />
            </View>
            <LabeledInput label="UPI ID" value={formState.bankDetails.upiId} onChangeText={(value) => handleChangeBankField('upiId', value)} />
          </Card>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editingId ? 'Update Customer' : 'Save Customer'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('GSTBillPreview', { transactionId: editingId })}
              disabled={!editingId}
            >
              <Text style={styles.secondaryButtonText}>Print Bill</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostButton} onPress={resetForm}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>GST Customers</Text>
            <TouchableOpacity onPress={loadTransactions}>
              <Text style={styles.refreshText}>{loading ? 'Loading...' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>

          {filteredCustomers.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No GST customers found</Text>
              <Text style={styles.emptySubtitle}>Enable GST while saving a B2B transaction or create one here.</Text>
            </Card>
          ) : (
            filteredCustomers.map((item) => {
              const expanded = expandedId === item._id;

              return (
                <Card key={item._id} style={styles.customerCard}>
                  <View style={styles.customerCardTop}>
                    <TouchableOpacity style={styles.customerNameWrap} onPress={() => setExpandedId(expanded ? null : item._id)}>
                      <Text style={styles.customerCardName}>{item.customerName}</Text>
                      <Text style={styles.tapHint}>{expanded ? 'Hide transaction details' : 'Tap to view transaction details'}</Text>
                    </TouchableOpacity>

                    <View style={styles.cardActionColumn}>
                      <MiniAction label="Print" backgroundColor="#DCFCE7" textColor="#166534" onPress={() => handlePrint(item)} />
                      <MiniAction label="Edit" backgroundColor="#DBEAFE" textColor="#1D4ED8" onPress={() => handleEdit(item._id)} />
                      <MiniAction label="Delete" backgroundColor="#FEE2E2" textColor="#B91C1C" onPress={() => handleDelete(item._id)} />
                    </View>
                  </View>

                  {expanded && (
                    <View style={styles.expandedDetailWrap}>
                      <InfoText label="Phone" value={item.phone || '-'} />
                      <InfoText label="Invoice" value={item.invoiceNumber || '-'} />
                      <InfoText label="GST No" value={item.gstNumber || '-'} />
                      <InfoText label="Total Invoice" value={formatCurrency(item.totalInvoiceValue)} />
                      <InfoText label="Date" value={formatDisplayDate(item.invoiceDate)} />
                      <View style={styles.divider} />
                      {(item.billDetails || []).map((row, index) => (
                        <View key={`${item._id}-row-${index}`} style={styles.expandedRow}>
                          <Text style={styles.expandedRowTitle}>{row.particular || `Item ${index + 1}`}</Text>
                          <Text style={styles.expandedRowMeta}>
                            HSN: {row.hsnCode || '-'} | Weight: {formatNumber(row.weight)} | Total: {formatCurrency(row.total)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const DECIMAL_KEYBOARD_TYPE = Platform.OS === 'ios' ? 'decimal-pad' : 'numeric';

const LabeledInput = ({ label, inputStyle, ...props }) => (
  <View style={styles.inputBlock}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.textInput, inputStyle]}
      placeholderTextColor="#94A3B8"
      autoCorrect={false}
      {...props}
    />
  </View>
);

const MiniAction = ({ label, backgroundColor, textColor, onPress }) => (
  <TouchableOpacity style={[styles.miniAction, { backgroundColor }]} onPress={onPress}>
    <Text style={[styles.miniActionText, { color: textColor }]}>{label}</Text>
  </TouchableOpacity>
);

const InfoText = ({ label, value }) => (
  <Text style={styles.infoText}>
    {label}: {value}
  </Text>
);

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNum = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
};

const formatDecimal = (value, digits = 2) => {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '';
};

const getDisplayValue = (field, changedField, rawValue, computedValue, digits) => {
  if (field === changedField) {
    return rawValue;
  }

  return formatDecimal(computedValue, digits);
};

function buildRowFallbacks(settings, ftRateValue) {
  return {
    rate: ftRateValue,
    hsnCode: settings?.hsnCode || '',
    cgstPercent: toNum(settings?.cgstPercent, 1.5),
    sgstPercent: toNum(settings?.sgstPercent, 1.5),
    igstPercent: toNum(settings?.igstPercent, 3),
    gstPercentage: toNum(settings?.gstPercentage, 3),
  };
}

function applyGstSettingsToForm(form, settings, ftRateValue) {
  const rows = Array.isArray(form?.billDetails) && form.billDetails.length > 0
    ? form.billDetails
    : [createEmptyLineItem(0)];

  const fallbacks = buildRowFallbacks(settings, ftRateValue);

  return {
    ...form,
    billDetails: rows.map((row, index) => recomputeBillRow(
      {
        ...row,
        sno: index + 1,
      },
      '',
      fallbacks
    )),
    bankDetails: {
      bankAccountName: form?.bankDetails?.bankAccountName || settings?.bankDetails?.bankAccountName || '',
      accountNumber: form?.bankDetails?.accountNumber || settings?.bankDetails?.accountNumber || '',
      ifscCode: form?.bankDetails?.ifscCode || settings?.bankDetails?.ifscCode || '',
      branch: form?.bankDetails?.branch || settings?.bankDetails?.branch || '',
      upiId: form?.bankDetails?.upiId || settings?.bankDetails?.upiId || '',
    },
  };
}

function formatInputDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDisplayDate(value) {
  const parsed = parseDateString(value);
  return parsed ? formatInputDate(parsed) : '-';
}

function parseDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' && value.includes('/')) {
    const [day, month, year] = value.split('/');
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateForApi(value) {
  const parsed = parseDateString(value);
  return parsed ? parsed.toISOString() : new Date().toISOString();
}

function recomputeBillRow(row, changedField, fallbackValues = {}) {
  const fallbacks = {
    weight: toNum(fallbackValues.weight, NaN),
    rate: toNum(fallbackValues.rate, NaN),
    taxableValue: toNum(fallbackValues.taxableValue, NaN),
    cgstAmount: toNum(fallbackValues.cgstAmount, NaN),
    sgstAmount: toNum(fallbackValues.sgstAmount, NaN),
    totalValue: toNum(fallbackValues.totalValue, NaN),
    cgstPercent: toNum(fallbackValues.cgstPercent, 1.5),
    sgstPercent: toNum(fallbackValues.sgstPercent, 1.5),
    hsnCode: fallbackValues.hsnCode || '',
    hasGstRecord: fallbackValues.hasGstRecord !== false
  };

  const shouldReplaceWeight = changedField === 'weight' || (!hasValue(row.weight) && Number.isFinite(fallbacks.weight));
  const shouldReplaceRate = changedField === 'rate' || (!hasValue(row.rate) && Number.isFinite(fallbacks.rate));
  const shouldReplaceTaxable = (
    changedField === 'taxableValue' ||
    changedField === 'weight' ||
    changedField === 'rate' ||
    (!hasValue(row.taxableValue) && (
      Number.isFinite(fallbacks.taxableValue) ||
      (Number.isFinite(toNum(row.weight, NaN)) && Number.isFinite(toNum(row.rate, NaN)))
    ))
  );
  const shouldReplaceCgst = (
    changedField === 'cgst' ||
    changedField === 'taxableValue' ||
    changedField === 'weight' ||
    changedField === 'rate' ||
    (!hasValue(row.cgst) && (Number.isFinite(fallbacks.cgstAmount) || fallbacks.hasGstRecord))
  );
  const shouldReplaceSgst = (
    changedField === 'sgst' ||
    changedField === 'taxableValue' ||
    changedField === 'weight' ||
    changedField === 'rate' ||
    (!hasValue(row.sgst) && (Number.isFinite(fallbacks.sgstAmount) || fallbacks.hasGstRecord))
  );
  const shouldReplaceTotal = (
    changedField === 'total' ||
    changedField === 'taxableValue' ||
    changedField === 'cgst' ||
    changedField === 'sgst' ||
    changedField === 'weight' ||
    changedField === 'rate' ||
    !hasValue(row.total)
  );

  const allowFallbackFill = !changedField || !hasValue(row[changedField]);

  const weightValue = !shouldReplaceWeight
    ? toNum(row.weight, NaN)
    : changedField === 'weight'
      ? toNum(row.weight, NaN)
    : allowFallbackFill
      ? fallbacks.weight
      : NaN;
  const rateValue = !shouldReplaceRate
    ? toNum(row.rate, NaN)
    : changedField === 'rate'
      ? toNum(row.rate, NaN)
    : allowFallbackFill
      ? fallbacks.rate
      : NaN;
  const taxableValue = !shouldReplaceTaxable
    ? toNum(row.taxableValue, NaN)
    : changedField === 'taxableValue'
      ? toNum(row.taxableValue, NaN)
    : Number.isFinite(fallbacks.taxableValue)
      ? fallbacks.taxableValue
      : Number.isFinite(weightValue) && Number.isFinite(rateValue)
        ? weightValue * rateValue
        : NaN;
  const cgstValue = !shouldReplaceCgst
    ? toNum(row.cgst, NaN)
    : changedField === 'cgst'
      ? toNum(row.cgst, NaN)
    : Number.isFinite(fallbacks.cgstAmount)
      ? fallbacks.cgstAmount
      : fallbacks.hasGstRecord && Number.isFinite(taxableValue)
        ? (taxableValue * fallbacks.cgstPercent) / 100
        : NaN;
  const sgstValue = !shouldReplaceSgst
    ? toNum(row.sgst, NaN)
    : changedField === 'sgst'
      ? toNum(row.sgst, NaN)
    : Number.isFinite(fallbacks.sgstAmount)
      ? fallbacks.sgstAmount
      : fallbacks.hasGstRecord && Number.isFinite(taxableValue)
        ? (taxableValue * fallbacks.sgstPercent) / 100
        : NaN;
  const recomputedTotalValue =
    Number.isFinite(taxableValue) && Number.isFinite(cgstValue) && Number.isFinite(sgstValue)
      ? taxableValue + cgstValue + sgstValue
      : NaN;
  const totalValue = !shouldReplaceTotal
    ? toNum(row.total, NaN)
    : changedField === 'total'
      ? toNum(row.total, NaN)
    : Number.isFinite(recomputedTotalValue)
      ? recomputedTotalValue
      : Number.isFinite(fallbacks.totalValue)
        ? fallbacks.totalValue
        : NaN;

  return {
    ...row,
    hsnCode: hasValue(row.hsnCode)
      ? row.hsnCode
      : allowFallbackFill
        ? fallbacks.hsnCode
        : '',
    weight: shouldReplaceWeight ? getDisplayValue('weight', changedField, row.weight, weightValue, 3) : row.weight,
    rate: shouldReplaceRate ? getDisplayValue('rate', changedField, row.rate, rateValue, 2) : row.rate,
    taxableValue: shouldReplaceTaxable ? getDisplayValue('taxableValue', changedField, row.taxableValue, taxableValue, 2) : row.taxableValue,
    cgst: shouldReplaceCgst ? getDisplayValue('cgst', changedField, row.cgst, cgstValue, 2) : row.cgst,
    sgst: shouldReplaceSgst ? getDisplayValue('sgst', changedField, row.sgst, sgstValue, 2) : row.sgst,
    total: shouldReplaceTotal ? getDisplayValue('total', changedField, row.total, totalValue, 2) : row.total,
  };
}

function buildPayload(formState, settings, ftRateValue) {
  const fallbacks = buildRowFallbacks(settings, ftRateValue);
  const normalizedRows = formState.billDetails.map((item, index) => recomputeBillRow({
    ...item,
    sno: index + 1,
  }, '', fallbacks));

  return {
    customerName: formState.customerName.trim(),
    phone: formState.phone.trim(),
    address: formState.address.trim(),
    gstNumber: formState.gstNumber.trim(),
    invoiceNumber: formState.invoiceNumber.trim() || '1',
    invoiceDate: formatDateForApi(formState.invoiceDate),
    totalInvoiceValue: normalizedRows.reduce((sum, item) => sum + toNumber(item.total), 0),
    billDetails: normalizedRows.map((item, index) => ({
      sno: index + 1,
      particular: item.particular || '',
      hsnCode: item.hsnCode || settings?.hsnCode || '',
      weight: toNumber(item.weight),
      rate: toNumber(item.rate) || toNumber(ftRateValue),
      taxableValue: toNumber(item.taxableValue),
      cgst: toNumber(item.cgst),
      sgst: toNumber(item.sgst),
      total: toNumber(item.total)
    })),
    bankDetails: {
      bankAccountName: formState.bankDetails.bankAccountName.trim() || settings?.bankDetails?.bankAccountName || '',
      accountNumber: formState.bankDetails.accountNumber.trim() || settings?.bankDetails?.accountNumber || '',
      ifscCode: formState.bankDetails.ifscCode.trim() || settings?.bankDetails?.ifscCode || '',
      branch: formState.bankDetails.branch.trim() || settings?.bankDetails?.branch || '',
      upiId: formState.bankDetails.upiId.trim() || settings?.bankDetails?.upiId || ''
    }
  };
}

function mapTransactionToForm(transaction, regenerateInvoice = false) {
  return {
    customerName: transaction.customerName || '',
    phone: transaction.phone || '',
    address: transaction.address || '',
    gstNumber: transaction.gstNumber || '',
    invoiceNumber: regenerateInvoice ? '' : (transaction.invoiceNumber || ''),
    invoiceDate: regenerateInvoice ? formatInputDate(new Date()) : formatDisplayDate(transaction.invoiceDate),
    totalInvoiceValue: String(transaction.totalInvoiceValue ?? ''),
    billDetails: Array.isArray(transaction.billDetails) && transaction.billDetails.length > 0
      ? transaction.billDetails.map((item, index) => ({
          sno: index + 1,
          particular: item.particular || '',
          hsnCode: item.hsnCode || '',
          weight: item.weight?.toString?.() || '',
          rate: item.rate?.toString?.() || '',
          taxableValue: item.taxableValue?.toString?.() || '',
          cgst: item.cgst?.toString?.() || '',
          sgst: item.sgst?.toString?.() || '',
          total: item.total?.toString?.() || ''
        }))
      : [createEmptyLineItem(0)],
    bankDetails: {
      bankAccountName: transaction.bankDetails?.bankAccountName || '',
      accountNumber: transaction.bankDetails?.accountNumber || '',
      ifscCode: transaction.bankDetails?.ifscCode || '',
      branch: transaction.bankDetails?.branch || '',
      upiId: transaction.bankDetails?.upiId || ''
    }
  };
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function formatNumber(value) {
  return Number(value || 0).toFixed(3);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F1',
  },
  accessDenied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  accessDeniedTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#7C3AED',
  },
  accessDeniedText: {
    fontSize: moderateScale(13),
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: horizontalPadding,
    paddingBottom: spacing.xl * 2,
  },
  heroCard: {
    backgroundColor: '#14532D',
    borderRadius: 24,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTextWrap: {
    flex: 1,
    paddingRight: spacing.md,
  },
  heroTitle: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: moderateScale(13),
    color: '#DCFCE7',
    lineHeight: 20,
    marginTop: 6,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    marginBottom: spacing.md,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: '#111827',
    fontSize: moderateScale(14),
  },
  formCard: {
    borderRadius: 14,
    marginTop: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderColor: '#E7E5E4',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: moderateScale(24),
    fontWeight: '800',
    color: '#166534',
    marginBottom: spacing.md,
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  pillButtonText: {
    color: '#166534',
    fontWeight: '700',
    marginLeft: 6,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  threeColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputBlock: {
    flex: 1,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D6D3D1',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: moderateScale(14),
    color: '#111827',
  },
  addressInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  billRowCard: {
    backgroundColor: '#FBFBF9',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    borderRadius: 20,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  rowTitle: {
    fontSize: moderateScale(17),
    fontWeight: '800',
    color: '#166534',
  },
  removeButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    flex: 1.3,
    backgroundColor: '#166534',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(15),
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(15),
    fontWeight: '800',
  },
  ghostButton: {
    flex: 0.7,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: '#374151',
    fontSize: moderateScale(14),
    fontWeight: '800',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  listTitle: {
    fontSize: moderateScale(26),
    fontWeight: '800',
    color: '#166534',
  },
  refreshText: {
    fontSize: moderateScale(14),
    color: '#166534',
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 20,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#111827',
  },
  emptySubtitle: {
    fontSize: moderateScale(13),
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  customerCard: {
    borderRadius: 20,
    padding: spacing.lg,
  },
  customerCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerNameWrap: {
    flex: 1,
    paddingRight: spacing.md,
  },
  customerCardName: {
    fontSize: moderateScale(20),
    fontWeight: '800',
    color: '#1F2937',
  },
  tapHint: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: moderateScale(12),
  },
  cardActionColumn: {
    width: 78,
  },
  miniAction: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  miniActionText: {
    fontWeight: '800',
    fontSize: moderateScale(13),
  },
  expandedDetailWrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  infoText: {
    fontSize: moderateScale(14),
    color: '#374151',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: spacing.md,
  },
  expandedRow: {
    marginBottom: spacing.sm,
  },
  expandedRowTitle: {
    fontSize: moderateScale(14),
    fontWeight: '800',
    color: '#166534',
  },
  expandedRowMeta: {
    fontSize: moderateScale(12),
    color: '#4B5563',
    marginTop: 2,
  },
});

export default GSTCustomerPage;
