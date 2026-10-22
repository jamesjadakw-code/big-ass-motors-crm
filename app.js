import React, { useState, useEffect } from 'react';

const App = () => {
  const [customers, setCustomers] = useState([]);
  const [formData, setFormData] = useState({ name: '', contact: '', email: '', status: 'Lead', value: '' });

  useEffect(() => {
    fetch('http://localhost:5000/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('http://localhost:5000/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const newData = await res.json();
    setCustomers([...customers, newData]);
    setFormData({ name: '', contact: '', email: '', status: 'Lead', value: '' });
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <header className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">🚀 ClaudeCRM</h1>
        <div className="bg-blue-600 text-white px-4 py-2 rounded-lg">Total Pipeline: ${customers.reduce((acc, curr) => acc + Number(curr.value), 0).toLocaleString()}</div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="bg-white p-6 rounded-xl shadow-md h-fit">
          <h2 className="text-xl font-semibold mb-4">Add New Lead</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input className="w-full p-2 border rounded" placeholder="Company Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            <input className="w-full p-2 border rounded" placeholder="Contact Person" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} required />
            <input className="w-full p-2 border rounded" placeholder="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            <select className="w-full p-2 border rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
              <option>Lead</option>
              <option>Negotiation</option>
              <option>Customer</option>
            </select>
            <input className="w-full p-2 border rounded" placeholder="Deal Value ($)" type="number" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} required />
            <button className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition">Add to Pipeline</button>
          </form>
        </div>

        {/* Table Section */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">Sales Pipeline</h2>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="py-2">Company</th>
                <th className="py-2">Contact</th>
                <th className="py-2">Status</th>
                <th className="py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{c.name}</td>
                  <td className="py-3 text-gray-600">{c.contact}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs ${c.status === 'Customer' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3">${Number(c.value).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
