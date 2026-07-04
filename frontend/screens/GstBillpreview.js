import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'qrcode';
import Header from '../components/Header';
import { fetchGstCustomerById, updateGstCustomer, uploadInvoicePdf } from '../services/api';
import { AppContext } from '../context/AppContext';
import { loadGstSettings } from '../services/gstSettings';
import { DEFAULT_SHOP_PROFILE, loadShopProfile } from '../services/shopProfile';
import { GST_EDITABLE_INVOICE_KEY, reserveNextInvoiceNumber } from '../utils/paymentUtils';
import { base_url } from '../config';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const LOGO_ASSET = require('../assets/logo.png');
const backend_url = base_url.replace(/\/api\/?$/, '');

// ── Premium Silver Jewellery Theme ────────────────────────────────────────────
const C = {
  dark:        '#1C2B3A',   // deep charcoal-navy — primary brand
  darkMid:     '#243447',   // slightly lighter dark
  silver:      '#8FA4B5',   // muted silver-blue accent
  silverLight: '#A8BDC9',   // light silver for text on dark bg
  silverBg:    '#EEF2F5',   // section backgrounds
  silverBg2:   '#F5F7F9',   // alternating row / subtle fills
  border:      '#C8D4DC',   // silver border
  borderDark:  '#97A8B5',   // stronger silver divider
  text:        '#1A2A38',   // primary text
  textMid:     '#445C6E',   // label text
  textLight:   '#6B8496',   // helper / secondary text
  white:       '#FFFFFF',
  offWhite:    '#FAFCFD',
};

const BANNER_COLOR = C.dark;

