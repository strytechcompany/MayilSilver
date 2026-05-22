const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const customerRoutes = require('./routes/customerRoutes');
const Customer = require('./models/Customer');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const INVOICES_DIR = path.join(__dirname, 'public', 'invoices');
if (!fs.existsSync(INVOICES_DIR)) fs.mkdirSync(INVOICES_DIR, { recursive: true });
const DOCUMENTS_DIR = path.join(__dirname, 'public', 'uploads', 'documents');
if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
const LOGO_DIR = path.join(__dirname, 'public', 'uploads', 'logo');
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
const SIGNATURE_DIR = path.join(__dirname, 'public', 'uploads', 'signature');
if (!fs.existsSync(SIGNATURE_DIR)) fs.mkdirSync(SIGNATURE_DIR, { recursive: true });

const app = express();
const ADMIN_EMAIL = 'mayilsilver@gmail.com';
const ADMIN_PASSWORD = '123456';
const SALT_ROUNDS = 10;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const MONGO_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

mongoose.set('strictQuery', false);
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 0);

app.use(cors());
app.use(express.json({ limit: '25mb' })); // increased for document base64 uploads
app.use('/invoices', express.static(INVOICES_DIR)); // publicly serve generated invoice PDFs
app.use('/uploads/documents', express.static(DOCUMENTS_DIR));
app.use('/uploads/logo', express.static(LOGO_DIR));
app.use('/uploads/signature', express.static(SIGNATURE_DIR));

// ── API Router (all /api/* routes) ───────────────────────────
const router = express.Router();

let mongoConnectPromise = null;

const redactMongoUri = (uri = '') => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:<password>@');

mongoose.connection.on('connecting', () => console.log('MongoDB Atlas connecting'));
mongoose.connection.on('connected', () => console.log('MongoDB Atlas Connected'));
mongoose.connection.on('disconnected', () => console.log('MongoDB Atlas disconnected'));
mongoose.connection.on('error', (err) => console.log('MongoDB Atlas Error:', err?.message || err));

const getMongoStateLabel = () => MONGO_STATE_LABELS[mongoose.connection.readyState] || 'unknown';

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!MONGO_URI) {
    throw new Error('Missing MongoDB connection string. Set MONGO_URI in Render Environment Variables.');
  }

  if (!mongoConnectPromise) {
    console.log('MongoDB Atlas connecting with URI:', redactMongoUri(MONGO_URI));
    mongoConnectPromise = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    })
      .then((connection) => {
        console.log('MongoDB Connected');
        return connection;
      })
      .catch((err) => {
        mongoConnectPromise = null;
        console.log('MongoDB Error:', err?.message || err);
        throw err;
      });
  }

  return mongoConnectPromise;
};

const waitForMongoConnection = async (timeoutMs = 12000) => {
  if (mongoose.connection.readyState === 1) return true;

  try {
    const connected = await Promise.race([
      connectDB().then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);

    if (!connected && mongoose.connection.readyState !== 1) {
      return false;
    }

    return mongoose.connection.readyState === 1;
  } catch (err) {
    console.log('MongoDB wait error:', err?.message || err);
    return false;
  }
};

const requireMongoReady = (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();

  return res.status(503).json({
    success: false,
    message: 'MongoDB Atlas is not connected. Check Render MONGO_URI and MongoDB Atlas Network Access.',
    mongoState: getMongoStateLabel(),
  });
};

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', CounterSchema);

async function getNextCounterValue(counterId) {
  const counter = await Counter.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

async function getNextBillNo() {
  return getNextCounterValue('billNo');
}

async function getNextGstInvoiceNo() {
  const seq = await getNextCounterValue('gstInvoiceNo');
  return `GST${String(seq).padStart(5, '0')}`;
}

async function getNextPaymentInvoiceNo() {
  const seq = await getNextCounterValue('paymentInvoiceNo');
  const now = new Date();
  const ds = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `PAY${ds}-${String(seq).padStart(4, '0')}`;
}

const BillSchema = new mongoose.Schema({
  billNo: { type: Number, required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerName: { type: String },
  transactionType: { type: String, default: 'B2B' },
  issueItems: [{
    itemName: { type: String },
    grossWeight: { type: Number, default: 0 },
    netWeight: { type: Number, default: 0 },
    touch: { type: Number, default: 0 },
    purity: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  }],
  receiptItems: [{
    itemName: { type: String },
    weight: { type: Number, default: 0 },
    result: { type: Number, default: 0 },
    touch: { type: Number, default: 0 },
    purity: { type: Number, default: 0 }
  }],
  cashEntries: [{
    cashAmount: { type: Number, default: 0 },
    cashType: { type: String, default: 'Cash' },
    notes: { type: String, default: '' },
    ftRate: { type: Number, default: 0 },
    pure: { type: Number, default: 0 }
  }],
  previousBalance: { type: Number, required: true },
  finalBalance: { type: Number, required: true },
  issueTotalPurity: { type: Number, default: 0 },
  receiptTotalPurity: { type: Number, default: 0 },
  cashTotalAmount: { type: Number, default: 0 },
  cashTotalPurity: { type: Number, default: 0 },
  createdBy: { type: String, default: 'admin' },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

// ── Shop Profile (singleton per app) ─────────────────────────
const ShopProfileSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'profile', unique: true },
  shopName:           { type: String, default: '' },
  gstin:              { type: String, default: '' },
  phone:              { type: String, default: '' },
  altPhone:           { type: String, default: '' },
  address:            { type: String, default: '' },
  city:               { type: String, default: '' },
  stateName:          { type: String, default: '' },
  stateCode:          { type: String, default: '' },
  email:              { type: String, default: '' },
  website:            { type: String, default: '' },
  tagline:            { type: String, default: '' },
  logoBase64:         { type: String, default: '' },
  logoUrl:            { type: String, default: '' },
  signatureBase64:    { type: String, default: '' },
  signatureUrl:       { type: String, default: '' },
  bankName:           { type: String, default: '' },
  accountNumber:      { type: String, default: '' },
  ifscCode:           { type: String, default: '' },
  branch:             { type: String, default: '' },
  termsAndConditions: { type: String, default: '' },
  footerNotes:        { type: String, default: '' },
  financialYear:      { type: String, default: '2025-2026' },
}, { timestamps: true });

// ── GST Settings (singleton per app) ─────────────────────────
const GstSettingsSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'settings', unique: true },
  cgstPercent: { type: String, default: '1.5' },
  sgstPercent: { type: String, default: '1.5' },
  igstPercent: { type: String, default: '3' },
  gstPercentage: { type: String, default: '3' },
  hsnCode: { type: String, default: '' },
  bankDetails: {
    bankAccountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    branch: { type: String, default: '' },
    upiId: { type: String, default: '' }
  }
}, { timestamps: true });

const GstLineItemSchema = new mongoose.Schema({
  sno: { type: Number, default: 1 },
  particular: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  weight: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  taxableValue: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const GstBankDetailsSchema = new mongoose.Schema({
  bankAccountName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  ifscCode: { type: String, default: '' },
  branch: { type: String, default: '' },
  upiId: { type: String, default: '' }
}, { _id: false });

const GstCustomerTransactionSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, required: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: Date, default: Date.now },
  totalInvoiceValue: { type: Number, default: 0 },
  billDetails: { type: [GstLineItemSchema], default: [] },
  bankDetails: { type: GstBankDetailsSchema, default: () => ({}) },
  sourceBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  sourceBillNo: { type: Number, default: null },
  sourceTransaction: {
    issueItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    receiptItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    cashEntries: { type: [mongoose.Schema.Types.Mixed], default: [] },
    previousBalance: { type: Number, default: 0 },
    finalBalance: { type: Number, default: 0 }
  }
}, { timestamps: true });

