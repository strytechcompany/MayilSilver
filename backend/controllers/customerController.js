const Customer = require('../models/Customer');

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getAllCustomers = async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    console.log('[GET /api/customers] search:', search || '(all)');

    const query = search
      ? {
          $or: [
            { customerName: { $regex: escapeRegex(search), $options: 'i' } },
            { phone: { $regex: escapeRegex(search), $options: 'i' } },
            { alternativePhone: { $regex: escapeRegex(search), $options: 'i' } },
            { gstin: { $regex: escapeRegex(search), $options: 'i' } },
          ],
        }
      : {};

    const customers = await Customer.find(query).sort({ createdAt: -1 });
    console.log('[GET /api/customers] returning', customers.length, 'customers');
    res.json({ success: true, customers });
  } catch (err) {
    console.error('[GET /api/customers] error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createCustomer = async (req, res) => {
  try {
    const { name, phone, alternativePhone, address, gstin, ob, ab } = req.body;
    const exists = await Customer.findOne({ phone });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }

    const newCustomer = new Customer({
      customerName: name,
      phone,
      alternativePhone: alternativePhone || '',
      address: address || '',
      gstin: gstin || '',
      ob: toNumber(ob),
      ab: toNumber(ab),
    });
    newCustomer.customerId = newCustomer._id.toString();
    await newCustomer.save();

    res.json({ success: true, customer: newCustomer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const createCustomerFromWorkflow = async (req, res) => {
  try {
    const { customerName, name, phone, alternativePhone, address, gstin, oldBalance, advanceBalance, ob, ab } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    const resolvedName = customerName || name;
    if (!resolvedName) {
      return res.status(400).json({ success: false, message: 'Customer name is required' });
    }

    const exists = await Customer.findOne({ phone });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }

    const newCustomer = new Customer({
      customerName: resolvedName,
      phone,
      alternativePhone: alternativePhone || '',
      address: address || '',
      gstin: gstin || '',
      ob: toNumber(ob || oldBalance),
      ab: toNumber(ab || advanceBalance),
      createdAt: new Date(),
    });
    newCustomer.customerId = newCustomer._id.toString();
    await newCustomer.save();

    res.json({ success: true, customer: newCustomer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const updateCustomer = async (req, res) => {
  try {
    const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, customer: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const deleteCustomer = async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createCustomer,
  createCustomerFromWorkflow,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};
