const express = require('express');
const {
  createCustomer,
  createCustomerFromWorkflow,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} = require('../controllers/customerController');

const router = express.Router();

router.get('/', getAllCustomers);
router.get('/:id', getCustomerById);
router.post('/', createCustomer);
router.post('/create', createCustomerFromWorkflow);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

module.exports = router;