const PaymentLineItemSchema = new mongoose.Schema({
  itemName: { type: String, default: '' },
  weight: { type: Number, default: 0 },
  cash: { type: Number, default: 0 },
  ftRate: { type: Number, default: 0 }
}, { _id: false });

const PaymentTransactionSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  status: { type: String, enum: ['draft', 'final'], default: 'draft' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  gstNo: { type: String, default: '' },
  itemName: { type: String, default: '' },
  items: { type: [PaymentLineItemSchema], default: [] },
  cash: { type: Number, default: 0 },
  ftRate: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  invoiceDate: { type: Date, default: Date.now },
  printedAt: { type: Date, default: null }
}, { timestamps: true });

const Bill = mongoose.model('Bill', BillSchema);
const GstCustomerTransaction = mongoose.model('GstCustomerTransaction', GstCustomerTransactionSchema);
const GstSettings = mongoose.model('GstSettings', GstSettingsSchema);
const PaymentTransaction = mongoose.model('PaymentTransaction', PaymentTransactionSchema);

const UserSchema = new mongoose.Schema({
  userName:       { type: String, default: '' },
  name:           { type: String, default: '' },
  phone:          { type: String, default: '' },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:       { type: String, required: true },
  role:           { type: String, default: 'user' },
  gstBillEnabled: { type: Boolean, default: false },
  allowedPages:   { type: [String], default: [] },
}, { timestamps: true });
const User = mongoose.model('User', UserSchema);
const ShopProfile = mongoose.model('ShopProfile', ShopProfileSchema);

// ── App Settings (singleton) ──────────────────────────────────
const AppSettingsSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'appsettings', unique: true },
  appName:      { type: String, default: 'Mayil Silver' },
  appVersion:   { type: String, default: '1.0.0' },
  appLink:      { type: String, default: '' },
  shareMessage: { type: String, default: 'Download our Billing App and manage your silver business easily.' },
  goldRate:     { type: Number, default: 9850 },
  ftRate:       { type: Number, default: 75.20 },
}, { timestamps: true });
const AppSettings = mongoose.model('AppSettings', AppSettingsSchema);

// ── Kadai Documents ───────────────────────────────────────────
const KadaiDocumentSchema = new mongoose.Schema({
  documentId:   { type: String, default: '' },
  title:       { type: String, required: true },
  type:        { type: String, default: 'OTHER' },
  fileUrl:     { type: String, default: '' },
  filePath:    { type: String, default: '' },
  mimeType:    { type: String, default: '' },
  fileName:    { type: String, default: '' },
  notes:       { type: String, default: '' },
  uploadDate:  { type: Date, default: Date.now },
  uploadedBy:  { type: String, default: 'admin' },
}, { timestamps: true });
const KadaiDocument = mongoose.model('KadaiDocument', KadaiDocumentSchema);

