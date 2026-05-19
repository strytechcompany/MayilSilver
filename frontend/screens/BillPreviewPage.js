import React, { useContext } from 'react';
import {
  Image, StyleSheet, Text, View, ScrollView,
  TouchableOpacity, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { generatePDF } from '../utils/pdfGenerator';
import { AuthContext } from '../context/AuthContext';
import { horizontalPadding, moderateScale, spacing } from '../utils/responsive';

const LOGO_ASSET = require('../assets/logo.png');

// ── Premium Silver Theme (mirrors GstBillpreview) ─────────────────────────────
const C = {
  dark:        '#1C2B3A',
  darkMid:     '#243447',
  silver:      '#8FA4B5',
  silverLight: '#A8BDC9',
  silverBg:    '#EEF2F5',
  silverBg2:   '#F5F7F9',
  border:      '#C8D4DC',
  borderDark:  '#97A8B5',
  text:        '#1A2A38',
  textMid:     '#445C6E',
  textLight:   '#6B8496',
  white:       '#FFFFFF',
  offWhite:    '#FAFCFD',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const toNumber  = (v) => Number(v) || 0;
const fmt3      = (v, d = 3) => toNumber(v).toFixed(d);
const fmt2      = (v)        => toNumber(v).toFixed(2);

const fmtDate = (s) => {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};
const fmtTime = (s) => {
  const d = new Date(s);
  return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true }).toUpperCase();
};

// ── Sub-components ────────────────────────────────────────────────────────────
const ActionBtn = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
    <MaterialCommunityIcons name={icon} size={15} color={C.white} />
    <Text style={styles.actionBtnText}>{label}</Text>
  </TouchableOpacity>
);

const SectionHead = ({ title }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionHeadText}>{title}</Text>
  </View>
);

const DetailRow = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailColon}>:</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const TH = ({ children, flex = 1, align = 'left' }) => (
  <Text style={[styles.th, { flex, textAlign: align }]}>{children}</Text>
);
const TD = ({ children, flex = 1, align = 'left', bold }) => (
  <Text style={[bold ? styles.tdBold : styles.td, { flex, textAlign: align }]}>{children}</Text>
);

