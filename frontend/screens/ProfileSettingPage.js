import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { AuthContext } from '../context/AuthContext';
import { changePassword, fetchProfile, updateProfile } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const EMPTY_PASSWORDS = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const ProfileSettingPage = ({ navigation }) => {
  const { currentUser, updateCurrentUser } = useContext(AuthContext);
  const [form, setForm] = useState({
    userName: currentUser?.userName || '',
    email: currentUser?.email || '',
  });
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loadMessage, setLoadMessage] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadMessage('');
    const res = await fetchProfile();
    if (res.success && res.profile) {
      setForm({
        userName: res.profile.userName || '',
        email: res.profile.email || '',
      });
      updateCurrentUser?.({
        userId: res.profile._id || currentUser?.userId || '',
        userName: res.profile.userName || '',
        email: res.profile.email || '',
        role: res.profile.role || currentUser?.role || 'user',
      });
    } else {
      setForm({
        userName: currentUser?.userName || '',
        email: currentUser?.email || '',
      });
      setLoadMessage(res.message || 'Could not load the latest profile details.');
    }
    setLoading(false);
  }, [currentUser?.email, currentUser?.role, currentUser?.userId, currentUser?.userName, updateCurrentUser]);

  useEffect(() => {
    if (!currentUser) return;
    setForm((prev) => ({
      userName: prev.userName || currentUser.userName || '',
      email: prev.email || currentUser.email || '',
    }));
  }, [currentUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProfile);
    return unsubscribe;
  }, [navigation, loadProfile]);

  const handleProfileSave = async () => {
    if (!form.userName.trim()) {
      Alert.alert('Validation', 'User name is required');
      return;
    }
    if (!form.email.trim()) {
      Alert.alert('Validation', 'Email address is required');
      return;
    }

    setSavingProfile(true);
    const res = await updateProfile({
      userName: form.userName.trim(),
      email: form.email.trim(),
    });
    setSavingProfile(false);

    if (!res.success) {
      Alert.alert('Error', res.message || 'Failed to update profile');
      return;
    }

    const profile = res.profile || {};
    setForm({
      userName: profile.userName || '',
      email: profile.email || '',
    });
    updateCurrentUser?.({
      userId: profile._id || currentUser?.userId || '',
      userName: profile.userName || '',
      email: profile.email || '',
      role: profile.role || currentUser?.role || 'user',
    });
    Alert.alert('Saved', 'Profile updated successfully.');
  };

  const handlePasswordSave = async () => {
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      Alert.alert('Validation', 'Please fill all password fields');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      Alert.alert('Validation', 'New password and confirm password must match');
      return;
    }

    setSavingPassword(true);
    const res = await changePassword(passwords);
    setSavingPassword(false);

    if (!res.success) {
      Alert.alert('Error', res.message || 'Failed to change password');
      return;
    }

    setPasswords(EMPTY_PASSWORDS);
    Alert.alert('Saved', 'Password changed successfully.');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="Profile Settings" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1D4ED8" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Profile Settings"
        subtitle="Manage account details and password"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loadMessage ? (
          <View style={styles.infoBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#92400E" />
            <Text style={styles.infoBannerText}>{loadMessage}</Text>
          </View>
        ) : null}

        <View style={styles.profileHero}>
          <View style={styles.profileAvatar}>
            <MaterialCommunityIcons name="account-circle-outline" size={42} color="#1D4ED8" />
          </View>
          <View style={styles.profileHeroText}>
            <Text style={styles.profileHeroName}>{form.userName || currentUser?.userName || 'User'}</Text>
            <Text style={styles.profileHeroEmail}>{form.email || currentUser?.email || 'No email available'}</Text>
          </View>
        </View>

        <SectionCard title="Profile Details" icon="account-cog-outline">
          <Field
            label="User Name"
            value={form.userName}
            onChangeText={(value) => setForm((prev) => ({ ...prev, userName: value }))}
            placeholder="Enter user name"
          />
          <Field
            label="Email Address"
            value={form.email}
            onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
            placeholder="Enter email address"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, savingProfile && styles.primaryBtnDisabled]}
            onPress={handleProfileSave}
            disabled={savingProfile}
            activeOpacity={0.85}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="content-save-outline" size={18} color="#fff" />
            )}
            <Text style={styles.primaryBtnText}>{savingProfile ? 'Saving...' : 'Edit Profile'}</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard title="Change Password" icon="lock-reset">
          <Field
            label="Current Password"
            value={passwords.currentPassword}
            onChangeText={(value) => setPasswords((prev) => ({ ...prev, currentPassword: value }))}
            placeholder="Enter current password"
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="New Password"
            value={passwords.newPassword}
            onChangeText={(value) => setPasswords((prev) => ({ ...prev, newPassword: value }))}
            placeholder="Enter new password"
            secureTextEntry
            autoCapitalize="none"
          />
          <Field
            label="Confirm Password"
            value={passwords.confirmPassword}
            onChangeText={(value) => setPasswords((prev) => ({ ...prev, confirmPassword: value }))}
            placeholder="Confirm new password"
            secureTextEntry
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.secondaryBtn, savingPassword && styles.primaryBtnDisabled]}
            onPress={handlePasswordSave}
            disabled={savingPassword}
            activeOpacity={0.85}
          >
            {savingPassword ? (
              <ActivityIndicator size="small" color="#1D4ED8" />
            ) : (
              <MaterialCommunityIcons name="shield-key-outline" size={18} color="#1D4ED8" />
            )}
            <Text style={styles.secondaryBtnText}>{savingPassword ? 'Updating...' : 'Change Password'}</Text>
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const SectionCard = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <MaterialCommunityIcons name={icon} size={18} color="#1E3A8A" />
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <View style={styles.cardBody}>{children}</View>
  </View>
);

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = 'words',
  keyboardType = 'default',
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94A3B8"
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: horizontalPadding, paddingBottom: spacing.xl * 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: spacing.md, color: '#64748B', fontSize: moderateScale(14) },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoBannerText: {
    flex: 1,
    color: '#92400E',
    fontSize: moderateScale(12),
    fontWeight: '600',
    lineHeight: 18,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeroText: { flex: 1 },
  profileHeroName: {
    fontSize: moderateScale(18),
    fontWeight: '900',
    color: '#0F172A',
  },
  profileHeroEmail: {
    marginTop: 4,
    fontSize: moderateScale(13),
    color: '#475569',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  cardTitle: { fontSize: moderateScale(15), fontWeight: '800', color: '#1E3A8A' },
  cardBody: { padding: spacing.md },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    marginBottom: 6,
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1D4ED8',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 4,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: moderateScale(14) },
  secondaryBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: moderateScale(14) },
});

export default ProfileSettingPage;
