# 🤝 Big Ass Motors (BAM) - Claude Code & Antigravity Collaborative Manifesto

> **Message from Google Antigravity**: *Welcome Claude! We are co-architecting the future of Big Ass Motors CRM together. This document is your guided tour of the codebase, our unified architecture, and our launch roadmap.*

---

## 🏛️ Project Vision: One Unified BAM CRM
We are unifying the best elements of two platforms into **One Single Production CRM** running on Hostinger PHP 8.3 + MySQL PDO:
1. **Live Hostinger CRM** (`bigassmotorscrm.bigassmotors.com`): Team task delegation (`tw_tasks`, `tw_assign`), multi-user role gating (`admin`, `sales`, `broker`), audit logging (`crm_audit`), and queued email pitches (`email_drafts`).
2. **Local Hunter Cockpit**: 0-100 deterministic equipment-to-buyer matching, lead cards, inventory brochure generation, and the sleek React/PHP command center.

Together, we've synthesized **54 Zero-Clash Unified Features** to maximize speed, margin security, and broker productivity.

---

## 🗺️ Codebase Map & Guided Tour

Here is where everything lives in this folder (`C:\Users\daley\OneDrive\Desktop\CLAUDE CRM`):

### 1. Production Backend & Web App (`HOSTINGER-DEPLOY-PACKAGE/`)
* **`bam_app/inc/auth.php`**: Session auth & role permissions (`admin`, `sales`, `broker`).
  * Login bypass REMOVED (2026-10-22). Never add a test or auto-login to any file that ships; test locally with a real login.
* **`bam_app/inc/db.php`**: Hostinger MySQL PDO helpers (`db()`, `q()`, `q_one()`, `audit()`).
* **`public_html/inventory/cockpit.php`**: Unified Hunter Command Center. Features our **Dual-Mode Shell** (hydrates from `window.BAM_PDO_STATE` on Hostinger, falls back to `localEngine.js` when offline).
* **`bam_app/inc/hunter_hook.php`**: Deterministic 0-100 matching engine scoring buyer requirements against live inventory specs.
* **`public_html/inventory/login.php`**: Clean authentication gate with Google Sign-In and local login.

### 2. Live Interactive Prototypes & Test UI
* **`BAM-Login.html`**: Ultra-compact 380px responsive login portal with test bypass indicators.
* **`One-Unified-CRM-Planner.html`**: High-level visual planner detailing all 54 unified CRM features.
* **`BAM-Command-Center-Preview.html`**: Live interactive mockup of the unified Cockpit.
* **`HOSTINGER-DEPLOY-BAM-CRM.zip`**: Packaged and validated production bundle ready to extract directly to Hostinger `public_html/`.

### 3. Background Daemons Managed by Antigravity
* **Static UI Server**: Running at `http://localhost:3000` (serving login and cockpit previews).
* **LiteLLM Proxy**: Running at `http://localhost:8000` (connecting you, Claude, to local Ollama `llama3.2` & `qwen3.5:4b`).

---

## 🛡️ BAM Non-Negotiable Rules (Law of the Shop)

1. **Zero Separate Node Server on Live Hostinger**:
   * Hostinger production runs purely on **PHP 8.3 + MySQL through PDO**.
   * Never introduce an Express/Node background daemon on Hostinger.
2. **Strict Buyer Safety**:
   * **Never expose wholesale/internal numbers**: `seller_cost_ask`, `buyPrice`, `seller_name`, `seller_contact`, `seller_location`, `unit_location_internal` (city/state), or `known_defects` must NEVER appear in public brochures or buyer-facing email drafts.
   * **Never fabricate machine specs; leave unstated specs out entirely** (Daley, 2026-10-22): a spec the listing does not state is not shown at all: no row, no name, no "Pending Inspection" placeholder, in brochures, listings, pitches and screens. If a customer asks, Daley gets it. Only stated values appear.
   * **Brochure Page 2 CTA**: Must read `"Call or text for a walk-around video and inspection details."`
   * Never include the phrase *"Inspection welcome before any deposit."*
3. **Multi-User Integrity**:
   * State mutations must log to `crm_audit` via `audit()`.
   * Sales rep visibility must scope to `tw_assign`.
   * Outbound buyer pitch drafts must queue into `email_drafts` (never auto-send).

---

## 🚀 Suggested Collaborative Missions for Claude

Feel free to tackle any of these high-value tasks, or propose your own in `COORDINATION.md`:

1. **Matching Engine Stress Test**:
   * Review `HOSTINGER-DEPLOY-PACKAGE/bam_app/inc/hunter_hook.php` to ensure 0-100 match weighting accurately scores machine hours, price thresholds, and year ranges.
2. **Brochure Redaction Audit**:
   * Inspect brochure generation logic in `cockpit.php` and `brochures/` to guarantee that wholesale costs, seller phone numbers, and defect logs are 100% stripped from all PDF/HTML outputs.
3. **Database Schema Enhancements**:
   * Propose optimizations for indexing `unit_lead_matches`, `tw_tasks`, and `crm_audit` for lightning-fast loads on Hostinger shared MySQL.

---

## 📡 Live Coordination Channel: `COORDINATION.md`
Whenever you make edits, need Antigravity to rebuild the deploy zip, want a screenshot of your UI change, or want to bounce an idea, write a note to `COORDINATION.md`! Antigravity is monitoring the file and will execute build and QA tasks immediately.
