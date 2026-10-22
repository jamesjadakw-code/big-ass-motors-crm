<?php

declare(strict_types=1);

namespace Bam\Hunter\Parser;

use JsonException;

/**
 * Deterministic Heavy-Equipment Spec Parser for Big Ass Motors (BAM).
 *
 * Bridges raw/legacy `inventory`, `sourcing_results`, and `leads` rows with:
 *   1. `Bam\Hunter\Matching\MatchingEngine::score()` flat keys:
 *      `year, make, model, category, hours, hp, asking_price, pullback_lbs, torque_ft_lbs, weight_lbs`
 *   2. The Canonical 2-Page BAM Brochure engine (`inc/brochure.php`, `inc/brochure_pdf.php`, `server/brochure.py`):
 *      `specs` (2-col table), `highlights`, `package_includes`, `subsystems` (`mud_system`, `trailer`), `package_subtitle`
 *   3. `leads.requirements` JSON extraction from legacy `leads` columns (`machine, brand, type, message`).
 *
 * Never guesses or invents values: missing fields stay null. OEM horsepower/specs are merged only when
 * passed via `$oemSpecs` (from `inc/oem_specs.php::oem_specs_for_unit()`) and tagged with `hp_source = 'oem'`.
 * Strictly scrubs seller names, non-BAM phone numbers, emails, URLs, and unit city/state locations.
 */
final class SpecParser
{
    /** Canonical OEM make aliases -> standardized display name. */
    private const MAKE_ALIASES = [
        'ditch witch'     => 'Ditch Witch',
        'ditchwitch'      => 'Ditch Witch',
        'vermeer'         => 'Vermeer',
        'caterpillar'     => 'Caterpillar',
        'cat'             => 'Caterpillar',
        'john deere'      => 'John Deere',
        'deere'           => 'John Deere',
        'case'            => 'Case',
        'komatsu'         => 'Komatsu',
        'kubota'          => 'Kubota',
        'bobcat'          => 'Bobcat',
        'hitachi'         => 'Hitachi',
        'volvo'           => 'Volvo',
        'jcb'             => 'JCB',
        'astec'           => 'Astec',
        'toro'            => 'Toro',
        'american augers' => 'American Augers',
        'barbco'          => 'Barbco',
        'trencor'         => 'Trencor',
        'takeuchi'        => 'Takeuchi',
        'gradall'         => 'Gradall',
        'altec'           => 'Altec',
        'terex'           => 'Terex',
        'hyundai'         => 'Hyundai',
        'doosan'          => 'Doosan',
        'kobelco'         => 'Kobelco',
        'liebherr'        => 'Liebherr',
        'sullair'         => 'Sullair',
        'felling'         => 'Felling',
        'mclaughlin'      => 'McLaughlin',
        'ring-o-matic'    => 'Ring-O-Matic',
        'vac-tron'        => 'Vac-Tron',
        'vactron'         => 'Vac-Tron',
    ];

    /** Category detection patterns -> canonical BAM category label. */
    private const CATEGORY_PATTERNS = [
        '/\b(hdd|horizontal\s+directional\s+drill|directional\s+drill|drill\s+rig|boring\s+machine)\b|\b(jt\s?\d{1,3}|d\d{1,3}x\d{1,3})\b/i' => 'Directional Drills',
        '/\b(vacuum\s+excavator|hydro\s?vac|vac\s+truck|vac\s+trailer|pothole|vactron|vx\d{2,3})\b/i'                                        => 'Vacuum Excavators',
        '/\b(rock\s?saw|wheel\s+trencher|hydra-?wheel)\b/i'                                                                                   => 'Rock Saws',
        '/\b(trencher|vibratory\s+plow|quad\s+track\s+plow|rt\s?\d{2,3}|rtx\s?\d{3,4})\b/i'                                                   => 'Trenchers',
        '/\b(mini\s+excavator|compact\s+excavator)\b/i'                                                                                       => 'Mini Excavators',
        '/\b(excavator|trackhoe|digging)\b/i'                                                                                                 => 'Excavators',
        '/\b(backhoe)\b/i'                                                                                                                    => 'Backhoes',
        '/\b(dozer|crawler\s+tractor|bulldozer)\b/i'                                                                                          => 'Dozers',
        '/\b(motor\s+grader|grader|blade)\b/i'                                                                                                => 'Motor Graders',
        '/\b(compact\s+track\s+loader|ctl|skid\s+steer)\b/i'                                                                                  => 'Skid Steers',
        '/\b(wheel\s+loader|front\s+loader|articulated\s+loader)\b/i'                                                                         => 'Wheel Loaders',
        '/\b(compactor|roller| vibratory\s+roller)\b/i'                                                                                       => 'Compactors',
    ];

