const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Mock Database
let customers = [
  { id: 1, name: "Acme Corp", contact: "John Doe", email: "john@acme.com", status: "Lead", value: 5000 },
  { id: 2, name: "Global Tech", contact: "Jane Smith", email: "jane@global.com", status: "Customer", value: 12000 },
  { id: 3, name: "Startup Inc", contact: "Bob Lee", email: "bob@startup.io", status: "Negotiation", value: 2000 },
];

// Get all customers
app.get('/api/customers', (req, res) => {
  res.json(customers);
});

// Add new customer
app.post('/api/customers', (req, res) => {
  const newCustomer = { id: customers.length + 1, ...req.body };
  customers.push(newCustomer);
  res.status(201).json(newCustomer);
});

// Update customer status
app.patch('/api/customers/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const customer = customers.find(c => c.id == id);
  if (customer) {
    customer.status = status;
    res.json(customer);
  } else {
    res.status(404).send("Customer not found");
  }
});

app.listen(PORT, () => console.log(`CRM Server running on http://localhost:${PORT}`));