// ── Pure utility helpers (unchanged) ─────────────────────────────────────────
const toNum = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value) =>
  toNum(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatWeight = (value) =>
  `${toNum(value).toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gram`;

const formatDisplayDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${parsed.getDate().toString().padStart(2, '0')}-${(parsed.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${parsed.getFullYear()}`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const numberToWordsIndian = (value) => {
  const number = Math.round(toNum(value));
  if (!number) return 'INR Zero Only';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
  const threeDigits = (n) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const ht = h ? `${ones[h]} Hundred` : '';
    const rt = r ? twoDigits(r) : '';
    return `${ht}${ht && rt ? ' ' : ''}${rt}`.trim();
  };
  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor((number % 10000000) / 100000);
  const thousand = Math.floor((number % 100000) / 1000);
  const remainder = number % 1000;
  const parts = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (remainder) parts.push(threeDigits(remainder));
  return `INR ${parts.join(' ')} Only`;
};

const normalizeInvoiceRows = (rows, ftRateValue, settings) =>
  rows.map((row, index) => {
    const weightNumeric = toNum(row.weight);
    const rateNumeric = toNum(row.rate) > 0 ? toNum(row.rate) : toNum(ftRateValue);
    const hsnCode = row.hsnCode || settings?.hsnCode || '';
    const taxableValueNumeric =
      toNum(row.taxableValue) > 0
        ? toNum(row.taxableValue)
        : parseFloat((weightNumeric * rateNumeric).toFixed(2));
    const cgstPercent = toNum(settings?.cgstPercent, 1.5);
    const sgstPercent = toNum(settings?.sgstPercent, 1.5);
    const cgstNumeric =
      toNum(row.cgst) > 0
        ? toNum(row.cgst)
        : parseFloat((taxableValueNumeric * cgstPercent / 100).toFixed(2));
    const sgstNumeric =
      toNum(row.sgst) > 0
        ? toNum(row.sgst)
        : parseFloat((taxableValueNumeric * sgstPercent / 100).toFixed(2));
    const totalNumeric =
      toNum(row.total) > 0
        ? toNum(row.total)
        : parseFloat((taxableValueNumeric + cgstNumeric + sgstNumeric).toFixed(2));
    return {
      ...row,
      sno: row.sno || index + 1,
      hsnCode,
      weightNumeric,
      rateNumeric,
      taxableValueNumeric,
      cgstNumeric,
      sgstNumeric,
      totalNumeric,
    };
  });


const buildPreviewQrUri = (text) => {
  const size = 29; let seed = 0;
  for (let i = 0; i < text.length; i++) seed = ((seed * 31) + text.charCodeAt(i)) % 2147483647;
  const next = () => { seed = (seed * 48271) % 2147483647; return seed % 2; };
  const cell = 4; const pad = 4; const full = size * cell + pad * 2;
  const finder = (x, y) =>
    `<rect x="${x}" y="${y}" width="${cell*7}" height="${cell*7}" fill="#111827"/>` +
    `<rect x="${x+cell}" y="${y+cell}" width="${cell*5}" height="${cell*5}" fill="#fff"/>` +
    `<rect x="${x+cell*2}" y="${y+cell*2}" width="${cell*3}" height="${cell*3}" fill="#111827"/>`;
  let b = '';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const inF = (r<7&&c<7)||(r<7&&c>=size-7)||(r>=size-7&&c<7);
    if (!inF && next()) b += `<rect x="${pad+c*cell}" y="${pad+r*cell}" width="${cell}" height="${cell}" fill="#111827"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${full}" height="${full}" viewBox="0 0 ${full} ${full}"><rect width="${full}" height="${full}" fill="#fff"/>${finder(pad,pad)}${finder(pad+(size-7)*cell,pad)}${finder(pad,pad+(size-7)*cell)}${b}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const toInvoiceFilename = (invoiceNumber) =>
  `invoice_${String(invoiceNumber || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

// ── Main Component ────────────────────────────────────────────────────────────
const GstBillpreview = ({ navigation, route }) => {
  const { ftRate } = useContext(AppContext);
  const transactionId = route?.params?.transactionId || null;
  const initialTransaction = route?.params?.transaction || null;

  const [transaction, setTransaction] = useState(initialTransaction);
  const [gstSettings, setGstSettings] = useState(null);
  const [shopProfile, setShopProfile] = useState({ ...DEFAULT_SHOP_PROFILE });
  const [logoDataUri, setLogoDataUri] = useState('');
  const [qrSvg, setQrSvg] = useState('');
  const [loading, setLoading] = useState(Boolean(transactionId && !initialTransaction));
  const [busyAction, setBusyAction] = useState('');
  const [editableInvoiceNumber, setEditableInvoiceNumber] = useState('');

  const refreshShopProfile = useCallback(async () => {
    const freshProfile = await loadShopProfile();
    setShopProfile({ ...DEFAULT_SHOP_PROFILE, ...freshProfile });
    setLogoDataUri('');
  }, []);

  useEffect(() => {
    loadGstSettings().then(setGstSettings);
    refreshShopProfile();
  }, [refreshShopProfile]);

  // Reload profile every time this screen comes into focus so KadaiProfile edits reflect immediately
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refreshShopProfile();
      loadGstSettings().then(setGstSettings);
    });
    return unsubscribe;
  }, [navigation, refreshShopProfile]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('shopProfileUpdated', (freshProfile) => {
      setShopProfile({ ...DEFAULT_SHOP_PROFILE, ...(freshProfile || {}) });
      setLogoDataUri('');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!transaction?.invoiceNumber) return;
    const url = `${backend_url}/invoices/${toInvoiceFilename(transaction.invoiceNumber)}`;
    QRCode.toString(url, { type: 'svg', margin: 1, width: 84 })
      .then(setQrSvg)
      .catch(() => setQrSvg(''));
  }, [transaction?.invoiceNumber]);

  useEffect(() => {
    setEditableInvoiceNumber(transaction?.invoiceNumber || '');
  }, [transaction?.invoiceNumber]);

  // Load logo from DB (base64 first, then backend URL, never local asset)
  useEffect(() => {
    const loadLogo = async () => {
      const b64 = shopProfile?.logoBase64;
      const url = shopProfile?.logoUrl;

      if (b64) {
        setLogoDataUri(b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);
        return;
      }
      if (url) {
        try {
          const fullUrl = url.startsWith('http') ? url : `${backend_url}${url}`;
          const cacheFile = `${FileSystem.cacheDirectory}gst_logo_pdf.png`;
          const { uri: dl } = await FileSystem.downloadAsync(fullUrl, cacheFile);
          const base64 = await FileSystem.readAsStringAsync(dl, { encoding: 'base64' });
          setLogoDataUri(`data:image/png;base64,${base64}`);
        } catch {
          setLogoDataUri('');
        }
        return;
      }
      setLogoDataUri('');
    };
    loadLogo();
  }, [shopProfile]);

  const loadTransaction = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const data = await fetchGstCustomerById(transactionId);
      if (!data) { Alert.alert('Error', 'GST invoice data not found'); return; }
      setTransaction(data);
    } catch {
      Alert.alert('Error', 'Failed to load GST invoice');
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    if (transactionId && !initialTransaction) loadTransaction();
  }, [transactionId, initialTransaction, loadTransaction]);

  const invoiceSummary = useMemo(() => {
    const rows = normalizeInvoiceRows(transaction?.billDetails || [], ftRate, gstSettings);
    const cgst = rows.reduce((s, r) => s + r.cgstNumeric, 0);
    const sgst = rows.reduce((s, r) => s + r.sgstNumeric, 0);
    const grandTotal =
      rows.reduce((s, r) => s + r.totalNumeric, 0) || toNum(transaction?.totalInvoiceValue);
    const roundedTotal = Math.round(grandTotal);
    const roundOff = roundedTotal - grandTotal;
    const qrText = `INV:${transaction?.invoiceNumber || '-'}|AMT:${(roundedTotal || grandTotal).toFixed(2)}`;
    return {
      rows,
      cgst,
      sgst,
      roundOff,
      grandTotal: roundedTotal || grandTotal,
      amountInWords: numberToWordsIndian(roundedTotal || grandTotal),
      previewQrUri: buildPreviewQrUri(qrText),
    };
  }, [transaction, ftRate, gstSettings]);

  const profile = useMemo(() => ({
    name:               shopProfile?.shopName           || '',
    tagline:            shopProfile?.tagline            || '',
    gst:                shopProfile?.gstin              || '',
    phone:              shopProfile?.phone              || '',
    address:            shopProfile?.address            || '',
    city:               shopProfile?.city               || '',
    stateName:          shopProfile?.stateName          || '',
    stateCode:          shopProfile?.stateCode          || '',
    email:              shopProfile?.email              || '',
    logoBase64:         shopProfile?.logoBase64         || '',
    financialYear:      shopProfile?.financialYear      || '2025-2026',
    bankName:           shopProfile?.bankName           || '',
    accountNumber:      shopProfile?.accountNumber      || '',
    ifscCode:           shopProfile?.ifscCode           || '',
    branch:             shopProfile?.branch             || '',
    termsAndConditions: shopProfile?.termsAndConditions || '',
  }), [shopProfile]);

  const runPrintAction = async (type) => {
    if (!transaction) return;
    setBusyAction(type);
    try {
      const trimmedInvoiceNumber = editableInvoiceNumber.trim();
      if (!trimmedInvoiceNumber) {
        Alert.alert('Required', 'Enter invoice number');
        return;
      }

      let workingTransaction = transaction;
      let workingQrSvg = qrSvg;
      if (trimmedInvoiceNumber !== transaction.invoiceNumber) {
        const response = await updateGstCustomer(transaction._id, { invoiceNumber: trimmedInvoiceNumber });
        if (!response?.success || !response.transaction) {
          Alert.alert('Error', response?.message || 'Failed to update invoice number');
          return;
        }
        workingTransaction = response.transaction;
        setTransaction(response.transaction);
        const url = `${backend_url}/invoices/${toInvoiceFilename(response.transaction.invoiceNumber)}`;
        workingQrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 84 }).catch(() => qrSvg);
        setQrSvg(workingQrSvg);
      }

      const html = buildInvoiceHtml(workingTransaction, invoiceSummary, gstSettings, logoDataUri, profile, workingQrSvg);
      if (type === 'print') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html, base64: false });
        // Upload PDF to server so the QR link works when scanned
        const pdfFilename = toInvoiceFilename(workingTransaction.invoiceNumber);
        FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
          .then((b64) => uploadInvoicePdf(workingTransaction._id, b64, pdfFilename))
          .catch((e) => console.warn('[GST Invoice] PDF upload:', e?.message));
        if (type === 'download') {
          Alert.alert('PDF Ready', `Invoice saved.\n${uri}`);
        } else if (type === 'share') {
          const ok = await Sharing.isAvailableAsync();
          if (!ok) { Alert.alert('Sharing Unavailable', `PDF at: ${uri}`); return; }
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share GST Invoice' });
        }
      }
      await reserveNextInvoiceNumber(GST_EDITABLE_INVOICE_KEY, trimmedInvoiceNumber);
    } catch {
      Alert.alert('Error', 'Failed to generate GST invoice');
    } finally {
      setBusyAction('');
    }
  };

  if (!transaction && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="GST Bill Preview" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-document-outline" size={52} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No GST invoice selected</Text>
          <Text style={styles.emptySubtitle}>Open a GST customer and tap Print to preview the bill.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Header title="GST Bill Preview" showBack onBackPress={() => navigation.goBack()} />
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#111111" />
          <Text style={styles.emptyTitle}>Preparing invoice</Text>
          <Text style={styles.emptySubtitle}>Loading GST bill details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const cgstPct = gstSettings?.cgstPercent || '1.50';
  const sgstPct = gstSettings?.sgstPercent || '1.50';
  const hsnCode = gstSettings?.hsnCode || '71141110';
  const gstPct  = gstSettings?.gstPercentage || '3';

  const bankName    = transaction?.bankDetails?.bankAccountName  || gstSettings?.bankDetails?.bankAccountName  || '-';
  const bankAccount = transaction?.bankDetails?.accountNumber    || gstSettings?.bankDetails?.accountNumber    || '-';
  const bankIfsc    = transaction?.bankDetails?.ifscCode         || gstSettings?.bankDetails?.ifscCode         || '-';
  const bankBranch  = transaction?.bankDetails?.branch           || gstSettings?.bankDetails?.branch           || '-';
  const upiId       = transaction?.bankDetails?.upiId            || gstSettings?.bankDetails?.upiId            || '-';

  const absRoundOff = Math.abs(invoiceSummary.roundOff).toFixed(2);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="GST Bill Preview"
        subtitle="Tax Invoice"
        showBack
        onBackPress={() => navigation.goBack()}
        rightIcon="refresh"
        onRightPress={loadTransaction}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Action Buttons ── */}
        <View style={styles.actionBar}>
          <ActionBtn
            icon="printer-outline"
            label={busyAction === 'print' ? 'Generating…' : 'Print Bill'}
            onPress={() => runPrintAction('print')}
          />
          <ActionBtn
            icon="download-outline"
            label={busyAction === 'download' ? 'Saving…' : 'Download PDF'}
            onPress={() => runPrintAction('download')}
          />
          <ActionBtn
            icon="whatsapp"
            label={busyAction === 'share' ? 'Sharing…' : 'WhatsApp'}
            onPress={() => runPrintAction('share')}
          />
        </View>

        {/* ── Invoice Paper ── */}
        <View style={styles.invoiceEditCard}>
          <Text style={styles.invoiceEditLabel}>Invoice Number</Text>
          <TextInput
            style={styles.invoiceEditInput}
            value={editableInvoiceNumber}
            onChangeText={setEditableInvoiceNumber}
            placeholder="Enter invoice number"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.paper}>

          {/* 1. Top Title Strip */}
          <View style={styles.topStrip}>
            <Text style={styles.topStripTitle}>Tax Invoice</Text>
            <Text style={styles.topStripOriginal}>ORIGINAL FOR RECIPIENT</Text>
          </View>

          {/* 2. Company Banner */}
          <View style={styles.banner}>
            <View style={styles.bannerTopRow}>
              <Text style={styles.bannerGst}>GST IN:- {profile.gst}</Text>
              <Text style={styles.bannerPhone}>{profile.phone}</Text>
            </View>
            <View style={styles.bannerLogoRow}>
              <Image
                source={logoDataUri ? { uri: logoDataUri } : LOGO_ASSET}
                style={styles.bannerLogo}
                resizeMode="contain"
              />
              <Text style={styles.bannerName}>{profile.name}</Text>
            </View>
            <Text style={styles.bannerTagline}>{profile.tagline}</Text>
          </View>

          {/* 3. Address Strip */}
          <View style={styles.addressStrip}>
            <Text style={styles.addressLine}>
              {profile.address} {profile.city}
            </Text>
            {profile.email ? <Text style={styles.addressLine}>{profile.email}</Text> : null}
          </View>

          {/* 4. IRN Row
          <View style={styles.irnRow}>
            <View style={styles.irnTextRow}>
              <Text style={styles.irnLabel}>IRN No</Text>
              <Text style={styles.irnColon}> : </Text>
              <Text style={styles.irnValue} numberOfLines={1}>{transaction?.irnNumber || '-'}</Text>
            </View>
            <View style={styles.irnSubRow}>
              <View style={styles.irnTextRow}>
                <Text style={styles.irnLabel}>Ack. No.</Text>
                <Text style={styles.irnColon}> : </Text>
                <Text style={styles.irnValue}>{transaction?.ackNumber || '-'}</Text>
              </View>
              <View style={[styles.irnTextRow, { marginLeft: 12 }]}>
                <Text style={styles.irnLabel}>Ack. Date</Text>
                <Text style={styles.irnColon}> : </Text>
                <Text style={styles.irnValue}>{formatDisplayDate(transaction?.ackDate)}</Text>
              </View>
            </View>
          </View> */}

          {/* 5. Customer + Invoice Details */}
          <View style={styles.detailsRow}>
            {/* Left: Customer */}
            <View style={styles.customerBox}>
              <DetailRow label="Name"       value={transaction?.customerName || '-'} />
              <DetailRow label="Phone"      value={transaction?.phone || '-'} />
            </View>
            {/* Right: Invoice */}
            <View style={styles.invoiceBox}>
              <DetailRow label="Invoice Number" value={transaction?.invoiceNumber || '-'} />
              <DetailRow label="Invoice Date" value={formatDisplayDate(transaction?.invoiceDate)} />
              <DetailRow label="Mobile No" value={transaction?.phone || '-'} />
            </View>
          </View>

          {/* 6. Item Table */}
          <View style={styles.tableWrap}>
            {/* Table Header */}
            <View style={styles.tableHead}>
              <Text style={[styles.th, { flex: 0.42, textAlign: 'center' }]}>{'S\nNo'}</Text>
              <Text style={[styles.th, { flex: 2.1 }]}>Descriptions</Text>
              <Text style={[styles.th, { flex: 1.05, textAlign: 'center' }]}>{'HSN\nCode'}</Text>
              <Text style={[styles.th, { flex: 0.72, textAlign: 'center' }]}>{'GST\nRate'}</Text>
              <Text style={[styles.th, { flex: 1.15, textAlign: 'right' }]}>Weight</Text>
              <Text style={[styles.th, { flex: 0.88, textAlign: 'right' }]}>Rate</Text>
              <Text style={[styles.th, { flex: 1.1, textAlign: 'right', borderRightWidth: 0 }]}>Amount</Text>
            </View>

            {/* Data Rows */}
            {invoiceSummary.rows.map((row, index) => (
              <View
                key={`row-${index}`}
                style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
              >
                <Text style={[styles.td, { flex: 0.42, textAlign: 'center' }]}>{index + 1}</Text>
                <Text style={[styles.td, { flex: 2.1 }]}>{row.particular || 'SILVER ARTICLES'}</Text>
                <Text style={[styles.td, { flex: 1.05, textAlign: 'center' }]}>{row.hsnCode || hsnCode}</Text>
                <Text style={[styles.td, { flex: 0.72, textAlign: 'center' }]}>{gstPct}%</Text>
                <Text style={[styles.td, { flex: 1.15, textAlign: 'right' }]}>{formatWeight(row.weightNumeric)}</Text>
                <Text style={[styles.td, { flex: 0.88, textAlign: 'right' }]}>{formatCurrency(row.rateNumeric)}</Text>
                <Text style={[styles.td, { flex: 1.1, textAlign: 'right', borderRightWidth: 0 }]}>
                  {formatCurrency(row.taxableValueNumeric)}
                </Text>
              </View>
            ))}

          </View>

          {/* 7. GST Summary — right-side only (matches reference image layout) */}
          <View style={styles.taxSummarySection}>
            <View style={styles.taxSummaryRight}>
              <TaxRow label={`CGST Output ${cgstPct}%`} value={formatCurrency(invoiceSummary.cgst)} />
              <TaxRow label={`SGST Output ${sgstPct}%`} value={formatCurrency(invoiceSummary.sgst)} />
              <TaxRow label="Round Off" value={`(-)${absRoundOff}`} isLast />
            </View>
          </View>

          {/* Total Bar */}
          <View style={styles.totalBar}>
            <Text style={styles.totalBarLabel}>Total</Text>
            <Text style={styles.totalBarValue}>{formatCurrency(invoiceSummary.grandTotal)}</Text>
          </View>

          {/* 8. Amount In Words */}
          <View style={styles.wordsSection}>
            <Text style={styles.wordsTitle}>Amount In Words:-</Text>
            <Text style={styles.wordsBody}>{invoiceSummary.amountInWords}.</Text>
          </View>

          {/* 9. Remarks */}
          {transaction?.remarks ? (
            <View style={styles.remarksSection}>
              <Text style={styles.remarksText}>
                <Text style={styles.remarksLabel}>Remarks : </Text>
                {transaction.remarks}
              </Text>
            </View>
          ) : null}

          {/* 10. Terms & Conditions + Bank Details */}
          <View style={styles.footerSection}>
            <View style={styles.tcBox}>
              <Text style={styles.sectionHeading}>Terms & Conditions</Text>
              <Text style={styles.tcLine}>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</Text>
              <Text style={styles.tcLine}>Interest@15% per annum will be charged for the bills not paid within 15 days.</Text>
              <Text style={styles.tcLine}>Goods once sold will not be taken back.</Text>
              <Text style={styles.tcLine}>No E way bill is required for goods covered under this invoice as per SR NO.150/151 of CGST Rule 138(14).</Text>
            </View>
            <View style={styles.bankBox}>
              <Text style={styles.sectionHeading}>Company's Bank Details</Text>
              <BankRow label="Bank Name" value={bankName} />
              <BankRow label="A/c No." value={bankAccount} />
              <BankRow label="Branch & IFS Code" value={`${bankBranch} / ${bankIfsc}`} />
              {upiId !== '-' ? <BankRow label="UPI ID" value={upiId} /> : null}
              <Text style={styles.companyStamp}>
                {'for '}
                {profile.name}
                {`\n[${profile.financialYear}]`}
              </Text>
            </View>
          </View>

          {/* 11. Signature Section */}
          <View style={styles.sigSection}>
            <View style={styles.sigLeft}>
              <Text style={styles.sigLabel}>Customer Signature</Text>
            </View>
            <View style={styles.sigRight}>
              <Text style={styles.sigCompany}>for {profile.name}</Text>
              <Text style={styles.sigLabel}>Authorised Signatory</Text>
            </View>
          </View>

          {/* 12. Bottom Totals Bar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomItem}>
              <Text style={styles.bottomLabel}>Sales Value</Text>
              <Text style={styles.bottomColon}> : </Text>
              <Text style={styles.bottomValue}>{formatCurrency(invoiceSummary.grandTotal)}</Text>
            </View>
            <View style={[styles.bottomItem, styles.bottomItemMid]}>
              <Text style={styles.bottomLabel}>Purchase Value</Text>
              <Text style={styles.bottomColon}> : </Text>
              <Text style={styles.bottomValue}> </Text>
            </View>
            <View style={[styles.bottomItem, styles.bottomItemRight]}>
              <Text style={styles.bottomLabel}>Receivable Amount:</Text>
              <Text style={[styles.bottomValue, { marginLeft: 4 }]}>
                {formatCurrency(invoiceSummary.grandTotal)}
              </Text>
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────
const ActionBtn = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
    <MaterialCommunityIcons name={icon} size={15} color="#FFFFFF" />
    <Text style={styles.actionBtnText}>{label}</Text>
  </TouchableOpacity>
);

const DetailRow = ({ label, value }) => (
  <View style={styles.detailRowInner}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailColon}>:</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const TaxRow = ({ label, value, isLast = false }) => (
  <View style={[styles.taxRow, isLast && styles.taxRowLast]}>
    <Text style={styles.taxRowLabel}>{label}</Text>
    <Text style={styles.taxRowValue}>{value}</Text>
  </View>
);

const BankRow = ({ label, value }) => (
  <View style={styles.bankRowInner}>
    <Text style={styles.bankLabel}>{label}</Text>
    <Text style={styles.bankColon}> : </Text>
    <Text style={styles.bankValue}>{value}</Text>
  </View>
);

// ── HTML builder for PDF / Print ─────────────────────────────────────────────
const buildInvoiceHtml = (transaction, summary, settings, logoSrc = '', profile = COMPANY, qrSvgStr = '') => {
  const cgstPct    = settings?.cgstPercent    || '1.50';
  const sgstPct    = settings?.sgstPercent    || '1.50';
  const hsnCode    = settings?.hsnCode        || '71141110';
  const gstPct     = settings?.gstPercentage  || '3';
  const bankName    = transaction?.bankDetails?.bankAccountName || settings?.bankDetails?.bankAccountName || '-';
  const bankAccount = transaction?.bankDetails?.accountNumber   || settings?.bankDetails?.accountNumber   || '-';
  const bankIfsc    = transaction?.bankDetails?.ifscCode        || settings?.bankDetails?.ifscCode        || '-';
  const bankBranch  = transaction?.bankDetails?.branch          || settings?.bankDetails?.branch          || '-';
  const upiId       = transaction?.bankDetails?.upiId           || settings?.bankDetails?.upiId           || '-';

  const tableRows = summary.rows
    .map((row, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(row.particular || 'SILVER ARTICLES')}</td>
        <td class="center">${escapeHtml(row.hsnCode || hsnCode)}</td>
        <td class="center">${escapeHtml(gstPct)}%</td>
        <td class="right">${formatWeight(row.weightNumeric)}</td>
        <td class="right">${formatCurrency(row.rateNumeric)}</td>
        <td class="right">${formatCurrency(row.taxableValueNumeric)}</td>
      </tr>`)
    .join('');

  const absRoundOff = Math.abs(summary.roundOff).toFixed(2);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; color: #1A2A38; background: #fff; }
  .invoice { border: 1.5px solid #97A8B5; box-shadow: 0 1px 4px rgba(0,0,0,0.10); }

  /* 1. Top strip */
  .top-strip {
    display:flex; justify-content:space-between; align-items:center;
    padding:6px 14px;
    background:#EEF2F5;
    border-bottom:1.5px solid #97A8B5;
  }
  .top-title { font-size:16px; font-weight:800; letter-spacing:.8px; color:#1C2B3A; }
  .top-orig  { font-size:11.5px; font-weight:700; color:#445C6E; letter-spacing:.3px; }

  /* 2. Company Banner */
  .banner {
    background:#1C2B3A;
    color:#fff;
    padding:10px 14px 8px;
    border-bottom:3px solid #8FA4B5;
  }
  .banner-top  { display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#A8BDC9; margin-bottom:6px; letter-spacing:.2px; }
  .banner-mid  { display:flex; justify-content:center; align-items:center; gap:12px; margin-bottom:5px; }
  .banner-logo { width:125px; height:auto; display:block; }
  .banner-name { font-size:34px; font-weight:900; letter-spacing:2px; color:#FFFFFF; text-transform:uppercase; }
  .banner-tag  { text-align:center; font-size:12px; color:#8FA4B5; letter-spacing:.3px; }

  /* 3. Address */
  .addr-strip {
    text-align:center; padding:7px 14px;
    background:#F5F7F9;
    border-bottom:1px solid #C8D4DC;
    font-size:13px; color:#445C6E; line-height:1.85;
  }

  /* 4. IRN row */
  .irn-row {
    padding:8px 14px;
    background:#FAFCFD;
    border-bottom:1px solid #C8D4DC;
  }
  .irn-block { font-size:11.5px; line-height:2.0; color:#445C6E; }
  .irn-block b { font-weight:700; color:#1C2B3A; }

  /* 5. Details grid */
  .details-grid { display:grid; grid-template-columns:1.1fr 1fr; border-bottom:1px solid #C8D4DC; }
  .detail-box { padding:11px 13px; background:#FFFFFF; }
  .detail-box.left { border-right:1px solid #C8D4DC; }
  .cust-name { font-size:14px; font-weight:800; color:#1C2B3A; margin-bottom:4px; }
  .cust-addr { font-size:13px; color:#445C6E; line-height:1.8; margin-bottom:6px; }
  .d-row { display:flex; align-items:flex-start; font-size:12.5px; margin-bottom:7px; line-height:1.55; }
  .d-lbl { min-width:118px; font-weight:700; color:#3F5565; }
  .d-colon { width:12px; text-align:center; color:#5F7382; font-weight:700; }
  .d-val { flex:1; font-weight:400; color:#1C2B3A; }

  /* 6. Table */
  table.items { width:100%; border-collapse:collapse; font-size:12.5px; }
  table.items th, table.items td { border:1px solid #C8D4DC; padding:9px 9px; vertical-align:middle; }
  table.items th {
    background:#E4EBF0;
    font-weight:800; text-transform:uppercase; font-size:11.5px;
    color:#1C2B3A; letter-spacing:.3px;
  }
  table.items tr:nth-child(even) td { background:#F5F7F9; }
  .center { text-align:center; }
  .right  { text-align:right; }

  /* 7. Tax summary */
  .tax-summary { display:flex; justify-content:flex-end; border-bottom:1px solid #C8D4DC; }
  .tax-tbl { width:55%; border-left:2px solid #97A8B5; border-collapse:collapse; }
  .tax-tbl td { padding:9px 14px; font-size:13.5px; border-bottom:1px solid #E4EBF0; color:#1A2A38; }
  .tax-tbl tr:last-child td { border-bottom:none; }
  .tax-tbl .right { text-align:right; font-weight:700; color:#1C2B3A; }

  /* Grand total */
  .grand-total {
    display:flex; justify-content:space-between; align-items:center;
    padding:10px 16px;
    border-bottom:1.5px solid #97A8B5;
    background:#1C2B3A;
  }
  .gt-label { font-size:16px; font-weight:800; color:#A8BDC9; letter-spacing:.5px; }
  .gt-value { font-size:20px; font-weight:900; color:#FFFFFF; letter-spacing:.5px; }

  /* 8. Words */
  .words-sec { padding:10px 14px; border-bottom:1px solid #C8D4DC; background:#FAFCFD; }
  .words-title { font-size:11.5px; font-weight:800; color:#1C2B3A; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
  .words-body  { font-size:15px; font-weight:700; color:#1A2A38; line-height:1.75; }

  /* 9. Remarks */
  .remarks { padding:7px 14px; border-bottom:1px solid #C8D4DC; font-size:12px; color:#445C6E; background:#F5F7F9; }

  /* 10. Footer */
  .footer-grid { display:grid; grid-template-columns:1.1fr 1fr; border-bottom:1px solid #C8D4DC; }
  .footer-box { padding:10px 12px; }
  .footer-box.left { border-right:1px solid #C8D4DC; }
  .sec-head {
    font-size:11.5px; font-weight:800; text-transform:uppercase; letter-spacing:.5px;
    color:#1C2B3A; margin-bottom:7px;
    padding-bottom:4px; border-bottom:1.5px solid #8FA4B5;
  }
  .tc-line  { font-size:11.5px; color:#4A6070; line-height:1.95; margin-bottom:4px; }
  .bank-row { display:flex; gap:3px; font-size:11.5px; margin-bottom:5px; }
  .b-lbl    { min-width:120px; color:#6B8496; }
  .b-val    { font-weight:700; color:#1A2A38; }
  .co-stamp { margin-top:14px; text-align:right; font-size:11.5px; font-weight:700; color:#1C2B3A; line-height:1.75; }

  /* 11. Signatures */
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; min-height:120px; border-bottom:1px solid #C8D4DC; }
  .sig-box  { display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:10px 8px; }
  .sig-box.left { border-right:1px solid #C8D4DC; }
  .sig-box.right { align-items:center; justify-content:flex-end; padding-right:0; padding-bottom:10px; }
  .sig-co   { font-size:11px; color:#6B8496; margin-bottom:5px; text-align:center; }
  .sig-lbl  { font-size:13px; font-weight:800; color:#1C2B3A; letter-spacing:.3px; text-align:center; }

  /* 12. Bottom bar */
  .bottom-bar {
    display:grid; grid-template-columns:1fr 1fr 1fr;
    padding:8px 14px;
    background:#243447;
  }
  .bb-cell    { display:flex; align-items:center; gap:2px; }
  .bb-cell.mid { justify-content:center; border-left:1px solid #3D5265; border-right:1px solid #3D5265; padding:0 8px; }
  .bb-cell.right { justify-content:flex-end; }
  .bb-lbl { font-weight:700; color:#A8BDC9; font-size:11.5px; }
  .bb-val { font-weight:800; color:#FFFFFF; font-size:11.5px; margin-left:2px; }
</style>
</head>
<body>
<div class="invoice">

  <div class="top-strip">
    <span class="top-title">Tax Invoice</span>
    <span class="top-orig">ORIGINAL FOR RECIPIENT</span>
  </div>

  <div class="banner">
    <div class="banner-top">
      <span>GST IN:- ${escapeHtml(profile.gst)}</span>
      <span>${escapeHtml(profile.phone)}</span>
    </div>
    <div class="banner-mid">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="banner-logo" />` : ''}
      <span class="banner-name">${escapeHtml(profile.name)}</span>
    </div>
    <div class="banner-tag">${escapeHtml(profile.tagline)}</div>
  </div>

  <div class="addr-strip">
    ${escapeHtml(profile.address)} ${escapeHtml(profile.city)}
    ${profile.email ? `<br/>${escapeHtml(profile.email)}` : ''}
  </div>

  <div class="details-grid">
    <div class="detail-box left">
      <div class="d-row"><span class="d-lbl">Name</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(transaction.customerName || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Phone</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(transaction.phone || '-')}</span></div>
    </div>
    <div class="detail-box">
      <div class="d-row"><span class="d-lbl">Invoice Number</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(transaction.invoiceNumber || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Invoice Date</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(formatDisplayDate(transaction.invoiceDate))}</span></div>
      <div class="d-row"><span class="d-lbl">Mobile No</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(transaction.phone || '-')}</span></div>
    </div>
  </div>

  <div>
    <table class="items">
      <thead>
        <tr>
          <th class="center" style="width:5%">S.No</th>
          <th style="width:30%">Descriptions</th>
          <th class="center" style="width:13%">HSN Code</th>
          <th class="center" style="width:8%">GST Rate</th>
          <th class="right" style="width:16%">Weight</th>
          <th class="right" style="width:12%">Rate</th>
          <th class="right" style="width:16%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  <div class="tax-summary">
    <table class="tax-tbl">
      <tr><td>CGST Output ${escapeHtml(String(cgstPct))}%</td><td class="right">${formatCurrency(summary.cgst)}</td></tr>
      <tr><td>SGST Output ${escapeHtml(String(sgstPct))}%</td><td class="right">${formatCurrency(summary.sgst)}</td></tr>
      <tr><td>Round Off</td><td class="right">(-)${absRoundOff}</td></tr>
    </table>
  </div>

  <div class="grand-total">
    <span class="gt-label">Total</span>
    <span class="gt-value">${formatCurrency(summary.grandTotal)}</span>
  </div>

  <div class="words-sec">
    <div class="words-title">Amount In Words:-</div>
    <div class="words-body">${escapeHtml(summary.amountInWords)}.</div>
  </div>

  ${transaction.remarks ? `<div class="remarks"><b>Remarks :</b> ${escapeHtml(transaction.remarks)}</div>` : ''}

  <div class="footer-grid">
    <div class="footer-box left">
      <div class="sec-head">Terms &amp; Conditions</div>
      <div class="tc-line">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
      <div class="tc-line">Interest@15% per annum will be charged for the bills not paid within 15 days.</div>
      <div class="tc-line">Goods once sold will not be taken back.</div>
      <div class="tc-line">No E way bill is required for goods covered under this invoice as per SR NO.150/151 of CGST Rule 138(14).</div>
    </div>
    <div class="footer-box">
      <div class="sec-head">Company's Bank Details</div>
      <div class="bank-row"><span class="b-lbl">Bank Name</span><span>:</span><span class="b-val">${escapeHtml(bankName)}</span></div>
      <div class="bank-row"><span class="b-lbl">A/c No.</span><span>:</span><span class="b-val">${escapeHtml(bankAccount)}</span></div>
      <div class="bank-row"><span class="b-lbl">Branch &amp; IFS Code</span><span>:</span><span class="b-val">${escapeHtml(bankBranch)} / ${escapeHtml(bankIfsc)}</span></div>
      ${upiId !== '-' ? `<div class="bank-row"><span class="b-lbl">UPI ID</span><span>:</span><span class="b-val">${escapeHtml(upiId)}</span></div>` : ''}
      <div class="co-stamp">for ${escapeHtml(profile.name)} [${escapeHtml(profile.financialYear)}]</div>
    </div>
  </div>

  <div class="sig-grid">
    <div class="sig-box left">
      <span class="sig-lbl">Customer Signature</span>
    </div>
    <div class="sig-box right">
      <span class="sig-co">for ${escapeHtml(profile.name)}</span>
      <span class="sig-lbl">Authorised Signatory</span>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="bb-cell"><span class="bb-lbl">Sales Value</span><span>:</span><span class="bb-val">${formatCurrency(summary.grandTotal)}</span></div>
    <div class="bb-cell mid"><span class="bb-lbl">Purchase Value</span><span>:</span><span class="bb-val">&nbsp;</span></div>
    <div class="bb-cell right"><span class="bb-lbl">Receivable Amount:</span><span class="bb-val">${formatCurrency(summary.grandTotal)}</span></div>
  </div>

</div>
</body>
</html>`;
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DDE3E9' },
  scrollContent: { padding: horizontalPadding, paddingBottom: spacing.xl * 2 },

  // Action bar — three premium dark buttons
  actionBar: { flexDirection: 'row', gap: 8, marginTop: spacing.sm, marginBottom: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.dark,
    paddingVertical: 12,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  actionBtnText: { color: C.white, fontSize: moderateScale(11), fontWeight: '700', letterSpacing: 0.3, fontFamily: 'Segoe UI' },

  // Invoice paper — clean white with silver shadow
  paper: {
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.borderDark,
    shadowColor: '#4A6070',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },

  // 1. Top strip — silver-grey background
  topStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.silverBg,
    borderBottomWidth: 1.5,
    borderBottomColor: C.borderDark,
  },
  topStripTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.dark,
    letterSpacing: 0.8,
    fontFamily: 'Segoe UI',
  },
  topStripOriginal: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMid,
    letterSpacing: 0.3,
    fontFamily: 'Segoe UI',
  },

  // 2. Company banner — deep charcoal, 3px silver bottom accent
  banner: {
    backgroundColor: BANNER_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: C.silver,
    alignItems: 'center',
  },
  bannerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 5,
  },
  bannerGst: { color: C.silverLight, fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2, fontFamily: 'Segoe UI' },
  bannerPhone: { color: C.silverLight, fontSize: 11.5, fontWeight: '600', fontFamily: 'Segoe UI' },
  bannerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 34,
    marginBottom: 5,
  },
  bannerLogo: { width: 118, height: 56 },
  bannerName: {
    color: C.white,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: 'Segoe UI',
  },
  bannerTagline: {
    color: C.silver,
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.3,
    fontFamily: 'Segoe UI',
  },

  // 3. Address strip — off-white silver
  addressStrip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: C.silverBg2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  addressLine: {
    fontSize: 11.5,
    color: C.textMid,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'Segoe UI',
  },

  // 4. IRN row — no QR here anymore
  irnRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.offWhite,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  irnTextRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  irnSubRow: { flexDirection: 'row', flexWrap: 'wrap' },
  irnLabel: { fontSize: 10.5, fontWeight: '700', color: C.dark },
  irnColon: { fontSize: 10.5, color: C.textMid },
  irnValue: { fontSize: 10.5, color: C.text, flex: 1 },

  // 5. Customer + Invoice details
  detailsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  customerBox: {
    flex: 1.1,
    padding: 9,
    borderRightWidth: 1,
    borderRightColor: C.border,
    backgroundColor: C.white,
  },
  invoiceBox: { flex: 1, padding: 9, backgroundColor: C.white },
  invoiceBoxInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingRight: 4,
  },
  invoiceDetailsText: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    fontSize: moderateScale(11.5),
    fontWeight: '800',
    color: C.dark,
    marginBottom: 2,
    fontFamily: 'Segoe UI',
  },
  customerAddress: {
    fontSize: 11.5,
    color: C.textMid,
    lineHeight: 17,
    marginBottom: 5,
    fontFamily: 'Segoe UI',
  },
  detailRowInner: { flexDirection: 'row', marginBottom: 5, alignItems: 'flex-start' },
  detailLabel: {
    width: 98,
    fontSize: 11.25,
    fontWeight: '700',
    color: '#43596A',
    fontFamily: 'Segoe UI',
  },
  detailColon: {
    width: 12,
    textAlign: 'center',
    fontSize: 11.25,
    fontWeight: '700',
    color: '#5F7382',
    fontFamily: 'Segoe UI',
  },
  detailValue: {
    fontSize: 11.25,
    fontWeight: '400',
    color: C.text,
    flex: 1,
    lineHeight: 17,
    fontFamily: 'Segoe UI',
  },
  // 6. Table — silver-tinted header, soft borders
  tableWrap: { borderBottomWidth: 1, borderBottomColor: C.border },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#E4EBF0',
    borderBottomWidth: 1.5,
    borderBottomColor: C.borderDark,
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: C.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: C.borderDark,
    fontFamily: 'Segoe UI',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 40,
    backgroundColor: C.white,
  },
  tableRowAlt: { backgroundColor: C.silverBg2 },
  tableRowBlank: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF2',
    height: 40,
  },
  td: {
    fontSize: 11.25,
    color: C.text,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
    fontFamily: 'Segoe UI',
  },

  // 7. Tax summary — silver left border accent
  taxSummarySection: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    alignItems: 'flex-end',
  },
  taxSummaryRight: {
    width: '55%',
    borderLeftWidth: 2,
    borderLeftColor: C.borderDark,
    backgroundColor: C.silverBg2,
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  taxRowLast: { borderBottomWidth: 0 },
  taxRowLabel: { fontSize: 12, color: C.textMid, fontFamily: 'Segoe UI' },
  taxRowValue: { fontSize: 12, fontWeight: '700', color: C.dark, fontFamily: 'Segoe UI' },

  // Total bar — premium dark band with white text
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: C.borderDark,
    backgroundColor: C.dark,
  },
  totalBarLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: C.silverLight,
    letterSpacing: 0.5,
    fontFamily: 'Segoe UI',
  },
  totalBarValue: {
    fontSize: 18,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.5,
    fontFamily: 'Segoe UI',
  },

  // 8. Amount in words — off-white background
  wordsSection: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.offWhite,
  },
  wordsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: C.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
    fontFamily: 'Segoe UI',
  },
  wordsBody: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    lineHeight: 23,
    fontFamily: 'Segoe UI',
  },

  // 9. Remarks
  remarksSection: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.silverBg2,
  },
  remarksLabel: { fontWeight: '700', fontSize: 11.25, color: C.dark, fontFamily: 'Segoe UI' },
  remarksText: { fontSize: 11.25, color: C.textMid, lineHeight: 18, fontFamily: 'Segoe UI' },

  // 10. Footer T&C + Bank
  footerSection: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  tcBox: {
    flex: 1.1,
    padding: 9,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  bankBox: { flex: 1, padding: 9 },
  sectionHeading: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: C.dark,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1.5,
    borderBottomColor: C.silver,
    fontFamily: 'Segoe UI',
  },
  tcLine: { fontSize: 9.8, color: C.textMid, lineHeight: 16.5, marginBottom: 3, fontFamily: 'Segoe UI' },
  bankRowInner: { flexDirection: 'row', marginBottom: 3 },
  bankLabel: { fontSize: 10, color: C.textLight, minWidth: 102, fontFamily: 'Segoe UI' },
  bankColon: { fontSize: 10, color: C.textLight, fontFamily: 'Segoe UI' },
  bankValue: { fontSize: 10, fontWeight: '700', color: C.text, flex: 1, fontFamily: 'Segoe UI' },
  companyStamp: {
    marginTop: 12,
    fontSize: 10.5,
    fontWeight: '700',
    color: C.dark,
    textAlign: 'right',
    lineHeight: 18,
    fontFamily: 'Segoe UI',
  },

  // 11. Signatures — QR moved to bottom-right
  sigSection: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 130,
  },
  sigLeft: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: C.border,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 12,
  },
  sigRight: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingTop: 10,
    paddingRight: 0,
    paddingBottom: 10,
    gap: 3,
  },
  sigCompany: { fontSize: 10, color: C.textLight, marginBottom: 2, textAlign: 'center' },
  sigLabel: { fontSize: 12, fontWeight: '800', color: C.dark, letterSpacing: 0.3, textAlign: 'center' },

  // 12. Bottom bar — dark charcoal footer
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.darkMid,
  },
  bottomItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  bottomItemMid: {
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#3D5265',
    paddingHorizontal: 4,
  },
  bottomItemRight: { justifyContent: 'flex-end' },
  bottomLabel: { fontSize: 9.5, color: C.silverLight, fontWeight: '700', fontFamily: 'Segoe UI' },
  bottomColon: { fontSize: 9.5, color: C.silverLight, fontFamily: 'Segoe UI' },
  bottomValue: { fontSize: 9.5, color: C.white, fontWeight: '800', fontFamily: 'Segoe UI' },
  invoiceEditCard: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: spacing.md,
  },
  invoiceEditLabel: {
    fontSize: moderateScale(12),
    fontWeight: '700',
    color: C.textMid,
    marginBottom: 6,
    fontFamily: 'Segoe UI',
  },
  invoiceEditInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.borderDark,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: moderateScale(14),
    color: C.text,
    backgroundColor: C.offWhite,
    fontFamily: 'Segoe UI',
  },

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { marginTop: spacing.md, fontSize: moderateScale(18), fontWeight: '800', color: '#111827', fontFamily: 'Segoe UI' },
  emptySubtitle: { marginTop: 8, textAlign: 'center', color: '#444444', fontSize: moderateScale(13), lineHeight: 20, fontFamily: 'Segoe UI' },
});

export default GstBillpreview;
