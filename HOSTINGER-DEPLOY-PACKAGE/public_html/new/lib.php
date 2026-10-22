<?php
/**
 * /new/ read-only connector: pure row mappers (MySQL row -> the shape the React CRM expects).
 * No database access and no session code here, so these can be tested with sample rows.
 *
 * Buyer safety: seller_name, seller_contact, seller_location and unit_location_internal are never copied out
 * (only a state/city for staff screens, and only the state when no city is on file). Cost fields leave the server
 * only when $showCost is true (admin).
 */
declare(strict_types=1);

const NEW_STAGES = ['New', 'Contacted', 'Qualified', 'Negotiation', 'Won', 'Lost'];

/**
 * lead_status as typed in the live CRM ("new", "Contacted", "Hot – website request", "Nurture" …) -> [stage, urgency].
 * Case does not matter. Anything unknown stays New; the original text is kept in statusRaw.
 */
function new_lead_stage(string $raw): array
{
    $s = mb_strtolower(trim($raw));
    foreach (NEW_STAGES as $st) { if ($s === mb_strtolower($st)) { return [$st, 'Medium']; } }
    if (str_starts_with($s, 'hot')) { return ['New', 'High']; }
    if ($s === 'nurture') { return ['Contacted', 'Low']; }
    return ['New', 'Medium'];
}

function new_str(mixed $v, int $max = 190): string
{
    return mb_substr(trim((string) ($v ?? '')), 0, $max);
}

function new_num(mixed $v): ?float
{
    return ($v === null || $v === '' || !is_numeric($v)) ? null : (float) $v;
}

/** Unit status as the React CRM knows it: Live | Sold | Draft (Staged and Pending are still unlisted). */
function new_unit_status(mixed $s): string
{
    return in_array($s, ['Live', 'Sold'], true) ? (string) $s : 'Draft';
}

/** "Austin, TX" style internal location -> [city, state]. Never returns the seller's own address. */
function new_city_state(array $r): array
{
    $loc = (string) ($r['unit_location_internal'] ?? '');
    $parts = array_values(array_filter(array_map('trim', explode(',', $loc)), static fn ($p) => $p !== ''));
    if (count($parts) >= 2) { return [mb_substr($parts[0], 0, 60), mb_substr($parts[1], 0, 20)]; }
    if (count($parts) === 1 && preg_match('/^[A-Za-z]{2}$/', $parts[0])) { return ['', strtoupper($parts[0])]; }
    return ['', ''];
}

/**
 * @param array<int,array> $photos rows of inventory_photos for this unit, already ordered primary-first
 * @param callable(array,bool|string):string $photoUrl photo_url() from inc/inventory.php
 */
function new_map_unit(array $r, array $photos, callable $photoUrl, bool $showCost): array
{
    $id = (int) $r['id'];
    [$city, $state] = new_city_state($r);
    $media = [];
    $thumbs = [];
    foreach ($photos as $p) {
        $full = $photoUrl($p, false);
        if ($full === '' || !preg_match('~^(https?://|/)~i', $full)) { continue; }
        $media[] = $full;
        $thumbs[] = $photoUrl($p, true) ?: $full;
    }
    $hours = new_num($r['hours'] ?? null);
    $unit = [
        'id'            => (string) $id,
        'stock'         => new_str($r['stock_no'] ?? '') ?: ('BAM-' . $id),
        'year'          => !empty($r['year']) ? (int) $r['year'] : null,
        'make'          => new_str($r['make'] ?? '', 80),
        'model'         => new_str($r['model'] ?? '', 120),
        'category'      => new_str($r['category'] ?? '', 80),
        'hours'         => $hours !== null && $hours > 0 ? (int) round($hours) : null,
        'serial'        => new_str($r['serial_vin'] ?? '', 80),
        'listPrice'     => (isset($r['show_price']) && (int) $r['show_price'] === 0) ? null : new_num($r['public_price'] ?? null),
        'city'          => $city,
        'state'         => $state,
        'status'        => new_unit_status($r['status'] ?? ''),
        'rawStatus'     => new_str($r['status'] ?? '', 20),
        'narrative'     => new_str($r['description'] ?? '', 4000),
        'verified'      => !empty($r['verified_at']),
        'sourceUrl'     => new_str($r['source_url'] ?? '', 500),
        // Only URL listings (Add from URL / uploader: inventory.url_listing = 1) are third-party machines that may be matched.
        'thirdParty'    => array_key_exists('url_listing', $r) ? (int) $r['url_listing'] === 1 : trim((string) ($r['source_url'] ?? '')) !== '',
        'media'         => $media,
        'thumbs'        => $thumbs,
        'oemSpecs'      => [],
        'pendingFields' => [],
        'createdAt'     => !empty($r['created_at']) ? (string) $r['created_at'] : null,
        'serverId'      => $id,
    ];
    // Unconfirmed specs stay unset; the app shows them as Pending Inspection. Nothing is guessed.
    foreach (['year' => 'year', 'hours' => 'hours', 'serial' => 'serial'] as $k => $f) {
        if ($unit[$k] === null || $unit[$k] === '') { $unit['pendingFields'][] = $f; }
    }
    $specs = json_decode((string) ($r['ai_specs'] ?? ''), true);
    if (is_array($specs)) {
        foreach (['hp', 'weight', 'dimensions', 'engine'] as $k) {
            if (isset($specs[$k]) && is_scalar($specs[$k]) && (string) $specs[$k] !== '') { $unit['oemSpecs'][$k] = $specs[$k]; }
        }
    }
    foreach (['hp', 'weight', 'dimensions'] as $k) {
        if (!isset($unit['oemSpecs'][$k])) { $unit['pendingFields'][] = $k; }
    }
    if ($showCost) {
        $ask = new_num($r['seller_cost_ask'] ?? null);
        $unit['askPrice'] = $ask;
        $unit['buyPrice'] = $ask;
    }
    return $unit;
}