    /** Private / identity keys that must never appear in the public 2-column technical spec grid. */
    private const BLOCKED_SPEC_KEYS = '/^(make|model|year|model\s+year|hours?|hour\s+meter|serial|vin|pin|price|asking\s+price|cost|seller|dealer|owner|location|city|state|zip|phone|contact|email|e-mail|url|link|stock|stock\s*#?)$/i';

    /**
     * Parses an `inventory` or `sourcing_results` associative row + optional OEM spec dictionary
     * (`oem_specs_for_unit($unit)` from `inc/oem_specs.php`) into the unified `ai_specs` payload.
     *
     * @param array<string, mixed>  $unit     Row from `inventory` or `sourcing_results`
     * @param array<string, string> $oemSpecs Authoritative OEM key/value rows from `inc/oem_specs.php`
     * @return array<string, mixed>
     */
    public static function parseUnit(array $unit, array $oemSpecs = []): array
    {
        $existing = self::decodeJson($unit['ai_specs'] ?? null);

        $title = trim((string) ($unit['title'] ?? ''));
        $desc = trim((string) ($unit['description'] ?? ''));
        $specText = trim((string) ($unit['specifications_text'] ?? ''));
        $attachText = trim((string) ($unit['attachments'] ?? ''));
        $featText = trim((string) ($unit['features'] ?? ''));

        $combinedText = trim(implode("\n", array_filter([$title, $desc, $specText, $attachText, $featText])));
        $cleanText = self::stripHtmlAndCss($combinedText);

        // 1. Core Identity (Year, Make, Model, Category)
        $year = self::extractYear($unit['year'] ?? ($existing['year'] ?? null), $cleanText);
        $make = self::extractMake((string) ($unit['make'] ?? ($existing['make'] ?? '')), $cleanText);
        $model = self::extractModel((string) ($unit['model'] ?? ($existing['model'] ?? '')), $make, $title !== '' ? $title : $cleanText);
        $category = self::extractCategory((string) ($unit['category'] ?? ($existing['category'] ?? '')), $cleanText, $model);

        // 2. Hours & Price (Never guessed)
        $hours = self::extractHours($unit['hours'] ?? ($existing['hours'] ?? null), $cleanText);
        $askingPrice = self::extractPrice($unit, $existing);

        // 3. Parse structured key/value rows and bullets from description + specifications_text
        $parsedText = self::parseStructuredText($specText . "\n" . $desc);

        // 4. Extract Horsepower (Listing text/specs first -> existing JSON -> OEM fallback)
        [$hp, $hpSource] = self::extractHorsepower($unit, $existing, $parsedText['rows'], $cleanText, $oemSpecs);

        // 5. Extract Heavy-Equipment Performance Metrics (Pullback, Thrust, Torque, Weight)
        $pullbackLbs = self::extractMetricLbs($cleanText, $parsedText['rows'], $oemSpecs, '/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:lb|lbs)\s*(?:pullback|pull\s+back)/i', 'pullback');
        $thrustLbs = self::extractMetricLbs($cleanText, $parsedText['rows'], $oemSpecs, '/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:lb|lbs)\s*thrust/i', 'thrust');
        $torqueFtLbs = self::extractMetricLbs($cleanText, $parsedText['rows'], $oemSpecs, '/(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:ft[·\-\s]?lb|ft[·\-\s]?lbs)(?:\s*(?:max\s*)?(?:rotational\s*)?torque)?/i', 'torque');
        $weightLbs = self::extractMetricLbs($cleanText, $parsedText['rows'], $oemSpecs, '/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:lb|lbs)\s*(?:operating\s+weight|weight\s+w\/?\s*pipe|basic\s+unit\s+weight|gvwr)/i', 'weight');

        // 6. Build Buyer-Safe Technical Specifications Grid (Page 2 of BAM Brochure)
        $specGrid = self::buildSpecGrid($unit, $existing, $parsedText['rows'], $oemSpecs, $year, $make, $model, $hours);

        // 7. Extract Sub-Systems (Mud Mixing System & Equipment Trailer for Page 2 Dual Cards)
        $subsystems = self::extractSubsystems($cleanText, $parsedText['rows'], $existing);

        // 8. Build Package Inclusions & Key Highlights (Page 1 of BAM Brochure)
        $packageIncludes = self::buildPackageIncludes($unit, $existing, $cleanText, $year, $make, $model, $hours, $subsystems);
        $highlights = self::buildHighlights($unit, $existing, $parsedText['bullets'], $cleanText, $year, $model, $hours, $pullbackLbs, $thrustLbs, $torqueFtLbs, $hp);
        $packageSubtitle = self::buildPackageSubtitle($category, $subsystems, $packageIncludes);

        return array_filter([
            // Flat keys required by Bam\Hunter\Matching\MatchingEngine::score()
            'year'             => $year,
            'make'             => $make !== '' ? $make : null,
            'model'            => $model !== '' ? $model : null,
            'category'         => $category !== '' ? $category : null,
            'hours'            => $hours,
            'hp'               => $hp,
            'hp_source'        => $hpSource,
            'asking_price'     => $askingPrice,
            'pullback_lbs'     => $pullbackLbs,
            'thrust_lbs'       => $thrustLbs,
            'torque_ft_lbs'    => $torqueFtLbs,
            'weight_lbs'       => $weightLbs,
            // Structured keys required by Canonical 2-Page BAM Brochure & Criteria Match Portfolio
            'package_subtitle' => $packageSubtitle !== '' ? $packageSubtitle : null,
            'specs'            => $specGrid,
            'highlights'       => $highlights,
            'package_includes' => $packageIncludes,
            'subsystems'       => $subsystems !== [] ? $subsystems : null,
        ], static fn(mixed $v): bool => $v !== null && $v !== []);
    }

