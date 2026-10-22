# BAM Private Hunter: backend layer (PHP 8.3 / MySQL)

Migrations, the `TaskOrchestrator` trigger engine, and the `MatchingEngine`. No framework, no Composer dependencies
(`autoload.php` is a tiny PSR-4 loader; `composer.json` is there if you prefer Composer).

**Back up the database before the first migration.** The pure scoring checks need no database; everything else
reads the live CRM's tables (`leads`, `inventory`, `call_log`, `tw_assign`).

## Setup

```bash
export DB_HOST=... DB_NAME=... DB_USER=... DB_PASS=...   # or a .env file; DB_PORT, DB_SOCKET, APP_TIMEZONE optional
php tests/scoring-test.php      # pure scoring checks, no DB needed
php bin/migrate.php             # idempotent; safe to re-run on every deploy
```

`APP_TIMEZONE` must match the CRM's `app.timezone` (default America/New_York). Like the CRM, Hunter sets PHP's zone to it
and the MySQL session to its offset, so the DATETIMEs it writes and compares line up with the CRM's.

## What the migration does

| Table | Change |
|---|---|
| `leads` | `demand_cluster_id` INT; `last_contacted_at` TIMESTAMP; **`requirements` JSON** (see assumptions). Lead status stays the CRM's own `lead_status`. |
| `tasks` (new) | `id`, `lead_id`, `user_id`, `task_type` (MATCH_ALERT, FOLLOW_UP, NURTURE, PRICE_DROP), `priority` 1-3 (CHECK), `due_date`, `status` (PENDING, COMPLETED, SNOOZED), `trigger_event`, plus `created_at`, `completed_at`. FK to `leads.id` copies the legacy id type/collation exactly. |
| `inventory` | `source_type` ENUM(FB_MARKETPLACE, MACHINERY_TRADER, PRIVATE_IMPORT) default PRIVATE_IMPORT; `seller_type` ENUM(PRIVATE, DEALER) default PRIVATE. The CRM's `ai_specs` is left alone. |

Every ALTER is guarded by an `information_schema` check (MySQL has no `ADD COLUMN IF NOT EXISTS`). An index name that
already exists on a different column stops the migration with an error instead of being skipped.

## What Hunter reads from the CRM (`src/Crm/LiveCrm.php`)

- **Active leads:** `leads.lead_status` not in lost / won / closed / dead / sold (case-insensitive). Edit `ACTIVE_LEAD` to add one.
- **Contacts:** calls logged in `call_log` (`kind = 'log'`, `lead_key = 'db:<lead id>'`), plus `recordContact()`.
- **Owner:** the rep in `tw_assign` for `lead_key = 'db:<lead id>'`; unassigned leads' tasks have no owner.
- **Units:** only `inventory.status = 'Live'`, scored from `year, make, model, category, hours, public_price`, and a
  "Horsepower" entry in `ai_specs` when there is one.

## TaskOrchestrator (`src/Tasks/TaskOrchestrator.php`)

- `createTask($leadId, TaskType, $priority, $event, ?$dueDate)`: returns the new id, or `null` if an identical open
  task (same lead + type + `trigger_event`, PENDING/SNOOZED) exists, so every trigger is safe to re-run. Locks the lead row so
  concurrent triggers can't double-insert. Default due: priority 1 = +1h, 2 = +1d, 3 = +3d. Owner comes from `tw_assign`.
- `resolveTasks($leadId, TaskType)`: completes all open tasks of that type; returns the count.
- `recordContact($leadId)`: stamps `last_contacted_at` and clears open NURTURE tasks. Calls logged in the CRM count as
  contacts without it.
- `checkColdLeads($days = 7)`: for cron. Active leads with no contact in 7 days (never-contacted ones age from `created_at`)
  and no open NURTURE task get a priority-3 `NURTURE` task. A lead deleted mid-run is skipped and logged; any other
  error stops the run, and the cron script exits 1.

Cron: `0 7 * * * cd /path/to/hunter-backend-php && php bin/check-cold-leads.php`

## MatchingEngine (`src/Matching/MatchingEngine.php`)

- `MatchingEngine::score($specs, $requirements)`: pure, 0-100. Weights: category 25, make 15, model 20, budget 20,
  hours 10, HP 10, min year 5; **only criteria the lead specified count**. A lead that names neither a category nor a
  model never matches (make or price alone is not enough). "CAT" and "Caterpillar" are one make. Containment matches
  ("D24x40" in "D24x40 S3") need 3+ characters, so "20" can't match "D20x22". Missing listing data earns nothing.
- `matchInventory($inventoryId)`: call after a listing is saved, verified or goes Live; only a **Live and verified**
  unit (`status = 'Live'` AND `verified_at IS NOT NULL`) is matched, so a Draft or unverified save never alerts. Any
  active lead scoring **strictly above 80** gets an **URGENT (priority 1) `MATCH_ALERT`** via `TaskOrchestrator`.
  `trigger_event = MATCH_ALERT:inventory:<id>`, so re-running never duplicates an open alert.
- `matchLead($leadId)`: the reverse, for a new lead or changed requirements, against Live units only.

```php
$pdo = Bam\Hunter\Database\Connection::fromEnv();
$engine = new Bam\Hunter\Matching\MatchingEngine($pdo, new Bam\Hunter\Tasks\TaskOrchestrator($pdo));
$engine->matchInventory($newInventoryId);          // after saving a listing
$orchestrator->resolveTasks($leadId, Bam\Hunter\Enum\TaskType::MatchAlert);   // after the brochure is sent
```

Unit specs (built from inventory columns): `year, make, model, category, hours, hp, asking_price`.
`requirements` keys: `category, make, model, min_year, max_hours, min_hp, budget_max`.

## Open points

1. **Nothing fills `leads.requirements` yet.** Until something does (the CRM's lead form, or a mapping from the lead's
   `brand` / `type` / `machine`), matching finds no leads to alert.
2. Existing `inventory` rows get `source_type = PRIVATE_IMPORT`, `seller_type = PRIVATE`; correct them if that's wrong.
3. The first cold-lead run gives a NURTURE task to every active lead created more than 7 days ago with no logged call.
4. Hunter's `tasks` are not shown in the CRM's own task screens (`tw_tasks`).

## Security notes

Credentials from env only; PDO with real prepared statements (`EMULATE_PREPARES=false`), exceptions on error;
`declare(strict_types=1)` everywhere; enum-typed task/status values (no free-form strings reach SQL); identifiers in
migrations are hard-coded; CLI scripts refuse to run under a web SAPI; malformed JSON is skipped and logged, never fatal.
