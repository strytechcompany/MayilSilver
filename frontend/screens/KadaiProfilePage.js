import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Header from '../components/Header';
import { loadShopProfile, saveShopProfile, DEFAULT_SHOP_PROFILE } from '../services/shopProfile';
import { uploadShopSignature } from '../services/api';
import { LOGO_ASSET } from '../utils/shopBranding';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

// ── Theme (matches GstBillpreview premium silver) ─────────────
const C = {
  dark:       '#1C2B3A',
  silver:     '#8FA4B5',
  silverBg:   '#EEF2F5',
  silverBg2:  '#F5F7F9',
  border:     '#C8D4DC',
  borderDark: '#97A8B5',
  text:       '#1A2A38',
  textMid:    '#445C6E',
  textLight:  '#6B8496',
  white:      '#FFFFFF',
  accent:     '#E8EDF2',
};

const BANNER = C.dark;

// ── Live Header Preview ───────────────────────────────────────
const HeaderPreview = ({ form }) => (
  <View style={preview.card}>
    <Text style={preview.cardLabel}>LIVE PREVIEW</Text>
    <View style={preview.invoice}>
      {/* Top strip */}
      <View style={preview.topStrip}>
        <Text style={preview.topTitle}>Tax Invoice</Text>
        <Text style={preview.topOrig}>ORIGINAL FOR RECIPIENT</Text>
      </View>
      {/* Banner */}
      <View style={preview.banner}>
        <View style={preview.bannerTop}>
          <Text style={preview.bannerSmall}>
            GST IN:- {form.gstin || 'GSTIN NUMBER'}
          </Text>
          <Text style={preview.bannerSmall}>
            {form.phone || 'PHONE'}
          </Text>
        </View>
        <View style={preview.bannerCenter}>
          <Image
            source={LOGO_ASSET}
            style={preview.logo}
            resizeMode="contain"
          />
          <Text style={preview.shopName} numberOfLines={1}>
            {form.shopName || 'SHOP NAME'}
          </Text>
        </View>
        <Text style={preview.tagline} numberOfLines={1}>
          {form.tagline || 'Your tagline / subtitle here'}
        </Text>
      </View>
      {/* Address */}
      <View style={preview.addrStrip}>
        <Text style={preview.addrText} numberOfLines={1}>
          {[form.address, form.city].filter(Boolean).join(', ') || 'Shop Address, City'}
        </Text>
        {form.email ? (
          <Text style={preview.addrText} numberOfLines={1}>{form.email}</Text>
        ) : null}
      </View>
    </View>
  </View>
);

