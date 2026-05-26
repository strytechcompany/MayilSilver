import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import Header from '../components/Header';
import { loadGstSettings } from '../services/gstSettings';
import { loadShopProfile } from '../services/shopProfile';
import {
  buildPaymentBillHtml,
  buildSummary,
  getLogoDataUri,
} from '../utils/paymentUtils';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';
import { AppContext } from '../context/AppContext';

const BACKEND_URL = (require('../config').base_url || '').replace(/\/api\/?$/, '');

const loadSignatureSrc = async (profile) => {
  const url = profile?.signatureUrl;
  if (url) {
    try {
      const fullUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
      const cached = `${FileSystem.cacheDirectory}payment_sig_pdf.png`;
      const { uri: dl } = await FileSystem.downloadAsync(fullUrl, cached);
      const base64 = await FileSystem.readAsStringAsync(dl, { encoding: 'base64' });
      if (base64) return `data:image/png;base64,${base64}`;
    } catch {}
  }
  return '';
};

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtCurrency = (value) =>
  Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTime = (value) => {
  const date = new Date(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PaymentBillPreviewPage = ({ navigation, route }) => {
  const paymentData = route.params?.paymentData || null;
  const { goldRate } = useContext(AppContext);
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const resolvedDate = paymentData?.invoiceDate || paymentData?.updatedAt || paymentData?.createdAt;

  const directAmount = useMemo(() => toNumber(paymentData?.cash), [paymentData]);

  const infoRows = useMemo(() => ([
    { label: 'Customer', value: paymentData?.customerName || '-' },
    { label: 'Phone', value: paymentData?.phone || '-' },
    { label: 'GST No', value: paymentData?.gstNo || '-' },
    { label: 'Item', value: paymentData?.itemName || '-' },
    { label: 'Weight', value: paymentData?.weight ? `${Number(paymentData.weight).toFixed(1)} g` : '-' },
    { label: 'Silver Rate', value: paymentData?.ftRate ? `Rs ${fmtCurrency(paymentData.ftRate)}` : (goldRate ? `Rs ${fmtCurrency(goldRate)}` : '-') },
    { label: 'Amount', value: directAmount > 0 ? `Rs ${fmtCurrency(directAmount)}` : '-' },
    { label: 'Bill No', value: paymentData?.invoiceNumber || '-' },
    { label: 'Date & Time', value: resolvedDate ? fmtDateTime(resolvedDate) : '-' },
  ]), [paymentData, resolvedDate, goldRate, directAmount]);

  useEffect(() => {
    const buildPreview = async () => {
      if (!paymentData) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [profile, gstSettings] = await Promise.all([
          loadShopProfile(),
          loadGstSettings(),
        ]);
        const [logoSrc, signatureSrc] = await Promise.all([
          getLogoDataUri(profile),
          loadSignatureSrc(profile),
        ]);
        const summary = buildSummary(paymentData.cash, paymentData.weight, gstSettings);
        summary.rows[0].particular = paymentData.itemName || '';
        const silverRate = toNumber(paymentData?.ftRate) || toNumber(goldRate);
        if (silverRate > 0) summary.rows[0].rateNumeric = silverRate;

        const transaction = {
          customerName: paymentData.customerName,
          phone: paymentData.phone,
          address: paymentData.address,
          gstNo: paymentData.gstNo,
          invoiceNumber: paymentData.invoiceNumber,
          invoiceDate: resolvedDate,
        };

        const shopProfileForHtml = {
          name:               profile.shopName           || '',
          tagline:            profile.tagline            || '',
          gst:                profile.gstin              || '',
          phone:              profile.phone              || '',
          altPhone:           profile.altPhone           || '',
          address:            profile.address            || '',
          city:               profile.city               || '',
          email:              profile.email              || '',
          stateName:          profile.stateName          || '',
          stateCode:          profile.stateCode          || '',
          financialYear:      profile.financialYear      || '2025-2026',
          termsAndConditions: profile.termsAndConditions || '',
          signatureSrc:       signatureSrc               || '',
        };

        setHtml(buildPaymentBillHtml(transaction, summary, gstSettings, logoSrc, shopProfileForHtml));
      } catch (error) {
        console.error('PaymentBillPreview buildPreview:', error);
        Alert.alert('Error', 'Failed to load payment bill preview.');
      } finally {
        setLoading(false);
      }
    };

    buildPreview();
  }, [paymentData, resolvedDate, goldRate]);

  const handlePrint = async () => {
    if (!html) return;
    setPrinting(true);
    try {
      await Print.printAsync({ html });
    } catch (error) {
      console.error('PaymentBillPreview print:', error);
      Alert.alert('Error', 'Failed to print payment bill.');
    } finally {
      setPrinting(false);
    }
  };

  if (!paymentData) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="Payment Bill" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-document-outline" size={54} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No payment bill found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Payment Bill"
        subtitle={paymentData.invoiceNumber || ''}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          {infoRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.printBtn, printing && styles.printBtnDisabled]}
          onPress={handlePrint}
          disabled={printing || !html}
        >
          {printing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.printBtnText}>Print Bill</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.previewCard}>
          {loading ? (
            <ActivityIndicator size="large" color="#2563EB" style={styles.loader} />
          ) : (
            <WebView
              source={{ html }}
              originWhitelist={['*']}
              scrollEnabled={false}
              style={styles.webview}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: horizontalPadding, paddingBottom: spacing.xl * 2, gap: 14 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    flex: 0.9,
    color: '#64748B',
    fontSize: moderateScale(12),
    fontWeight: '700',
  },
  infoValue: {
    flex: 1.1,
    color: '#0F172A',
    fontSize: moderateScale(12),
    fontWeight: '600',
    textAlign: 'right',
  },
  printBtn: {
    backgroundColor: '#1C2B3A',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  printBtnDisabled: { opacity: 0.6 },
  printBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(15),
  },
  previewCard: {
    minHeight: 900,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  webview: {
    minHeight: 1400,
    backgroundColor: '#FFFFFF',
  },
  loader: {
    marginTop: 60,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#475569',
  },
});

export default PaymentBillPreviewPage;
