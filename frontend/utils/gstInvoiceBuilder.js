const toNum = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const escHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const fmtCurr = (value) =>
  toNum(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtWt = (value) =>
  `${toNum(value).toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gram`;

const fmtDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${parsed.getDate().toString().padStart(2, '0')}-${(parsed.getMonth() + 1)
    .toString().padStart(2, '0')}-${parsed.getFullYear()}`;
};

const numToWords = (value) => {
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

export const normalizeInvoiceRows = (rows, ftRateValue, settings) =>
  (rows || []).map((row, index) => {
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

export const computeInvoiceSummary = (transaction, ftRate, gstSettings) => {
  const rows = normalizeInvoiceRows(transaction?.billDetails || [], ftRate, gstSettings);
  const cgst = rows.reduce((s, r) => s + r.cgstNumeric, 0);
  const sgst = rows.reduce((s, r) => s + r.sgstNumeric, 0);
  const grandTotal =
    rows.reduce((s, r) => s + r.totalNumeric, 0) || toNum(transaction?.totalInvoiceValue);
  const roundedTotal = Math.round(grandTotal);
  const roundOff = roundedTotal - grandTotal;
  return {
    rows,
    cgst,
    sgst,
    roundOff,
    grandTotal: roundedTotal || grandTotal,
    amountInWords: numToWords(roundedTotal || grandTotal),
  };
};

const INVOICE_CSS = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; color: #1A2A38; background: #fff; }
  .page-wrap { page-break-after: always; padding-bottom: 4mm; }
  .page-wrap:last-child { page-break-after: avoid; }
  .invoice { border: 1.5px solid #97A8B5; box-shadow: 0 1px 4px rgba(0,0,0,0.10); }

  .top-strip {
    display:flex; justify-content:space-between; align-items:center;
    padding:6px 14px;
    background:#EEF2F5;
    border-bottom:1.5px solid #97A8B5;
  }
  .top-title { font-size:16px; font-weight:800; letter-spacing:.8px; color:#1C2B3A; }
  .top-orig  { font-size:11.5px; font-weight:700; color:#445C6E; letter-spacing:.3px; }

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

  .addr-strip {
    text-align:center; padding:7px 14px;
    background:#F5F7F9;
    border-bottom:1px solid #C8D4DC;
    font-size:13px; color:#445C6E; line-height:1.85;
  }

  .irn-row {
    padding:8px 14px;
    background:#FAFCFD;
    border-bottom:1px solid #C8D4DC;
  }
  .irn-block { font-size:11.5px; line-height:2.0; color:#445C6E; }
  .irn-block b { font-weight:700; color:#1C2B3A; }

  .details-grid { display:grid; grid-template-columns:1.1fr 1fr; border-bottom:1px solid #C8D4DC; }
  .detail-box { padding:11px 13px; background:#FFFFFF; }
  .detail-box.left { border-right:1px solid #C8D4DC; }
  .cust-name { font-size:14px; font-weight:800; color:#1C2B3A; margin-bottom:4px; }
  .cust-addr { font-size:13px; color:#445C6E; line-height:1.8; margin-bottom:6px; }
  .d-row { display:flex; align-items:flex-start; font-size:12.5px; margin-bottom:7px; line-height:1.55; }
  .d-lbl { min-width:118px; font-weight:700; color:#3F5565; }
  .d-colon { width:12px; text-align:center; color:#5F7382; font-weight:700; }
  .d-val { flex:1; font-weight:400; color:#1C2B3A; }

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

  .tax-summary { display:flex; justify-content:flex-end; border-bottom:1px solid #C8D4DC; }
  .tax-tbl { width:55%; border-left:2px solid #97A8B5; border-collapse:collapse; }
  .tax-tbl td { padding:9px 14px; font-size:13.5px; border-bottom:1px solid #E4EBF0; color:#1A2A38; }
  .tax-tbl tr:last-child td { border-bottom:none; }
  .tax-tbl .right { text-align:right; font-weight:700; color:#1C2B3A; }

  .grand-total {
    display:flex; justify-content:space-between; align-items:center;
    padding:10px 16px;
    border-bottom:1.5px solid #97A8B5;
    background:#1C2B3A;
  }
  .gt-label { font-size:16px; font-weight:800; color:#A8BDC9; letter-spacing:.5px; }
  .gt-value { font-size:20px; font-weight:900; color:#FFFFFF; letter-spacing:.5px; }

  .words-sec { padding:10px 14px; border-bottom:1px solid #C8D4DC; background:#FAFCFD; }
  .words-title { font-size:11.5px; font-weight:800; color:#1C2B3A; margin-bottom:4px; text-transform:uppercase; letter-spacing:.3px; }
  .words-body  { font-size:15px; font-weight:700; color:#1A2A38; line-height:1.75; }

  .remarks { padding:7px 14px; border-bottom:1px solid #C8D4DC; font-size:12px; color:#445C6E; background:#F5F7F9; }

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

  .sig-grid { display:grid; grid-template-columns:1fr 1fr; min-height:120px; border-bottom:1px solid #C8D4DC; }
  .sig-box  { display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:10px 8px; }
  .sig-box.left { border-right:1px solid #C8D4DC; }
  .sig-box.right { align-items:center; justify-content:flex-end; padding-right:0; padding-bottom:10px; }
  .sig-co   { font-size:11px; color:#6B8496; margin-bottom:5px; text-align:center; }
  .sig-lbl  { font-size:13px; font-weight:800; color:#1C2B3A; letter-spacing:.3px; text-align:center; }

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
`;

const buildInvoiceBody = (transaction, summary, settings, logoSrc, profile) => {
  const cgstPct = settings?.cgstPercent || '1.50';
  const sgstPct = settings?.sgstPercent || '1.50';
  const hsnCode = settings?.hsnCode || '71141110';
  const gstPct = settings?.gstPercentage || '3';
  const bankName = transaction?.bankDetails?.bankAccountName || settings?.bankDetails?.bankAccountName || '-';
  const bankAccount = transaction?.bankDetails?.accountNumber || settings?.bankDetails?.accountNumber || '-';
  const bankIfsc = transaction?.bankDetails?.ifscCode || settings?.bankDetails?.ifscCode || '-';
  const bankBranch = transaction?.bankDetails?.branch || settings?.bankDetails?.branch || '-';
  const upiId = transaction?.bankDetails?.upiId || settings?.bankDetails?.upiId || '-';

  const tableRows = summary.rows
    .map((row, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escHtml(row.particular || 'SILVER ARTICLES')}</td>
        <td class="center">${escHtml(row.hsnCode || hsnCode)}</td>
        <td class="center">${escHtml(gstPct)}%</td>
        <td class="right">${fmtWt(row.weightNumeric)}</td>
        <td class="right">${fmtCurr(row.rateNumeric)}</td>
        <td class="right">${fmtCurr(row.taxableValueNumeric)}</td>
      </tr>`)
    .join('');

  const absRoundOff = Math.abs(summary.roundOff).toFixed(2);

  return `<div class="invoice">

  <div class="top-strip">
    <span class="top-title">Tax Invoice</span>
    <span class="top-orig">ORIGINAL FOR RECIPIENT</span>
  </div>

  <div class="banner">
    <div class="banner-top">
      <span>GST IN:- ${escHtml(profile.gst)}</span>
      <span>${escHtml(profile.phone)}</span>
    </div>
    <div class="banner-mid">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="banner-logo" />` : ''}
      <span class="banner-name">${escHtml(profile.name)}</span>
    </div>
    <div class="banner-tag">${escHtml(profile.tagline)}</div>
  </div>

  <div class="addr-strip">
    ${escHtml(profile.address)} ${escHtml(profile.city)}
    ${profile.email ? `<br/>${escHtml(profile.email)}` : ''}
  </div>

  <div class="details-grid">
    <div class="detail-box left">
      <div class="d-row"><span class="d-lbl">Name</span><span class="d-colon">:</span><span class="d-val">${escHtml(transaction.customerName || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Phone</span><span class="d-colon">:</span><span class="d-val">${escHtml(transaction.phone || '-')}</span></div>
    </div>
    <div class="detail-box">
      <div class="d-row"><span class="d-lbl">Invoice Number</span><span class="d-colon">:</span><span class="d-val">${escHtml(transaction.invoiceNumber || '-')}</span></div>
      <div class="d-row"><span class="d-lbl">Invoice Date</span><span class="d-colon">:</span><span class="d-val">${escHtml(fmtDate(transaction.invoiceDate))}</span></div>
      <div class="d-row"><span class="d-lbl">Mobile No</span><span class="d-colon">:</span><span class="d-val">${escHtml(transaction.phone || '-')}</span></div>
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
      <tr><td>CGST Output ${escHtml(String(cgstPct))}%</td><td class="right">${fmtCurr(summary.cgst)}</td></tr>
      <tr><td>SGST Output ${escHtml(String(sgstPct))}%</td><td class="right">${fmtCurr(summary.sgst)}</td></tr>
      <tr><td>Round Off</td><td class="right">(-)${absRoundOff}</td></tr>
    </table>
  </div>

  <div class="grand-total">
    <span class="gt-label">Total</span>
    <span class="gt-value">${fmtCurr(summary.grandTotal)}</span>
  </div>

  <div class="words-sec">
    <div class="words-title">Amount In Words:-</div>
    <div class="words-body">${escHtml(summary.amountInWords)}.</div>
  </div>

  ${transaction.remarks ? `<div class="remarks"><b>Remarks :</b> ${escHtml(transaction.remarks)}</div>` : ''}

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
      <div class="bank-row"><span class="b-lbl">Bank Name</span><span>:</span><span class="b-val">${escHtml(bankName)}</span></div>
      <div class="bank-row"><span class="b-lbl">A/c No.</span><span>:</span><span class="b-val">${escHtml(bankAccount)}</span></div>
      <div class="bank-row"><span class="b-lbl">Branch &amp; IFS Code</span><span>:</span><span class="b-val">${escHtml(bankBranch)} / ${escHtml(bankIfsc)}</span></div>
      ${upiId !== '-' ? `<div class="bank-row"><span class="b-lbl">UPI ID</span><span>:</span><span class="b-val">${escHtml(upiId)}</span></div>` : ''}
      <div class="co-stamp">for ${escHtml(profile.name)} [${escHtml(profile.financialYear)}]</div>
    </div>
  </div>

  <div class="sig-grid">
    <div class="sig-box left">
      <span class="sig-lbl">Customer Signature</span>
    </div>
    <div class="sig-box right">
      <span class="sig-co">for ${escHtml(profile.name)}</span>
      <span class="sig-lbl">Authorised Signatory</span>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="bb-cell"><span class="bb-lbl">Sales Value</span><span>:</span><span class="bb-val">${fmtCurr(summary.grandTotal)}</span></div>
    <div class="bb-cell mid"><span class="bb-lbl">Purchase Value</span><span>:</span><span class="bb-val">&nbsp;</span></div>
    <div class="bb-cell right"><span class="bb-lbl">Receivable Amount:</span><span class="bb-val">${fmtCurr(summary.grandTotal)}</span></div>
  </div>

</div>`;
};

export const buildCombinedInvoiceHtml = (bills) => {
  const bodies = bills
    .map(({ transaction, summary, settings, logoSrc, profile }) =>
      `<div class="page-wrap">${buildInvoiceBody(transaction, summary, settings, logoSrc, profile)}</div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
${INVOICE_CSS}
</style>
</head>
<body>
${bodies}
</body>
</html>`;
};
