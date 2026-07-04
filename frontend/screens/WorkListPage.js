import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { createUser, deleteUser, fetchUsers, updateUser } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

// ── Granular page definitions ─────────────────────────────────
// Each page key maps to ONE screen. Sub-screens (previews) inherit
// their parent's key in AppNavigator so they never block navigation.
export const PAGE_CATEGORIES = [
  {
    id: 'b2b', category: 'B2B Billing',
    color: '#2563EB', bgColor: '#EFF6FF', borderColor: '#BFDBFE', icon: 'calculator-variant',
    pages: [
      { key: 'b2b_calculation', label: 'B2B Calculation', shortLabel: 'B2B Calc',  icon: 'calculator-variant' },
      { key: 'customer_list',   label: 'Customer List',   shortLabel: 'Customers', icon: 'account-multiple' },
      { key: 'bill_history',    label: 'Bill History',    shortLabel: 'Bills',     icon: 'receipt' },
      { key: 'mini_statement',  label: 'Mini Statement',  shortLabel: 'Statement', icon: 'file-chart' },
      { key: 'b2b_reports',     label: 'B2B Reports',     shortLabel: 'Reports',   icon: 'chart-bar' },
    ],
  },
  {
    id: 'gst', category: 'GST Billing',
    color: '#7C3AED', bgColor: '#F5F3FF', borderColor: '#DDD6FE', icon: 'file-document-outline',
    pages: [
      { key: 'gst_customer', label: 'GST Customer', shortLabel: 'GST Cust', icon: 'account-tie' },
      { key: 'gst_settings', label: 'GST Settings', shortLabel: 'GST Set',  icon: 'file-cog' },
      { key: 'gst_history',  label: 'GST History',  shortLabel: 'GST Hist', icon: 'history' },
    ],
  },
  {
    id: 'payment', category: 'Payments',
    color: '#059669', bgColor: '#ECFDF5', borderColor: '#A7F3D0', icon: 'qrcode-scan',
    pages: [
      { key: 'payment',         label: 'Payment Entry',   shortLabel: 'Payment',  icon: 'qrcode-scan' },
      { key: 'payment_history', label: 'Payment History', shortLabel: 'Pay Hist', icon: 'history' },
    ],
  },
  {
    id: 'tools', category: 'Tools',
    color: '#D97706', bgColor: '#FFFBEB', borderColor: '#FDE68A', icon: 'toolbox-outline',
    pages: [
      { key: 'daily_expense',  label: 'Daily Expense',  shortLabel: 'Expense',  icon: 'cash-multiple' },
      { key: 'kadai_document', label: 'Kadai Document', shortLabel: 'Docs',     icon: 'file-document' },
      { key: 'settings',       label: 'Settings',       shortLabel: 'Settings', icon: 'cog' },
    ],
  },
];

export const ALL_PAGE_KEYS = PAGE_CATEGORIES.flatMap((c) => c.pages.map((p) => p.key));

// Flat map for label/color lookups
const PAGE_MAP = {};
PAGE_CATEGORIES.forEach((c) =>
  c.pages.forEach((p) => {
    PAGE_MAP[p.key] = { label: p.label, shortLabel: p.shortLabel, color: c.color, bgColor: c.bgColor };
  })
);

// Fallback display for legacy module keys still stored in DB
const OLD_KEY_META = {
  b2b:           { label: 'B2B',     color: '#2563EB', bg: '#EFF6FF' },
  gst:           { label: 'GST',     color: '#7C3AED', bg: '#F5F3FF' },
  payment:       { label: 'Payment', color: '#059669', bg: '#ECFDF5' },
  daily_expense: { label: 'Expense', color: '#D97706', bg: '#FFFBEB' },
  kadai_document:{ label: 'Docs',    color: '#DC2626', bg: '#FEF2F2' },
  settings:      { label: 'Settings',color: '#4B5563', bg: '#F9FAFB' },
};

const pageLabel  = (key) => PAGE_MAP[key]?.shortLabel ?? OLD_KEY_META[key]?.label  ?? key;
const pageColor  = (key) => PAGE_MAP[key]?.color      ?? OLD_KEY_META[key]?.color  ?? '#6B7280';
const pageBg     = (key) => PAGE_MAP[key]?.bgColor    ?? OLD_KEY_META[key]?.bg     ?? '#F3F4F6';

