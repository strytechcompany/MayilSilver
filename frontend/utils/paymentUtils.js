import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { base_url } from '../config';

const LOGO_ASSET = require('../assets/logo.png');
const BACKEND_URL = (base_url || '').replace(/\/api\/?$/, '');

export const PAYMENT_HISTORY_KEY  = 'paymentHistory';
export const PAYMENT_COUNTER_KEY  = 'paymentInvoiceCounter';
export const PAYMENT_ITEM_HISTORY_KEY = 'paymentItemHistory';
export const PAYMENT_EDITABLE_INVOICE_KEY = 'paymentEditableInvoiceNumber';
export const GST_EDITABLE_INVOICE_KEY = 'gstEditableInvoiceNumber';

// ── Number helpers ─────────────────────────────────────────────────────────
export const toNum = (v, fb = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fb;
};

export const fmt = (v) =>
  toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtW = (v) =>
  `${toNum(v).toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gram`;

export const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
};

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const numToWords = (value) => {
  const n = Math.round(toNum(value));
  if (!n) return 'INR Zero Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two   = (x) => x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`;
  const three = (x) => {
    const h = Math.floor(x / 100), r = x % 100;
    return `${h ? `${ones[h]} Hundred` : ''}${h && r ? ' ' : ''}${r ? two(r) : ''}`.trim();
  };
  const cr = Math.floor(n / 10000000);
  const lk = Math.floor((n % 10000000) / 100000);
  const th = Math.floor((n % 100000) / 1000);
  const rm = n % 1000;
  const p = [];
  if (cr) p.push(`${two(cr)} Crore`);
  if (lk) p.push(`${two(lk)} Lakh`);
  if (th) p.push(`${three(th)} Thousand`);
  if (rm) p.push(three(rm));
  return `INR ${p.join(' ')} Only`;
};

// ── Invoice number ─────────────────────────────────────────────────────────
export const getNextInvoiceNumber = async () => {
  const raw   = await AsyncStorage.getItem(PAYMENT_COUNTER_KEY);
  const count = (parseInt(raw) || 0) + 1;
  await AsyncStorage.setItem(PAYMENT_COUNTER_KEY, String(count));
  const now = new Date();
  const ds  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `PAY${ds}-${String(count).padStart(4, '0')}`;
};

// ── History helpers ────────────────────────────────────────────────────────
export const savePaymentToHistory = async (record) => {
  const raw     = await AsyncStorage.getItem(PAYMENT_HISTORY_KEY);
  const history = raw ? JSON.parse(raw) : [];
  history.unshift(record);
  await AsyncStorage.setItem(PAYMENT_HISTORY_KEY, JSON.stringify(history));
};

