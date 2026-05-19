import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Header from '../components/Header';
import { fetchAllCustomers, fetchMiniStatement } from '../services/api';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const DEBIT_COLOR = '#EF4444';
const CREDIT_COLOR = '#10B981';
const BALANCE_COLOR = '#2563EB';

const MiniStatementPage = ({ navigation, route }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(route?.params?.customer || null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [statement, setStatement] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (selectedCustomer?._id) {
      loadStatement(selectedCustomer._id);
    } else {
      loadCustomers();
    }
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const loadStatement = async (customerId) => {
    setLoading(true);
    try {
      const data = await fetchMiniStatement(customerId);
      if (data.success) {
        setStatement(Array.isArray(data.statement) ? data.statement : []);
        setCustomerInfo(data.customer || null);
      } else {
        setStatement([]);
        setCustomerInfo(null);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load mini statement');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (selectedCustomer?._id) {
      await loadStatement(selectedCustomer._id);
    } else {
      await loadCustomers();
    }
    setRefreshing(false);
  }, [selectedCustomer]);

  const handleBack = () => {
    if (selectedCustomer && !route?.params?.customer) {
      setSelectedCustomer(null);
      setCustomerInfo(null);
      setStatement([]);
      loadCustomers();
      return;
    }

    navigation.goBack();
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    loadStatement(customer._id);
  };

  const rows = useMemo(() => buildStatementRows(statement, customerInfo), [statement, customerInfo]);
  const summary = useMemo(() => buildSummary(rows, customerInfo), [rows, customerInfo]);
  const customerName = selectedCustomer?.customerName || selectedCustomer?.name || customerInfo?.customerName || '';
  const customerPhone = selectedCustomer?.phone || customerInfo?.phone || '';
  const dateRange = useMemo(() => getDateRange(rows), [rows]);

  const generatePdf = async (shareAfterCreate = false) => {
    if (!selectedCustomer) {
      Alert.alert('Select Customer', 'Please select a customer before exporting PDF.');
      return;
    }

    setExporting(true);
    try {
      const html = buildPdfHtml({
        rows,
        summary,
        customerName,
        customerPhone,
        dateRange,
      });
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (shareAfterCreate) {
        if (Platform.OS === 'web') {
          Alert.alert('PDF Ready', `PDF generated at: ${uri}`);
          return;
        }

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          Alert.alert('Sharing Unavailable', `PDF generated at: ${uri}`);
          return;
        }

        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Mini Statement PDF',
          UTI: 'com.adobe.pdf',
        });
        return;
      }

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        Alert.alert('PDF Generated', `PDF saved at:\n${uri}`);
      }
    } catch (error) {
      Alert.alert('Export Failed', 'Unable to generate the mini statement PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!selectedCustomer) {
      Alert.alert('Select Customer', 'Please select a customer first.');
      return;
    }

    setExporting(true);
    try {
      const html = buildPdfHtml({
        rows,
        summary,
        customerName,
        customerPhone,
        dateRange,
      });
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      let phone = customerPhone || '';
      phone = phone.replace(/[^0-9]/g, '');
      
      if (!phone) {
        Alert.alert('Error', 'Customer phone number is missing.');
        setExporting(false);
        return;
      }
      
      if (phone.length === 10) {
        phone = '91' + phone;
      }
      
      const url = `https://wa.me/${phone}?text=Your%20mini%20statement%20is%20attached`;
      
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed.');
      }
      
      setTimeout(async () => {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Share Mini Statement PDF' });
        }
      }, 1500);

    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to share via WhatsApp.');
    } finally {
      setExporting(false);
    }
  };

  const renderCustomerList = () => (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BALANCE_COLOR]} />}
    >
      <Text style={styles.sectionTitle}>Select Customer</Text>
      {loading ? (
        <ActivityIndicator size="large" color={BALANCE_COLOR} style={styles.loader} />
      ) : customers.length === 0 ? (
        <EmptyState text="No customers available" />
      ) : (
        customers.map((customer) => (
          <TouchableOpacity
            key={customer._id}
            style={styles.customerCard}
            onPress={() => selectCustomer(customer)}
            activeOpacity={0.8}
          >
            <View style={styles.customerIcon}>
              <MaterialCommunityIcons name="account-outline" size={22} color={BALANCE_COLOR} />
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customer.customerName || customer.name || 'Unnamed Customer'}</Text>
              <Text style={styles.customerPhone}>{customer.phone || 'No phone number'}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderStatement = () => (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BALANCE_COLOR]} />}
    >
      <View style={styles.statementHeader}>
        <View>
          <Text style={styles.statementTitle}>Mini Statement</Text>
          <Text style={styles.statementSubtitle}>{customerName || 'Customer'}{customerPhone ? ` - ${customerPhone}` : ''}</Text>
          <Text style={styles.dateRange}>{dateRange || 'All transactions'}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.disabledButton]}
          onPress={() => generatePdf(false)}
          disabled={exporting}
        >
          <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
          <Text style={styles.exportButtonText}>Download PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shareButton, exporting && styles.disabledButton]}
          onPress={() => generatePdf(true)}
          disabled={exporting}
        >
          <MaterialCommunityIcons name="share-variant" size={18} color={BALANCE_COLOR} />
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.whatsappButton, exporting && styles.disabledButton]}
          onPress={handleWhatsAppShare}
          disabled={exporting}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
          <Text style={styles.whatsappButtonText}>WhatsApp</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryCard}>
        <SummaryItem label="Total Debit" value={`${formatNumber(summary.debit)}g`} color={DEBIT_COLOR} />
        <View style={styles.summaryDivider} />
        <SummaryItem label="Total Credit" value={`${formatNumber(summary.credit)}g`} color={CREDIT_COLOR} />
        <View style={styles.summaryDivider} />
        <SummaryItem label="Closing Balance" value={`${summary.balanceLabel} ${formatNumber(summary.balance)}g`} color={BALANCE_COLOR} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={[styles.th, styles.dateCol]}>Date</Text>
            <Text style={[styles.th, styles.typeCol]}>Type</Text>
            <Text style={[styles.th, styles.descCol]}>Description</Text>
            <Text style={[styles.th, styles.amountCol]}>Debit</Text>
            <Text style={[styles.th, styles.amountCol]}>Credit</Text>
            <Text style={[styles.th, styles.balanceCol]}>Balance</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={BALANCE_COLOR} style={styles.loader} />
          ) : rows.length === 0 ? (
            <EmptyState text="No transactions available" />
          ) : (
            rows.map((row, index) => (
              <View key={row.id} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                <Text style={[styles.td, styles.dateCol]}>{formatDate(row.date)}</Text>
                <Text style={[styles.td, styles.typeCol, { color: row.direction === 'debit' ? DEBIT_COLOR : CREDIT_COLOR }]}>
                  {row.type}
                </Text>
                <Text style={[styles.td, styles.descCol]}>{row.description}</Text>
                <Text style={[styles.td, styles.amountCol, { color: DEBIT_COLOR }]}>
                  {row.debit > 0 ? `${formatNumber(row.debit)}g` : '-'}
                </Text>
                <Text style={[styles.td, styles.amountCol, { color: CREDIT_COLOR }]}>
                  {row.credit > 0 ? `${formatNumber(row.credit)}g` : '-'}
                </Text>
                <Text style={[styles.td, styles.balanceCol, { color: BALANCE_COLOR }]}>
                  {row.balanceLabel} {formatNumber(row.balance)}g
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomSummary}>
        <Text style={styles.bottomSummaryTitle}>Summary</Text>
        <SummaryLine label="Total Debit" value={`${formatNumber(summary.debit)}g`} color={DEBIT_COLOR} />
        <SummaryLine label="Total Credit" value={`${formatNumber(summary.credit)}g`} color={CREDIT_COLOR} />
        <SummaryLine label="Closing Balance" value={`${summary.balanceLabel} ${formatNumber(summary.balance)}g`} color={BALANCE_COLOR} />
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header
        title="Mini Statement"
        subtitle={customerName || 'Select Customer'}
        showBack
        onBackPress={handleBack}
        rightIcon="refresh"
        onRightPress={onRefresh}
      />

      {!selectedCustomer ? renderCustomerList() : renderStatement()}
    </SafeAreaView>
  );
};

