// BAM CRM Zero-API Client Bridge
// Replaces all fetch('/api/...') calls with the direct Zero-API Engine (`localEngine.js`),
// which hydrates from Hostinger MySQL PDO (`window.BAM_PDO_STATE`) and syncs writes via PHP POST on Hostinger
// or runs 100% standalone in the browser with zero Node/Express API server.

import { localApi, openCanonicalBrochure, STAGES as ENGINE_STAGES, UNIT_STATUSES as ENGINE_STATUSES } from './localEngine.js';

export const STAGES = ENGINE_STAGES;
export const UNIT_STATUSES = ENGINE_STATUSES;
export { openCanonicalBrochure };
export { SCRAPE_WEBSITES } from './localEngine.js';

export const api = {
  today: () => localApi.today(),
  stats: () => localApi.stats(),
  config: () => localApi.config(),
  saveConfig: (b) => localApi.saveConfig(b),

  leads: (f) => localApi.leads(f),
  createLead: (b) => localApi.createLead(b),
  updateLead: (id, b) => localApi.updateLead(id, b),
  deleteLead: (id) => localApi.deleteLead(id),
  importLeads: (b) => localApi.importLeads(b),
  logCall: (id, note) => localApi.logCall(id, note),
  logTouch: (id, b) => localApi.logTouch(id, b),
  leadMatches: (id) => localApi.leadMatches(id),

  inventory: (f) => localApi.inventory(f),
  createUnit: (b) => localApi.createUnit(b),
  updateUnit: (id, b) => localApi.updateUnit(id, b),
  deleteUnit: (id) => localApi.deleteUnit(id),
  unitMatches: (id, min) => localApi.unitMatches(id, min),
  brochureUrl: (id) => localApi.brochureUrl(id),
  openBrochure: (id) => openCanonicalBrochure(id),
  matchStatus: (b) => localApi.matchStatus(b),
  bulkPitch: (b) => localApi.bulkPitch(b),
  googleStatus: () => localApi.googleStatus(),
  googleDisconnect: () => localApi.googleDisconnect(),

  parseListing: (b) => localApi.parseListing(b),
  pullListing: (url) => localApi.pullListing(url),

  scrapingConfigs: () => localApi.scrapingConfigs(),
  saveScrapingConfig: (b) => localApi.saveScrapingConfig(b),
  deleteScrapingConfig: (id) => localApi.deleteScrapingConfig(id),
  verifyUnit: (id) => localApi.verifyUnit(id),

  tasks: () => localApi.tasks(),
  createTask: (b) => localApi.createTask(b),
  updateTask: (id, b) => localApi.updateTask(id, b),
  deleteTask: (id) => localApi.deleteTask(id),

  // Multi-user / Hostinger MySQL PDO tables (`users`, `team_settings`, `email_drafts`, `crm_audit`)
  users: () => localApi.users(),
  saveUser: (u) => localApi.saveUser(u),
  deleteUser: (id) => localApi.deleteUser(id),
  assignLeadOwner: (leadId, userId) => localApi.assignLeadOwner(leadId, userId),
  emailDrafts: () => localApi.emailDrafts(),
  updateEmailDraft: (id, status) => localApi.updateEmailDraft(id, status),
  saveEmailDraft: (draft, fields) => localApi.saveEmailDraft(draft, fields),
  rebuildDraftText: (draft) => localApi.rebuildDraftText(draft),
  auditLog: () => localApi.auditLog(),
};
