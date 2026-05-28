import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TextInput, KeyboardAvoidingView, Platform,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAllCustomers, createCustomer, updateCustomer, deleteCustomer } from '../services/api';
import Header from '../components/Header';
import Card from '../components/Card';
import InputField from '../components/InputField';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { toNumber } from '../utils/balanceDisplay';

const formatGram = (value) => `${Math.abs(toNumber(value)).toFixed(1)}g`;

const getCustomerBalanceState = (customer) => {
  const signedBalance = customer?.balance !== undefined && customer?.balance !== null
    ? toNumber(customer.balance)
    : toNumber(customer?.ab) - toNumber(customer?.ob);

  if (signedBalance < 0) {
    return {
      label: 'Balance',
      value: formatGram(signedBalance),
      style: 'balance',
      icon: 'alert-circle-outline',
    };
  }

  if (signedBalance > 0) {
    return {
      label: 'Advance',
      value: formatGram(signedBalance),
      style: 'advance',
      icon: 'check-circle-outline',
    };
  }

  return null;
};

const CustomerDataListPage = ({ navigation }) => {
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState('');
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    alternativePhone: '',
    address: '',
    gstin: '',
    ob: '',
    ab: ''
  });

  const updateCustomerForm = useCallback((field, value) => {
    setCustomerForm((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const updateBalanceField = useCallback((field, value) => {
    setCustomerForm((prev) => {
      if (field === 'ob') {
        return {
          ...prev,
          ob: value,
          ab: value ? '0' : prev.ab
        };
      }

      return {
        ...prev,
        ab: value,
        ob: value ? '0' : prev.ob
      };
    });
  }, []);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      customers.filter(c =>
        (c.customerName || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.alternativePhone || '').includes(q)
      )
    );
  }, [search, customers]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllCustomers();
      setCustomers(data);
      setFiltered(data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  }, []);

  const resetCustomerForm = useCallback(() => {
    setCustomerForm({ name: '', phone: '', alternativePhone: '', address: '', gstin: '', ob: '', ab: '' });
    setEditingCustomerId('');
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    resetCustomerForm();
  }, [resetCustomerForm]);

  const openCreateForm = useCallback(() => {
    resetCustomerForm();
    setShowForm(true);
  }, [resetCustomerForm]);

  const handleDeleteCustomer = useCallback((customer) => {
    Alert.alert(
      'Delete Customer',
      `Delete "${customer.customerName}"? This will permanently remove the customer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setCustomers((prev) => prev.filter((c) => c._id !== customer._id));
            const res = await deleteCustomer(customer._id);
            if (!res?.success) {
              loadCustomers();
              Alert.alert('Error', res?.message || 'Failed to delete customer.');
            }
          },
        },
      ]
    );
  }, []);

  const openEditForm = useCallback((customer) => {
    setEditingCustomerId(customer._id || '');
    setCustomerForm({
      name: customer.customerName || '',
      phone: customer.phone || '',
      alternativePhone: customer.alternativePhone || '',
      address: customer.address || '',
      gstin: customer.gstin || '',
      ob: customer.ob ? String(customer.ob) : '',
      ab: customer.ab ? String(customer.ab) : '',
    });
    setShowForm(true);
  }, []);

  const handleSaveCustomer = async () => {
    if (!customerForm.name || !customerForm.phone) {
      Alert.alert('Validation Error', 'Name and Phone are required.');
      return;
    }

    try {
      const payload = {
        customerName: customerForm.name,
        name: customerForm.name,
        phone: customerForm.phone,
        alternativePhone: customerForm.alternativePhone || '',
        address: customerForm.address || '',
        gstin: customerForm.gstin || '',
        ob: parseFloat(customerForm.ob) || 0,
        ab: parseFloat(customerForm.ab) || 0
      };
      const data = editingCustomerId
        ? await updateCustomer(editingCustomerId, payload)
        : await createCustomer(payload);

      if (data.success) {
        Alert.alert('Success', editingCustomerId ? 'Customer updated successfully.' : 'Customer created successfully.');
        closeForm();
        loadCustomers();
      } else {
        Alert.alert('Error', data.message || 'Failed to save customer');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header 
        title="Customer Management" 
        showBack={true}
        onBackPress={() => navigation.goBack()}
        rightIcon={showForm ? "close" : "plus"}
        onRightPress={showForm ? closeForm : openCreateForm}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={!showForm && refreshing}
              onRefresh={showForm ? undefined : onRefresh}
              colors={['#2563EB']}
            />
          }
        >
          {showForm ? (
            <Card style={styles.formCard}>
              <Text style={styles.sectionTitle}>{editingCustomerId ? 'Edit Customer' : 'Create Customer'}</Text>

              <FormInput
                label="Customer Name"
                placeholder="Enter name"
                value={customerForm.name}
                onChangeText={(t) => updateCustomerForm('name', t)}
              />

              <FormInput
                label="Phone Number"
                placeholder="Enter phone"
                value={customerForm.phone}
                onChangeText={(t) => updateCustomerForm('phone', t)}
                keyboardType="phone-pad"
              />

              <FormInput
                label="Alternative Number (Optional)"
                placeholder="Enter alternative phone"
                value={customerForm.alternativePhone}
                onChangeText={(t) => updateCustomerForm('alternativePhone', t)}
                keyboardType="phone-pad"
              />

              <FormInput
                label="Address"
                placeholder="Enter address"
                value={customerForm.address}
                onChangeText={(t) => updateCustomerForm('address', t)}
              />

              <FormInput
                label="GSTIN"
                placeholder="Enter GSTIN"
                value={customerForm.gstin}
                onChangeText={(t) => updateCustomerForm('gstin', t)}
              />

              <View style={styles.row}>
                <FormInput
                  containerStyle={{ flex: 1, marginRight: 12 }}
                  label="Balance"
                  placeholder="0.000"
                  value={customerForm.ob}
                  onChangeText={(t) => updateBalanceField('ob', t)}
                  keyboardType="numeric"
                />
                <FormInput
                  containerStyle={{ flex: 1 }}
                  label="Advance"
                  placeholder="0.000"
                  value={customerForm.ab}
                  onChangeText={(t) => updateBalanceField('ab', t)}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCustomer}>
                  <Text style={styles.saveBtnText}>{editingCustomerId ? 'Update Customer' : 'Save Customer'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : (
            <>
              <View style={styles.searchWrapper}>
                <InputField 
                  icon="magnify"
                  placeholder="Search by name or phone..."
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              {loading ? (
                <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
              ) : filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="account-search" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>
                    {search ? 'No customers match your search' : 'No customers found'}
                  </Text>
                </View>
              ) : (
                filtered.map((customer) => {
                  const balanceState = getCustomerBalanceState(customer);
                  const balanceTone = balanceState?.style === 'advance'
                    ? { badge: styles.advanceBalanceBadge, text: styles.advanceBalanceText }
                    : { badge: styles.dueBalanceBadge, text: styles.dueBalanceText };

                  return (
                    <Card key={customer._id} style={styles.customerCard}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardInfo}>
                          <Text style={styles.customerName}>{customer.customerName}</Text>
                          <Text style={styles.customerPhone}>{customer.phone}</Text>
                          {customer.alternativePhone ? (
                            <Text style={styles.customerAltPhone}>Alt: {customer.alternativePhone}</Text>
                          ) : null}
                          {customer.address ? (
                            <Text style={styles.customerAddress} numberOfLines={1}>{customer.address}</Text>
                          ) : null}
                        </View>
                        <View style={styles.balanceBadge}>
                          {balanceState ? (
                            <View style={[styles.badge, balanceTone.badge]}>
                              <View style={styles.badgeTitleRow}>
                                <MaterialCommunityIcons name={balanceState.icon} size={13} color={balanceTone.text.color} />
                                <Text style={[styles.badgeLabel, balanceTone.text]}>
                                  {balanceState.label} : {balanceState.value}
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.nilBalanceBadge]}>
                              <Text style={[styles.badgeValue, styles.nilBalanceText]}>NIL</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => navigation.navigate('CustomerBillHistory', { customer })}
                        >
                          <MaterialCommunityIcons name="receipt" size={16} color="#4B5563" />
                          <Text style={styles.actionBtnText}>History</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => openEditForm(customer)}
                        >
                          <MaterialCommunityIcons name="pencil" size={16} color="#2563EB" />
                          <Text style={[styles.actionBtnText, { color: '#2563EB' }]}>Edit</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => navigation.navigate('MiniStatement', { customer })}
                        >
                          <MaterialCommunityIcons name="file-chart" size={16} color="#4B5563" />
                          <Text style={styles.actionBtnText}>Statement</Text>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleDeleteCustomer(customer)}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
                          <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const FormInput = React.memo(({ label, containerStyle, style, ...props }) => (
  <View style={[styles.formInputWrap, containerStyle]}>
    <Text style={styles.formInputLabel}>{label}</Text>
    <TextInput
      style={[styles.formInput, style]}
      placeholderTextColor="#9CA3AF"
      autoCorrect={false}
      autoCapitalize="none"
      blurOnSubmit={false}
      {...props}
    />
  </View>
));

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  scrollContent: { 
    padding: horizontalPadding, 
    paddingBottom: spacing.xl 
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: spacing.lg,
  },
  searchWrapper: { 
    marginBottom: 8 
  },
  formCard: {
    padding: spacing.lg,
  },
  formInputWrap: {
    marginBottom: spacing.md,
  },
  formInputLabel: {
    fontSize: moderateScale(13),
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  formInput: {
    minHeight: moderateScale(48),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: moderateScale(15),
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formActions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  cancelBtnText: {
    color: '#4B5563',
    fontWeight: '600',
    fontSize: moderateScale(15),
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: moderateScale(15),
  },
  customerCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  cardInfo: { 
    flex: 1 
  },
  customerName: { 
    fontSize: moderateScale(16), 
    fontWeight: 'bold', 
    color: '#111827' 
  },
  customerPhone: { 
    fontSize: moderateScale(13), 
    color: '#6B7280', 
    marginTop: 4 
  },
  customerAltPhone: {
    fontSize: moderateScale(12),
    color: '#64748B',
    marginTop: 3,
    fontWeight: '600',
  },
  customerAddress: { 
    fontSize: moderateScale(12), 
    color: '#9CA3AF', 
    marginTop: 4 
  },
  balanceBadge: { 
    marginLeft: 12 
  },
  badge: { 
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    minWidth: 128,
    borderWidth: 1,
  },
  dueBalanceBadge: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  dueBalanceText: {
    color: '#DC2626',
  },
  advanceBalanceBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  advanceBalanceText: {
    color: '#059669',
  },
  nilBalanceBadge: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    minWidth: 78,
    alignItems: 'center',
  },
  nilBalanceText: {
    color: '#6B7280',
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeLabel: { 
    fontSize: moderateScale(12),
    fontWeight: '900',
  },
  badgeValue: { 
    fontSize: moderateScale(15),
    fontWeight: '900',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row', 
    borderTopWidth: 1, 
    borderTopColor: '#F3F4F6',
    paddingTop: spacing.sm,
  },
  actionBtn: {
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnText: { 
    fontSize: moderateScale(13), 
    fontWeight: '500', 
    color: '#4B5563' 
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 8,
  },
  emptyState: { 
    alignItems: 'center', 
    marginTop: 60 
  },
  emptyText: { 
    fontSize: moderateScale(15), 
    color: '#6B7280', 
    marginTop: 12, 
    textAlign: 'center' 
  },
});

export default CustomerDataListPage;
