import React, { useCallback, useEffect, useState } from 'react';
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
import Header from '../components/Header';
import Card from '../components/Card';
import { loadGstSettings, saveGstSettings } from '../services/gstSettings';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const GSTSettingsPage = ({ navigation }) => {
  const [formState, setFormState] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const settings = await loadGstSettings();
    setFormState(settings);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateField = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const updateBankField = (field, value) => {
    setFormState((prev) => ({
      ...prev,
      bankDetails: {
        ...prev.bankDetails,
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!formState) return;
    setSaving(true);
    const result = await saveGstSettings(formState);
    setSaving(false);

    if (result.success) {
      Alert.alert('Saved ✓', 'GST settings saved to database successfully.');
      navigation.goBack();
    } else if (result.settings) {
      // Partial success — saved locally but DB unreachable
      Alert.alert(
        'Saved Locally',
        result.message || 'Settings saved on this device. Reconnect to sync with the server.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert('Error', 'Failed to save GST settings. Please try again.');
    }
  };

  if (!formState) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="GST Settings" showBack={true} onBackPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="GST Settings"
        subtitle="Tax defaults and bank details"
        showBack={true}
        onBackPress={() => navigation.goBack()}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Tax Defaults</Text>
            <View style={styles.row}>
              <FormInput label="CGST %" value={formState.cgstPercent} onChangeText={(value) => updateField('cgstPercent', value)} keyboardType="numeric" />
              <FormInput label="SGST %" value={formState.sgstPercent} onChangeText={(value) => updateField('sgstPercent', value)} keyboardType="numeric" />
            </View>
            <View style={styles.row}>
              <FormInput label="IGST %" value={formState.igstPercent} onChangeText={(value) => updateField('igstPercent', value)} keyboardType="numeric" />
              <FormInput label="GST Percentage" value={formState.gstPercentage} onChangeText={(value) => updateField('gstPercentage', value)} keyboardType="numeric" />
            </View>
            <FormInput label="HSN Code" value={formState.hsnCode} onChangeText={(value) => updateField('hsnCode', value)} />
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Bank Details</Text>
            <View style={styles.row}>
              <FormInput label="Bank Account Name" value={formState.bankDetails.bankAccountName} onChangeText={(value) => updateBankField('bankAccountName', value)} />
              <FormInput label="Account Number" value={formState.bankDetails.accountNumber} onChangeText={(value) => updateBankField('accountNumber', value)} />
            </View>
            <View style={styles.row}>
              <FormInput label="IFSC Code" value={formState.bankDetails.ifscCode} onChangeText={(value) => updateBankField('ifscCode', value)} />
              <FormInput label="Branch" value={formState.bankDetails.branch} onChangeText={(value) => updateBankField('branch', value)} />
            </View>
            <FormInput label="UPI ID" value={formState.bankDetails.upiId} onChangeText={(value) => updateBankField('upiId', value)} />
          </Card>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save GST Settings'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const FormInput = ({ label, ...props }) => (
  <View style={styles.inputBlock}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholderTextColor="#94A3B8"
      autoCorrect={false}
      {...props}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: horizontalPadding,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    borderRadius: 20,
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputBlock: {
    flex: 1,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: moderateScale(14),
  },
  saveButton: {
    marginTop: spacing.sm,
    backgroundColor: '#166534',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(15),
  },
});

export default GSTSettingsPage;
