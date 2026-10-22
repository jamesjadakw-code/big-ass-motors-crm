<?php

declare(strict_types=1);

// Dependency-free test of Bam\Hunter\Parser\SpecParser + MatchingEngine integration:
// php tests/spec-parser-test.php
require __DIR__ . '/../autoload.php';

use Bam\Hunter\Matching\MatchingEngine;
use Bam\Hunter\Parser\SpecParser;

$failures = 0;
$check = static function (string $name, bool $ok) use (&$failures): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . PHP_EOL;
    if (!$ok) {
        $failures++;
    }
};

// 1. Parse the canonical 2018 Ditch Witch JT20 HDD Package listing
$rawJt20 = [
    'title'       => '2018 Ditch Witch JT20 Horizontal Directional Drill Package',
    'year'        => 2018,
    'make'        => 'Ditch Witch',
    'model'       => 'JT20',
    'category'    => 'Directional Drills',
    'hours'       => 1542,
    'public_price'=> 175000,
    'seller_name' => 'Secret Florida Contractor LLC',
    'description' => "2018 Ditch Witch JT20 horizontal directional drill offered as a complete HDD package with a Ditch Witch FM13 mud mixing system, a Felling FT-24 equipment trailer (25,900 lb GVWR) and a full rack of drill pipe. 1,542 hours on a 20,000 lb class rack-and-pinion drill with automatic pipe loader, rubber tracks and a 74 hp Deutz diesel. 17,000 lb thrust, 2,200 ft-lb torque. Located in Orlando, FL. Call seller at 407-555-0199. Inspection welcome before any deposit. Owner reports the unit starts, runs, tracks and operates.",
];

$parsedJt20 = SpecParser::parseUnit($rawJt20);

$check('extracts year/make/model/hours/hp/price for MatchingEngine',
    $parsedJt20['year'] === 2018
    && $parsedJt20['make'] === 'Ditch Witch'
    && $parsedJt20['model'] === 'JT20'
    && $parsedJt20['hours'] === 1542.0
    && $parsedJt20['hp'] === 74.0
    && $parsedJt20['asking_price'] === 175000.0
);

$check('extracts pullback (20,000 lb), thrust (17,000 lb) and torque (2,200 ft-lb)',
    ($parsedJt20['pullback_lbs'] ?? null) === 20000
    && ($parsedJt20['thrust_lbs'] ?? null) === 17000
    && ($parsedJt20['torque_ft_lbs'] ?? null) === 2200
);

$check('detects FM13 Mud System and Felling FT-24 Trailer subsystems for Page 2 brochure cards',
    isset($parsedJt20['subsystems']['mud_system'])
    && isset($parsedJt20['subsystems']['trailer'])
    && $parsedJt20['subsystems']['mud_system']['title'] === 'DITCH WITCH FM13 MUD SYSTEM'
);

$scrubbedDesc = SpecParser::scrubBuyerSafeText($rawJt20['description'], $rawJt20);
$check('scrubs seller name, non-BAM phone, Orlando FL location, and forbidden deposit phrase',
    !str_contains($scrubbedDesc, 'Secret Florida Contractor')
    && !str_contains($scrubbedDesc, '407-555-0199')
    && !str_contains($scrubbedDesc, 'Orlando, FL')
    && !str_contains($scrubbedDesc, 'Inspection welcome before any deposit')
);

// 2. OEM Horsepower Fallback when listing has no HP in text
$rt125NoHp = [
    'year'              => 2020,
    'make'              => 'Ditch Witch',
    'model'             => 'RT125 Quad',
    'category'          => 'Trenchers',
    'hours'             => 1140,
    'seller_cost_ask'   => 95000,
    'description'       => 'Quad-track trencher in great working condition.',
];
$oemRt125 = ['Engine' => 'Cummins F3.8 diesel', 'Horsepower' => '121 hp', 'Basic Unit Weight' => 'Approx. 15,300 lb'];
$parsedRt125 = SpecParser::parseUnit($rt125NoHp, $oemRt125);

$check('falls back to OEM horsepower (121 hp) and tags hp_source = oem',
    ($parsedRt125['hp'] ?? null) === 121.0 && ($parsedRt125['hp_source'] ?? null) === 'oem'
);

// 3. Parse historical Lead row into `leads.requirements` and score against parsed unit
$legacyLead = [
    'machine' => '2017 Ditch Witch JT20',
    'brand'   => 'Ditch Witch',
    'type'    => 'Directional Drills',
    'message' => 'Looking for a JT20 drill package under $185k with under 2,000 hours',
];
$req = SpecParser::parseLeadRequirements($legacyLead);
$score = MatchingEngine::score($parsedJt20, $req);

$check("legacy lead requirements parse and score 100.0 against parsed JT20 (got {$score})", $score === 100.0);

// 3b. Title-only parse: "2008 CAT 320" gives year, make and model and nothing else.
$t = SpecParser::parseTitle('2008 CAT 320');
$check('title "2008 CAT 320" => year 2008, make Caterpillar, model 320',
    ($t['year'] ?? null) === 2008 && ($t['make'] ?? null) === 'Caterpillar' && ($t['model'] ?? null) === '320'
);
$check('title-only parse does not invent category, hours, hp or price',
    !isset($t['category']) && !isset($t['hours']) && !isset($t['hp']) && !isset($t['asking_price'])
);
$check('title-only parse fills hp from OEM only, tagged oem',
    (SpecParser::parseTitle('2008 CAT 320', ['Horsepower' => '121 hp'])['hp'] ?? null) === 121.0
    && (SpecParser::parseTitle('2008 CAT 320', ['Horsepower' => '121 hp'])['hp_source'] ?? null) === 'oem'
);
$check('title-only parse ignores the description',
    SpecParser::parseTitle(SpecParser::unitTitle(['title' => '2008 CAT 320', 'description' => '74 hp Deutz, 1,542 hours, $50,000'])) === $t
);
$check('blank title falls back to Year Make Model', SpecParser::unitTitle(['title' => '', 'year' => 2008, 'make' => 'CAT', 'model' => '320']) === '2008 CAT 320');

// 4. Non-destructive merge: OEM hp fills only a missing hp and keeps every existing key.
$oemFilled = json_decode(SpecParser::mergeIntoAiSpecs('{"Engine":"Cummins F3.8","notes":"keep me"}', $parsedRt125), true);
$check('merge adds hp = 121 with hp_source = oem and keeps existing keys',
    ($oemFilled['hp'] ?? null) === 121.0 && ($oemFilled['hp_source'] ?? null) === 'oem'
    && ($oemFilled['Engine'] ?? null) === 'Cummins F3.8' && ($oemFilled['notes'] ?? null) === 'keep me'
);
$verifiedHp = json_decode(SpecParser::mergeIntoAiSpecs('{"hp":135,"hp_source":"manual"}', $parsedRt125), true);
$check('merge never overwrites an existing hp', ($verifiedHp['hp'] ?? null) === 135 && ($verifiedHp['hp_source'] ?? null) === 'manual');

// 5. Brochure rules: parsed buyer-facing blocks never carry the forbidden phrase or the unit's city/state.
$blocks = json_encode([$parsedJt20['highlights'] ?? [], $parsedJt20['package_includes'] ?? [], $parsedJt20['package_subtitle'] ?? '', $parsedJt20['specs'] ?? []]);
$check('parsed brochure blocks omit "Inspection welcome before any deposit"', stripos((string) $blocks, 'inspection welcome') === false);
$check('parsed brochure blocks omit the unit city/state (Orlando, FL)', stripos((string) $blocks, 'orlando') === false);

exit($failures === 0 ? 0 : 1);