    /**
     * The machine title the scraper saved ("2008 CAT 320"). Uses `inventory.title`; when that is blank it falls back to
     * "Year Make Model", the CRM's own display title for a unit with no title. Never reads the description.
     *
     * @param array<string, mixed> $unit
     */
    public static function unitTitle(array $unit): string
    {
        $title = trim((string) ($unit['title'] ?? ''));
        if ($title !== '') {
            return $title;
        }
        return trim(implode(' ', array_filter([
            trim((string) ($unit['year'] ?? '')),
            trim((string) ($unit['make'] ?? '')),
            trim((string) ($unit['model'] ?? '')),
        ], static fn (string $p): bool => $p !== '')));
    }

    /**
     * Title-only parse: reads year, make, model and category from the machine title and nothing else, e.g.
     * "2008 CAT 320" => year 2008, make Caterpillar, model 320. Nothing is guessed: a field the title does not state is
     * left out (a bare "320" does not name a category). Horsepower comes only from the OEM table (`$oemSpecs`), tagged
     * `hp_source = 'oem'`. Hours, price, highlights and the brochure blocks are not produced here.
     *
     * @param array<string, string> $oemSpecs from `oem_specs_for_unit()`
     * @return array<string, mixed> flat keys year, make, model, category, hp, hp_source (only those found)
     */
    public static function parseTitle(string $title, array $oemSpecs = []): array
    {
        $clean = self::scrubBuyerSafeText(self::stripHtmlAndCss($title));
        if ($clean === '') {
            return [];
        }

        $year = self::extractYear(null, $clean);
        $make = self::extractMake('', $clean);
        $model = self::extractModel('', $make, $clean);
        $category = self::extractCategory('', $clean, $model);
        [$hp, $hpSource] = self::extractHorsepower([], null, [], '', $oemSpecs);

        return array_filter([
            'year'      => $year,
            'make'      => $make !== '' ? $make : null,
            'model'     => $model !== '' ? $model : null,
            'category'  => $category !== '' ? $category : null,
            'hp'        => $hp,
            'hp_source' => $hpSource,
        ], static fn (mixed $v): bool => $v !== null && $v !== []);
    }