const EMPTY_FORM = { name: '', phone: '', email: '', password: '', allowedPages: [] };

// ── Component ─────────────────────────────────────────────────
const WorkListPage = ({ navigation }) => {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetchUsers();
    setUsers(res.users || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setModalVisible(true);
  };

  const openEdit = (user) => {
    setEditingId(user._id);
    setForm({
      name:         user.name  || '',
      phone:        user.phone || '',
      email:        user.email || '',
      password:     '',
      allowedPages: Array.isArray(user.allowedPages) ? [...user.allowedPages] : [],
    });
    setShowPassword(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  // ── Page toggle helpers ───────────────────────────────────
  const togglePage = (key) => {
    setForm((f) => ({
      ...f,
      allowedPages: f.allowedPages.includes(key)
        ? f.allowedPages.filter((k) => k !== key)
        : [...f.allowedPages, key],
    }));
  };

  const toggleCategory = (catId) => {
    const cat = PAGE_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    const catKeys = cat.pages.map((p) => p.key);
    const allOn   = catKeys.every((k) => form.allowedPages.includes(k));
    setForm((f) => ({
      ...f,
      allowedPages: allOn
        ? f.allowedPages.filter((k) => !catKeys.includes(k))
        : [...new Set([...f.allowedPages, ...catKeys])],
    }));
  };

  const toggleSelectAll = () => {
    const allOn = ALL_PAGE_KEYS.every((k) => form.allowedPages.includes(k));
    setForm((f) => ({ ...f, allowedPages: allOn ? [] : [...ALL_PAGE_KEYS] }));
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.email.trim()) {
      Alert.alert('Validation', 'Email is required');
      return;
    }
    if (!editingId && !form.password.trim()) {
      Alert.alert('Validation', 'Password is required for new users');
      return;
    }
    if (form.allowedPages.length === 0) {
      Alert.alert(
        'No Pages Selected',
        'This user will have no page access. Save anyway?',
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Save Anyway', onPress: doSave },
        ],
      );
      return;
    }
    doSave();
  };

  const doSave = async () => {
    setSaving(true);
    const GST_KEYS = ['gst_customer', 'gst_settings', 'gst_history', 'gst'];
    const payload = {
      name:           form.name.trim(),
      phone:          form.phone.trim(),
      email:          form.email.trim(),
      allowedPages:   form.allowedPages,
      gstBillEnabled: form.allowedPages.some((k) => GST_KEYS.includes(k)),
    };
    if (form.password.trim()) payload.password = form.password.trim();

    const res = editingId
      ? await updateUser(editingId, payload)
      : await createUser(payload);

    setSaving(false);
    if (!res.success) {
      Alert.alert('Error', res.message || 'Failed to save user');
      return;
    }
    closeModal();
    loadUsers();
  };

  const handleDelete = (user) => {
    Alert.alert(
      'Delete User',
      `Remove ${user.name || user.email}?\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const res = await deleteUser(user._id);
            if (res.success) loadUsers();
            else Alert.alert('Error', res.message || 'Delete failed');
          },
        },
      ],
    );
  };

  const allSelected = ALL_PAGE_KEYS.every((k) => form.allowedPages.includes(k));

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="User Management"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>

          {/* ── Admin card (fixed) ─────────────────────────── */}
          <View style={[styles.userCard, styles.adminCard]}>
            <View style={styles.cardTop}>
              <View style={[styles.avatar, styles.avatarAdmin]}>
                <MaterialCommunityIcons name="shield-crown-outline" size={17} color="#fff" />
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.cardName}>Admin</Text>
                <Text style={styles.cardEmail}>mayilsilver@gmail.com</Text>
              </View>
              <View style={[styles.accessBadge, { backgroundColor: '#D1FAE5' }]}>
                <Text style={[styles.accessBadgeText, { color: '#065F46' }]}>Full Access</Text>
              </View>
            </View>
            <View style={styles.cardDivider} />
            <Text style={styles.allowedLabel}>All Pages</Text>
            <View style={styles.tagsRow}>
              {ALL_PAGE_KEYS.map((k) => (
                <View key={k} style={[styles.pageTag, { backgroundColor: pageBg(k), borderColor: pageColor(k) + '40' }]}>
                  <Text style={[styles.pageTagText, { color: pageColor(k) }]}>{pageLabel(k)}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Sub-users ──────────────────────────────────── */}
          {users.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-off-outline" size={48} color="#C4B5FD" />
              <Text style={styles.emptyText}>No workers yet.</Text>
              <Text style={styles.emptyHint}>Tap + Add User to create one.</Text>
            </View>
          ) : (
            users.map((user) => {
              const pages    = Array.isArray(user.allowedPages) ? user.allowedPages : [];
              const isLegacy = pages.length === 0;
              return (
                <View key={user._id} style={styles.userCard}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <MaterialCommunityIcons name="account-outline" size={17} color="#7C3AED" />
                    </View>
                    <View style={styles.cardMeta}>
                      {!!user.name && <Text style={styles.cardName}>{user.name}</Text>}
                      <Text style={styles.cardEmail}>{user.email}</Text>
                      {!!user.phone && <Text style={styles.cardPhone}>{user.phone}</Text>}
                    </View>
                    <View style={styles.iconBtns}>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(user)}>
                        <MaterialCommunityIcons name="pencil-outline" size={16} color="#6B7280" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(user)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />
                  <Text style={styles.allowedLabel}>Allowed Pages</Text>
                  {isLegacy ? (
                    <View style={styles.tagsRow}>
                      <View style={[styles.pageTag, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                        <Text style={[styles.pageTagText, { color: '#9CA3AF' }]}>Legacy — all non-admin pages</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.tagsRow}>
                      {pages.map((k) => (
                        <View key={k} style={[styles.pageTag, { backgroundColor: pageBg(k), borderColor: pageColor(k) + '50' }]}>
                          <Text style={[styles.pageTagText, { color: pageColor(k) }]}>{pageLabel(k)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <MaterialCommunityIcons name="account-plus-outline" size={22} color="#fff" />
        <Text style={styles.fabText}>Add User</Text>
      </TouchableOpacity>

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit User' : 'Add User'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <MaterialCommunityIcons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Basic Info ─────────────────────────── */}
              <Text style={styles.sectionHead}>Basic Information</Text>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Worker / dealer name"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.fieldLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                placeholder="Mobile number"
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.fieldLabel}>Email *</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="user@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.fieldLabel}>
                Password{editingId ? ' (leave blank to keep)' : ' *'}
              </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={form.password}
                  onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                  placeholder="Enter password"
                  secureTextEntry={!showPassword}
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)}>
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#6B7280"
                  />
                </TouchableOpacity>
              </View>

              {/* ── Page Access ────────────────────────── */}
              <View style={styles.permHeaderRow}>
                <View>
                  <Text style={styles.sectionHead}>Page Access</Text>
                  <Text style={styles.permCount}>
                    {form.allowedPages.filter((k) => ALL_PAGE_KEYS.includes(k)).length} of {ALL_PAGE_KEYS.length} pages selected
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.selectAllBtn, allSelected && styles.selectAllBtnOn]}
                  onPress={toggleSelectAll}
                >
                  <MaterialCommunityIcons
                    name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={14}
                    color={allSelected ? '#fff' : '#7C3AED'}
                  />
                  <Text style={[styles.selectAllTxt, allSelected && styles.selectAllTxtOn]}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Category sections ──────────────────── */}
              {PAGE_CATEGORIES.map((cat) => {
                const catKeys   = cat.pages.map((p) => p.key);
                const selCount  = catKeys.filter((k) => form.allowedPages.includes(k)).length;
                const allCatOn  = selCount === catKeys.length;
                const someCatOn = selCount > 0 && !allCatOn;

                return (
                  <View key={cat.id} style={styles.catSection}>
                    {/* Category header */}
                    <TouchableOpacity
                      style={[styles.catHeader, allCatOn && { backgroundColor: cat.bgColor }]}
                      onPress={() => toggleCategory(cat.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.catIconWrap, { backgroundColor: cat.color }]}>
                        <MaterialCommunityIcons name={cat.icon} size={13} color="#fff" />
                      </View>
                      <Text style={[styles.catTitle, { color: cat.color }]}>{cat.category}</Text>
                      <Text style={styles.catCountBadge}>
                        {selCount}/{catKeys.length}
                      </Text>
                      <MaterialCommunityIcons
                        name={
                          allCatOn   ? 'checkbox-marked' :
                          someCatOn  ? 'minus-box-outline' :
                                       'checkbox-blank-outline'
                        }
                        size={20}
                        color={allCatOn || someCatOn ? cat.color : '#D1D5DB'}
                      />
                    </TouchableOpacity>

                    {/* Individual page rows */}
                    <View style={styles.pagesContainer}>
                      {cat.pages.map((page) => {
                        const on = form.allowedPages.includes(page.key);
                        return (
                          <TouchableOpacity
                            key={page.key}
                            style={[styles.pageRow, on && { backgroundColor: cat.bgColor }]}
                            onPress={() => togglePage(page.key)}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons
                              name={page.icon}
                              size={15}
                              color={on ? cat.color : '#9CA3AF'}
                              style={styles.pageRowIcon}
                            />
                            <Text style={[styles.pageRowLabel, on && { color: cat.color, fontWeight: '700' }]}>
                              {page.label}
                            </Text>
                            <MaterialCommunityIcons
                              name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                              size={18}
                              color={on ? cat.color : '#D1D5DB'}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* ── Actions ────────────────────────────── */}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
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
                    <>
                      <MaterialCommunityIcons name="content-save-outline" size={16} color="#fff" />
                      <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Create User'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F5F3FF' },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: horizontalPadding, paddingBottom: 110 },

  // ── User cards ────────────────────────────────────────────
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  adminCard: { borderColor: '#7C3AED', borderWidth: 1.5 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarAdmin: { backgroundColor: '#7C3AED' },

  cardMeta:  { flex: 1 },
  cardName:  { fontSize: moderateScale(13), fontWeight: '800', color: '#111827' },
  cardEmail: { fontSize: moderateScale(11.5), color: '#374151', fontWeight: '600', marginTop: 1 },
  cardPhone: { fontSize: moderateScale(11), color: '#6B7280', marginTop: 1 },

  accessBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  accessBadgeText: { fontSize: moderateScale(10), fontWeight: '800' },

  iconBtns: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  cardDivider: { height: 1, backgroundColor: '#F3F0FF', marginVertical: 10 },
  allowedLabel: {
    fontSize: moderateScale(10.5),
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pageTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  pageTagText: { fontSize: moderateScale(10.5), fontWeight: '700' },

  // ── Empty ─────────────────────────────────────────────────
  empty:     { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyText: { fontSize: moderateScale(15), fontWeight: '700', color: '#7C3AED', marginTop: 14 },
  emptyHint: { fontSize: moderateScale(12), color: '#9CA3AF', marginTop: 4 },

  // ── FAB ───────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    bottom: 28,
    right: horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },

  // ── Modal ─────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle:  { fontSize: moderateScale(17), fontWeight: '800', color: '#1F2937' },
  modalScroll: { paddingHorizontal: 22, paddingBottom: 30 },

  sectionHead: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 12,
  },

  // ── Form fields ───────────────────────────────────────────
  fieldLabel:    { fontSize: moderateScale(12), fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: moderateScale(14),
    color: '#111827',
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
  },
  passwordRow:   { position: 'relative', marginBottom: 14 },
  passwordInput: { marginBottom: 0, paddingRight: 46 },
  eyeBtn:        { position: 'absolute', right: 12, top: 11 },

  // ── Permission section ────────────────────────────────────
  permHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
    marginTop: 4,
  },
  permCount: { fontSize: moderateScale(11), color: '#7C3AED', fontWeight: '600', marginTop: 2 },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    backgroundColor: '#F5F3FF',
  },
  selectAllBtnOn: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  selectAllTxt:   { fontSize: moderateScale(11), fontWeight: '700', color: '#7C3AED' },
  selectAllTxtOn: { color: '#fff' },

  // ── Category sections ─────────────────────────────────────
  catSection: {
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catTitle: {
    flex: 1,
    fontSize: moderateScale(12.5),
    fontWeight: '800',
  },
  catCountBadge: {
    fontSize: moderateScale(10.5),
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 4,
  },
  pagesContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  pageRowIcon: { flexShrink: 0 },
  pageRowLabel: {
    flex: 1,
    fontSize: moderateScale(13),
    fontWeight: '500',
    color: '#374151',
  },

  // ── Modal actions ─────────────────────────────────────────
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: '#7C3AED',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

export default WorkListPage;
