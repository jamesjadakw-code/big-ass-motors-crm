-- FALLBACK ONLY: use this in phpMyAdmin if you cannot run `php bin/migrate.php` (SSH/cron).
-- The PHP migrator is safer: it skips anything already present and matches your leads.id type.
-- This file will ERROR on a column that already exists. BACK UP FIRST, run one statement at a time,
-- and skip any that report "Duplicate column name".
-- The tasks table has NO foreign key here (a type mismatch with leads.id would be rejected); lead_id is indexed.
-- Set lead_id's type below to exactly match leads.id (check Structure tab in phpMyAdmin).

-- Lead status stays the CRM's own leads.lead_status, and inventory.ai_specs belongs to the CRM: neither is touched.

ALTER TABLE leads ADD COLUMN demand_cluster_id INT NULL DEFAULT NULL;
ALTER TABLE leads ADD COLUMN last_contacted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE leads ADD COLUMN requirements JSON NULL;
ALTER TABLE leads ADD INDEX idx_leads_demand_cluster (demand_cluster_id);
ALTER TABLE leads ADD INDEX idx_leads_last_contacted (last_contacted_at);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lead_id INT UNSIGNED NOT NULL,            -- CHANGE to match leads.id exactly
    user_id INT NULL DEFAULT NULL,
    task_type ENUM('MATCH_ALERT','FOLLOW_UP','NURTURE','PRICE_DROP') NOT NULL,
    priority TINYINT UNSIGNED NOT NULL DEFAULT 2,
    due_date DATETIME NOT NULL,
    status ENUM('PENDING','COMPLETED','SNOOZED') NOT NULL DEFAULT 'PENDING',
    trigger_event VARCHAR(191) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_tasks_queue (status, due_date),
    KEY idx_tasks_user_queue (user_id, status, due_date),
    KEY idx_tasks_lead_lookup (lead_id, task_type, status),
    CONSTRAINT chk_tasks_priority CHECK (priority BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE inventory ADD COLUMN source_type ENUM('FB_MARKETPLACE','MACHINERY_TRADER','PRIVATE_IMPORT') NOT NULL DEFAULT 'PRIVATE_IMPORT';
ALTER TABLE inventory ADD COLUMN seller_type ENUM('PRIVATE','DEALER') NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE inventory ADD INDEX idx_inventory_source_type (source_type);
ALTER TABLE inventory ADD INDEX idx_inventory_seller_type (seller_type);