const DailyExpenseSchema = new mongoose.Schema({
  expenseId:   { type: String, default: '' },
  workerName:  { type: String, default: '' },
  title:       { type: String, required: true, trim: true },
  amount:      { type: Number, required: true, min: 0 },
  category:    { type: String, required: true, trim: true },
  notes:       { type: String, default: '' },
  date:        { type: Date, required: true },
  createdBy:   { type: String, default: 'admin' },
  createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
const DailyExpense = mongoose.model('DailyExpense', DailyExpenseSchema);

const sanitizeUser = (user) => ({
  _id: user._id,
  userName: user.userName || '',
  name: user.name || '',
  phone: user.phone || '',
  email: user.email,
  role: user.role || 'user',
  gstBillEnabled: user.gstBillEnabled,
  allowedPages: user.allowedPages || [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const buildDefaultUserName = (email = '') =>
  (email.split('@')[0] || 'User')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase()) || 'User';

const isBcryptHash = (value = '') => /^\$2[aby]\$\d+\$/.test(value);

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

const verifyPassword = async (password, storedHash = '') => {
  if (isBcryptHash(storedHash)) return bcrypt.compare(password, storedHash);
  return password === storedHash;
};

const normalizeDateInput = (value) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toSafeSlug = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'file';

const extensionFromMime = (mimeType = '') => {
  if (mimeType.includes('pdf')) return '.pdf';
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  return '';
};

const ensureDocumentStored = ({ base64Data, mimeType = '', fileName = '', title = '' }) => {
  if (!base64Data) return null;
  const providedExt = path.extname(fileName || '');
  const extension = providedExt || extensionFromMime(mimeType) || '.bin';
  const safeName = `${Date.now()}_${toSafeSlug(title || fileName || 'document')}${extension}`;
  const absolutePath = path.join(DOCUMENTS_DIR, safeName);
  fs.writeFileSync(absolutePath, base64Data, 'base64');
  return {
    fileName: fileName || safeName,
    filePath: absolutePath,
    fileUrl: `/uploads/documents/${safeName}`,
  };
};

const removeStoredDocument = (filePath = '') => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const ensureAdminUser = async () => {
  let admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await User.create({
      userName: 'Admin',
      email: ADMIN_EMAIL,
      password: await hashPassword(ADMIN_PASSWORD),
      role: 'admin',
      gstBillEnabled: true,
    });
    return admin;
  }

  let changed = false;
  if (!admin.userName) {
    admin.userName = 'Admin';
    changed = true;
  }
  if (!admin.gstBillEnabled) {
    admin.gstBillEnabled = true;
    changed = true;
  }
  if (admin.role !== 'admin') {
    admin.role = 'admin';
    changed = true;
  }
  if (!isBcryptHash(admin.password)) {
    admin.password = await hashPassword(admin.password || ADMIN_PASSWORD);
    changed = true;
  }
  if (changed) await admin.save();
  return admin;
};

const resolveCurrentUser = async (req) => {
  const rawUserId = req.header('x-user-id') || req.query.userId;
  const role = req.header('x-user-role') || req.query.role;
  const email = (req.header('x-user-email') || req.query.email || '').toLowerCase().trim();

  if (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId)) {
    const found = await User.findById(rawUserId);
    if (found) return found;
  }

  if (email) {
    const found = await User.findOne({ email });
    if (found) return found;
  }

  if (role === 'admin' || email === ADMIN_EMAIL) {
    return ensureAdminUser();
  }

  return null;
};

const DEFAULT_GST_SETTINGS = {
  _singleton: 'settings',
  cgstPercent: '1.5',
  sgstPercent: '1.5',
  igstPercent: '3',
  gstPercentage: '3',
  hsnCode: '',
  bankDetails: {
    bankAccountName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    upiId: ''
  }
};

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const normalizeIssueItems = (issueItems = []) => (
  issueItems.map((i) => ({
    itemName: i.itemName || '',
    grossWeight: toNumber(i.grossWeight),
    netWeight: toNumber(i.netWeight || i.grossWeight),
    touch: toNumber(i.touch),
    purity: toNumber(i.purity),
    amount: toNumber(i.amount)
  }))
);

const normalizeReceiptItems = (receiptItems = []) => (
  receiptItems.map((i) => ({
    itemName: i.itemName || '',
    weight: toNumber(i.weight),
    result: toNumber(i.result),
    touch: toNumber(i.touch),
    purity: toNumber(i.purity)
  }))
);

const normalizeCashEntries = (cashEntries = []) => (
  cashEntries.map((i) => ({
    cashAmount: toNumber(i.amount || i.cashAmount),
    cashType: i.cashType || 'Cash',
    notes: i.notes || '',
    ftRate: toNumber(i.ftRate),
    pure: toNumber(i.pure)
  }))
);

const normalizeBankDetails = (bankDetails = {}) => ({
  bankAccountName: bankDetails.bankAccountName || '',
  accountNumber: bankDetails.accountNumber || '',
  ifscCode: bankDetails.ifscCode || '',
  branch: bankDetails.branch || '',
  upiId: bankDetails.upiId || ''
});

const normalizeGstBillDetails = (items = []) => {
  const rows = Array.isArray(items) ? items : [];

  if (rows.length === 0) {
    return [{
      sno: 1,
      particular: '',
      hsnCode: '',
      weight: 0,
      rate: 0,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      total: 0
    }];
  }

  return rows.map((item, index) => {
    const taxableValue = toNumber(item.taxableValue);
    const cgst = toNumber(item.cgst);
    const sgst = toNumber(item.sgst);
    const total = toNumber(item.total) || parseFloat((taxableValue + cgst + sgst).toFixed(2));

    return {
      sno: index + 1,
      particular: item.particular || item.itemName || '',
      hsnCode: item.hsnCode || '',
      weight: toNumber(item.weight || item.grossWeight || item.result),
      rate: toNumber(item.rate),
      taxableValue,
      cgst,
      sgst,
      total
    };
  });
};

const buildGstDraftFromTransaction = ({
  customer,
  bill,
  issueItems,
  receiptItems,
  cashEntries,
  previousBalance,
  finalBalance,
  gstDraft
}) => {
  const mergedLineItems = issueItems.length > 0 ? issueItems : receiptItems;
  const billDetails = normalizeGstBillDetails(gstDraft?.billDetails || mergedLineItems);
  const totalInvoiceValue = gstDraft?.totalInvoiceValue !== undefined
    ? toNumber(gstDraft.totalInvoiceValue)
    : billDetails.reduce((sum, item) => sum + toNumber(item.total), 0);

  return {
    customerId: customer._id,
    customerName: gstDraft?.customerName || customer.customerName || '',
    phone: gstDraft?.phone || customer.phone || '',
    address: gstDraft?.address || customer.address || '',
    gstNumber: gstDraft?.gstNumber || customer.gstin || '',
    invoiceNumber: gstDraft?.invoiceNumber || '',
    invoiceDate: toDate(gstDraft?.invoiceDate),
    totalInvoiceValue,
    billDetails,
    bankDetails: normalizeBankDetails(gstDraft?.bankDetails),
    sourceBillId: bill._id,
    sourceBillNo: bill.billNo,
    sourceTransaction: {
      issueItems,
      receiptItems,
      cashEntries,
      previousBalance: toNumber(previousBalance),
      finalBalance: toNumber(finalBalance)
    }
  };
};

const normalizeGstPayload = async (payload = {}, existing = null) => {
  const billDetails = normalizeGstBillDetails(payload.billDetails);
  const computedTotal = billDetails.reduce((sum, item) => sum + toNumber(item.total), 0);

  return {
    customerId: payload.customerId || existing?.customerId || null,
    customerName: payload.customerName || existing?.customerName || '',
    phone: payload.phone || existing?.phone || '',
    address: payload.address || existing?.address || '',
    gstNumber: payload.gstNumber || existing?.gstNumber || '',
    invoiceNumber: payload.invoiceNumber || existing?.invoiceNumber || await getNextGstInvoiceNo(),
    invoiceDate: toDate(payload.invoiceDate || existing?.invoiceDate),
    totalInvoiceValue: payload.totalInvoiceValue !== undefined
      ? toNumber(payload.totalInvoiceValue)
      : parseFloat(computedTotal.toFixed(2)),
    billDetails,
    bankDetails: normalizeBankDetails(payload.bankDetails || existing?.bankDetails),
    sourceBillId: payload.sourceBillId !== undefined ? payload.sourceBillId : (existing?.sourceBillId || null),
    sourceBillNo: payload.sourceBillNo !== undefined ? payload.sourceBillNo : (existing?.sourceBillNo || null),
    sourceTransaction: {
      issueItems: payload.sourceTransaction?.issueItems || existing?.sourceTransaction?.issueItems || [],
      receiptItems: payload.sourceTransaction?.receiptItems || existing?.sourceTransaction?.receiptItems || [],
      cashEntries: payload.sourceTransaction?.cashEntries || existing?.sourceTransaction?.cashEntries || [],
      previousBalance: toNumber(payload.sourceTransaction?.previousBalance ?? existing?.sourceTransaction?.previousBalance),
      finalBalance: toNumber(payload.sourceTransaction?.finalBalance ?? existing?.sourceTransaction?.finalBalance)
    }
  };
};

const normalizePaymentItems = (payload = {}) => {
  const baseItems = Array.isArray(payload.items) && payload.items.length > 0
    ? payload.items
    : [{
      itemName: payload.itemName || '',
      weight: payload.weight,
      cash: payload.cash,
      ftRate: payload.ftRate
    }];

  return baseItems.map((item) => ({
    itemName: item.itemName || '',
    weight: toNumber(item.weight),
    cash: toNumber(item.cash),
    ftRate: toNumber(item.ftRate)
  }));
};

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findOrCreatePaymentCustomer = async (payload = {}) => {
  const customerId = payload.customerId;
  const customerName = String(payload.customerName || '').trim();
  const phone = String(payload.phone || '').trim();
  const address = String(payload.address || '').trim();
  const gstin = String(payload.gstNo || payload.gstin || '').trim();

  let customer = null;
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    customer = await Customer.findById(customerId);
  }
  if (!customer && phone) {
    customer = await Customer.findOne({ phone });
  }
  if (!customer && customerName) {
    customer = await Customer.findOne({
      customerName: { $regex: `^${escapeRegex(customerName)}$`, $options: 'i' }
    });
  }

  if (customer) {
    let changed = false;
    if (customerName && customer.customerName !== customerName) {
      customer.customerName = customerName;
      changed = true;
    }
    if (phone && customer.phone !== phone) {
      customer.phone = phone;
      changed = true;
    }
    if (address !== customer.address) {
      customer.address = address;
      changed = true;
    }
    if (gstin !== customer.gstin) {
      customer.gstin = gstin;
      changed = true;
    }
    if (!customer.customerId) {
      customer.customerId = customer._id.toString();
      changed = true;
    }
    if (changed) await customer.save();
    return customer;
  }

  if (!customerName || !phone) return null;

  const created = new Customer({
    customerName,
    phone,
    address,
    gstin,
    createdAt: new Date()
  });
  created.customerId = created._id.toString();
  await created.save();
  return created;
};

// ── Root health-check (no /api prefix) ──────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Mayil Silver Backend is running', time: new Date() });
});

// ── /api health-check ─────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({ message: 'Mayil Silver API is running', time: new Date() });
});

// ── GST SETTINGS ─────────────────────────────────────────────

