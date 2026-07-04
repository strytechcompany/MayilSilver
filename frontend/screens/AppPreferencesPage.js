import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Header from '../components/Header';
import { fetchAppSettings, saveAppSettings } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const APP_VERSION = '1.0.0';

const AppPreferencesPage = ({ navigation }) => {
  const [appName, setAppName]       = useState('Mayil Silver');
  const [appLink, setAppLink]       = useState('');
  const [shareMessage, setShareMessage] = useState('Download our Billing App and manage your silver business easily.');
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchAppSettings();
    if (res.success && res.settings) {
      setAppName(res.settings.appName || 'Mayil Silver');
      setAppLink(res.settings.appLink || '');
      setShareMessage(res.settings.shareMessage || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const res = await saveAppSettings({ appName, appVersion: APP_VERSION, appLink, shareMessage });
    setSaving(false);
    if (res.success) {
      Alert.alert('Saved', 'App preferences updated successfully.');
    } else {
      Alert.alert('Error', 'Failed to save. Try again.');
    }
  };

  const handleShare = async () => {
    const link = appLink.trim();
    const msg  = shareMessage.trim();
    if (!link && !msg) {
      Alert.alert('Nothing to Share', 'Please add an App Link or Share Message first.');
      return;
    }
    try {
      const content = [msg, link].filter(Boolean).join('\n\n');
      await Share.share({ message: content, title: appName });
    } catch {
      Alert.alert('Error', 'Could not open share dialog.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="App Preferences" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header title="App Preferences" showBack onBackPress={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* App Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.appIconWrap}>
            <MaterialCommunityIcons name="cellphone-check" size={32} color="#2563EB" />
          </View>
          <View style={styles.appInfoText}>
            <Text style={styles.appInfoName}>{appName}</Text>
            <Text style={styles.appInfoVersion}>Version {APP_VERSION}</Text>
          </View>
        </View>

        {/* Share App Button */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
          <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
          <Text style={styles.shareBtnText}>Share App</Text>
        </TouchableOpacity>

        {/* Settings Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>App Name</Text>
            <TextInput
              style={styles.input}
              value={appName}
              onChangeText={setAppName}
              placeholder="Enter app name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={[styles.field, { marginBottom: 0 }]}>
            <Text style={styles.fieldLabel}>App Version</Text>
            <View style={styles.inputReadonly}>
              <Text style={styles.inputReadonlyText}>{APP_VERSION}</Text>
              <MaterialCommunityIcons name="lock-outline" size={15} color="#9CA3AF" />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share Settings</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>App Download Link</Text>
            <TextInput
              style={styles.input}
              value={appLink}
              onChangeText={setAppLink}
              placeholder="https://yourapplink.com"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={styles.fieldHint}>This link will be included when sharing the app.</Text>
          </View>

          <View style={[styles.field, { marginBottom: 0 }]}>
            <Text style={styles.fieldLabel}>Share Message</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={shareMessage}
              onChangeText={setShareMessage}
              placeholder="Custom message shown when sharing..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Share Preview */}
        {(shareMessage || appLink) ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Share Preview</Text>
            <View style={styles.previewBox}>
              <MaterialCommunityIcons name="whatsapp" size={18} color="#25D366" />
              <Text style={styles.previewText} numberOfLines={4}>
                {[shareMessage, appLink].filter(Boolean).join('\n\n')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.65 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name="content-save-outline" size={20} color="#fff" />
          }
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Preferences'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: horizontalPadding, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 14,
  },
  appIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  appInfoText: { flex: 1 },
  appInfoName: { fontSize: moderateScale(18), fontWeight: '800', color: '#1E3A8A' },
  appInfoVersion: { fontSize: moderateScale(12), color: '#6B7280', marginTop: 3 },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: spacing.xl,
  },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: moderateScale(15) },

  section: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },

  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: moderateScale(13), fontWeight: '600', color: '#374151', marginBottom: 6 },
  fieldHint: { fontSize: moderateScale(11), color: '#9CA3AF', marginTop: 4 },

  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: moderateScale(14),
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  inputMultiline: { height: 80, paddingTop: 10 },
  inputReadonly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#F3F4F6',
  },
  inputReadonlyText: { fontSize: moderateScale(14), color: '#6B7280' },

  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  previewBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'flex-start',
  },
  previewText: { flex: 1, fontSize: moderateScale(13), color: '#374151', lineHeight: 20 },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: spacing.sm,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: moderateScale(15) },
});

export default AppPreferencesPage;