    /**
     * Non-destructively merges newly parsed specs into an existing `inventory.ai_specs` JSON string.
     * Existing top-level scalar values (e.g. manually verified `hp`) are preserved unless null/empty.
     *
     * @param array<string, mixed> $parsed Output of `SpecParser::parseUnit()`
     */
    public static function mergeIntoAiSpecs(?string $existingJson, array $parsed): string
    {
        $existing = self::decodeJson($existingJson) ?? [];
        $merged = $existing;

        foreach ($parsed as $k => $v) {
            if ($k === 'specs' && is_array($v)) {
                $existingSpecs = is_array($existing['specs'] ?? null) ? $existing['specs'] : [];
                // Existing manual spec labels win over newly parsed/OEM defaults
                $merged['specs'] = array_merge($v, $existingSpecs);
                continue;
            }
            if (!isset($merged[$k]) || $merged[$k] === '' || $merged[$k] === []) {
                $merged[$k] = $v;
            }
        }

        return json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * Parses a historical row from `leads` (2,532 rows) into the structured `leads.requirements`
     * array expected by `MatchingEngine::score()`:
     *   `category, make, model, min_year, max_hours, min_hp, budget_max`
     *
     * @param array<string, mixed> $lead Row from `leads`
     * @return array<string, mixed>
     */
    public static function parseLeadRequirements(array $lead): array
    {
        $existing = self::decodeJson($lead['requirements'] ?? null) ?? [];

        $machineText = trim((string) ($lead['machine'] ?? ''));
        $brandText = trim((string) ($lead['brand'] ?? ($lead['brand_key'] ?? ($lead['machine_make_key'] ?? ''))));
        $typeText = trim((string) ($lead['type'] ?? ($lead['type_key'] ?? '')));
        $msgText = trim((string) (($lead['message'] ?? '') . ' ' . ($lead['custom_message'] ?? '')));
        $combined = trim(implode(' ', array_filter([$typeText, $brandText, $machineText, $msgText])));

        $make = (string) ($existing['make'] ?? '');
        if ($make === '') {
            $make = self::extractMake($brandText, $combined);
        }

        $model = (string) ($existing['model'] ?? '');
        if ($model === '') {
            $model = self::extractModel('', $make, $machineText !== '' ? $machineText : $combined);
        }

        $category = (string) ($existing['category'] ?? '');
        if ($category === '') {
            $category = self::extractCategory($typeText, $combined, $model);
        }

        // Extract optional constraints from buyer notes/messages ("under $150k", "under 2,000 hrs", "2016 or newer")
        $budgetMax = self::toFloat($existing['budget_max'] ?? null);
        if ($budgetMax === null && preg_match('/(?:under|max|budget|up\s+to|below|around)\s*\$?\s*(\d{2,3})\s*k\b/i', $combined, $m)) {
            $budgetMax = (float) $m[1] * 1000.0;
        } elseif ($budgetMax === null && preg_match('/\$\s*(\d{2,3}(?:,\d{3})+)/', $combined, $m)) {
            $budgetMax = (float) str_replace(',', '', $m[1]);
        }

        $maxHours = self::toFloat($existing['max_hours'] ?? null);
        if ($maxHours === null && preg_match('/(?:under|less\s+than|max|below)\s*(\d{1,2}(?:,\d{3})|\d{3,5})\s*(?:hours|hrs|hr)\b/i', $combined, $m)) {
            $maxHours = (float) str_replace(',', '', $m[1]);
        }

        $minYear = self::toInt($existing['min_year'] ?? null);
        if ($minYear === null && preg_match('/\b(20[0-2]\d)\s*(?:\+|or\s+newer|and\s+up|to\s+20[12]\d)\b/i', $combined, $m)) {
            $minYear = (int) $m[1];
        } elseif ($minYear === null && preg_match('/\b(199\d|20[0-2]\d)\b/', $machineText, $m)) {
            $minYear = max(1990, (int) $m[1] - 3);
        }

        $minHp = self::toFloat($existing['min_hp'] ?? null);
        if ($minHp === null && preg_match('/(\d{2,4})\s*\+?\s*hp\b/i', $combined, $m)) {
            $minHp = (float) $m[1];
        }

        return array_filter([
            'category'   => $category !== '' ? $category : null,
            'make'       => $make !== '' ? $make : null,
            'model'      => $model !== '' ? $model : null,
            'min_year'   => $minYear,
            'max_hours'  => $maxHours,
            'min_hp'     => $minHp,
            'budget_max' => $budgetMax,
        ], static fn(mixed $v): bool => $v !== null && $v !== '');
    }

    /**
     * Scrubs seller names, non-BAM phone numbers, emails, URLs, and unit city/state locations
     * so buyer-facing spec values and highlights are 100% compliant with BAM's Anonymization Protocol.
     */
    public static function scrubBuyerSafeText(string $text, array $unit = []): string
    {
        if (trim($text) === '') {
            return '';
        }

        // Remove explicit seller name if known on the unit
        $seller = trim((string) ($unit['seller_name'] ?? ''));
        if ($seller !== '' && mb_strlen($seller) >= 3) {
            $text = preg_replace('/\b' . preg_quote($seller, '/') . '\b/iu', '', $text) ?? $text;
        }

        // Remove forbidden phrase per BAM brochure directive
        $text = preg_replace('/\bInspection\s+welcome\s+before\s+any\s+deposit\.?\s*/iu', '', $text) ?? $text;

        // Remove non-BAM emails and URLs
        $text = preg_replace('/(?<!sales@bigassmotors\.com)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/iu', '', $text) ?? $text;
        $text = preg_replace('~https?://(?!www\.bigassmotors\.com)\S+~iu', '', $text) ?? $text;

        // Remove non-BAM phone numbers
        $text = preg_replace_callback(
            '/(?:\+?1[\s.\-]?)?\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/u',
            static function (array $m): string {
                $digits = preg_replace('/\D/', '', $m[0]) ?? '';
                if (str_ends_with($digits, '9047675232') || str_ends_with($digits, '9047291051')) {
                    return $m[0];
                }
                return '';
            },
            $text
        ) ?? $text;

        // Remove "Located in City, ST" phrases (except Jacksonville, FL)
        $text = preg_replace(
            '/\b(?:located\s+in|location\s*:?|machine\s+is\s+in|sits\s+in|yard\s+in)\s+(?!Jacksonville)[A-Z][a-zA-Z.\'\s]{1,25},\s*[A-Z]{2}\b/u',
            '',
            $text
        ) ?? $text;

        return trim(preg_replace('/\s{2,}/u', ' ', $text) ?? $text);
    }

    private static function extractYear(mixed $rawYear, string $text): ?int
    {
        $y = self::toInt($rawYear);
        if ($y !== null && $y >= 1970 && $y <= 2035) {
            return $y;
        }
        if (preg_match('/\b(19[89]\d|20[0-3]\d)\b/', $text, $m)) {
            return (int) $m[1];
        }
        return null;
    }

    private static function extractMake(string $rawMake, string $text): string
    {
        $candidates = array_filter([trim($rawMake), $text]);
        foreach ($candidates as $cand) {
            $lower = mb_strtolower($cand);
            if (isset(self::MAKE_ALIASES[$lower])) {
                return self::MAKE_ALIASES[$lower];
            }
            foreach (self::MAKE_ALIASES as $alias => $canonical) {
                if (preg_match('/\b' . preg_quote($alias, '/') . '\b/i', $cand)) {
                    return $canonical;
                }
            }
        }
        return trim($rawMake);
    }

    private static function extractModel(string $rawModel, string $make, string $text): string
    {
        $cleanRaw = trim($rawModel);
        if ($cleanRaw !== '') {
            return $cleanRaw;
        }
        if ($make !== '') {
            $aliases = array_keys(array_filter(self::MAKE_ALIASES, static fn(string $v): bool => $v === $make));
            $pattern = implode('|', array_map(static fn(string $a): string => preg_quote($a, '/'), array_merge([$make], $aliases)));
            if (preg_match('/(?:' . $pattern . ')\s+([A-Z0-9]{1,5}[\-]?[A-Z0-9]{1,8}(?:\s+(?:Quad|S3|Series\s*(?:II|III)?|II|III|XL|LGP|XLT|AT|Mach\s*1))?)/i', $text, $m)) {
                return trim($m[1], " .,-•");
            }
        }
        // Known model patterns (JT20, D24x40, RT125, etc.)
        if (preg_match('/\b((?:JT|AT|RT|RTX|HT)\s?\d{2,4}(?:\s*Quad)?|D\d{1,3}x\d{1,3}(?:\s*S3|II|III)?)\b/i', $text, $m)) {
            return trim($m[1]);
        }
        return '';
    }

    private static function extractCategory(string $rawCategory, string $text, string $model): string
    {
        $combined = trim($rawCategory . ' ' . $model . ' ' . $text);
        foreach (self::CATEGORY_PATTERNS as $regex => $canonical) {
            if (preg_match($regex, $combined)) {
                return $canonical;
            }
        }
        return trim($rawCategory);
    }

    private static function extractHours(mixed $rawHours, string $text): ?float
    {
        $h = self::toFloat($rawHours);
        if ($h !== null && $h > 0) {
            return round($h, 1);
        }
        if (preg_match('/\b(\d{1,3}(?:,\d{3})+|\d{2,5}(?:\.\d)?)\s*(?:original\s+|meter\s+)?(?:hours|hrs|hr)\b/i', $text, $m)) {
            $val = (float) str_replace(',', '', $m[1]);
            if ($val > 0 && $val < 50000) {
                return $val;
            }
        }
        return null;
    }

    /**
     * @param array<string, mixed>      $unit
     * @param array<string, mixed>|null $existing
     */
    private static function extractPrice(array $unit, ?array $existing): ?float
    {
        foreach (['public_price', 'listPrice', 'asking_price', 'price', 'seller_cost_ask', 'askPrice'] as $field) {
            $v = self::toFloat($unit[$field] ?? ($existing[$field] ?? null));
            if ($v !== null && $v > 0) {
                return $v;
            }
        }
        return null;
    }

    /**
     * Extracts horsepower from unit fields, parsed spec rows, description text, or OEM fallback.
     *
     * @param array<string, mixed>      $unit
     * @param array<string, mixed>|null $existing
     * @param array<string, string>     $parsedRows
     * @param array<string, string>     $oemSpecs
     * @return array{0: ?float, 1: ?string}
     */
    private static function extractHorsepower(
        array $unit,
        ?array $existing,
        array $parsedRows,
        string $cleanText,
        array $oemSpecs,
    ): array {
        // 1. Direct numeric field on unit or existing ai_specs
        $direct = self::toFloat($unit['hp'] ?? ($existing['hp'] ?? null));
        if ($direct !== null && $direct > 0) {
            return [$direct, (string) ($existing['hp_source'] ?? 'listing')];
        }

        // 2. Parsed spec rows from description/specifications_text
        foreach ($parsedRows as $k => $v) {
            if (preg_match('/\b(horsepower|power|gross\s+power|net\s+power|engine\s+hp)\b/i', $k)) {
                if (preg_match('/\b(\d{2,4}(?:\.\d)?)\s*(?:hp|horsepower)\b/i', $v, $m) || preg_match('/^(\d{2,4}(?:\.\d)?)$/', trim($v), $m)) {
                    return [(float) $m[1], 'listing'];
                }
            }
        }

        // 3. Free-text regex (excluding small mud-mixing auxiliary engine HP if core drill HP is present)
        if (preg_match_all('/\b(\d{2,4}(?:\.\d)?)\s*(?:gross\s+|net\s+)?(?:hp|horsepower)\b/i', $cleanText, $matches)) {
            $nums = array_map('floatval', $matches[1]);
            $coreHp = max($nums);
            if ($coreHp >= 20.0 && $coreHp <= 2500.0) {
                return [$coreHp, 'listing'];
            }
        }

        // 4. Authoritative OEM fallback (from inc/oem_specs.php)
        foreach ($oemSpecs as $k => $v) {
            if (preg_match('/\b(horsepower|power|gross\s+power|net\s+horsepower)\b/i', $k)) {
                if (preg_match('/\b(\d{2,4}(?:\.\d)?)\s*(?:hp|horsepower)?\b/i', (string) $v, $m)) {
                    return [(float) $m[1], 'oem'];
                }
            }
        }

        return [null, null];
    }

    /**
     * @param array<string, string> $parsedRows
     * @param array<string, string> $oemSpecs
     */
    private static function extractMetricLbs(
        string $cleanText,
        array $parsedRows,
        array $oemSpecs,
        string $textRegex,
        string $keyKeyword,
    ): ?int {
        if (preg_match($textRegex, $cleanText, $m)) {
            return (int) str_replace(',', '', $m[1]);
        }
        foreach ([$parsedRows, $oemSpecs] as $source) {
            foreach ($source as $k => $v) {
                if (stripos($k, $keyKeyword) !== false && preg_match('/(\d{1,3}(?:,\d{3})+|\d{3,6})/', (string) $v, $m)) {
                    return (int) str_replace(',', '', $m[1]);
                }
            }
        }
        return null;
    }

    /**
     * Parses free-form descriptions and spec blocks into `rows` (key => value) and `bullets`.
     *
     * @return array{rows: array<string, string>, bullets: list<string>}
     */
    public static function parseStructuredText(string $text): array
    {
        $rows = [];
        $bullets = [];
        $lines = preg_split('/\R/u', $text) ?: [];

        foreach ($lines as $rawLine) {
            $line = trim($rawLine);
            if ($line === '') {
                continue;
            }
            $bulletStripped = preg_replace('/^[-•*·–]\s*/u', '', $line, -1, $isBullet) ?? $line;
            if (preg_match('/^([A-Za-z][A-Za-z0-9 \/&().,#-]{1,42}):\s*(.{1,220})$/u', $bulletStripped, $kv)) {
                $k = trim($kv[1]);
                $v = trim($kv[2]);
                if (!preg_match(self::BLOCKED_SPEC_KEYS, $k) && !preg_match('~https?://|@~i', $v)) {
                    $rows[$k] = $v;
                }
                continue;
            }
            if ($isBullet > 0 && mb_strlen($bulletStripped) <= 140) {
                $bullets[] = $bulletStripped;
            }
        }

        return ['rows' => $rows, 'bullets' => $bullets];
    }

    /**
     * Builds the 2-column Technical Specifications grid (up to 26 rows) for Page 2 of the BAM Brochure.
     *
     * @param array<string, mixed>      $unit
     * @param array<string, mixed>|null $existing
     * @param array<string, string>     $parsedRows
     * @param array<string, string>     $oemSpecs
     * @return array<string, string>
     */
    private static function buildSpecGrid(
        array $unit,
        ?array $existing,
        array $parsedRows,
        array $oemSpecs,
        ?int $year,
        string $make,
        string $model,
        ?float $hours,
    ): array {
        $grid = [];
        $ymTitle = trim(($year !== null ? $year . ' ' : '') . $make . ' ' . $model);
        if ($ymTitle !== '') {
            $grid['Year / Model'] = $ymTitle;
        }
        if ($hours !== null) {
            $grid['Hours'] = number_format($hours, $hours == (int) $hours ? 0 : 1);
        }
        if (($unit['undercarriage_pct'] ?? null) !== null && $unit['undercarriage_pct'] !== '') {
            $grid['Undercarriage'] = (int) $unit['undercarriage_pct'] . '% remaining';
        }
        if (($unit['tires_pct'] ?? null) !== null && $unit['tires_pct'] !== '') {
            $grid['Tires'] = (int) $unit['tires_pct'] . '% remaining';
        }

        $existingSpecs = is_array($existing['specs'] ?? null) ? $existing['specs'] : [];
        $seen = array_change_key_case(array_flip(array_keys($grid)), CASE_LOWER);

        foreach ([$existingSpecs, $parsedRows, $oemSpecs] as $source) {
            foreach ($source as $k => $v) {
                $label = trim((string) $k);
                $val = self::scrubBuyerSafeText((string) $v, $unit);
                $lower = mb_strtolower($label);
                if ($label === '' || $val === '' || isset($seen[$lower]) || preg_match(self::BLOCKED_SPEC_KEYS, $label)) {
                    continue;
                }
                $seen[$lower] = 1;
                $grid[$label] = mb_substr($val, 0, 80);
                if (count($grid) >= 26) {
                    break 2;
                }
            }
        }

        return $grid;
    }

    /**
     * Extracts Mud Mixing System and Equipment Trailer sub-systems for Page 2 Dual Cards.
     *
     * @param array<string, string>     $parsedRows
     * @param array<string, mixed>|null $existing
     * @return array<string, array{title: string, specs: array<string, string>}>
     */
    private static function extractSubsystems(string $cleanText, array $parsedRows, ?array $existing): array
    {
        if (is_array($existing['subsystems'] ?? null) && $existing['subsystems'] !== []) {
            return $existing['subsystems'];
        }

        $subsystems = [];

        // 1. Mud Mixing System Detection (e.g. Ditch Witch FM13, FM25, Vermeer MX125, MX240)
        if (preg_match('/\b((?:Ditch\s+Witch\s+|Vermeer\s+)?(?:FM\s?\d{1,3}[A-Z]?|MX\s?\d{2,3}|FT\s?\d{1,2})\s*(?:mud\s*(?:mixing\s*)?system|fluid\s*mixer)?)\b/i', $cleanText, $m)
            || preg_match('/\b(mud\s+mixing\s+system|mixing\s+system)\b/i', $cleanText, $m)
        ) {
            $rawName = strtoupper(trim($m[1]));
            $title = str_contains($rawName, 'MUD') ? $rawName : $rawName . ' MUD SYSTEM';
            if (str_contains($rawName, 'FM13')) {
                $subsystems['mud_system'] = [
                    'title' => 'DITCH WITCH FM13 MUD SYSTEM',
                    'specs' => [
                        'Engine'       => '13 hp (9.7 kW) gasoline',
                        'Mud flow'     => '200 gpm @ 42-viscosity',
                        'Max flow'     => '300 gpm @ 26-viscosity',
                        'Tank options' => '500 or 1,000 gal (OEM)',
                        'Hoppers'      => '2 — dry additives + liquids',
                    ],
                ];
            } else {
                $subsystems['mud_system'] = [
                    'title' => $title,
                    'specs' => [
                        'Configuration' => 'High-shear venturi fluid mixing system',
                        'Tank / Pump'   => 'Skid/trailer-mounted mud tank & centrifugal pump',
                    ],
                ];
            }
        }

        // 2. Equipment Trailer Detection (e.g. Felling FT-24, FT-30, Belshe, Pintle trailer)
        if (preg_match('/\b((?:Felling|Belshe|Towmaster|Butler|Interstate|Ditch\s+Witch)\s+[A-Z0-9\-]{2,10})\s*(?:equipment\s+)?trailer\b/i', $cleanText, $m)) {
            $trailerModel = strtoupper(trim($m[1]));
            $gvwr = '25,900 lb';
            if (preg_match('/(\d{2},\d{3})\s*(?:lb|lbs)\s*GVWR/i', $cleanText, $gm)) {
                $gvwr = $gm[1] . ' lb';
            }
            $subsystems['trailer'] = [
                'title' => $trailerModel . ' EQUIPMENT TRAILER',
                'specs' => [
                    'GVWR'           => $gvwr,
                    'Axles / brakes' => '2 × 12,000 lb oil bath; electric',
                    'Deck'           => '2 in white oak; 20 ft std.',
                    'Width / tires'  => '102 in OD • 235/75R17.5',
                    'Hitch'          => '3 in adj. lunette eye / pintle',
                ],
            ];
        }

        return $subsystems;
    }

    /**
     * @param array<string, mixed>      $unit
     * @param array<string, mixed>|null $existing
     * @param array<string, array{title: string, specs: array<string, string>}> $subsystems
     * @return list<string>
     */
    private static function buildPackageIncludes(
        array $unit,
        ?array $existing,
        string $cleanText,
        ?int $year,
        string $make,
        string $model,
        ?float $hours,
        array $subsystems,
    ): array {
        if (is_array($existing['package_includes'] ?? null) && $existing['package_includes'] !== []) {
            return array_values(array_map('strval', $existing['package_includes']));
        }

        $items = [];
        $coreTitle = trim(($year !== null ? $year . ' ' : '') . $make . ' ' . $model);
        if ($coreTitle !== '') {
            $items[] = $coreTitle . ($hours !== null ? ' • ' . number_format($hours, 0) . ' hours' : '');
        }

        if (isset($subsystems['mud_system'])) {
            $items[] = ucwords(strtolower($subsystems['mud_system']['title']));
        }
        if (isset($subsystems['trailer'])) {
            $gvwr = $subsystems['trailer']['specs']['GVWR'] ?? '';
            $items[] = ucwords(strtolower($subsystems['trailer']['title'])) . ($gvwr !== '' ? " ({$gvwr} GVWR)" : '');
        }
        if (preg_match('/\b(full\s+rack\s+of\s+(?:rods|drill\s+pipe)|drill\s+pipe\s+included|rods\s+included)\b/i', $cleanText)) {
            $items[] = 'Full rack of rods / drill pipe';
        }

        foreach (preg_split('/[;\n]+/', (string) ($unit['attachments'] ?? '')) ?: [] as $att) {
            $att = self::scrubBuyerSafeText(trim($att), $unit);
            if ($att !== '' && count($items) < 6) {
                $items[] = $att;
            }
        }

        if (preg_match('/\blocator\s*:\s*not\s+included\b|\bno\s+locator\b/i', $cleanText)) {
            $items[] = 'Locator: not included';
        }

        return array_values(array_unique($items));
    }

    /**
     * Builds 6–7 buyer-safe bullet highlights for Page 1 `KEY HIGHLIGHTS` (never includes forbidden deposit text).
     *
     * @param array<string, mixed>      $unit
     * @param array<string, mixed>|null $existing
     * @param list<string>              $parsedBullets
     * @return list<string>
     */
    private static function buildHighlights(
        array $unit,
        ?array $existing,
        array $parsedBullets,
        string $cleanText,
        ?int $year,
        string $model,
        ?float $hours,
        ?int $pullbackLbs,
        ?int $thrustLbs,
        ?int $torqueFtLbs,
        ?float $hp,
    ): array {
        $hl = [];
        if ($hours !== null) {
            $hl[] = 'Only ' . number_format($hours, 0) . ' hours' . ($year || $model ? ' on a ' . trim($year . ' ' . $model) : '') . '.';
        }
        if (preg_match('/\b(full\s+rack\s+of\s+(?:rods|drill\s+pipe))\b/i', $cleanText)) {
            $hl[] = 'Full rack of rods / drill pipe included.';
        }
        if ($pullbackLbs !== null) {
            $hl[] = number_format($pullbackLbs) . ' lb pullback' . ($thrustLbs !== null ? ' • ' . number_format($thrustLbs) . ' lb thrust.' : '.');
        }
        if ($torqueFtLbs !== null) {
            $hl[] = number_format($torqueFtLbs) . ' ft·lb max rotational torque.';
        }
        if ($hp !== null) {
            $hl[] = (int) $hp . ' hp turbo diesel engine.';
        }
        foreach ($parsedBullets as $b) {
            $clean = self::scrubBuyerSafeText($b, $unit);
            if ($clean !== '' && count($hl) < 7) {
                $hl[] = $clean;
            }
        }
        if (preg_match('/\b(starts,\s*runs,\s*tracks|work-?ready)\b/i', $cleanText) && count($hl) < 7) {
            $hl[] = 'Owner reports: starts, runs, tracks & operates.';
        }

        return array_values(array_slice(array_unique($hl), 0, 7));
    }

    /**
     * @param array<string, array{title: string, specs: array<string, string>}> $subsystems
     * @param list<string> $packageIncludes
     */
    private static function buildPackageSubtitle(string $category, array $subsystems, array $packageIncludes): string
    {
        if ($subsystems === []) {
            return $category;
        }
        $parts = ['Drill'];
        if (isset($subsystems['mud_system'])) {
            $parts[] = preg_replace('/\bDITCH\s+WITCH\s+|\s+SYSTEM\b/i', '', $subsystems['mud_system']['title']) ?: 'Mud System';
        }
        if (isset($subsystems['trailer'])) {
            $parts[] = 'Equipment Trailer';
        }
        foreach ($packageIncludes as $inc) {
            if (stripos($inc, 'pipe') !== false || stripos($inc, 'rod') !== false) {
                $parts[] = 'Full Rack of Pipe';
                break;
            }
        }
        $classLabel = stripos($category, 'Drill') !== false ? 'Horizontal Directional Drill Package' : ($category !== '' ? $category . ' Package' : 'Complete Equipment Package');
        return $classLabel . ' — ' . implode(' • ', array_map('trim', $parts));
    }

    private static function stripHtmlAndCss(string $raw): string
    {
        $s = preg_replace('~<script[\s\S]*?</script>|<style[\s\S]*?</style>~i', ' ', $raw) ?? $raw;
        $s = strip_tags($s);
        return html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /** @return array<string, mixed>|null */
    private static function decodeJson(mixed $json): ?array
    {
        if (is_array($json)) {
            return $json;
        }
        if (!is_string($json) || trim($json) === '') {
            return null;
        }
        try {
            $decoded = json_decode($json, true, 16, JSON_THROW_ON_ERROR);
            return is_array($decoded) ? $decoded : null;
        } catch (JsonException) {
            return null;
        }
    }

    private static function toFloat(mixed $v): ?float
    {
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        if (is_string($v)) {
            $clean = str_replace([',', '$', ' '], '', trim($v));
            return is_numeric($clean) ? (float) $clean : null;
        }
        return null;
    }

    private static function toInt(mixed $v): ?int
    {
        $f = self::toFloat($v);
        return $f !== null ? (int) round($f) : null;
    }
}
