# Hooking Hunter into the live PHP CRM

Nothing here has been applied to the live site. The Hunter side (`MatchingEngine`, `UnitSync`, `SpecParser`) is ready in this
folder; the CRM side is three small calls, listed below by file and function, because the live source is not in this workspace.

The only local copy of the CRM is `bigassmotorscrm.bigassmotors.com.zip OCT 14` (dated Oct 14, marked DO_NOT_UPLOAD_HERE).
It has no `inc/` folder (`inc/inventory.php`, `inc/oem_specs.php`, `inc/brochure.php`), so apply these edits to the **live**
files after reading them there, not to that snapshot.

## What was changed in Hunter

| File | Change |
|---|---|
| `src/Matching/MatchingEngine.php` | New `isMatchable($unit)`: `status = 'Live'` AND `verified_at` set. `matchInventory()` and `matchLead()` use it, so an unverified or Draft unit never creates a `MATCH_ALERT`. Horsepower is read from the flat `ai_specs.hp` first, then the legacy `Horsepower` entry. |
| `src/Crm/LiveCrm.php` | `VERIFIED_UNIT` SQL fragment. |
| `src/Crm/UnitSync.php` (new) | `syncAiSpecs()` runs `SpecParser::parseUnit()` + `mergeIntoAiSpecs()` and writes `inventory.ai_specs` only when it changed. `onUnitChanged()` syncs, then matches only a Live + verified unit. |
| `crm-hooks/hunter_hook.php` (new) | `bam_hunter_on_unit_changed($id)`: finds Hunter, loads the CRM's `oem_specs_for_unit()`, calls `UnitSync`. Never throws; failures go to the PHP error log. |
| `tests/*.php` | New checks for the gate, flat `hp`, non-destructive OEM `hp` fill, and the brochure rules. **Not run yet** (no PHP on this machine). |

**Title only.** By default `ai_specs` is built from the machine title alone (`inventory.title`, e.g. "2008 CAT 320" => year 2008,
make Caterpillar, model 320; a blank title falls back to Year Make Model, the CRM's own display title). The description is
never read, and nothing is guessed: a bare "320" gives no category, and hours and price stay in their own columns.
`SpecParser::parseTitle()` does this. The old full parse (description, specs, highlights, brochure blocks) is still there as
`SpecParser::parseUnit()`; pass `titleOnly = false` to `UnitSync`, or `--full` to `bin/parse-specs.php`, to use it.

OEM horsepower: `hp` is filled (with `hp_source = 'oem'`) only when `ai_specs.hp` is missing or null; every existing key,
including a manually verified `hp`, is kept.

## What to add in the CRM

1. Copy `crm-hooks/hunter_hook.php` to `BAM_ROOT/inc/hunter_hook.php`.
2. Call it in these three places, each after the database write and inside nothing that can fail the request:

```php
require_once BAM_ROOT . '/inc/hunter_hook.php';

// a) End of unit_save() in inc/inventory.php, after the row is written, with the unit id.
//    Covers unit.php (manual save), add_url.php and api/hub/queue_step.php, which all go through unit_save().
//    A Draft or unverified save only refreshes ai_specs; it can never create a MATCH_ALERT.
bam_hunter_on_unit_changed((int) $id);

// b) unit_list_now() in inc/inventory.php, after status becomes 'Live' (called from unit_action.php, case 'list_now').
bam_hunter_on_unit_changed((int) $id);

// c) inventory/api/hub/verify.php, in the `if ($verify)` branch right after the verified_at UPDATE.
//    This is where a Live unit that was waiting for verification starts matching.
bam_hunter_on_unit_changed($id);
```

3. Do not call it from the un-verify branch of `verify.php` (that branch already drops the unit back to Draft).

Install Hunter next to `public_html` as in `UPLOAD-GUIDE.md`, fill its `.env`, and run `php bin/migrate.php` once.

## Brochure rules (non-negotiable)

`SpecParser` already scrubs `Inspection welcome before any deposit.` and unit city/state from everything it writes into
`ai_specs`. The brochure renderer in the CRM must also follow them. In the Oct 14 snapshot,
`public_html/inventory/brochure.php` line 62 still prints this default terms line:

> Prices in USD, subject to prior sale. Inspection welcome before any deposit; escrow-friendly; freight arranged across the US & Mexico. Call … for photos, walk-around videos and inspection reports.

Check whether the live `inc/brochure.php` / `inc/brochure_pdf.php` still has it, and if so:

- remove "Inspection welcome before any deposit" from every description, highlight and CTA box;
- Page 2 CTA box text: `Call or text for a walk-around video and inspection details.`;
- never print the unit's city/state (`loc`) in the buyer brochure subtitle;
- keep the canonical 2-page layout (2018 Ditch Witch JT20 standard) and the multi-page criteria match portfolio.

## Check before going live

1. `php tests/scoring-test.php` and `php tests/spec-parser-test.php` should print only PASS lines.
2. Back up the database. Test on one Draft unit (ai_specs fills, no task), then verify it and set it Live (exactly one
   `MATCH_ALERT` per qualifying lead, none on a second run).
3. `php bin/parse-specs.php` backfills existing units and leads; try it on a copy of the database first.