const SummaryItem = ({ label, value, color }) => (
  <View style={styles.summaryItem}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, { color }]}>{value}</Text>
  </View>
);

const SummaryLine = ({ label, value, color }) => (
  <View style={styles.summaryLine}>
    <Text style={styles.summaryLineLabel}>{label}</Text>
    <Text style={[styles.summaryLineValue, { color }]}>{value}</Text>
  </View>
);

const EmptyState = ({ text }) => (
  <View style={styles.emptyState}>
    <MaterialCommunityIcons name="file-document-outline" size={54} color="#D1D5DB" />
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

const buildStatementRows = (statement, customerInfo) => {
  let runningBalance = Number(customerInfo?.openingBalance) || 0;

  return statement.flatMap((bill, billIndex) => {
    const rows = [];
    const issueValue = Number(bill.issueTotalPurity) || 0;
    const receiptValue = Number(bill.receiptTotalPurity) || 0;
    const cashEntries = Array.isArray(bill.cashEntries) ? bill.cashEntries : [];
    const billNo = bill.billNo || billIndex + 1;

    if (issueValue > 0) {
      runningBalance += issueValue;
      rows.push(createRow({
        id: `${billNo}-issue`,
        date: bill.date,
        type: 'ISSUE',
        description: `Issue (Debit) - Bill #${billNo}`,
        debit: issueValue,
        credit: 0,
        balance: runningBalance,
      }));
    }

    if (receiptValue > 0) {
      runningBalance -= receiptValue;
      rows.push(createRow({
        id: `${billNo}-receipt`,
        date: bill.date,
        type: 'RECEIPT',
        description: `Receipt (Credit) - Bill #${billNo}`,
        debit: 0,
        credit: receiptValue,
        balance: runningBalance,
      }));
    }

    cashEntries.forEach((cash, cashIndex) => {
      const cashAmount = Number(cash.cashAmount || cash.amount) || 0;
      const pureValue = Number(cash.pure) || 0;
      if (cashAmount <= 0 && pureValue <= 0) return;

      const isGiven = isCashGiven(cash.cashType || cash.type || cash.notes);
      const value = pureValue;
      runningBalance += isGiven ? value : -value;

      rows.push(createRow({
        id: `${billNo}-cash-${cashIndex}`,
        date: bill.date,
        type: isGiven ? 'CASH GIVEN' : 'CASH RECEIVED',
        description: `${isGiven ? 'Cash Given (Debit)' : 'Cash Received (Credit)'} - ${formatCurrency(cashAmount)}`,
        debit: isGiven ? value : 0,
        credit: isGiven ? 0 : value,
        balance: runningBalance,
      }));
    });

    return rows;
  });
};

const createRow = ({ id, date, type, description, debit, credit, balance }) => ({
  id,
  date,
  type,
  description,
  debit,
  credit,
  direction: debit > 0 ? 'debit' : 'credit',
  balance: Math.abs(balance),
  balanceLabel: balance >= 0 ? 'OB' : 'AB',
});

const buildSummary = (rows, customerInfo) => {
  const debit = rows.reduce((sum, row) => sum + row.debit, 0);
  const credit = rows.reduce((sum, row) => sum + row.credit, 0);
  const currentOB = Number(customerInfo?.currentOB) || 0;
  const currentAB = Number(customerInfo?.currentAB) || 0;
  const signedBalance = currentOB > 0 || currentAB > 0 ? currentOB - currentAB : debit - credit;

  return {
    debit,
    credit,
    balance: Math.abs(signedBalance),
    balanceLabel: signedBalance >= 0 ? 'OB' : 'AB',
  };
};

const buildPdfHtml = ({ rows, summary, customerName, customerPhone, dateRange }) => {
  const generatedOn = formatDateTime(new Date());
  const tableRows = rows.length
    ? rows.map((row, index) => `
      <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
        <td>${escapeHtml(formatDate(row.date))}</td>
        <td>${escapeHtml(row.type)}</td>
        <td>${escapeHtml(row.description)}</td>
        <td class="debit">${row.debit > 0 ? `${formatNumber(row.debit)}g` : '-'}</td>
        <td class="credit">${row.credit > 0 ? `${formatNumber(row.credit)}g` : '-'}</td>
        <td class="balance">${row.balanceLabel} ${formatNumber(row.balance)}g</td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty">No transactions available</td></tr>';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 28px;
          }
          .brand {
            text-align: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .logo {
            width: 96px;
            height: 48px;
            object-fit: contain;
            margin-bottom: 8px;
          }
          h1 {
            margin: 0;
            font-size: 24px;
            color: #111827;
          }
          .company {
            margin-top: 4px;
            font-size: 12px;
            color: #6B7280;
          }
          .info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 18px;
            font-size: 12px;
          }
          .summary {
            display: flex;
            gap: 12px;
            margin-bottom: 18px;
          }
          .summary-box {
            flex: 1;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 12px;
            background: #F9FAFB;
          }
          .label {
            font-size: 11px;
            color: #6B7280;
            font-weight: bold;
            text-transform: uppercase;
          }
          .value {
            margin-top: 6px;
            font-size: 16px;
            font-weight: bold;
          }
          .blue { color: #2563EB; }
          .green { color: #10B981; }
          .red { color: #EF4444; }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          th {
            background: #111827;
            color: #FFFFFF;
            padding: 9px;
            border: 1px solid #111827;
            text-align: left;
          }
          td {
            padding: 9px;
            border: 1px solid #D1D5DB;
          }
          tr.even { background: #FFFFFF; }
          tr.odd { background: #F9FAFB; }
          .debit { color: #EF4444; text-align: right; font-weight: bold; }
          .credit { color: #10B981; text-align: right; font-weight: bold; }
          .balance { color: #2563EB; text-align: right; font-weight: bold; }
          .empty { text-align: center; color: #6B7280; padding: 24px; }
          .footer {
            margin-top: 28px;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #6B7280;
          }
          .signature {
            margin-top: 32px;
            text-align: right;
            font-size: 11px;
            color: #111827;
          }
          .signature-line {
            display: inline-block;
            width: 160px;
            border-top: 1px solid #111827;
            padding-top: 6px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="brand">
          <h1>Mayil Silver</h1>
          <div class="company">Mini Statement</div>
        </div>

        <div class="info">
          <div>
            <strong>Customer:</strong> ${escapeHtml(customerName || 'Customer')}<br/>
            <strong>Phone:</strong> ${escapeHtml(customerPhone || '-')}
          </div>
          <div>
            <strong>Date Range:</strong> ${escapeHtml(dateRange || 'All transactions')}<br/>
            <strong>Generated:</strong> ${escapeHtml(generatedOn)}
          </div>
        </div>

        <div class="summary">
          <div class="summary-box">
            <div class="label">Total Debit</div>
            <div class="value red">${formatNumber(summary.debit)}g</div>
          </div>
          <div class="summary-box">
            <div class="label">Total Credit</div>
            <div class="value green">${formatNumber(summary.credit)}g</div>
          </div>
          <div class="summary-box">
            <div class="label">Closing Balance</div>
            <div class="value blue">${summary.balanceLabel} ${formatNumber(summary.balance)}g</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div class="footer">
          <div>Generated on: ${escapeHtml(generatedOn)}</div>
          <div>Mayil Silver Business Statement</div>
        </div>

        <div class="signature">
          <span class="signature-line">Authorized Signature</span>
        </div>
      </body>
    </html>
  `;
};

const isCashGiven = (value = '') => {
  const normalized = String(value).toLowerCase();
  return ['given', 'paid', 'debit', 'out', 'payment'].some((word) => normalized.includes(word));
};

const getDateRange = (rows) => {
  if (!rows.length) return '';
  return `${formatDate(rows[0].date)} to ${formatDate(rows[rows.length - 1].date)}`;
};

const formatNumber = (value) => (Number(value) || 0).toFixed(3);

const formatCurrency = (value) =>
  `Rs. ${(Number(value) || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;

const formatDate = (dateValue) => {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';

  return `${formatDate(date)} ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: horizontalPadding,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: '#111827',
    marginBottom: spacing.md,
  },
  statementHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statementTitle: {
    fontSize: moderateScale(22),
    fontWeight: '900',
    color: '#111827',
  },
  statementSubtitle: {
    fontSize: moderateScale(14),
    color: '#4B5563',
    marginTop: 4,
    fontWeight: '700',
  },
  dateRange: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  exportButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: BALANCE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  shareButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  whatsappButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(14),
  },
  shareButtonText: {
    color: BALANCE_COLOR,
    fontWeight: '800',
    fontSize: moderateScale(14),
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(14),
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  summaryItem: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: spacing.sm,
  },
  summaryLabel: {
    fontSize: moderateScale(11),
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: moderateScale(15),
    fontWeight: '900',
  },
  table: {
    minWidth: 760,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  tableRow: {
    flexDirection: 'row',
    minHeight: 48,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableHead: {
    backgroundColor: '#111827',
  },
  rowEven: {
    backgroundColor: '#FFFFFF',
  },
  rowOdd: {
    backgroundColor: '#F9FAFB',
  },
  th: {
    color: '#FFFFFF',
    fontSize: moderateScale(12),
    fontWeight: '900',
    paddingHorizontal: spacing.sm,
  },
  td: {
    color: '#111827',
    fontSize: moderateScale(12),
    paddingHorizontal: spacing.sm,
    fontWeight: '600',
  },
  dateCol: {
    width: 120,
  },
  typeCol: {
    width: 120,
  },
  descCol: {
    width: 220,
  },
  amountCol: {
    width: 100,
    textAlign: 'right',
  },
  balanceCol: {
    width: 120,
    textAlign: 'right',
  },
  bottomSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  bottomSummaryTitle: {
    fontSize: moderateScale(16),
    fontWeight: '900',
    color: '#111827',
    marginBottom: spacing.sm,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLineLabel: {
    fontSize: moderateScale(14),
    color: '#4B5563',
    fontWeight: '700',
  },
  summaryLineValue: {
    fontSize: moderateScale(14),
    fontWeight: '900',
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  customerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: moderateScale(15),
    fontWeight: '800',
    color: '#111827',
  },
  customerPhone: {
    fontSize: moderateScale(12),
    color: '#6B7280',
    marginTop: 4,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    minWidth: 320,
  },
  emptyText: {
    fontSize: moderateScale(15),
    color: '#9CA3AF',
    fontWeight: '700',
    marginTop: spacing.sm,
  },
});

export default MiniStatementPage;
