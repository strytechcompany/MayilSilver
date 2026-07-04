import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
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
  createDailyExpense,
  deleteDailyExpense,
  fetchDailyExpenses,
  updateDailyExpense,
} from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const CATEGORIES = ['Staff Expense', 'Tea Expense', 'Transport', 'Rent', 'Electricity', 'Misc'];

const todayString = () => new Date().toISOString().slice(0, 10);
const buildMonthFilter = (month) => (month ? `${new Date().getFullYear()}-${month}` : '');

const EMPTY_FORM = {
  workerName: '',
  title: '',
  amount: '',
  category: 'Staff Expense',
  notes: '',
  date: todayString(),
};

const MONTH_OPTIONS = [
  { label: 'All Months', value: '' },
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const formatDisplayDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || '-';
  return `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
};

const DailyExpense = ({ navigation }) => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    month: '',
  });

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const activeFilters = filters.month
      ? { month: buildMonthFilter(filters.month) }
      : { from: filters.from, to: filters.to };
    const res = await fetchDailyExpenses(activeFilters);
    setExpenses(res.success ? (res.expenses || []) : []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadExpenses);
    return unsubscribe;
  }, [navigation, loadExpenses]);

  const totalExpense = useMemo(
    () => expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [expenses]
  );

  const summaryTitle = useMemo(() => {
    if (filters.month) return 'Total Monthly Expense';
    if (filters.from || filters.to) return 'Total Filtered Expense';
    return 'Total Expense';
  }, [filters]);

  const openAddModal = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: todayString() });
    setModalVisible(true);
  };

  const openEditModal = (expense) => {
    setEditingId(expense._id);
    setForm({
      workerName: expense.workerName || '',
      title: expense.title || '',
      amount: String(expense.amount ?? ''),
      category: expense.category || 'Misc',
      notes: expense.notes || '',
      date: expense.date ? String(expense.date).slice(0, 10) : todayString(),
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Validation', 'Expense title is required');
      return;
    }
    if (!form.amount || Number.isNaN(Number(form.amount))) {
      Alert.alert('Validation', 'Enter a valid expense amount');
      return;
    }
    if (!form.category.trim()) {
      Alert.alert('Validation', 'Expense category is required');
      return;
    }
    if (!form.date.trim()) {
      Alert.alert('Validation', 'Expense date is required');
      return;
    }

    const payload = {
      workerName: form.workerName.trim(),
      title: form.title.trim(),
      amount: Number(form.amount),
      category: form.category.trim(),
      notes: form.notes.trim(),
      date: form.date,
    };

    setSaving(true);
    const res = editingId
      ? await updateDailyExpense(editingId, payload)
      : await createDailyExpense(payload);
    setSaving(false);

    if (!res.success) {
      Alert.alert('Error', res.message || 'Failed to save expense');
      return;
    }

    closeModal();
    loadExpenses();
  };

  const handleDelete = (expense) => {
    Alert.alert(
      'Delete Expense',
      `Delete "${expense.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteDailyExpense(expense._id);
            if (res.success) loadExpenses();
            else Alert.alert('Error', res.message || 'Failed to delete expense');
          },
        },
      ]
    );
  };

  const renderExpense = ({ item }) => (
    <View style={styles.expenseCard}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="cash-fast" size={20} color="#0F766E" />
        </View>
        <View style={styles.cardInfo}>
          {item.workerName ? <Text style={styles.workerName}>{item.workerName}</Text> : null}
          <Text style={styles.expenseTitle}>{item.title}</Text>
          <Text style={styles.expenseMeta}>{item.category}</Text>
          <Text style={styles.expenseDate}>{formatDisplayDate(item.date || item.createdAt)}</Text>
        </View>
        <View style={styles.amountWrap}>
          <Text style={styles.amountText}>Rs. {Number(item.amount || 0).toFixed(2)}</Text>
        </View>
      </View>

      {item.notes ? <Text style={styles.notesText}>{item.notes}</Text> : null}

      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => openEditModal(item)}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color="#D97706" />
          <Text style={[styles.actionText, { color: '#D97706' }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item)}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
          <Text style={[styles.actionText, { color: '#DC2626' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Daily Expense"
        subtitle="Track and manage shop expenses"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <View style={styles.filterPanel}>
        <View style={styles.monthRow}>
          <Text style={styles.filterSectionTitle}>Select Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthWrap}>
            {MONTH_OPTIONS.map((option) => {
              const selected = filters.month === option.value;
              return (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.monthChip, selected && styles.monthChipActive]}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      month: option.value,
                      from: option.value ? '' : prev.from,
                      to: option.value ? '' : prev.to,
                    }))
                  }
                >
                  <Text style={[styles.monthChipText, selected && styles.monthChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text style={styles.filterSectionTitle}>Date Range</Text>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>From Date</Text>
            <TextInput
              style={styles.filterInput}
              value={filters.from}
              onChangeText={(value) => setFilters((prev) => ({ ...prev, from: value, month: '' }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>To Date</Text>
            <TextInput
              style={styles.filterInput}
              value={filters.to}
              onChangeText={(value) => setFilters((prev) => ({ ...prev, to: value, month: '' }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>
      </View>

      <View style={styles.summaryStrip}>
        <View>
          <Text style={styles.summaryLabel}>{summaryTitle}</Text>
          <Text style={styles.summaryValue}>Rs. {totalExpense.toFixed(2)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Expense</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0F766E" />
          <Text style={styles.loadingText}>Loading expenses...</Text>
        </View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item._id}
          renderItem={renderExpense}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="cash-remove" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Expenses Yet</Text>
              <Text style={styles.emptySubtitle}>Save your first daily expense to see it here.</Text>
            </View>
          }
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Expense' : 'Add Expense'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Field
                label="Worker Name"
                value={form.workerName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, workerName: value }))}
                placeholder="e.g. Ravi"
              />
              <Field
                label="Expense Title"
                value={form.title}
                onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
                placeholder="e.g. Tea Expense"
              />
              <Field
                label="Expense Amount"
                value={form.amount}
                onChangeText={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                placeholder="e.g. 250"
                keyboardType="numeric"
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Expense Category</Text>
                <View style={styles.categoryWrap}>
                  {CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryChip,
                        form.category === category && styles.categoryChipActive,
                      ]}
                      onPress={() => setForm((prev) => ({ ...prev, category }))}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          form.category === category && styles.categoryChipTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Field
                label="Date"
                value={form.date}
                onChangeText={(value) => setForm((prev) => ({ ...prev, date: value }))}
                placeholder="YYYY-MM-DD"
              />
              <Field
                label="Notes"
                value={form.notes}
                onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
                placeholder="Optional notes"
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      keyboardType={keyboardType}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalPadding,
    paddingVertical: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterPanel: {
    paddingHorizontal: horizontalPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterSectionTitle: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  monthRow: { marginBottom: spacing.md },
  monthWrap: { gap: 8, paddingRight: 8 },
  monthChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  monthChipActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  monthChipText: { color: '#475569', fontWeight: '700', fontSize: moderateScale(11) },
  monthChipTextActive: { color: '#FFFFFF' },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterField: { flex: 1 },
  filterLabel: { marginBottom: 6, color: '#64748B', fontSize: moderateScale(11), fontWeight: '700' },
  filterInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: moderateScale(13),
  },
  summaryLabel: { color: '#64748B', fontSize: moderateScale(12), fontWeight: '700' },
  summaryValue: { color: '#0F172A', fontSize: moderateScale(20), fontWeight: '900', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(13) },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: spacing.md, color: '#64748B', fontSize: moderateScale(14) },
  list: { padding: horizontalPadding, paddingBottom: spacing.xl * 2 },
  expenseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  workerName: { fontSize: moderateScale(11), color: '#0F766E', fontWeight: '800', marginBottom: 2 },
  expenseTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#0F172A' },
  expenseMeta: { marginTop: 2, fontSize: moderateScale(12), color: '#0F766E', fontWeight: '700' },
  expenseDate: { marginTop: 2, fontSize: moderateScale(11), color: '#64748B' },
  amountWrap: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  amountText: { fontSize: moderateScale(13), fontWeight: '800', color: '#047857' },
  notesText: { marginTop: spacing.sm, color: '#475569', fontSize: moderateScale(12), lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
  },
  editBtn: { backgroundColor: '#FEF3C7' },
  deleteBtn: { backgroundColor: '#FEE2E2' },
  actionText: { fontWeight: '700', fontSize: moderateScale(12) },
  emptyBox: { alignItems: 'center', paddingTop: spacing.xl * 2 },
  emptyTitle: { marginTop: spacing.md, fontSize: moderateScale(18), fontWeight: '800', color: '#334155' },
  emptySubtitle: {
    marginTop: 6,
    fontSize: moderateScale(13),
    color: '#94A3B8',
    textAlign: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: horizontalPadding,
    paddingBottom: spacing.xl,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: moderateScale(18), fontWeight: '900', color: '#0F172A' },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    marginBottom: 8,
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: moderateScale(14),
  },
  inputMultiline: { minHeight: 90, paddingTop: 12 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  categoryChipText: { color: '#475569', fontWeight: '700', fontSize: moderateScale(11) },
  categoryChipTextActive: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: spacing.lg },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: { color: '#334155', fontWeight: '800', fontSize: moderateScale(14) },
  saveBtn: {
    flex: 1.4,
    backgroundColor: '#0F766E',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(14) },
});

export default DailyExpense;