// ── Main Component ────────────────────────────────────────────
const KadaiProfilePage = ({ navigation }) => {
  const [form, setForm] = useState({ ...DEFAULT_SHOP_PROFILE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadShopProfile().then((profile) => {
      setForm({ ...DEFAULT_SHOP_PROFILE, ...profile });
      setLoading(false);
    });
  }, []);

  const set = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const pickSignature = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to upload a signature.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.45,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const { base64, mimeType } = result.assets[0];
      const mime = mimeType || 'image/jpeg';
      set('signatureBase64', `data:${mime};base64,${base64}`);
      // Upload to backend to get a hosted URL
      try {
        const uploadResult = await uploadShopSignature(base64, mime);
        console.log('[Signature] upload response:', uploadResult);
        if (uploadResult?.success && uploadResult.signatureUrl) {
          set('signatureUrl', uploadResult.signatureUrl);
        } else {
          console.log('[Signature] upload did not return signatureUrl:', uploadResult);
          Alert.alert(
            'Signature Upload Issue',
            (uploadResult?.message || 'Could not reach the server.') + ' The signature preview is set locally — tap "Save" below, and if it still fails, try again once your connection is stable.'
          );
        }
      } catch (err) {
        console.log('[Signature] upload failed:', err?.message || err);
        Alert.alert(
          'Signature Upload Issue',
          'Could not upload the signature to the server. The signature preview is set locally — tap "Save" below, and if it still fails, try again once your connection is stable.'
        );
      }
    }
  };

  const removeSignature = () => setForm((prev) => ({ ...prev, signatureBase64: '', signatureUrl: '' }));

  const handleSave = async () => {
    if (!form.shopName.trim()) {
      Alert.alert('Validation', 'Shop Name is required.');
      return;
    }
    setSaving(true);
    const result = await saveShopProfile(form);
    console.log('[Signature] saveShopProfile result:', {
      success: result.success,
      signatureBase64: result.profile?.signatureBase64 ? '(set)' : '(empty)',
      signatureUrl: result.profile?.signatureUrl || '(empty)',
    });
    const latestProfile = await loadShopProfile();
    console.log('[Signature] reloaded profile after save:', {
      signatureBase64: latestProfile?.signatureBase64 ? '(set)' : '(empty)',
      signatureUrl: latestProfile?.signatureUrl || '(empty)',
    });
    setForm({ ...DEFAULT_SHOP_PROFILE, ...latestProfile });
    setSaving(false);
    DeviceEventEmitter.emit('shopProfileUpdated', latestProfile);
    if (result.success) {
      Alert.alert('Saved', 'Kadai Profile saved successfully.');
    } else {
      Alert.alert('Partially Saved', result.message || 'Saved locally. Check server connection.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="Kadai Profile" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.dark} />
          <Text style={styles.loadingText}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Kadai Profile"
        subtitle="GST Bill Header Settings"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Live Header Preview ── */}
          <HeaderPreview form={form} />

          {/* ── Section: Shop Branding ── */}
          {/* Company Logo is a fixed brand asset (assets/logo.png) — no upload control here */}
          <SectionCard title="Shop Branding" icon="store-outline">
            <Field label="Shop Name *" value={form.shopName} onChangeText={(v) => set('shopName', v)} placeholder="e.g. SHRI MAYIL SILVER" autoCapitalize="characters" />
            <Field label="Tagline / Subtitle" value={form.tagline} onChangeText={(v) => set('tagline', v)} placeholder="e.g. Silver Wholesale & Retail Showroom" />
          </SectionCard>

          {/* ── Section: Contact & Identity ── */}
          <SectionCard title="Contact & Identity" icon="card-account-details-outline">
            <Field label="GST Number (GSTIN)" value={form.gstin} onChangeText={(v) => set('gstin', v)} placeholder="e.g. 33AEIFS5522D1ZA" autoCapitalize="characters" />
            <Field label="Primary Mobile" value={form.phone} onChangeText={(v) => set('phone', v)} placeholder="e.g. +91 99943 59013" keyboardType="phone-pad" />
            <Field label="Alternate Mobile" value={form.altPhone} onChangeText={(v) => set('altPhone', v)} placeholder="Optional" keyboardType="phone-pad" />
            <Field label="Email" value={form.email} onChangeText={(v) => set('email', v)} placeholder="e.g. shop@example.com" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Website" value={form.website} onChangeText={(v) => set('website', v)} placeholder="e.g. www.mayilsilver.com" autoCapitalize="none" />
          </SectionCard>

          {/* ── Section: Address ── */}
          <SectionCard title="Shop Address" icon="map-marker-outline">
            <Field label="Street Address" value={form.address} onChangeText={(v) => set('address', v)} placeholder="e.g. No.1 Naikkanukula Street, Big Bazzar" multiline />
            <Field label="City" value={form.city} onChangeText={(v) => set('city', v)} placeholder="e.g. Trichy - 620008" />
            <Field label="State Name" value={form.stateName} onChangeText={(v) => set('stateName', v)} placeholder="e.g. Tamil Nadu" />
            <Field label="State Code" value={form.stateCode} onChangeText={(v) => set('stateCode', v)} placeholder="e.g. 33" keyboardType="number-pad" />
          </SectionCard>

          {/* ── Section: Bank Details ── */}
          <SectionCard title="Bank Details" icon="bank-outline">
            <Field label="Bank Name" value={form.bankName} onChangeText={(v) => set('bankName', v)} placeholder="e.g. State Bank of India" />
            <Field label="Account Number" value={form.accountNumber} onChangeText={(v) => set('accountNumber', v)} placeholder="e.g. 1234567890" keyboardType="number-pad" />
            <Field label="IFSC Code" value={form.ifscCode} onChangeText={(v) => set('ifscCode', v)} placeholder="e.g. SBIN0001234" autoCapitalize="characters" />
            <Field label="Branch Name" value={form.branch} onChangeText={(v) => set('branch', v)} placeholder="e.g. Trichy Main Branch" />
          </SectionCard>

          {/* ── Section: Authorized Signature ── */}
          <SectionCard title="Authorized Signature" icon="draw-pen">
            <Text style={styles.fieldLabel}>Signature</Text>
            <View style={styles.logoRow}>
              {form.signatureBase64 ? (
                <Image
                  source={{ uri: form.signatureBase64 }}
                  style={styles.logoPreview}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.logoEmpty}>
                  <MaterialCommunityIcons name="image-plus" size={28} color={C.silver} />
                  <Text style={styles.logoEmptyText}>No signature</Text>
                </View>
              )}
              <View style={styles.logoBtns}>
                <TouchableOpacity style={styles.uploadBtn} onPress={pickSignature} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="upload" size={14} color={C.white} />
                  <Text style={styles.uploadBtnText}>
                    {form.signatureBase64 ? 'Change Signature' : 'Upload Signature'}
                  </Text>
                </TouchableOpacity>
                {form.signatureBase64 ? (
                  <TouchableOpacity style={styles.removeBtn} onPress={removeSignature} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="delete-outline" size={14} color="#DC2626" />
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </SectionCard>

          {/* ── Section: Invoice Content ── */}
          <SectionCard title="Invoice Content" icon="file-document-edit-outline">
            <Field
              label="Terms & Conditions"
              value={form.termsAndConditions}
              onChangeText={(v) => set('termsAndConditions', v)}
              placeholder="Enter your invoice terms & conditions…"
              multiline
              numberOfLines={4}
              autoCapitalize="sentences"
            />
            <Field
              label="Footer Notes"
              value={form.footerNotes}
              onChangeText={(v) => set('footerNotes', v)}
              placeholder="e.g. Thank you for your business!"
              multiline
            />
            <Field label="Financial Year" value={form.financialYear} onChangeText={(v) => set('financialYear', v)} placeholder="e.g. 2025-2026" />
          </SectionCard>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed Save Button ── */}
      <View style={styles.saveBar}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <MaterialCommunityIcons name="content-save-outline" size={18} color={C.white} />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving…' : 'Save Kadai Profile'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ── Reusable sub-components ───────────────────────────────────
const SectionCard = ({ title, icon, children }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <MaterialCommunityIcons name={icon} size={16} color={C.dark} />
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
  multiline = false,
  numberOfLines = 1,
  keyboardType = 'default',
  autoCapitalize = 'words',
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMulti]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={C.textLight}
      multiline={multiline}
      numberOfLines={multiline ? numberOfLines : 1}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

// ── Preview styles ────────────────────────────────────────────
const preview = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: C.borderDark,
  },
  cardLabel: {
    backgroundColor: C.dark,
    color: C.silver,
    fontSize: moderateScale(9),
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    paddingVertical: 5,
  },
  invoice: { backgroundColor: C.white },
  topStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.silverBg,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDark,
  },
  topTitle: { fontSize: moderateScale(9), fontWeight: '800', color: C.dark, letterSpacing: 0.5 },
  topOrig: { fontSize: moderateScale(7), fontWeight: '700', color: C.textMid },
  banner: {
    backgroundColor: BANNER,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: 2,
    borderBottomColor: C.silver,
    alignItems: 'center',
  },
  bannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  bannerSmall: { color: '#A8BDC9', fontSize: moderateScale(7.5), fontWeight: '600' },
  bannerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  logo: { width: 28, height: 28, borderRadius: 3 },
  logoPlaceholder: {
    width: 28, height: 28, borderRadius: 3,
    backgroundColor: '#2D3F50',
    alignItems: 'center', justifyContent: 'center',
  },
  shopName: { color: '#FFFFFF', fontSize: moderateScale(13), fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', flex: 1 },
  tagline: { color: C.silver, fontSize: moderateScale(7), textAlign: 'center' },
  addrStrip: {
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: C.silverBg2,
    alignItems: 'center',
  },
  addrText: { fontSize: moderateScale(8), color: C.textMid, textAlign: 'center' },
});

