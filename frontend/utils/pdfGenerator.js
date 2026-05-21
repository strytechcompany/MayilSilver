import * as Print from 'expo-print';
import { getDueBalanceDisplay } from './balanceDisplay';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};
const formatTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const formatOne = (v) => (Number(v) || 0).toFixed(1);
const formatWeight = (v) => `${formatOne(v)} g`;
const formatCash = (v) => formatOne(v);

export const generatePDF = async (data, type) => {
  let html = '';

  if (type === 'bill') {
    const { billData, customer, logoSrc = '' } = data;
    const issueItems = billData.issueItems || [];
    const receiptItems = billData.receiptItems || [];
    const cashEntries = billData.cashEntries || [];
    const prevBal = Number(billData.previousBalance) || 0;
    const finalBal = Number(billData.finalBalance) || 0;
    const finalBalDisplay = getDueBalanceDisplay(finalBal);
    const prevBalDisplay = getDueBalanceDisplay(prevBal);
    const createdBy = billData.createdBy || billData.userName || 'Admin';

    const issueRows = issueItems.map((item, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td class="right">${formatOne(item.grossWeight)}</td>
        <td class="right">${formatOne(item.netWeight)}</td>
        <td class="center">${formatOne(item.touch)}%</td>
        <td class="right">${formatOne(item.purity)}</td>
      </tr>
    `).join('');

    const receiptRows = receiptItems.map((item, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td class="right">${formatOne(item.weight)}</td>
        <td class="right">${formatOne(item.result)}</td>
        <td class="center">${formatOne(item.touch)}%</td>
        <td class="right">${formatOne(item.purity)}</td>
      </tr>
    `).join('');

    const cashRows = cashEntries.map((cash, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>Cash Entry</td>
        <td class="right">&#8377;${formatCash(cash.cashAmount || cash.amount)}</td>
        <td class="right">${formatOne(cash.ftRate)}</td>
        <td class="center">-</td>
        <td class="right">${formatOne(cash.pure)}</td>
      </tr>
    `).join('');

    html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1A2A38; background: #fff; }
	  .invoice { border: 1px solid #97A8B5; }
  .top-strip { display:grid; grid-template-columns:1fr 1fr 1fr; align-items:center; padding:8px 14px; background:#FFFFFF; border-bottom:1px solid #C8D4DC; }
  .top-title { font-size:17px; font-weight:900; letter-spacing:1.2px; color:#1C2B3A; text-align:center; }
  .top-orig  { font-size:11.5px; font-weight:800; color:#445C6E; text-align:right; }
  .banner    { background:#F5F7F9; color:#1C2B3A; padding:10px 14px 8px; border-bottom:1px solid #C8D4DC; }
  .banner-mid { display:flex; justify-content:center; align-items:center; gap:12px; margin-bottom:4px; }
  .banner-name{ font-size:28px; font-weight:900; letter-spacing:1.4px; color:#1C2B3A; text-transform:uppercase; }
  .banner-tag { text-align:center; font-size:12px; color:#6B8496; letter-spacing:.3px; }
  .details-grid { display:grid; grid-template-columns:1.1fr 1fr; padding:10px 14px; background:#FFFFFF; }
  .detail-box { padding:0; background:#FFFFFF; }
  .detail-box.left { border-right:1px solid #C8D4DC; padding-right:12px; }
  .detail-box.right { padding-left:12px; }
  .d-row { display:flex; align-items:flex-start; font-size:12.5px; margin-bottom:6px; }
  .d-lbl { min-width:108px; font-weight:800; color:#3F5565; }
  .d-colon { width:12px; text-align:center; color:#5F7382; }
  .d-val { flex:1; color:#1C2B3A; font-weight:600; }
	  .dash { border-top:1px dashed #97A8B5; margin:9px 14px; }
	  .sec-title { background:#EEF2F5; margin:0 14px; padding:6px 10px; font-size:12px; font-weight:900; color:#1C2B3A; text-transform:uppercase; text-align:center; border:1px solid #97A8B5; letter-spacing:.5px; }
	  table.items { width:100%; border-collapse:collapse; font-size:12px; }
	  table.items th, table.items td { border-bottom:1px solid #DCE4EA; padding:7px 8px; vertical-align:middle; }
	  table.items th { background:#1C2B3A; font-weight:900; text-transform:uppercase; color:#FFFFFF; border-bottom:1px solid #97A8B5; }
	  table.items tr:nth-child(even) td { background:#F5F7F9; }
	  table.items tr.total td { background:#EEF2F5; border-top:1px solid #97A8B5; font-weight:900; }
	  .table-box { margin:0 14px 8px; border-left:1px solid #97A8B5; border-right:1px solid #97A8B5; border-bottom:1px solid #97A8B5; }
	  .center { text-align:center; } .right { text-align:right; }
  .summary-table { width:calc(100% - 28px); margin:0 14px 6px; border-collapse:collapse; border:1px solid #97A8B5; }
  .summary-table th, .summary-table td { padding:10px 5px; text-align:center; border:1px solid #C8D4DC; }
  .summary-table th { background:#FFFFFF; font-size:10.5px; color:#1C2B3A; font-weight:900; }
  .summary-table td { font-weight:800; font-size:13px; }
  .formula { margin:0 14px; padding:8px; text-align:center; background:#FAFCFD; border:1px solid #C8D4DC; border-top:none; font-weight:800; color:#445C6E; }
  .grand-total { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:#1C2B3A; color:#FFF; }
  .gt-label { font-size:15px; font-weight:800; color:#A8BDC9; }
  .gt-value { font-size:20px; font-weight:900; }
  .footer-sig { display:grid; grid-template-columns:1fr 1fr; min-height:100px; border-top:1px solid #C8D4DC; }
  .sig-box { display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:15px; }
  .sig-lbl { font-size:13px; font-weight:800; border-top:1px solid #1C2B3A; padding-top:5px; width:150px; text-align:center; }
  .bottom-bar { display:grid; grid-template-columns:1fr 1fr 1fr; padding:8px 14px; background:#243447; color:#FFF; font-size:11px; }
  .bb-cell { display:flex; align-items:center; gap:4px; }
  .bb-lbl { font-weight:700; color:#A8BDC9; }
  .bb-val { font-weight:800; }
</style>
</head>
<body>
<div class="invoice">
  <div class="top-strip">
    <span></span>
    <span class="top-title">BILL</span>
    <span class="top-orig">TYPE : B2B</span>
  </div>
  <div class="banner">
    <div class="banner-mid">
      ${logoSrc ? `<img src="${logoSrc}" alt="" style="width:42px;height:42px;object-fit:contain;border-radius:4px;flex-shrink:0;"/>` : ''}
      <span class="banner-name">MAYIL SILVER</span>
    </div>
    <div class="banner-tag">Pure Silver - Trusted Quality</div>
  </div>
  <div class="details-grid">
    <div class="detail-box left">
      <div class="d-row"><span class="d-lbl">Bill No</span><span class="d-colon">:</span><span class="d-val">${String(billData.billNo).padStart(5, '0')}</span></div>
      <div class="d-row"><span class="d-lbl">Name</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(billData.customerName)}</span></div>
      <div class="d-row"><span class="d-lbl">Phone</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(customer?.phone || '-')}</span></div>
    </div>
    <div class="detail-box right">
      <div class="d-row"><span class="d-lbl">Date</span><span class="d-colon">:</span><span class="d-val">${formatDate(billData.createdAt)}</span></div>
      <div class="d-row"><span class="d-lbl">Time</span><span class="d-colon">:</span><span class="d-val">${formatTime(billData.createdAt)}</span></div>
      <div class="d-row"><span class="d-lbl">By</span><span class="d-colon">:</span><span class="d-val">${escapeHtml(createdBy)}</span></div>
	      <div class="d-row"><span class="d-lbl" style="color:${prevBalDisplay.color}">${prevBalDisplay.label}</span><span class="d-colon">:</span><span class="d-val" style="color:${prevBalDisplay.color}; font-weight:900;">${prevBalDisplay.value}</span></div>
    </div>
  </div>
  <div class="dash"></div>

	  ${issueItems.length > 0 ? `
	  <div class="sec-title">Issue</div>
	  <div class="table-box">
	    <table class="items">
	      <thead>
	        <tr><th>S.No</th><th>Name</th><th class="right">G.Weight</th><th class="right">N.Weight</th><th class="center">Calc</th><th class="right">Pure</th></tr>
	      </thead>
	      <tbody>${issueRows}
	        <tr class="total"><td></td><td>TOTAL</td><td class="right">${formatOne(issueItems.reduce((s, i) => s + (Number(i.grossWeight) || 0), 0))}</td><td class="right">${formatOne(issueItems.reduce((s, i) => s + (Number(i.netWeight) || 0), 0))}</td><td></td><td class="right">${formatOne(billData.issueTotalPurity)}</td></tr>
	      </tbody>
	    </table>
	  </div>` : ''}

	  ${receiptItems.length > 0 ? `
	  <div class="sec-title">Received</div>
	  <div class="table-box">
	    <table class="items">
	      <thead>
	        <tr><th>S.No</th><th>Name</th><th class="right">Weight</th><th class="right">Result</th><th class="center">Calc</th><th class="right">Pure</th></tr>
	      </thead>
	      <tbody>${receiptRows}
	        <tr class="total"><td></td><td>TOTAL</td><td class="right">${formatOne(receiptItems.reduce((s, i) => s + (Number(i.weight) || 0), 0))}</td><td class="right">${formatOne(receiptItems.reduce((s, i) => s + (Number(i.result) || 0), 0))}</td><td></td><td class="right">${formatOne(billData.receiptTotalPurity)}</td></tr>
	      </tbody>
	    </table>
	  </div>` : ''}

	  ${cashEntries.length > 0 ? `
	  <div class="sec-title">Cash</div>
	  <div class="table-box">
	    <table class="items">
	      <thead>
	        <tr><th>S.No</th><th>Description</th><th class="right">Amount</th><th class="right">FT Rate</th><th class="center">-</th><th class="right">Pure</th></tr>
	      </thead>
	      <tbody>${cashRows}</tbody>
	    </table>
	  </div>` : ''}
  <div class="dash"></div>

  <div class="sec-title">Summary</div>
  <table class="summary-table">
    <thead>
      <tr><th style="color:${prevBalDisplay.color}">${prevBalDisplay.label}</th><th>Receipt</th><th>Issue</th><th>Cash</th><th style="color:${finalBalDisplay.color}">${finalBalDisplay.label}</th></tr>
    </thead>
    <tbody>
      <tr>
	        <td style="color: ${prevBalDisplay.color}">${prevBalDisplay.value}</td>
	        <td>${formatWeight(billData.receiptTotalPurity)}</td>
	        <td>${formatWeight(billData.issueTotalPurity)}</td>
	        <td>${formatWeight(billData.cashTotalPurity)}</td>
	        <td style="color: ${finalBalDisplay.color}">${finalBalDisplay.value}</td>
      </tr>
    </tbody>
  </table>
  <div class="formula">
	    ${formatOne(Math.abs(prevBal))} + ${formatOne(billData.issueTotalPurity)} - (${formatOne(billData.receiptTotalPurity)} + ${formatOne(billData.cashTotalPurity)}) = ${formatOne(Math.abs(finalBal))}
  </div>

  <div class="grand-total">
	    <span class="gt-label" style="color:${finalBalDisplay.color}">${finalBalDisplay.label}</span>
	    <span class="gt-value" style="color:${finalBalDisplay.color}">${finalBalDisplay.value}</span>
  </div>

  <div class="footer-sig">
    <div class="sig-box"><span class="sig-lbl">Customer Signature</span></div>
    <div class="sig-box"><span class="sig-lbl">Authorized Signature</span></div>
  </div>

  <div class="bottom-bar">
	    <div class="bb-cell"><span class="bb-lbl">Total Pure (Issue)</span><span class="bb-val">: ${formatWeight(billData.issueTotalPurity)}</span></div>
	    <div class="bb-cell" style="justify-content:center; border-left:1px solid #3D5265; border-right:1px solid #3D5265;"><span class="bb-lbl">Total Pure (Recp)</span><span class="bb-val">: ${formatWeight(billData.receiptTotalPurity)}</span></div>
	    <div class="bb-cell" style="justify-content:flex-end;"><span class="bb-lbl" style="color:${finalBalDisplay.color}">${finalBalDisplay.label}</span><span class="bb-val" style="color:${finalBalDisplay.color}">: ${finalBalDisplay.value}</span></div>
  </div>
</div>
</body>
</html>`;
  } else if (type === 'statement') {
    const { rows, summary, customerName, customerPhone, dateRange } = data;
    const generatedOn = new Date().toLocaleString();
    
    const legacyAdvanceToken = String.fromCharCode(65, 66);
    const getStatementBalanceDisplay = (row) =>
      row.balanceDisplay || (row.balanceLabel === legacyAdvanceToken
        ? getDueBalanceDisplay(-Math.abs(Number(row.balance) || 0))
        : getDueBalanceDisplay(Math.abs(Number(row.balance) || 0)));
    const summaryBalanceDisplay = summary.balanceDisplay || (summary.balanceLabel === legacyAdvanceToken
      ? getDueBalanceDisplay(-Math.abs(Number(summary.balance) || 0))
      : getDueBalanceDisplay(Math.abs(Number(summary.balance) || 0)));

    const statementRows = rows.map((row, index) => {
      const balanceDisplay = getStatementBalanceDisplay(row);

      return `
	      <tr class="${index % 2 === 0 ? 'even' : 'odd'}">
	        <td class="center">${formatDate(row.date)}</td>
	        <td class="center">${escapeHtml(row.type)}</td>
	        <td>${escapeHtml(row.description)}</td>
	        <td class="right" style="color:#EF4444">${row.debit > 0 ? row.debit.toFixed(3) : '-'}</td>
	        <td class="right" style="color:#10B981">${row.credit > 0 ? row.credit.toFixed(3) : '-'}</td>
	        <td class="right" style="color:${balanceDisplay.color}; font-weight:700">${balanceDisplay.text}</td>
	      </tr>
	    `;
    }).join('');

    html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1A2A38; background: #fff; }
  .invoice { border: 1.5px solid #97A8B5; }
  .top-strip { display:flex; justify-content:space-between; align-items:center; padding:6px 14px; background:#EEF2F5; border-bottom:1.5px solid #97A8B5; }
  .top-title { font-size:16px; font-weight:800; letter-spacing:.8px; color:#1C2B3A; }
  .banner    { background:#1C2B3A; color:#fff; padding:15px; border-bottom:3px solid #8FA4B5; text-align:center; }
  .banner-name{ font-size:28px; font-weight:900; letter-spacing:2px; color:#FFFFFF; text-transform:uppercase; margin-bottom:4px; }
  .banner-tag { font-size:12px; color:#8FA4B5; letter-spacing:.3px; }
  .info-strip { padding:10px 15px; background:#F5F7F9; border-bottom:1px solid #C8D4DC; display:flex; justify-content:space-between; font-size:12px; }
  .summary-boxes { display:flex; gap:10px; padding:15px; background:#FAFCFD; border-bottom:1px solid #C8D4DC; }
  .box { flex:1; padding:12px; border:1px solid #E5E7EB; borderRadius:8px; background:#FFF; text-align:center; }
  .box-lbl { font-size:10px; font-weight:800; color:#6B7280; text-transform:uppercase; margin-bottom:5px; }
  .box-val { font-size:18px; font-weight:900; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border:1px solid #DDE3E9; padding:8px; }
  th { background:#1C2B3A; color:#FFF; text-transform:uppercase; letter-spacing:0.5px; }
  .even { background:#FFF; } .odd { background:#F9FAFB; }
  .center { text-align:center; } .right { text-align:right; }
</style>
</head>
<body>
<div class="invoice">
  <div class="top-strip"><span class="top-title">Mini Statement</span></div>
  <div class="banner">
    <div class="banner-name">MAYIL SILVER</div>
    <div class="banner-tag">Customer Business Statement</div>
  </div>
  <div class="info-strip">
    <div><strong>Customer:</strong> ${escapeHtml(customerName)}<br/><strong>Phone:</strong> ${escapeHtml(customerPhone || '-')}</div>
    <div class="right"><strong>Range:</strong> ${escapeHtml(dateRange)}<br/><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
  </div>
  <div class="summary-boxes">
    <div class="box"><div class="box-lbl">Total Debit</div><div class="box-val" style="color:#EF4444">${summary.debit.toFixed(3)} g</div></div>
    <div class="box"><div class="box-lbl">Total Credit</div><div class="box-val" style="color:#10B981">${summary.credit.toFixed(3)} g</div></div>
	    <div class="box"><div class="box-lbl">Closing Balance</div><div class="box-val" style="color:${summaryBalanceDisplay.color}">${summaryBalanceDisplay.text}</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Type</th><th>Description</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Balance</th></tr>
    </thead>
    <tbody>${statementRows}</tbody>
  </table>
</div>
</body>
</html>`;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
};
