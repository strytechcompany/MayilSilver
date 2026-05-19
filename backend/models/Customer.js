const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  customerId: { type: String },
  customerName: { type: String, required: true },
  phone: { type: String, required: true },
  alternativePhone: { type: String, default: '' },
  address: { type: String, default: '' },
  gstin: { type: String, default: '' },
  ob: { type: Number, default: 0 },
  ab: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