export const loadPaymentHistory = async () => {
  const raw = await AsyncStorage.getItem(PAYMENT_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
};

export const deletePaymentFromHistory = async (invoiceNumber) => {
  const history = await loadPaymentHistory();
  const updated = history.filter((r) => r.invoiceNumber !== invoiceNumber);
  await AsyncStorage.setItem(PAYMENT_HISTORY_KEY, JSON.stringify(updated));
  return updated;
};

export const savePaymentItemName = async (itemName) => {
  const trimmed = String(itemName || '').trim();
  if (!trimmed) return [];

  const raw = await AsyncStorage.getItem(PAYMENT_ITEM_HISTORY_KEY);
  const history = raw ? JSON.parse(raw) : [];
  const seen = new Set();
  const updated = [trimmed, ...history]
    .filter((name) => {
      const normalized = String(name || '').trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 100);

  await AsyncStorage.setItem(PAYMENT_ITEM_HISTORY_KEY, JSON.stringify(updated));
  return updated;
};

export const loadPaymentItemHistory = async () => {
  const raw = await AsyncStorage.getItem(PAYMENT_ITEM_HISTORY_KEY);
  return raw ? JSON.parse(raw) : [];
};

export const extractNumericInvoiceValue = (invoiceNumber) => {
  const match = String(invoiceNumber || '').match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : 0;
};

export const getStoredOrComputedNextInvoice = async (storageKey, existingInvoices = []) => {
  const storedRaw = await AsyncStorage.getItem(storageKey);
  const storedValue = extractNumericInvoiceValue(storedRaw);
  const existingMax = existingInvoices.reduce((max, invoiceNumber) => (
    Math.max(max, extractNumericInvoiceValue(invoiceNumber))
  ), 0);
  const nextValue = Math.max(storedValue, existingMax + 1, 1);
  await AsyncStorage.setItem(storageKey, String(nextValue));
  return String(nextValue);
};

export const getStoredInvoiceSequence = async (storageKey, existingInvoices = []) => {
  const nextInvoiceNumber = await getStoredOrComputedNextInvoice(storageKey, existingInvoices);
  const nextValue = extractNumericInvoiceValue(nextInvoiceNumber);
  const previousValue = nextValue > 1 ? nextValue - 1 : 0;

  return {
    currentInvoiceNumber: String(nextValue),
    previousInvoiceNumber: previousValue > 0 ? String(previousValue) : '',
  };
};

export const reserveNextInvoiceNumber = async (storageKey, currentInvoiceNumber) => {
  const currentValue = extractNumericInvoiceValue(currentInvoiceNumber);
  const storedRaw = await AsyncStorage.getItem(storageKey);
  const storedValue = extractNumericInvoiceValue(storedRaw);
  const nextValue = Math.max(storedValue, currentValue + 1, 1);
  await AsyncStorage.setItem(storageKey, String(nextValue));
  return String(nextValue);
};

// ── Logo helper ────────────────────────────────────────────────────────────
export const getLogoDataUri = async (profile) => {
  // 1. Backend URL — always set when logo is uploaded via POST /api/shop-profile/logo
  if (profile?.logoUrl) {
    try {
      const fullUrl = profile.logoUrl.startsWith('http')
        ? profile.logoUrl
        : `${BACKEND_URL}${profile.logoUrl}`;
      const cached = `${FileSystem.cacheDirectory}payment_logo_pdf.png`;
      const { uri: dl } = await FileSystem.downloadAsync(fullUrl, cached);
      const b64 = await FileSystem.readAsStringAsync(dl, { encoding: FileSystem.EncodingType.Base64 });
      if (b64) return `data:image/png;base64,${b64}`;
    } catch {}
  }
  // 2. Base64 stored directly in MongoDB
  if (profile?.logoBase64) {
    const b = profile.logoBase64;
    if (b) return b.startsWith('data:') ? b : `data:image/png;base64,${b}`;
  }
  // 3. Fallback: local bundled asset
  try {
    const [asset] = await Asset.loadAsync(LOGO_ASSET);
    const b64 = await FileSystem.readAsStringAsync(asset.localUri ?? asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/png;base64,${b64}`;
  } catch { return ''; }
};

// ── Bill summary builder ───────────────────────────────────────────────────
export const buildSummary = (cash, weight, gstSettings) => {
  const totalAmount = toNum(cash);
  const wt       = toNum(weight);
  const cgstPct  = toNum(gstSettings?.cgstPercent, 1.5);
  const sgstPct  = toNum(gstSettings?.sgstPercent, 1.5);
  const gstPct   = cgstPct + sgstPct;
  const taxable  = gstPct > 0 ? totalAmount / (1 + gstPct / 100) : totalAmount;
  const rate     = wt > 0 ? taxable / wt : 0;
  const cgst     = taxable * cgstPct / 100;
  const sgst     = taxable * sgstPct / 100;
  const rawTotal = taxable + cgst + sgst;
  const grandTotal  = totalAmount;
  const computedRoundOff = grandTotal - rawTotal;
  const roundOff = Math.abs(computedRoundOff) < 0.005 ? 0 : computedRoundOff;
  return {
    rows: [{
      particular:         '',
      hsnCode:            gstSettings?.hsnCode || '71141110',
      weightNumeric:      wt,
      rateNumeric:        rate,
      taxableValueNumeric: taxable,
    }],
    taxable, cgst, sgst, roundOff, grandTotal,
    amountInWords: numToWords(grandTotal),
  };
};

// ── HTML bill builder ──────────────────────────────────────────────────────
export const buildPaymentBillHtml = (tx, summary, settings, logoSrc = '', profile = {}) => {
  const cgstPct    = settings?.cgstPercent    || '1.50';
  const sgstPct    = settings?.sgstPercent    || '1.50';
  const hsnCode    = settings?.hsnCode        || '71141110';
  const gstPct     = settings?.gstPercentage  || '3';
  const bankName   = settings?.bankDetails?.bankAccountName || '-';
  const bankAcct   = settings?.bankDetails?.accountNumber   || '-';
  const bankIfsc   = settings?.bankDetails?.ifscCode        || '-';
  const bankBranch = settings?.bankDetails?.branch          || '-';
  const upiId      = settings?.bankDetails?.upiId           || '-';
  const absRound   = Math.abs(summary.roundOff).toFixed(2);

  const tableRows = summary.rows.map((row, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${esc(row.particular || 'SILVER ARTICLES')}</td>
      <td class="center">${esc(row.hsnCode || hsnCode)}</td>
      <td class="center">${esc(gstPct)}%</td>
      <td class="right">${fmtW(row.weightNumeric)}</td>
      <td class="right">${fmt(row.rateNumeric)}</td>
      <td class="right">${fmt(row.taxableValueNumeric)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; color: #1A2A38; background: #fff; }
  .invoice { border: 1.5px solid #97A8B5; }
  .top-strip { display:flex; justify-content:space-between; align-items:center; padding:6px 14px; background:#EEF2F5; border-bottom:1.5px solid #97A8B5; }
  .top-title  { font-size:16px; font-weight:800; letter-spacing:.8px; color:#1C2B3A; }
  .top-orig   { font-size:11.5px; font-weight:700; color:#445C6E; }
  .banner     { background:#1C2B3A; color:#fff; padding:10px 14px 8px; border-bottom:3px solid #8FA4B5; }
  .banner-top { display:flex; justify-content:space-between; font-size:12px; font-weight:600; color:#A8BDC9; margin-bottom:6px; }
  .banner-mid { display:flex; justify-content:center; align-items:center; gap:12px; margin-bottom:5px; }
  .banner-logo      { width:125px; height:auto; display:block; }
  .banner-name{ font-size:34px; font-weight:900; letter-spacing:2px; color:#FFF; text-transform:uppercase; }
  .banner-tag { text-align:center; font-size:12px; color:#8FA4B5; }
  .addr-strip { text-align:center; padding:7px 14px; background:#F5F7F9; border-bottom:1px solid #C8D4DC; font-size:13px; color:#445C6E; line-height:1.85; }
  .details-grid { display:grid; grid-template-columns:1.1fr 1fr; border-bottom:1px solid #C8D4DC; }
  .detail-box   { padding:11px 13px; background:#FFF; }
  .detail-box.left { border-right:1px solid #C8D4DC; }
  .d-row  { display:flex; align-items:flex-start; font-size:12.5px; margin-bottom:7px; line-height:1.55; }
  .d-lbl  { min-width:118px; font-weight:700; color:#3F5565; }
  .d-colon{ width:12px; text-align:center; color:#5F7382; font-weight:700; }
  .d-val  { flex:1; color:#1C2B3A; }
  table.items { width:100%; border-collapse:collapse; font-size:12.5px; }
  table.items th, table.items td { border:1px solid #C8D4DC; padding:9px; vertical-align:middle; }
  table.items th { background:#E4EBF0; font-weight:800; text-transform:uppercase; font-size:11.5px; color:#1C2B3A; letter-spacing:.3px; }
  table.items tr:nth-child(even) td { background:#F5F7F9; }
  .center { text-align:center; } .right { text-align:right; }
  .tax-summary { display:flex; justify-content:flex-end; border-bottom:1px solid #C8D4DC; }
  .tax-tbl  { width:55%; border-left:2px solid #97A8B5; border-collapse:collapse; }
  .tax-tbl td { padding:9px 14px; font-size:13.5px; border-bottom:1px solid #E4EBF0; }
  .tax-tbl tr:last-child td { border-bottom:none; }
  .tax-tbl .right { text-align:right; font-weight:700; }
  .grand-total { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-bottom:1.5px solid #97A8B5; background:#1C2B3A; }
  .gt-label { font-size:16px; font-weight:800; color:#A8BDC9; }
  .gt-value { font-size:20px; font-weight:900; color:#FFF; }
  .words-sec   { padding:10px 14px; border-bottom:1px solid #C8D4DC; background:#FAFCFD; }
  .words-title { font-size:11.5px; font-weight:800; color:#1C2B3A; margin-bottom:4px; text-transform:uppercase; }
  .words-body  { font-size:15px; font-weight:700; line-height:1.75; }
  .footer-grid { display:grid; grid-template-columns:1.1fr 1fr; border-bottom:1px solid #C8D4DC; }
  .footer-box  { padding:10px 12px; }
  .footer-box.left { border-right:1px solid #C8D4DC; }
  .sec-head { font-size:11.5px; font-weight:800; text-transform:uppercase; color:#1C2B3A; margin-bottom:7px; padding-bottom:4px; border-bottom:1.5px solid #8FA4B5; }
  .tc-line  { font-size:11.5px; color:#4A6070; line-height:1.95; margin-bottom:4px; }
  .bank-row { display:flex; gap:3px; font-size:11.5px; margin-bottom:5px; }
  .b-lbl    { min-width:120px; color:#6B8496; }
  .b-val    { font-weight:700; color:#1A2A38; }
  .co-stamp { margin-top:14px; text-align:right; font-size:11.5px; font-weight:700; color:#1C2B3A; line-height:1.75; }
  .sig-grid { display:grid; grid-template-columns:1fr 1fr; min-height:120px; border-bottom:1px solid #C8D4DC; }
  .sig-box  { display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:10px 8px; }
  .sig-box.left { border-right:1px solid #C8D4DC; }
  .sig-lbl  { font-size:13px; font-weight:800; color:#1C2B3A; }
  .sig-co   { font-size:11px; color:#6B8496; margin-bottom:5px; }
  .bottom-bar { display:grid; grid-template-columns:1fr 1fr 1fr; padding:8px 14px; background:#243447; }
  .bb-cell    { display:flex; align-items:center; gap:2px; }
  .bb-cell.mid{ justify-content:center; border-left:1px solid #3D5265; border-right:1px solid #3D5265; padding:0 8px; }
  .bb-cell.right { justify-content:flex-end; }
  .bb-lbl { font-weight:700; color:#A8BDC9; font-size:11.5px; }
  .bb-val { font-weight:800; color:#FFF; font-size:11.5px; margin-left:2px; }
</style>
</head>
<body>
<div class="invoice">

  <div class="top-strip">
    <span class="top-title">Payment Receipt</span>
    <span class="top-orig">ORIGINAL FOR RECIPIENT</span>
  </div>

  <div class="banner">
    <div class="banner-top">
      <span>GST IN:- ${esc(profile.gst || '')}</span>
      <span>${esc(profile.phone || '')}${profile.altPhone ? ` / ${esc(profile.altPhone)}` : ''}</span>
    </div>
    <div class="banner-mid">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="banner-logo"/>` : ''}
      <span class="banner-name">${esc(profile.name || '')}</span>
    </div>
    <div class="banner-tag">${esc(profile.tagline || '')}</div>
  </div>

  <div class="addr-strip">
    ${esc(profile.address || '')} ${esc(profile.city || '')}
    ${profile.email ? `<br/>${esc(profile.email)}` : ''}
  </div>

  <div class="details-grid">
    <div class="detail-box left">
      <div class="d-row"><span class="d-lbl">Name</span><span class="d-colon">:</span><span class="d-val">${esc(tx.customerName || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Phone</span><span class="d-colon">:</span><span class="d-val">${esc(tx.phone || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Address</span><span class="d-colon">:</span><span class="d-val">${esc(tx.address || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">GST No</span><span class="d-colon">:</span><span class="d-val">${esc(tx.gstNo || '-')}</span></div>
    </div>
    <div class="detail-box">
      <div class="d-row"><span class="d-lbl">Invoice Number</span><span class="d-colon">:</span><span class="d-val">${esc(tx.invoiceNumber || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Invoice Date</span><span class="d-colon">:</span><span class="d-val">${esc(fmtDate(tx.invoiceDate))}</span></div>
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
          <th class="right"  style="width:16%">Weight</th>
          <th class="right"  style="width:12%">Rate</th>
          <th class="right"  style="width:16%">Amount</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="tax-summary">
    <table class="tax-tbl">
      <tr><td>Taxable Amount</td><td class="right">${fmt(summary.taxable)}</td></tr>
      <tr><td>CGST Output ${esc(String(cgstPct))}%</td><td class="right">${fmt(summary.cgst)}</td></tr>
      <tr><td>SGST Output ${esc(String(sgstPct))}%</td><td class="right">${fmt(summary.sgst)}</td></tr>
      <tr><td>Round Off</td><td class="right">(-)${absRound}</td></tr>
    </table>
  </div>

  <div class="grand-total">
    <span class="gt-label">Total</span>
    <span class="gt-value">${fmt(summary.grandTotal)}</span>
  </div>

  <div class="words-sec">
    <div class="words-title">Amount In Words:-</div>
    <div class="words-body">${esc(summary.amountInWords)}.</div>
  </div>

  <div class="footer-grid">
    <div class="footer-box left">
      <div class="sec-head">Declaration</div>
      ${profile.termsAndConditions
        ? profile.termsAndConditions.split('\n').filter(l => l.trim()).map(l => `<div class="tc-line">${esc(l)}</div>`).join('')
        : `<div class="tc-line">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
      <div class="tc-line">Interest@15% per annum will be charged for the bills not paid within 15 days.</div>
      <div class="tc-line">Goods once sold will not be taken back.</div>
      <div class="tc-line">No E way bill is required for goods covered under this invoice as per SR NO.150/151 of CGST Rule 138(14).</div>`}
    </div>
    <div class="footer-box">
      <div class="sec-head">Company's Bank Details</div>
      <div class="bank-row"><span class="b-lbl">Bank Name</span><span>:</span><span class="b-val">${esc(bankName)}</span></div>
      <div class="bank-row"><span class="b-lbl">A/c No.</span><span>:</span><span class="b-val">${esc(bankAcct)}</span></div>
      <div class="bank-row"><span class="b-lbl">Branch &amp; IFS Code</span><span>:</span><span class="b-val">${esc(bankBranch)} / ${esc(bankIfsc)}</span></div>
      ${upiId !== '-' ? `<div class="bank-row"><span class="b-lbl">UPI ID</span><span>:</span><span class="b-val">${esc(upiId)}</span></div>` : ''}
      <div class="co-stamp">for ${esc(profile.name || '')} [${esc(profile.financialYear || '2025-2026')}]</div>
    </div>
  </div>

  <div class="sig-grid" style="grid-template-columns:1fr;">
    <div class="sig-box" style="align-items:flex-end; padding-right:24px; padding-bottom:12px;">
      ${profile.signatureSrc ? `<img src="${profile.signatureSrc}" alt="" style="height:56px;max-width:180px;object-fit:contain;margin-bottom:6px;display:block;"/>` : '<div style="height:56px;"></div>'}
      <span class="sig-co">for ${esc(profile.name || '')}</span>
      <span class="sig-lbl">Authorised Signatory</span>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="bb-cell"><span class="bb-lbl">Sales Value</span><span>:</span><span class="bb-val">${fmt(summary.grandTotal)}</span></div>
    <div class="bb-cell mid"><span class="bb-lbl">Purchase Value</span><span>:</span><span class="bb-val">&nbsp;</span></div>
    <div class="bb-cell right"><span class="bb-lbl">Receivable Amount:</span><span class="bb-val">${fmt(summary.grandTotal)}</span></div>
  </div>

</div>
</body>
</html>`;
};
