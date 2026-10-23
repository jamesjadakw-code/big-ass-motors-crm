-- =====================================================================
-- Big Ass Motors CRM - High-Performance MySQL Index Optimization Proposal
-- Note: As requested, this file is a proposal ONLY and has NOT been executed.
-- Safe to review and run via Hostinger phpMyAdmin when ready.
-- =====================================================================

-- 1. unit_lead_matches: Optimizes Match Inbox, Hunter 0-100 sorting, and lead-to-unit lookups
ALTER TABLE unit_lead_matches
  ADD INDEX IF NOT EXISTS idx_ulm_lead_score (lead_id, score DESC),
  ADD INDEX IF NOT EXISTS idx_ulm_unit_score (unit_id, score DESC),
  ADD INDEX IF NOT EXISTS idx_ulm_status (status, created_at DESC);

-- 2. tw_tasks (Team Work): Optimizes sales rep scoping, open task filtering, and lead linking
ALTER TABLE tw_tasks
  ADD INDEX IF NOT EXISTS idx_tw_assignee_status (assignee_id, status, due_at),
  ADD INDEX IF NOT EXISTS idx_tw_lead_key (lead_key),
  ADD INDEX IF NOT EXISTS idx_tw_unit_id (unit_id);

-- 3. crm_audit: Optimizes audit timeline rendering and per-record change history
ALTER TABLE crm_audit
  ADD INDEX IF NOT EXISTS idx_audit_record (record_type, record_id, created_at DESC),
  ADD INDEX IF NOT EXISTS idx_audit_user (user_id, created_at DESC),
  ADD INDEX IF NOT EXISTS idx_audit_created (created_at DESC);
