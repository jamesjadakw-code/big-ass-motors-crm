// Shared settings object. Read with fs (not require) so `node --watch` does not restart the server when Settings saves config.json.
// POST /api/config mutates this same object, so pitch drafts and the brochure see changes immediately.
const fs = require('fs');
const path = require('path');

module.exports = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
