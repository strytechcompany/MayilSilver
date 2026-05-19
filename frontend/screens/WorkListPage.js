import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
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

const EMPTY_FORM = { email: '', password: '', gstBillEnabled: false };

const WorkListPage = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
    setForm({ email: user.email, password: '', gstBillEnabled: user.gstBillEnabled });
    setShowPassword(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.email.trim()) {
      Alert.alert('Validation', 'Email is required');
      return;
    }
    if (!editingId && !form.password.trim()) {
      Alert.alert('Validation', 'Password is required for new users');
      return;
    }

    setSaving(true);
    const payload = { email: form.email.trim(), gstBillEnabled: form.gstBillEnabled };
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
      `Remove ${user.email}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteUser(user._id);
            if (res.success) loadUsers();
            else Alert.alert('Error', res.message || 'Delete failed');
          },
        },
      ]
    );
  };

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
          {/* Admin row — always present, non-editable */}
          <View style={styles.userCard}>
            <View style={styles.userLeft}>
              <View style={[styles.avatar, styles.avatarAdmin]}>
                <MaterialCommunityIcons name="shield-crown-outline" size={18} color="#fff" />
              </View>
              <View>
                <Text style={styles.userEmail}>mayilsilver@gmail.com</Text>
                <Text style={styles.userRole}>Admin · Full Access</Text>
              </View>
            </View>
            <View style={[styles.gstBadge, styles.gstBadgeOn]}>
              <Text style={styles.gstBadgeText}>GST ON</Text>
            </View>
          </View>

          {/* Sub-users */}
          {users.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-off-outline" size={40} color="#C4B5FD" />
              <Text style={styles.emptyText}>No sub-users yet.</Text>
              <Text style={styles.emptyHint}>Tap + Add User to create one.</Text>
            </View>
          ) : (
            users.map((user) => (
              <View key={user._id} style={styles.userCard}>
                <View style={styles.userLeft}>
                  <View style={styles.avatar}>
                    <MaterialCommunityIcons name="account-outline" size={18} color="#7C3AED" />
                  </View>
                  <View>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.userRole}>
                      {user.gstBillEnabled ? 'GST User' : 'Regular User'}
                    </Text>
                  </View>
                </View>
                <View style={styles.userRight}>
                  <View style={[styles.gstBadge, user.gstBillEnabled ? styles.gstBadgeOn : styles.gstBadgeOff]}>
                    <Text style={styles.gstBadgeText}>{user.gstBillEnabled ? 'GST ON' : 'GST OFF'}</Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(user)}>
                    <MaterialCommunityIcons name="pencil-outline" size={18} color="#6B7280" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(user)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <MaterialCommunityIcons name="account-plus-outline" size={22} color="#fff" />
        <Text style={styles.fabText}>Add User</Text>
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit User' : 'Add User'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <MaterialCommunityIcons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Email</Text>
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
              Password{editingId ? ' (leave blank to keep current)' : ''}
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

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>GST Bill Access</Text>
                <Text style={styles.toggleHint}>
                  {form.gstBillEnabled ? 'Can access GST billing pages' : 'Regular billing only'}
                </Text>
              </View>
              <Switch
                value={form.gstBillEnabled}
                onValueChange={(v) => setForm((f) => ({ ...f, gstBillEnabled: v }))}
                trackColor={{ false: '#E5E7EB', true: '#7C3AED' }}
                thumbColor="#fff"
              />
            </View>

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
                  <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Create'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: {
    padding: horizontalPadding,
    paddingBottom: 100,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },

  userLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAdmin: { backgroundColor: '#7C3AED' },

  userEmail: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#1F2937',
  },
  userRole: {
    fontSize: moderateScale(11),
    color: '#6B7280',
    marginTop: 1,
  },

  userRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  gstBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  gstBadgeOn: { backgroundColor: '#D1FAE5' },
  gstBadgeOff: { backgroundColor: '#F3F4F6' },
  gstBadgeText: { fontSize: moderateScale(9.5), fontWeight: '700', color: '#374151' },

  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xl * 2 },
  emptyText: { fontSize: moderateScale(15), fontWeight: '700', color: '#7C3AED', marginTop: 12 },
  emptyHint: { fontSize: moderateScale(12), color: '#9CA3AF', marginTop: 4 },

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

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: moderateScale(17), fontWeight: '800', color: '#1F2937' },

  fieldLabel: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
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

  passwordRow: { position: 'relative', marginBottom: 14 },
  passwordInput: { marginBottom: 0, paddingRight: 46 },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 11,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  toggleLabel: { fontSize: moderateScale(14), fontWeight: '700', color: '#1F2937' },
  toggleHint: { fontSize: moderateScale(11), color: '#7C3AED', marginTop: 2 },

  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelBtnText: { color: '#374151', fontWeight: '700', fontSize: moderateScale(14) },
  saveBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#7C3AED',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: moderateScale(14) },
});

export default WorkListPage;