// ── Main Component ────────────────────────────────────────────────────────────
const BillPreviewPage = ({ navigation, route }) => {
  const { gstBillEnabled, isAdmin, currentUser } = useContext(AuthContext);
  const { billData, customer } = route.params || {};

  if (gstBillEnabled && !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.accessDenied}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.accessBack}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#7C3AED" />
          </TouchableOpacity>
          <MaterialCommunityIcons name="lock-outline" size={52} color="#C4B5FD" />
          <Text style={styles.accessDeniedTitle}>GST Access Only</Text>
          <Text style={styles.accessDeniedText}>Your account is configured for GST billing only.</Text>
          <TouchableOpacity style={styles.accessBtn} onPress={() => navigation.navigate('GSTCustomer')}>
            <Text style={styles.accessBtnText}>Go to GST Billing</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!billData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="file-document-outline" size={52} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No Bill Data Found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.accessBtn}>
            <Text style={styles.accessBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const issueItems   = Array.isArray(billData.issueItems)   ? billData.issueItems   : [];
  const receiptItems = Array.isArray(billData.receiptItems) ? billData.receiptItems : [];
  const cashEntries  = Array.isArray(billData.cashEntries)  ? billData.cashEntries  : [];

  const prevBal    = toNumber(billData.previousBalance);
  const issueTotal = toNumber(billData.issueTotalPurity);
  const recpTotal  = toNumber(billData.receiptTotalPurity);
  const cashPurity = toNumber(billData.cashTotalPurity);
  const finalBal   = toNumber(billData.finalBalance);

  const prevBalColor  = prevBal  >= 0 ? '#DC2626' : '#10B981';
  const finalBalColor = finalBal >= 0 ? '#2563EB' : '#10B981';
  const prevBalLabel  = prevBal  >= 0 ? 'Old Balance'   : 'Advance Balance';
  const finalBalLabel = finalBal >= 0 ? 'Old Balance'   : 'Advance Balance';
  const createdBy = billData.createdBy || currentUser?.userName || currentUser?.email || 'Admin';

  // ── Actions ───────────────────────────────────────────────────────────────
  const saveBillLocally = async () => {
    try {
      const existing = await AsyncStorage.getItem('bills');
      const arr = existing ? JSON.parse(existing) : [];
      if (!arr.some(b => b.billNo === billData.billNo)) {
        arr.push({ ...billData, billType: 'REGULAR' });
        await AsyncStorage.setItem('bills', JSON.stringify(arr));
      }
      Alert.alert('Success', 'Bill saved!', [{ text: 'OK', onPress: () => navigation.navigate('BillHistory') }]);
    } catch {
      Alert.alert('Error', 'Failed to save bill.');
    }
  };

  const handleWhatsAppShare = async () => {
    try {
      const uri = await generatePDF({ billData, customer }, 'bill');
      let phone = (customer?.phone || '').replace(/[^0-9]/g, '');
      if (!phone) { Alert.alert('Error', 'Phone number missing.'); return; }
      if (phone.length === 10) phone = '91' + phone;
      const url = `https://wa.me/${phone}?text=Your%20bill%20is%20attached`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
      else Alert.alert('Error', 'WhatsApp not installed.');
      setTimeout(async () => {
        const ok = await Sharing.isAvailableAsync();
        if (ok) await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }, 1500);
    } catch { Alert.alert('Error', 'WhatsApp share failed.'); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left','right','bottom']}>

      {/* ── Action Bar ── */}
      <View style={styles.actionBar}>
        <ActionBtn icon="arrow-left"      label="Back"      onPress={() => navigation.goBack()} />
        <ActionBtn icon="content-save"    label="Save Bill" onPress={saveBillLocally} />
        <ActionBtn icon="whatsapp"        label="WhatsApp"  onPress={handleWhatsAppShare} />
        <ActionBtn icon="home"            label="Home"      onPress={() => navigation.navigate('Home')} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.paper}>

          {/* 1. Top Strip */}
          <View style={styles.topStrip}>
            <Text style={styles.topStripSpacer}> </Text>
            <Text style={styles.topStripTitle}>BILL</Text>
            <Text style={styles.topStripOriginal}>TYPE : B2B</Text>
          </View>

          {/* 2. Dark Banner */}
          <View style={styles.banner}>
            <View style={styles.bannerLogoRow}>
              <Image source={LOGO_ASSET} style={styles.bannerLogo} resizeMode="contain" />
              <Text style={styles.bannerName}>MAYIL SILVER</Text>
            </View>
            <Text style={styles.bannerTagline}>Pure Silver · Trusted Quality</Text>
          </View>

          {/* 3. Customer + Bill Details Row */}
          <View style={styles.detailsRow}>
            <View style={styles.customerBox}>
              <DetailRow label="Bill No" value={String(billData.billNo).padStart(5,'0')} />
              <DetailRow label="Name"  value={billData.customerName || '-'} />
              <DetailRow label="Phone" value={customer?.phone || '-'} />
            </View>
            <View style={styles.invoiceBox}>
              <DetailRow label="Date"       value={fmtDate(billData.createdAt)} />
              <DetailRow label="Time"       value={fmtTime(billData.createdAt)} />
              <DetailRow label="By"         value={createdBy} />
              <DetailRow label={prevBalLabel} value={`${fmt3(Math.abs(prevBal))} g`} />
            </View>
          </View>

          <View style={styles.dashedDivider} />

          {/* 4. RECEIPT Table */}
          <SectionHead title="RECEIPT" />
          <View style={styles.tableWrap}>
            <View style={styles.tableHead}>
              <TH flex={2}>Item Name</TH>
              <TH flex={1.3} align="right">Weight</TH>
              <TH flex={1.3} align="right">Result</TH>
              <TH flex={1}   align="right">Touch</TH>
              <TH flex={1.3} align="right">Pure</TH>
            </View>
            {receiptItems.length > 0 ? (
              <>
                {receiptItems.map((item, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <TD flex={2}   >{item.itemName}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.weight)}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.result)}</TD>
                    <TD flex={1}   align="right">{fmt2(item.touch)}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.purity)}</TD>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <TD flex={2}   bold>TOTAL</TD>
                  <TD flex={1.3} bold align="right">{fmt3(receiptItems.reduce((s,i)=>s+toNumber(i.weight),0))}</TD>
                  <TD flex={1.3} bold align="right">{fmt3(receiptItems.reduce((s,i)=>s+toNumber(i.result),0))}</TD>
                  <TD flex={1}></TD>
                  <TD flex={1.3} bold align="right">{fmt3(recpTotal)}</TD>
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No receipt items</Text>
            )}
          </View>

          {/* 5. ISSUE Table */}
          <SectionHead title="ISSUE" />
          <View style={styles.tableWrap}>
            <View style={styles.tableHead}>
              <TH flex={2}>Item Name</TH>
              <TH flex={1.3} align="right">G.Wt</TH>
              <TH flex={1.3} align="right">N.Wt</TH>
              <TH flex={1}   align="right">Touch</TH>
              <TH flex={1.3} align="right">Pure</TH>
            </View>
            {issueItems.length > 0 ? (
              <>
                {issueItems.map((item, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <TD flex={2}   >{item.itemName}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.grossWeight)}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.netWeight)}</TD>
                    <TD flex={1}   align="right">{fmt2(item.touch)}</TD>
                    <TD flex={1.3} align="right">{fmt3(item.purity)}</TD>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <TD flex={2}   bold>TOTAL</TD>
                  <TD flex={1.3} bold align="right">{fmt3(issueItems.reduce((s,i)=>s+toNumber(i.grossWeight),0))}</TD>
                  <TD flex={1.3} bold align="right">{fmt3(issueItems.reduce((s,i)=>s+toNumber(i.netWeight),0))}</TD>
                  <TD flex={1}></TD>
                  <TD flex={1.3} bold align="right">{fmt3(issueTotal)}</TD>
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No issue items</Text>
            )}
          </View>

          {/* 6. CASH Section */}
          <SectionHead title="CASH" />
          <View style={styles.cashSection}>
            {cashEntries.length > 0 ? (
              cashEntries.map((cash, i) => (
                <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                  <Text style={styles.td}>
                    ₹{fmt2(cash.cashAmount)}  /  {toNumber(cash.ftRate).toFixed(2)}  =  {fmt3(cash.pure)} g
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.noData}>N/A</Text>
            )}
          </View>

          <View style={styles.dashedDivider} />

          {/* 7. Summary Table */}
          <SectionHead title="SUMMARY" />
          <View style={styles.summaryTable}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={[styles.summaryTh, { color: prevBalColor }]}>Advance Balance</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTh}>RECEIPT</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTh}>ISSUE</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTh}>CASH</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryTh, { color: finalBalColor }]}>Old Balance</Text>
              </View>
            </View>
            <View style={[styles.summaryRow, styles.summaryDataRow]}>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={[styles.summaryTd, { color: prevBalColor }]}>{fmt3(Math.abs(prevBal))}</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTd}>{fmt3(recpTotal)}</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTd}>{fmt3(issueTotal)}</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryCellBorder]}>
                <Text style={styles.summaryTd}>{fmt3(cashPurity)}</Text>
              </View>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryTd, { color: finalBalColor }]}>{fmt3(Math.abs(finalBal))}</Text>
              </View>
            </View>
          </View>

          {/* Formula */}
          <View style={styles.formulaBox}>
            <Text style={styles.formulaText}>
              {fmt3(Math.abs(prevBal))} + {fmt3(issueTotal)} - ({fmt3(recpTotal)} + {fmt3(cashPurity)}) = {fmt3(Math.abs(finalBal))}
            </Text>
          </View>

          {/* 8. Total / Balance Bar */}
          <View style={styles.totalBar}>
            <Text style={styles.totalBarLabel}>{finalBalLabel}</Text>
            <Text style={[styles.totalBarValue, { color: finalBalColor === '#2563EB' ? C.silverLight : '#6EE7B7' }]}>
              {fmt3(Math.abs(finalBal))} g
            </Text>
          </View>

          {/* 9. Signature Section */}
          <View style={styles.sigSection}>
            <View style={styles.sigLeft}>
              <Text style={styles.sigLabel}>Customer Signature</Text>
            </View>
            <View style={styles.sigRight}>
              <Text style={styles.sigCompany}>Mayil Silver</Text>
              <Text style={styles.sigLabel}>Authorised Signatory</Text>
            </View>
          </View>

          {/* 10. Bottom Bar */}
          <View style={styles.bottomBar}>
            <View style={styles.bottomItem}>
              <Text style={styles.bottomLabel}>Issue Total</Text>
              <Text style={styles.bottomColon}> : </Text>
              <Text style={styles.bottomValue}>{fmt3(issueTotal)} g</Text>
            </View>
            <View style={[styles.bottomItem, styles.bottomItemMid]}>
              <Text style={styles.bottomLabel}>Receipt Total</Text>
              <Text style={styles.bottomColon}> : </Text>
              <Text style={styles.bottomValue}>{fmt3(recpTotal)} g</Text>
            </View>
            <View style={[styles.bottomItem, styles.bottomItemRight]}>
              <Text style={styles.bottomLabel}>{finalBalLabel}</Text>
              <Text style={styles.bottomColon}> : </Text>
              <Text style={styles.bottomValue}>{fmt3(Math.abs(finalBal))} g</Text>
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#DDE3E9' },
  scrollContent: { padding: horizontalPadding, paddingBottom: spacing.xl * 2 },

  // Access Denied
  accessDenied: { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:32, gap:12, backgroundColor:'#F5F3FF' },
  accessBack:   { position:'absolute', top:50, left:20 },
  accessDeniedTitle: { fontSize: moderateScale(18), fontWeight:'800', color:'#7C3AED' },
  accessDeniedText:  { fontSize: moderateScale(13), color:'#6B7280', textAlign:'center', lineHeight:20 },
  accessBtn:    { marginTop:8, backgroundColor:'#7C3AED', paddingHorizontal:24, paddingVertical:12, borderRadius:10 },
  accessBtnText:{ color:'#fff', fontWeight:'700', fontSize: moderateScale(14) },

  emptyState:  { flex:1, alignItems:'center', justifyContent:'center', gap:12 },
  emptyTitle:  { fontSize: moderateScale(16), fontWeight:'700', color:C.text },

  // Action Bar
  actionBar: { flexDirection:'row', gap:6, paddingHorizontal: horizontalPadding, paddingVertical: spacing.sm, backgroundColor: C.darkMid },
  actionBtn: {
    flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4,
    backgroundColor: C.dark, paddingVertical:10, borderRadius:5,
    shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.18, shadowRadius:3, elevation:3,
  },
  actionBtnText: { color:C.white, fontSize: moderateScale(10), fontWeight:'700', letterSpacing:0.3 },

  // Paper
  paper: {
    backgroundColor: C.white, borderWidth:1.5, borderColor: C.borderDark,
    shadowColor:'#4A6070', shadowOffset:{width:0,height:3}, shadowOpacity:0.15, shadowRadius:6, elevation:4,
    paddingBottom: 2,
  },

  // 1. Top Strip
  topStrip: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:14, paddingVertical:8,
    backgroundColor: C.white, borderBottomWidth:1, borderBottomColor: C.border,
  },
  topStripSpacer:   { flex:1, fontSize:11 },
  topStripTitle:    { flex:1, fontSize:16, fontWeight:'900', color:C.dark, letterSpacing:1.2, textAlign:'center' },
  topStripOriginal: { flex:1, fontSize:11, fontWeight:'800', color:C.textMid, letterSpacing:0.3, textAlign:'right' },

  // 2. Banner
  banner: { backgroundColor: C.silverBg2, paddingHorizontal:14, paddingVertical:8, borderBottomWidth:1, borderBottomColor: C.border },
  bannerTopRow:  { flexDirection:'row', justifyContent:'space-between', marginBottom:6 },
  bannerLeft:    { fontSize:12, fontWeight:'600', color: C.silverLight, letterSpacing:0.2 },
  bannerRight:   { fontSize:12, fontWeight:'600', color: C.silverLight, letterSpacing:0.2 },
  bannerLogoRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, marginBottom:2 },
  bannerLogo:    { width:42, height:42, borderRadius:4 },
  bannerName:    { fontSize:24, fontWeight:'900', color:C.dark, letterSpacing:1.2 },
  bannerTagline: { textAlign:'center', fontSize:11, color:C.textLight, letterSpacing:0.2 },

  // 3. Details Row
  detailsRow:   { flexDirection:'row', paddingHorizontal:12, paddingVertical:10, backgroundColor: C.white },
  customerBox:  { flex:1.1, paddingRight:10, borderRightWidth:1, borderRightColor: C.border },
  invoiceBox:   { flex:1, paddingLeft:10 },
  detailRow:    { flexDirection:'row', alignItems:'flex-start', marginBottom:5 },
  detailLabel:  { minWidth:70, fontSize: moderateScale(11), fontWeight:'800', color:C.textMid },
  detailColon:  { width:10, textAlign:'center', color:C.textLight, fontWeight:'700' },
  detailValue:  { flex:1, fontSize: moderateScale(11), color:C.text, fontWeight:'600' },
  dashedDivider:{ borderBottomWidth:1, borderStyle:'dashed', borderColor:C.textMid, marginHorizontal:12, marginVertical:8 },

  // Section Heading
  sectionHead: {
    backgroundColor: C.white, borderBottomWidth:1.5, borderColor: C.textMid,
    paddingHorizontal:12, paddingVertical:5,
  },
  sectionHeadText: { fontSize: moderateScale(12), fontWeight:'900', color:C.dark, letterSpacing:0.6, textTransform:'uppercase' },

  // Table
  tableWrap: { borderBottomWidth:1, borderBottomColor: C.border, marginHorizontal:12 },
  tableHead: {
    flexDirection:'row', backgroundColor:C.white,
    paddingHorizontal:8, paddingVertical:6,
    borderBottomWidth:1.5, borderBottomColor: C.textMid,
  },
  th: { fontSize: moderateScale(10), fontWeight:'900', color:C.textMid, letterSpacing:0.2 },
  tableRow:    { flexDirection:'row', paddingHorizontal:8, paddingVertical:7 },
  tableRowAlt: { backgroundColor: C.silverBg2 },
  td:     { fontSize: moderateScale(11.5), color:C.text },
  tdBold: { fontSize: moderateScale(11.5), color:C.dark, fontWeight:'700' },
  totalRow: {
    flexDirection:'row', paddingHorizontal:8, paddingVertical:8,
    borderTopWidth:1.5, borderTopColor: C.textMid,
    backgroundColor: C.silverBg,
  },
  noData: { fontSize: moderateScale(13), color:C.textLight, padding:12 },

  // Cash
  cashSection: { borderBottomWidth:1, borderBottomColor: C.border, marginHorizontal:12 },

  // Summary Table
  summaryTable:     { borderWidth:1, borderColor: C.borderDark, marginHorizontal:12, marginBottom:6 },
  summaryRow:       { flexDirection:'row', borderBottomWidth:1, borderBottomColor: C.borderDark },
  summaryDataRow:   { borderBottomWidth:0 },
  summaryCell:      { flex:1, minHeight:42, paddingHorizontal:3, paddingVertical:8, alignItems:'center', justifyContent:'center' },
  summaryCellBorder:{ borderRightWidth:1, borderRightColor: C.border },
  summaryTh:  { fontSize: moderateScale(9), fontWeight:'900', color:C.dark, textAlign:'center' },
  summaryTd:  { fontSize: moderateScale(11.5), fontWeight:'800', color:C.dark, textAlign:'center' },

  formulaBox: { borderBottomWidth:1, borderBottomColor: C.border, padding:8, alignItems:'center', backgroundColor: C.offWhite, marginHorizontal:12 },
  formulaText:{ fontSize: moderateScale(11), fontWeight:'700', color:C.textMid },

  // Total Bar (mirrors GST grand-total)
  totalBar: {
    flexDirection:'row', justifyContent:'space-between', alignItems:'center',
    paddingHorizontal:16, paddingVertical:10,
    backgroundColor: C.dark, borderBottomWidth:1.5, borderBottomColor: C.borderDark,
  },
  totalBarLabel: { fontSize:14, fontWeight:'800', color: C.silverLight, letterSpacing:0.5 },
  totalBarValue: { fontSize:20, fontWeight:'900', letterSpacing:0.5 },

  // Signature
  sigSection: { flexDirection:'row', minHeight:80, borderBottomWidth:1, borderBottomColor: C.border },
  sigLeft:    { flex:1, justifyContent:'flex-end', alignItems:'center', padding:10, borderRightWidth:1, borderRightColor: C.border },
  sigRight:   { flex:1, justifyContent:'flex-end', alignItems:'center', padding:10 },
  sigLabel:   { fontSize: moderateScale(12), fontWeight:'800', color:C.dark, letterSpacing:0.3 },
  sigCompany: { fontSize: moderateScale(11), color:C.textLight, marginBottom:5 },

  // Bottom Bar
  bottomBar: { flexDirection:'row', backgroundColor: C.darkMid, paddingHorizontal:14, paddingVertical:8 },
  bottomItem: { flex:1, flexDirection:'row', alignItems:'center' },
  bottomItemMid:   { justifyContent:'center', borderLeftWidth:1, borderRightWidth:1, borderColor:'#3D5265', paddingHorizontal:6 },
  bottomItemRight: { justifyContent:'flex-end' },
  bottomLabel: { fontSize: moderateScale(10.5), fontWeight:'700', color: C.silverLight },
  bottomColon: { color: C.silver, fontSize: moderateScale(10.5) },
  bottomValue: { fontSize: moderateScale(10.5), fontWeight:'800', color:C.white },
});

export default BillPreviewPage;