// GET /api/gst-settings — returns the singleton settings document
router.get('/gst-settings', async (req, res) => {
  try {
    let settings = await GstSettings.findOne({ _singleton: 'settings' });
    if (!settings) {
      settings = await GstSettings.create(DEFAULT_GST_SETTINGS);
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/gst-settings — upsert the singleton settings document
router.put('/gst-settings', async (req, res) => {
  try {
    const { cgstPercent, sgstPercent, igstPercent, gstPercentage, hsnCode, bankDetails } = req.body;
    const update = {
      cgstPercent: cgstPercent ?? DEFAULT_GST_SETTINGS.cgstPercent,
      sgstPercent: sgstPercent ?? DEFAULT_GST_SETTINGS.sgstPercent,
      igstPercent: igstPercent ?? DEFAULT_GST_SETTINGS.igstPercent,
      gstPercentage: gstPercentage ?? DEFAULT_GST_SETTINGS.gstPercentage,
      hsnCode: hsnCode ?? DEFAULT_GST_SETTINGS.hsnCode,
      bankDetails: {
        bankAccountName: bankDetails?.bankAccountName ?? '',
        accountNumber: bankDetails?.accountNumber ?? '',
        ifscCode: bankDetails?.ifscCode ?? '',
        branch: bankDetails?.branch ?? '',
        upiId: bankDetails?.upiId ?? ''
      }
    };
    const settings = await GstSettings.findOneAndUpdate(
      { _singleton: 'settings' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── SHOP PROFILE ─────────────────────────────────────────────

// GET /api/shop-profile — returns the singleton shop profile
router.get('/shop-profile', async (req, res) => {
  try {
    let profile = await ShopProfile.findOne({ _singleton: 'profile' });
    if (!profile) {
      profile = await ShopProfile.create({ _singleton: 'profile' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/shop-profile — upsert the singleton shop profile
router.put('/shop-profile', async (req, res) => {
  try {
    const allowed = [
      'shopName', 'gstin', 'phone', 'altPhone', 'address', 'city',
      'stateName', 'stateCode', 'email', 'website', 'tagline', 'logoBase64', 'logoUrl',
      'signatureBase64', 'signatureUrl',
      'bankName', 'accountNumber', 'ifscCode', 'branch',
      'termsAndConditions', 'footerNotes', 'financialYear'
    ];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });
    const profile = await ShopProfile.findOneAndUpdate(
      { _singleton: 'profile' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/shop-profile/logo — upload logo file, store URL in ShopProfile
router.post('/shop-profile/logo', async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    if (!base64Data) return res.status(400).json({ success: false, message: 'No image data provided' });

    const ext = (mimeType || '').includes('png') ? '.png' : '.jpg';
    const safeName = `logo_${Date.now()}${ext}`;
    const absolutePath = path.join(LOGO_DIR, safeName);

    // Remove old logo files to keep storage clean
    try {
      const existing = fs.readdirSync(LOGO_DIR);
      existing.forEach((f) => { try { fs.unlinkSync(path.join(LOGO_DIR, f)); } catch {} });
    } catch {}

    fs.writeFileSync(absolutePath, base64Data, 'base64');
    const logoUrl = `/uploads/logo/${safeName}`;

    await ShopProfile.findOneAndUpdate(
      { _singleton: 'profile' },
      { $set: { logoUrl } },
      { upsert: true }
    );

    res.json({ success: true, logoUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/shop-profile/signature — upload signature file, store URL in ShopProfile
router.post('/shop-profile/signature', async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    if (!base64Data) return res.status(400).json({ success: false, message: 'No image data provided' });

    const ext = (mimeType || '').includes('png') ? '.png' : '.jpg';
    const safeName = `signature_${Date.now()}${ext}`;
    const absolutePath = path.join(SIGNATURE_DIR, safeName);

    // Remove old signature files to keep storage clean
    try {
      const existing = fs.readdirSync(SIGNATURE_DIR);
      existing.forEach((f) => { try { fs.unlinkSync(path.join(SIGNATURE_DIR, f)); } catch {} });
    } catch {}

    fs.writeFileSync(absolutePath, base64Data, 'base64');
    const signatureUrl = `/uploads/signature/${safeName}`;

    await ShopProfile.findOneAndUpdate(
      { _singleton: 'profile' },
      { $set: { signatureUrl } },
      { upsert: true }
    );

    res.json({ success: true, signatureUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GST INVOICE PDF STORAGE ───────────────────────────────────

// POST /api/gst-invoice/:id/pdf — save generated PDF under public/invoices/<filename>
router.post('/gst-invoice/:id/pdf', (req, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) return res.status(400).json({ success: false, message: 'No PDF data' });
    // sanitize filename — allow alphanumeric, underscore, hyphen, dot only
    const safe = (filename || `invoice_${req.params.id}.pdf`).replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const filePath = path.join(INVOICES_DIR, safe);
    fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
    res.json({ success: true, filename: safe, url: `/invoices/${safe}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();
    console.log('[LOGIN] request', {
      email: normalizedEmail,
      mongoState: getMongoStateLabel(),
      timestamp: new Date().toISOString(),
    });

    const mongoReady = await waitForMongoConnection();
    if (!mongoReady) {
      console.log('[LOGIN] blocked - MongoDB not ready', { mongoState: getMongoStateLabel() });
      return res.status(503).json({
        success: false,
        message: 'Server waking up... Please try again in a few seconds.',
      });
    }

    // Admin account (hardcoded — always has full GST access)
    if (normalizedEmail === ADMIN_EMAIL) {
      const adminUser = await ensureAdminUser();
      const matchesAdminPassword = await verifyPassword(password, adminUser.password);
      if (!matchesAdminPassword) {
        console.log('[LOGIN] invalid admin credentials', { email: normalizedEmail });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      console.log('[LOGIN] success', { email: normalizedEmail, role: adminUser.role || 'admin' });
      return res.json({
        success: true,
        gstBillEnabled: true,
        role: adminUser.role || 'admin',
        userId: adminUser._id,
        userName: adminUser.userName || 'Admin',
        email: adminUser.email,
      });
    }
    // DB users
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await verifyPassword(password, user.password))) {
      console.log('[LOGIN] invalid user credentials', { email: normalizedEmail });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!user.userName) user.userName = buildDefaultUserName(user.email);
    if (!isBcryptHash(user.password)) {
      user.password = await hashPassword(password);
    }
    await user.save();
    console.log('[LOGIN] success', { email: normalizedEmail, role: user.role || 'user' });
    res.json({
      success: true,
      gstBillEnabled: user.gstBillEnabled,
      role: user.role || 'user',
      userId: user._id,
      userName: user.userName,
      name: user.name || '',
      phone: user.phone || '',
      email: user.email,
      allowedPages: user.allowedPages || [],
    });
  } catch (err) {
    console.log('[LOGIN] error', err?.message || err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── USER MANAGEMENT ───────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } }, '-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { userName, name, phone, email, password, gstBillEnabled = false, allowedPages = [] } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.create({
      userName: (userName || buildDefaultUserName(normalizedEmail)).trim(),
      name: (name || '').trim(),
      phone: (phone || '').trim(),
      email: normalizedEmail,
      password: await hashPassword(password),
      role: 'user',
      gstBillEnabled,
      allowedPages: Array.isArray(allowedPages) ? allowedPages : [],
    });
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    const msg = err.code === 11000 ? 'Email already exists' : err.message;
    res.status(400).json({ success: false, message: msg });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { userName, name, phone, email, password, gstBillEnabled, allowedPages } = req.body;
    const update = {};
    if (userName !== undefined)             update.userName       = userName.trim();
    if (name !== undefined)                 update.name           = name.trim();
    if (phone !== undefined)                update.phone          = phone.trim();
    if (email)                              update.email          = email.toLowerCase().trim();
    if (password)                           update.password       = await hashPassword(password);
    if (gstBillEnabled !== undefined)       update.gstBillEnabled = gstBillEnabled;
    if (Array.isArray(allowedPages))        update.allowedPages   = allowedPages;
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/profile', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.userName) {
      user.userName = buildDefaultUserName(user.email);
      await user.save();
    }
    res.json({ success: true, profile: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/profile/update', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const nextName = String(req.body.userName || '').trim();
    const nextEmail = String(req.body.email || '').toLowerCase().trim();
    if (!nextName) return res.status(400).json({ success: false, message: 'User name is required' });
    if (!nextEmail) return res.status(400).json({ success: false, message: 'Email is required' });

    const existingEmailUser = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
    if (existingEmailUser) return res.status(400).json({ success: false, message: 'Email already exists' });

    user.userName = nextName;
    user.email = nextEmail;
    await user.save();
    res.json({ success: true, profile: sanitizeUser(user) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/profile/change-password', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirm password must match' });
    }
    const matches = await verifyPassword(currentPassword, user.password);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = await hashPassword(newPassword);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/daily-expenses', async (req, res) => {
  try {
    const { from, to, month } = req.query;
    const query = {};

    if (month) {
      const monthStart = new Date(`${month}-01T00:00:00.000Z`);
      if (Number.isNaN(monthStart.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid month filter' });
      }
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
      query.date = { $gte: monthStart, $lt: monthEnd };
    } else if (from || to) {
      const dateQuery = {};
      if (from) {
        const fromDate = normalizeDateInput(from);
        if (!fromDate) return res.status(400).json({ success: false, message: 'Invalid from date' });
        fromDate.setHours(0, 0, 0, 0);
        dateQuery.$gte = fromDate;
      }
      if (to) {
        const toDate = normalizeDateInput(to);
        if (!toDate) return res.status(400).json({ success: false, message: 'Invalid to date' });
        toDate.setHours(23, 59, 59, 999);
        dateQuery.$lte = toDate;
      }
      query.date = dateQuery;
    }

    const expenses = await DailyExpense.find(query).sort({ createdAt: -1 });
    res.json({ success: true, expenses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/daily-expenses', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    const { workerName = '', title, amount, category, notes = '', date } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ success: false, message: 'Expense title is required' });
    if (amount === undefined || Number.isNaN(Number(amount))) return res.status(400).json({ success: false, message: 'Expense amount is required' });
    if (!category || !String(category).trim()) return res.status(400).json({ success: false, message: 'Expense category is required' });

    const normalizedDate = normalizeDateInput(date);
    if (!normalizedDate) return res.status(400).json({ success: false, message: 'Valid expense date is required' });

    const expense = await DailyExpense.create({
      expenseId: `EXP${Date.now()}`,
      workerName: String(workerName || '').trim(),
      title: String(title).trim(),
      amount: Number(amount),
      category: String(category).trim(),
      notes: String(notes || '').trim(),
      date: normalizedDate,
      createdBy: user?.userName || user?.email || req.body.createdBy || 'admin',
      createdById: user?._id || null,
    });
    res.json({ success: true, expense });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/daily-expenses/:id', async (req, res) => {
  try {
    const { workerName, title, amount, category, notes = '', date } = req.body;
    const update = {};
    if (workerName !== undefined) update.workerName = String(workerName).trim();
    if (title !== undefined) update.title = String(title).trim();
    if (amount !== undefined) update.amount = Number(amount);
    if (category !== undefined) update.category = String(category).trim();
    if (notes !== undefined) update.notes = String(notes).trim();
    if (date !== undefined) {
      const normalizedDate = normalizeDateInput(date);
      if (!normalizedDate) return res.status(400).json({ success: false, message: 'Valid expense date is required' });
      update.date = normalizedDate;
    }

    const expense = await DailyExpense.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, expense });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/daily-expenses/:id', async (req, res) => {
  try {
    const expense = await DailyExpense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const payments = await PaymentTransaction.find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate('customerId', 'customerName phone address gstin');
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/payments/item-suggestions', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const payments = await PaymentTransaction.find(
      search
        ? { itemName: { $regex: escapeRegex(search), $options: 'i' } }
        : {},
      'itemName items updatedAt createdAt'
    ).sort({ updatedAt: -1, createdAt: -1 });

    const seen = new Set();
    const suggestions = [];

    payments.forEach((payment) => {
      const names = [
        payment.itemName,
        ...(Array.isArray(payment.items) ? payment.items.map((item) => item.itemName) : [])
      ];

      names.forEach((name) => {
        const trimmed = String(name || '').trim();
        const normalized = trimmed.toLowerCase();
        if (!trimmed) return;
        if (search && !normalized.startsWith(search.toLowerCase())) return;
        if (seen.has(normalized)) return;
        seen.add(normalized);
        suggestions.push(trimmed);
      });
    });

    res.json({ success: true, items: suggestions.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/payments/save', async (req, res) => {
  try {
    const {
      paymentId,
      invoiceNumber,
      customerId,
      customerName,
      phone,
      address,
      gstNo,
      itemName,
      items,
      cash,
      ftRate,
      weight,
      subtotal,
      cgst,
      sgst,
      roundOff,
      total,
      invoiceDate,
      status = 'draft'
    } = req.body;

    const normalizedStatus = status === 'final' ? 'final' : 'draft';
    const trimmedCustomerName = String(customerName || '').trim();
    const trimmedItemName = String(itemName || '').trim();

    if (!trimmedCustomerName) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }
    if (normalizedStatus === 'final') {
      if (!String(phone || '').trim()) return res.status(400).json({ success: false, message: 'Phone is required' });
      if (!trimmedItemName) return res.status(400).json({ success: false, message: 'Item name is required' });
      if (toNumber(cash) <= 0) return res.status(400).json({ success: false, message: 'Cash must be greater than 0' });
      if (toNumber(weight) <= 0) return res.status(400).json({ success: false, message: 'Weight must be greater than 0' });
    }

    let existing = null;
    if (paymentId && mongoose.Types.ObjectId.isValid(paymentId)) {
      existing = await PaymentTransaction.findById(paymentId);
    }
    if (!existing && invoiceNumber) {
      existing = await PaymentTransaction.findOne({ invoiceNumber });
    }

    const customer = await findOrCreatePaymentCustomer({
      customerId,
      customerName: trimmedCustomerName,
      phone,
      address,
      gstNo
    });

    const normalizedItems = normalizePaymentItems({
      items,
      itemName: trimmedItemName,
      weight,
      cash,
      ftRate
    });

    const payload = {
      invoiceNumber: existing?.invoiceNumber || invoiceNumber || await getNextPaymentInvoiceNo(),
      status: normalizedStatus,
      customerId: customer?._id || existing?.customerId || null,
      customerName: trimmedCustomerName,
      phone: String(phone || '').trim(),
      address: String(address || '').trim(),
      gstNo: String(gstNo || '').trim(),
      itemName: trimmedItemName,
      items: normalizedItems,
      cash: toNumber(cash),
      ftRate: toNumber(ftRate),
      weight: toNumber(weight),
      subtotal: toNumber(subtotal),
      cgst: toNumber(cgst),
      sgst: toNumber(sgst),
      roundOff: toNumber(roundOff),
      total: toNumber(total),
      invoiceDate: toDate(invoiceDate),
      printedAt: normalizedStatus === 'final' ? new Date() : (existing?.printedAt || null)
    };

    let payment = null;
    if (existing) {
      Object.assign(existing, payload);
      payment = await existing.save();
    } else {
      payment = await PaymentTransaction.create(payload);
    }

    const populatedPayment = await PaymentTransaction.findById(payment._id)
      .populate('customerId', 'customerName phone address gstin');

    res.json({ success: true, payment: populatedPayment });
  } catch (err) {
    console.error('Save Payment Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const payment = await PaymentTransaction.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    const existing = await PaymentTransaction.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Payment not found' });

    const {
      customerId, customerName, phone, address, gstNo,
      itemName, items, cash, ftRate, weight,
      subtotal, cgst, sgst, roundOff, total,
      invoiceDate, status,
    } = req.body;

    const normalizedStatus = status === 'final' ? 'final' : (status === 'draft' ? 'draft' : existing.status);
    const trimmedCustomerName = String(customerName || existing.customerName || '').trim();
    const trimmedItemName     = String(itemName     || existing.itemName     || '').trim();

    const customer = await findOrCreatePaymentCustomer({
      customerId: customerId || existing.customerId,
      customerName: trimmedCustomerName,
      phone:   phone   !== undefined ? phone   : existing.phone,
      address: address !== undefined ? address : existing.address,
      gstNo:   gstNo   !== undefined ? gstNo   : existing.gstNo,
    });

    const normalizedItems = normalizePaymentItems({
      items:    items    !== undefined ? items    : existing.items,
      itemName: trimmedItemName,
      weight:   weight   !== undefined ? weight   : existing.weight,
      cash:     cash     !== undefined ? cash     : existing.cash,
      ftRate:   ftRate   !== undefined ? ftRate   : existing.ftRate,
    });

    Object.assign(existing, {
      status:       normalizedStatus,
      customerId:   customer?._id || existing.customerId,
      customerName: trimmedCustomerName,
      phone:        phone   !== undefined ? String(phone   || '').trim() : existing.phone,
      address:      address !== undefined ? String(address || '').trim() : existing.address,
      gstNo:        gstNo   !== undefined ? String(gstNo   || '').trim() : existing.gstNo,
      itemName:     trimmedItemName,
      items:        normalizedItems,
      cash:         cash     !== undefined ? toNumber(cash)     : existing.cash,
      ftRate:       ftRate   !== undefined ? toNumber(ftRate)   : existing.ftRate,
      weight:       weight   !== undefined ? toNumber(weight)   : existing.weight,
      subtotal:     subtotal !== undefined ? toNumber(subtotal) : existing.subtotal,
      cgst:         cgst     !== undefined ? toNumber(cgst)     : existing.cgst,
      sgst:         sgst     !== undefined ? toNumber(sgst)     : existing.sgst,
      roundOff:     roundOff !== undefined ? toNumber(roundOff) : existing.roundOff,
      total:        total    !== undefined ? toNumber(total)    : existing.total,
      invoiceDate:  invoiceDate !== undefined ? toDate(invoiceDate) : existing.invoiceDate,
      printedAt:    normalizedStatus === 'final' ? (existing.printedAt || new Date()) : existing.printedAt,
    });

    const saved = await existing.save();
    const populated = await PaymentTransaction.findById(saved._id)
      .populate('customerId', 'customerName phone address gstin');

    res.json({ success: true, payment: populated });
  } catch (err) {
    console.error('Update Payment Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const { customerId, issueItems, receiptItems, cashEntries, previousBalance, finalBalance } = req.body;

    const billNo = await getNextBillNo();
    const customer = await Customer.findById(customerId);
    const user = await resolveCurrentUser(req);

    const normalizedIssueItems = normalizeIssueItems(issueItems);
    const normalizedReceiptItems = normalizeReceiptItems(receiptItems);
    const normalizedCashEntries = normalizeCashEntries(cashEntries);

    const issueTotalPurity = normalizedIssueItems.reduce((sum, item) => sum + item.purity, 0);
    const receiptTotalPurity = normalizedReceiptItems.reduce((sum, item) => sum + item.purity, 0);
    const cashTotalAmount = normalizedCashEntries.reduce((sum, item) => sum + item.cashAmount, 0);

    const bill = new Bill({
      billNo,
      customerId,
      customerName: customer ? customer.customerName || customer.name : '',
      issueItems: normalizedIssueItems,
      receiptItems: normalizedReceiptItems,
      cashEntries: normalizedCashEntries,
      previousBalance: toNumber(previousBalance),
      finalBalance: toNumber(finalBalance),
      issueTotalPurity,
      receiptTotalPurity,
      cashTotalAmount,
      createdBy: user?.userName || user?.email || req.body.createdBy || 'admin',
      createdById: user?._id || null
    });

    await bill.save();

    const balanceUpdate = toNumber(finalBalance) >= 0
      ? { ob: toNumber(finalBalance), ab: 0 }
      : { ob: 0, ab: Math.abs(toNumber(finalBalance)) };

    await Customer.findByIdAndUpdate(customerId, balanceUpdate);

    res.json({ success: true, bill, billNo });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/transactions/save', async (req, res) => {
  try {
    const {
      customerId,
      issueItems,
      receiptItems,
      cashEntries,
      previousBalance,
      transactionType,
      enableGst,
      gstDraft
    } = req.body;

    if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required' });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    const user = await resolveCurrentUser(req);

    const normalizedIssueItems = normalizeIssueItems(issueItems);
    const normalizedReceiptItems = normalizeReceiptItems(receiptItems);
    const normalizedCashEntries = normalizeCashEntries(cashEntries);

    const issueTotalPurity = normalizedIssueItems.reduce((sum, item) => sum + item.purity, 0);
    const receiptTotalPurity = normalizedReceiptItems.reduce((sum, item) => sum + item.purity, 0);
    const cashTotalAmount = normalizedCashEntries.reduce((sum, item) => sum + item.cashAmount, 0);
    const cashTotalPurity = normalizedCashEntries.reduce((sum, item) => sum + item.pure, 0);

    const prevBal = req.body.previousBalance !== undefined
      ? toNumber(previousBalance)
      : (customer.ob - customer.ab);

    const finalBalance = parseFloat((prevBal + issueTotalPurity - receiptTotalPurity - cashTotalPurity).toFixed(3));
    const billNo = await getNextBillNo();

    const bill = new Bill({
      billNo,
      customerId,
      customerName: customer.customerName || '',
      transactionType: transactionType || 'B2B',
      issueItems: normalizedIssueItems,
      receiptItems: normalizedReceiptItems,
      cashEntries: normalizedCashEntries,
      previousBalance: prevBal,
      finalBalance,
      issueTotalPurity: parseFloat(issueTotalPurity.toFixed(3)),
      receiptTotalPurity: parseFloat(receiptTotalPurity.toFixed(3)),
      cashTotalAmount: parseFloat(cashTotalAmount.toFixed(3)),
      cashTotalPurity: parseFloat(cashTotalPurity.toFixed(3)),
      createdBy: user?.userName || user?.email || req.body.createdBy || 'admin',
      createdById: user?._id || null
    });

    await bill.save();

    const balanceUpdate = finalBalance >= 0
      ? { ob: finalBalance, ab: 0 }
      : { ob: 0, ab: Math.abs(finalBalance) };

    const updatedCustomer = await Customer.findByIdAndUpdate(customerId, balanceUpdate, { new: true });

    let gstTransaction = null;
    if (enableGst) {
      const draft = buildGstDraftFromTransaction({
        customer,
        bill,
        issueItems: normalizedIssueItems,
        receiptItems: normalizedReceiptItems,
        cashEntries: normalizedCashEntries,
        previousBalance: prevBal,
        finalBalance,
        gstDraft
      });
      const normalizedDraft = await normalizeGstPayload(draft);
      gstTransaction = await GstCustomerTransaction.create(normalizedDraft);
    }

    res.json({
      success: true,
      bill,
      billNo,
      finalBalance,
      updatedCustomer,
      gstTransaction,
      balanceLabel: finalBalance >= 0 ? 'OB' : 'AB',
      balanceValue: Math.abs(finalBalance)
    });
  } catch (err) {
    console.error('Save Transaction Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/transactions/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const bills = await Bill.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('customerId', 'customerName phone');
    res.json({ success: true, transactions: bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bills', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    const isAdminRequest = !user || user.role === 'admin' || user.email === ADMIN_EMAIL;
    const query = isAdminRequest
      ? {}
      : {
          $or: [
            { createdById: user._id },
            { createdBy: user.userName || '' },
            { createdBy: user.email || '' },
          ],
        };

    const bills = await Bill.find(query)
      .sort({ createdAt: -1 })
      .populate('customerId', 'customerName phone address gstin');

    res.json({ success: true, bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bills/history/:customerId', async (req, res) => {
  try {
    const bills = await Bill.find({ customerId: req.params.customerId }).sort({ createdAt: -1 });
    res.json({ success: true, bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/bills/:billNo', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    const billNo = parseInt(req.params.billNo, 10);
    const query = { billNo };

    if (user && user.role !== 'admin' && user.email !== ADMIN_EMAIL) {
      query.$or = [
        { createdById: user._id },
        { createdBy: user.userName || '' },
        { createdBy: user.email || '' },
      ];
    }

    const bill = await Bill.findOneAndDelete(query);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/bills/:billNo', async (req, res) => {
  try {
    const bill = await Bill.findOne({ billNo: parseInt(req.params.billNo, 10) })
      .populate('customerId', 'customerName phone address gstin');
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/mini-statement/:customerId', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const bills = await Bill.find({ customerId: req.params.customerId }).sort({ createdAt: 1 });

    const statement = bills.map((bill) => ({
      billNo: bill.billNo,
      date: bill.createdAt,
      issueItems: bill.issueItems,
      receiptItems: bill.receiptItems,
      cashEntries: bill.cashEntries,
      issueTotalPurity: bill.issueTotalPurity,
      receiptTotalPurity: bill.receiptTotalPurity,
      cashTotalAmount: bill.cashTotalAmount,
      previousBalance: bill.previousBalance,
      finalBalance: bill.finalBalance,
      balanceLabel: bill.finalBalance >= 0 ? 'OB' : 'AB',
      balanceValue: Math.abs(bill.finalBalance)
    }));

    res.json({
      success: true,
      customer: {
        _id: customer._id,
        customerName: customer.customerName,
        phone: customer.phone,
        currentOB: customer.ob,
        currentAB: customer.ab,
        currentBalance: customer.ob - customer.ab
      },
      statement
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/gst-customers', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const filter = search
      ? { customerName: { $regex: search, $options: 'i' } }
      : {};

    const transactions = await GstCustomerTransaction.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/gst-customers/:id', async (req, res) => {
  try {
    const transaction = await GstCustomerTransaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ success: false, message: 'GST transaction not found' });
    res.json({ success: true, transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/gst-customers', async (req, res) => {
  try {
    if (!req.body.customerName) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    const normalizedPayload = await normalizeGstPayload(req.body);
    const transaction = await GstCustomerTransaction.create(normalizedPayload);
    res.json({ success: true, transaction });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/gst-customers/:id', async (req, res) => {
  try {
    const existing = await GstCustomerTransaction.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'GST transaction not found' });

    const normalizedPayload = await normalizeGstPayload(req.body, existing);
    const transaction = await GstCustomerTransaction.findByIdAndUpdate(
      req.params.id,
      normalizedPayload,
      { new: true, runValidators: true }
    );

    res.json({ success: true, transaction });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/gst-customers/:id', async (req, res) => {
  try {
    const deleted = await GstCustomerTransaction.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'GST transaction not found' });
    res.json({ success: true, message: 'GST transaction deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/clear-all-data', async (req, res) => {
  try {
    await Promise.all([
      Customer.deleteMany({}),
      Bill.deleteMany({}),
      GstCustomerTransaction.deleteMany({}),
      Counter.deleteMany({}),
    ]);
    res.json({ success: true, message: 'All billing data cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const { from, to, date } = req.query;

    let fromDate, toDate;
    if (date) {
      // Single-day mode: ?date=YYYY-MM-DD
      fromDate = new Date(date);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(date);
      toDate.setHours(23, 59, 59, 999);
    } else {
      fromDate = from ? new Date(from) : new Date(0);
      toDate = to ? new Date(to) : new Date();
      toDate.setHours(23, 59, 59, 999);
    }

    const dateFilter = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [bills, gstBills] = await Promise.all([
      Bill.find(dateFilter).sort({ createdAt: -1 }),
      GstCustomerTransaction.find(dateFilter).sort({ createdAt: -1 }),
    ]);

    const summary = {
      totalBills: bills.length,
      totalGstBills: gstBills.length,
      totalIssuePurity: bills.reduce((sum, b) => sum + (b.issueTotalPurity || 0), 0),
      totalReceiptPurity: bills.reduce((sum, b) => sum + (b.receiptTotalPurity || 0), 0),
      totalCashAmount: bills.reduce((sum, b) => sum + (b.cashTotalAmount || 0), 0),
      totalCashPurity: bills.reduce((sum, b) => sum + (b.cashTotalPurity || 0), 0),
      totalGstValue: gstBills.reduce((sum, g) => sum + (g.totalInvoiceValue || 0), 0),
    };

    res.json({ success: true, bills, gstBills, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── B2B CUSTOMER SUMMARY REPORT ───────────────────────────────
router.get('/b2b-report', async (req, res) => {
  try {
    const { date, month, year, from, to } = req.query;

    // Build primary filter date range
    let fromDate, toDate;
    if (date) {
      fromDate = new Date(date); fromDate.setHours(0, 0, 0, 0);
      toDate   = new Date(date); toDate.setHours(23, 59, 59, 999);
    } else if (month && year) {
      fromDate = new Date(Number(year), Number(month) - 1, 1);
      toDate   = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
    } else if (year) {
      fromDate = new Date(Number(year), 0, 1);
      toDate   = new Date(Number(year), 11, 31, 23, 59, 59, 999);
    } else if (from && to) {
      fromDate = new Date(from); fromDate.setHours(0, 0, 0, 0);
      toDate   = new Date(to);   toDate.setHours(23, 59, 59, 999);
    } else {
      fromDate = new Date(0);
      toDate   = new Date();
    }

    // Current month/year ranges for monthly & yearly totals
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const curMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const curYearStart  = new Date(now.getFullYear(), 0, 1);
    const curYearEnd    = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const [filteredBills, allBills, monthBills, yearBills, customers] = await Promise.all([
      Bill.find({ createdAt: { $gte: fromDate, $lte: toDate } }).sort({ createdAt: -1 }).lean(),
      Bill.find({}).sort({ createdAt: -1 }).lean(),
      Bill.find({ createdAt: { $gte: curMonthStart, $lte: curMonthEnd } }).lean(),
      Bill.find({ createdAt: { $gte: curYearStart,  $lte: curYearEnd  } }).lean(),
      Customer.find({}).lean(),
    ]);

    // Customer lookup by _id string
    const customerMap = {};
    customers.forEach(c => { customerMap[String(c._id)] = c; });

    // Latest bill per customer (from all bills, already sorted desc)
    const latestBillMap = {};
    allBills.forEach(b => {
      const cid = String(b.customerId);
      if (!latestBillMap[cid]) latestBillMap[cid] = b;
    });

    // Monthly totals per customer
    const monthMap = {};
    monthBills.forEach(b => {
      const cid = String(b.customerId);
      if (!monthMap[cid]) monthMap[cid] = { issueWeight: 0, receiptWeight: 0, cash: 0, billCount: 0 };
      monthMap[cid].issueWeight   += b.issueTotalPurity   || 0;
      monthMap[cid].receiptWeight += b.receiptTotalPurity || 0;
      monthMap[cid].cash          += b.cashTotalAmount    || 0;
      monthMap[cid].billCount     += 1;
    });

    // Yearly totals per customer
    const yearMap = {};
    yearBills.forEach(b => {
      const cid = String(b.customerId);
      if (!yearMap[cid]) yearMap[cid] = { issueWeight: 0, receiptWeight: 0, cash: 0, billCount: 0 };
      yearMap[cid].issueWeight   += b.issueTotalPurity   || 0;
      yearMap[cid].receiptWeight += b.receiptTotalPurity || 0;
      yearMap[cid].cash          += b.cashTotalAmount    || 0;
      yearMap[cid].billCount     += 1;
    });

    // Group filtered bills by customerId
    const filteredMap = {};
    filteredBills.forEach(b => {
      const cid = String(b.customerId);
      if (!filteredMap[cid]) filteredMap[cid] = [];
      filteredMap[cid].push(b);
    });

    // Build customer summaries
    const summaries = Object.entries(filteredMap).map(([cid, cbills]) => {
      const customer   = customerMap[cid];
      const latestBill = latestBillMap[cid] || cbills[0];
      const firstInPeriod = cbills[cbills.length - 1];

      const totalIssue   = cbills.reduce((s, b) => s + (b.issueTotalPurity   || 0), 0);
      const totalReceipt = cbills.reduce((s, b) => s + (b.receiptTotalPurity || 0), 0);
      const totalCash    = cbills.reduce((s, b) => s + (b.cashTotalAmount    || 0), 0);

      return {
        customerId:      cid,
        customerName:    customer?.customerName || cbills[0].customerName || 'Unknown',
        phone:           customer?.phone        || '',
        billCount:       cbills.length,
        totalIssueWeight:   parseFloat(totalIssue.toFixed(3)),
        totalReceiptWeight: parseFloat(totalReceipt.toFixed(3)),
        totalCash:          parseFloat(totalCash.toFixed(2)),
        currentBalance:     latestBill?.finalBalance  || 0,
        advanceBalance:     customer?.ab              || 0,
        oldBalance:         customer?.ob              || 0,
        monthlyTotal:  monthMap[cid]  || { issueWeight: 0, receiptWeight: 0, cash: 0, billCount: 0 },
        yearlyTotal:   yearMap[cid]   || { issueWeight: 0, receiptWeight: 0, cash: 0, billCount: 0 },
        lastBillDate:  cbills[0]?.createdAt || null,
        firstBillDate: firstInPeriod?.createdAt || null,
      };
    });

    summaries.sort((a, b) => a.customerName.localeCompare(b.customerName));

    const totals = {
      customers:     summaries.length,
      bills:         filteredBills.length,
      issueWeight:   parseFloat(summaries.reduce((s, c) => s + c.totalIssueWeight,   0).toFixed(3)),
      receiptWeight: parseFloat(summaries.reduce((s, c) => s + c.totalReceiptWeight, 0).toFixed(3)),
      cash:          parseFloat(summaries.reduce((s, c) => s + c.totalCash,          0).toFixed(2)),
    };

    res.json({ success: true, summaries, totals, fromDate, toDate });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── APP SETTINGS ─────────────────────────────────────────────
router.get('/app-settings', async (req, res) => {
  try {
    let s = await AppSettings.findOne({ _singleton: 'appsettings' });
    if (!s) s = await AppSettings.create({ _singleton: 'appsettings' });
    if (s.goldRate === undefined || s.goldRate === null) {
      s.goldRate = 9850;
      await s.save();
    }
    res.json({ success: true, settings: s });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/app-settings', async (req, res) => {
  try {
    const { appName, appVersion, appLink, shareMessage, goldRate, ftRate } = req.body;
    const update = {};
    if (appName !== undefined) update.appName = appName;
    if (appVersion !== undefined) update.appVersion = appVersion;
    if (appLink !== undefined) update.appLink = appLink;
    if (shareMessage !== undefined) update.shareMessage = shareMessage;
    if (goldRate !== undefined) update.goldRate = toNumber(goldRate);
    if (ftRate !== undefined) update.ftRate = toNumber(ftRate);
    const s = await AppSettings.findOneAndUpdate(
      { _singleton: 'appsettings' },
      { $set: update },
      { upsert: true, new: true }
    );
    res.json({ success: true, settings: s });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── KADAI DOCUMENTS ───────────────────────────────────────────
router.get('/documents', async (req, res) => {
  try {
    const docs = await KadaiDocument.find({}).sort({ createdAt: -1 });
    res.json({ success: true, documents: docs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/documents', async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    const { title, type, fileData, mimeType, fileName, notes, uploadedBy, uploadDate } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
    if (!fileData) return res.status(400).json({ success: false, message: 'Document file is required' });
    const storedFile = ensureDocumentStored({ base64Data: fileData, mimeType, fileName, title });
    const normalizedUploadDate = normalizeDateInput(uploadDate) || new Date();
    const doc = await KadaiDocument.create({
      documentId: `DOC${Date.now()}`,
      title: String(title).trim(),
      type: type || 'OTHER',
      fileUrl: storedFile.fileUrl,
      filePath: storedFile.filePath,
      mimeType: mimeType || '',
      fileName: storedFile.fileName,
      notes: String(notes || '').trim(),
      uploadDate: normalizedUploadDate,
      uploadedBy: user?.userName || user?.email || uploadedBy || 'admin',
    });
    res.json({ success: true, document: doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/documents/:id', async (req, res) => {
  try {
    const doc = await KadaiDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true, document: doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/documents/:id', async (req, res) => {
  try {
    const { title, type, notes, fileData, mimeType, fileName, uploadDate } = req.body;
    const doc = await KadaiDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    if (title !== undefined) doc.title = String(title).trim();
    if (type !== undefined) doc.type = type || 'OTHER';
    if (notes !== undefined) doc.notes = String(notes).trim();
    if (uploadDate !== undefined) {
      const normalizedUploadDate = normalizeDateInput(uploadDate);
      if (!normalizedUploadDate) return res.status(400).json({ success: false, message: 'Valid upload date is required' });
      doc.uploadDate = normalizedUploadDate;
    }
    if (fileData) {
      const storedFile = ensureDocumentStored({ base64Data: fileData, mimeType, fileName, title: doc.title });
      removeStoredDocument(doc.filePath);
      doc.fileUrl = storedFile.fileUrl;
      doc.filePath = storedFile.filePath;
      doc.mimeType = mimeType || doc.mimeType;
      doc.fileName = storedFile.fileName;
    }
    await doc.save();
    res.json({ success: true, document: doc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const doc = await KadaiDocument.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    removeStoredDocument(doc.filePath);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Mount /api router ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    mongoState: getMongoStateLabel(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    mongoState: getMongoStateLabel(),
  });
});

app.use('/api', requireMongoReady);
app.use('/api/customers', customerRoutes);
app.use('/api', router);
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
    path: req.originalUrl,
  });
});

module.exports = app;
module.exports.app = app;
module.exports.connectDB = connectDB;
module.exports.getMongoStateLabel = getMongoStateLabel;
