// Sample data (fictional people/units) so the app is useful on first run.
const crypto = require('crypto');

const id = () => crypto.randomUUID();
const iso = (offsetDays = 0, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

module.exports = function seed() {
  const L = (o) => ({
    id: id(), createdAt: iso(-10), language: 'en', source: 'Sample', interactions: [], notes: '',
    stage: 'New', urgency: 'Medium', ...o,
  });

  const leads = [
    L({ firstName: 'Wes', lastName: 'Harlan', email: 'wes@westtxtrenching.example', phone: '(432) 555-0114', company: 'West Texas Trenching', city: 'Midland', state: 'TX', stage: 'Qualified', urgency: 'High', budgetMax: 120000, maxHours: 1800, minHp: 120, wants: { make: 'Ditch Witch', model: 'RT125', category: 'Trencher', minYear: 2018 } }),
    L({ firstName: 'Mike', lastName: 'Duarte', email: 'mike@duartebore.example', phone: '(305) 555-0172', company: 'Duarte Directional', city: 'Miami', state: 'FL', stage: 'Negotiation', urgency: 'High', language: 'es', budgetMax: 420000, maxHours: 4500, wants: { make: 'Vermeer', model: 'D60x90', category: 'HDD Drill' } }),
    L({ firstName: 'Brad', lastName: 'Lambert', email: 'brad@gulfcoastdewater.example', phone: '(229) 555-0148', company: 'Gulf Coast Dewatering', city: 'Panama City', state: 'FL', stage: 'Negotiation', urgency: 'High', budgetMax: 246000, maxHours: 2500, minHp: 120, wants: { make: 'Vermeer', model: 'RTX1250', category: 'Trencher' } }),
    L({ firstName: 'Jim', lastName: 'Kirton', email: 'jim@redkoon.example', phone: '(901) 555-0190', company: 'Red Koon Utilities', city: 'Memphis', state: 'TN', stage: 'Qualified', budgetMax: 230000, maxHours: 2000, wants: { make: 'Vermeer', model: 'RTX1250', category: 'Trencher' } }),
    L({ firstName: 'Debra', lastName: 'Chapman', email: 'debra@dig1.example', phone: '(512) 555-0133', company: 'Dig One Services', city: 'Austin', state: 'TX', stage: 'Contacted', budgetMax: 200000, wants: { make: 'Vermeer', category: 'Trencher' } }),
    L({ firstName: 'Tom', lastName: 'Reyes', email: 'tom@reyesexcavating.example', phone: '(713) 555-0166', company: 'Reyes Excavating', city: 'Houston', state: 'TX', stage: 'New', urgency: 'Low', budgetMax: 90000, maxHours: 6000, wants: { make: 'Caterpillar', model: '320E', category: 'Excavator' } }),
    L({ firstName: 'Ana', lastName: 'Morales', email: 'ana@moralesvac.example', phone: '(904) 555-0121', company: 'Morales Vac Services', city: 'Jacksonville', state: 'FL', stage: 'Contacted', budgetMax: 60000, wants: { category: 'Vacuum Excavator' } }),
    L({ firstName: 'Carl', lastName: 'Owens', email: 'carl@owensgrading.example', phone: '(615) 555-0177', company: 'Owens Grading', city: 'Nashville', state: 'TN', stage: 'Won', wants: { make: 'Caterpillar', category: 'Dozer' } }),
  ];
  leads[0].interactions.push({ id: id(), at: iso(-6), type: 'call', note: 'Wants combo plow/trencher, needs it by spring.' });
  leads[1].interactions.push({ id: id(), at: iso(-3), type: 'call', note: 'Quiere inspección la próxima semana.' });
  leads[2].interactions.push({ id: id(), at: iso(-2), type: 'call', note: 'Comparing against a new unit. Budget firm.' });

  const U = (o) => ({
    id: id(), createdAt: iso(-5), status: 'Live', media: [], pendingFields: [], oemSpecs: {},
    serviceHistory: '', inspectionNotes: '', sellerStatus: 'Motivated', ...o,
  });
  const inventory = [
    U({ stock: 'BAM-1001', year: 2020, make: 'Ditch Witch', model: 'RT125 Quad', category: 'Trencher', hours: 1140, hp: 125, serial: 'DW2020RT125Q01', askPrice: 89500, listPrice: null, buyPrice: 82000, city: 'Phoenix', state: 'AZ', serviceHistory: 'Full dealer service records', narrative: 'Quad-track trencher with complete dealer records and walk-around video available.' }),
    U({ stock: 'BAM-1002', year: 2019, make: 'Ditch Witch', model: 'RT125', category: 'Trencher', hours: 1620, hp: 125, serial: 'DW2019RT12502', askPrice: 94000, listPrice: 112000, buyPrice: 86000, city: 'Raleigh', state: 'NC', narrative: 'Clean RT125 with fresh chain and teeth.' }),
    U({ stock: 'BAM-1003', year: 2021, make: 'Vermeer', model: 'RTX1250I2', category: 'Trencher', hours: 1084, hp: 130, serial: '', askPrice: 215000, listPrice: null, buyPrice: 203000, city: 'Simpsonville', state: 'SC', oemSpecs: { engine: 'Cummins QSB4.5', hp: 130 }, pendingFields: ['serial'], status: 'Draft', sourceUrl: 'https://www.machinerytrader.com/', narrative: 'Quad-track RTX1250 trencher. Serial pending inspection.' }),
    U({ stock: 'BAM-1004', year: 2018, make: 'Vermeer', model: 'D60x90', category: 'HDD Drill', hours: 4000, serial: '', askPrice: 385000, listPrice: null, buyPrice: 360000, city: 'Dallas', state: 'TX', pendingFields: ['serial', 'hp', 'weight', 'dimensions'], status: 'Draft', serviceHistory: 'Seller states: fully serviced (records not verified)', narrative: 'Ready-to-work 60x90 HDD with 600 ft of drill pipe included.' }),
    U({ stock: 'BAM-1005', year: 2014, make: 'Caterpillar', model: '320E', category: 'Excavator', hours: 6200, serial: 'CAT320E0099', askPrice: 78000, listPrice: 92000, buyPrice: 70000, city: 'Houston', state: 'TX', narrative: 'Well-maintained 320E excavator.' }),
    U({ stock: 'BAM-1006', year: 2017, make: 'Vermeer', model: 'RTX1250 Rocksaw', category: 'Rock Saw', hours: 1720, hp: 130, serial: 'VM2017RTX0155', askPrice: 189000, listPrice: null, buyPrice: 175000, city: 'Austin', state: 'TX', narrative: 'Rock saw configuration, strong hours.' }),
  ];

  const tasks = [
    { id: id(), title: 'Follow up: Wes Harlan', leadId: leads[0].id, due: iso(-1, 14), done: false, priority: 'high' },
    { id: id(), title: 'Send quote sheet to Brad Lambert', leadId: leads[2].id, due: iso(0, 16), done: false, priority: 'normal' },
    { id: id(), title: 'Verify serial on BAM-1004', leadId: null, due: iso(0, 11), done: false, priority: 'high' },
  ];

  return { leads, inventory, tasks, matches: [] };
};