/** One `leads` row -> React lead. $ownerNames maps user id => display name. */
function new_map_lead(array $r, ?int $ownerId, array $ownerNames): array
{
    $stage = (string) ($r['lead_status'] ?? '');
    [$mapped, $urgency] = new_lead_stage($stage);
    $lang = preg_match('/\b(hola|necesito|quiero|busco|precio|cu[aá]nto)\b/iu', (string) ($r['message'] ?? '')) ? 'es' : 'en';
    return [
        'id'         => (string) (int) $r['id'],
        'firstName'  => new_str($r['first_name'] ?? '', 80),
        'lastName'   => new_str($r['last_name'] ?? '', 80),
        'email'      => new_str($r['email'] ?? '', 190),
        'phone'      => new_str($r['phone'] ?? '', 40),
        'company'    => new_str($r['company'] ?? '', 160),
        'city'       => new_str($r['city'] ?? '', 80),
        'state'      => new_str($r['state'] ?? '', 40),
        'stage'      => $mapped,
        'statusRaw'  => new_str($stage, 60),
        'urgency'    => $urgency,
        'language'   => $lang,
        'budgetMax'  => null,
        'maxHours'   => null,
        'ownerId'    => $ownerId,
        'ownerName'  => $ownerId !== null ? ($ownerNames[$ownerId] ?? '') : '',
        'source'     => new_str($r['lead_source'] ?? '', 80),
        'notes'      => new_str($r['message'] ?? '', 600),
        'createdAt'  => !empty($r['created_at']) ? (string) $r['created_at'] : null,
        'wants'      => array_filter([
            'make'     => new_str($r['brand'] ?? '', 80),
            'model'    => new_str($r['machine'] ?? '', 120),
            'category' => new_str($r['type'] ?? '', 80),
        ], static fn ($v) => $v !== ''),
        'interactions' => [],
    ];
}

/** `users` row -> safe user. Password hashes, Google ids and session epochs are never copied. */
function new_map_user(array $r): array
{
    return [
        'id'             => (int) $r['id'],
        'email'          => new_str($r['email'] ?? '', 190),
        'name'           => new_str($r['name'] ?? '', 120),
        'role'           => in_array($r['role'] ?? '', ['admin', 'sales', 'broker'], true) ? (string) $r['role'] : 'sales',
        'active'         => (int) ($r['is_active'] ?? 0) === 1 ? 1 : 0,
        'google_allowed' => !empty($r['google_allowed']) ? 1 : 0,
        'last_login_at'  => !empty($r['last_login_at']) ? (string) $r['last_login_at'] : null,
        'last_login_via' => new_str($r['last_login_method'] ?? '', 20),
    ];
}

/** `tw_tasks` row -> React task. Only tasks tied to a CRM lead (db:<id>) link to a lead card. */
function new_map_task(array $r): array
{
    $key = (string) ($r['lead_key'] ?? '');
    $leadId = preg_match('~^db:(\d{1,10})$~', $key, $m) ? $m[1] : null;
    return [
        'id'         => (string) (int) $r['id'],
        'title'      => new_str($r['title'] ?? '', 190),
        'leadId'     => $leadId,
        'due'        => !empty($r['due_at']) ? date('c', (int) strtotime((string) $r['due_at'])) : null,
        'done'       => ($r['status'] ?? '') === 'done',
        'priority'   => in_array($r['priority'] ?? '', ['high', 'urgent'], true) ? 'high' : 'normal',
        'assignedTo' => isset($r['assignee_id']) ? (int) $r['assignee_id'] : null,
        'unitId'     => isset($r['unit_id']) && (int) $r['unit_id'] > 0 ? (string) (int) $r['unit_id'] : null,
    ];
}

/** JSON that is safe to place inside an inline <script> (lead messages are user-supplied). */
function new_json_for_script(mixed $data): string
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR;
    return (string) json_encode($data, $flags);
}