// ── Page styles ───────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DDE3E9' },
  scroll: { padding: horizontalPadding, paddingBottom: spacing.xl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.md, color: C.textMid, fontSize: moderateScale(14) },

  // Card
  card: {
    backgroundColor: C.white,
    borderRadius: 10,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#4A6070',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: C.silverBg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  cardTitle: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: C.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: { padding: spacing.md },

  // Logo upload
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: spacing.md,
    padding: 10,
    backgroundColor: C.silverBg2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: 6,
    backgroundColor: C.silverBg,
  },
  logoEmpty: {
    width: 64,
    height: 64,
    borderRadius: 6,
    backgroundColor: C.silverBg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  logoEmptyText: { fontSize: moderateScale(8), color: C.textLight },
  logoBtns: { gap: 8 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.dark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
  },
  uploadBtnText: { color: C.white, fontSize: moderateScale(11), fontWeight: '700' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeBtnText: { color: '#DC2626', fontSize: moderateScale(11), fontWeight: '600' },

  // Form field
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: C.textMid,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: moderateScale(13),
    color: C.text,
    backgroundColor: C.white,
  },
  inputMulti: {
    minHeight: 80,
    paddingTop: 10,
  },

  // Save bar
  saveBar: {
    paddingHorizontal: horizontalPadding,
    paddingVertical: 10,
    backgroundColor: '#DDE3E9',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.dark,
    paddingVertical: 14,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: C.white, fontSize: moderateScale(14), fontWeight: '800', letterSpacing: 0.3 },
});

export default KadaiProfilePage;
