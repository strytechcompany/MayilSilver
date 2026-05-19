const express = require('express');
const {
  createCustomer,
  createCustomerFromWorkflow,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
} = require('../controllers/customerController');

const router = express.Router();

router.get('/', getAllCustomers);
router.get('/:id', getCustomerById);
router.post('/', createCustomer);
router.post('/create', createCustomerFromWorkflow);
router.put('/:id', updateCustomer);

module.exports = router;
