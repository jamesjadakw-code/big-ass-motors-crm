<?php

declare(strict_types=1);

// Dependency-free test of the pure scoring function: php tests/scoring-test.php
require __DIR__ . '/../autoload.php';

use Bam\Hunter\Matching\MatchingEngine;

$failures = 0;
$check = static function (string $name, bool $ok) use (&$failures): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . PHP_EOL;
    if (!$ok) {
        $failures++;
    }
};

$listing = [
    'year' => 2018, 'make' => 'Vermeer', 'model' => 'D24x40 S3', 'category' => 'HDD Drill',
    'hours' => 1900, 'hp' => 130, 'asking_price' => 140000,
];

$perfect = ['category' => 'HDD Drill', 'make' => 'Vermeer', 'model' => 'D24x40', 'max_hours' => 2500, 'min_hp' => 120, 'budget_max' => 150000, 'min_year' => 2015];
$check('perfect match scores 100', MatchingEngine::score($listing, $perfect) === 100.0);
$check('perfect match alerts (> 80)', MatchingEngine::score($listing, $perfect) > MatchingEngine::ALERT_THRESHOLD);

$wrongType = ['category' => 'Trencher', 'make' => 'Ditch Witch', 'model' => 'RT125', 'budget_max' => 150000];
$check('wrong equipment scores far below 80', MatchingEngine::score($listing, $wrongType) < 40.0);

$check('no category/make/model never matches', MatchingEngine::score($listing, ['budget_max' => 999999]) === 0.0);
$check('empty requirements score 0', MatchingEngine::score($listing, []) === 0.0);

$overBudget = ['category' => 'HDD Drill', 'make' => 'Vermeer', 'model' => 'D24x40', 'budget_max' => 100000];
$check('over budget drops below alert threshold', MatchingEngine::score($listing, $overBudget) <= MatchingEngine::ALERT_THRESHOLD);

$missingHours = $listing;
unset($missingHours['hours']);
$check('unknown hours earn nothing (not guessed)', MatchingEngine::score($missingHours, $perfect) < 100.0);

// Weights total 100; failing hours (10) and hp (10) leaves exactly 80.0, which must NOT alert.
$exactly80 = ['category' => 'HDD Drill', 'make' => 'Vermeer', 'model' => 'D24x40', 'budget_max' => 150000, 'max_hours' => 100, 'min_hp' => 200];
$s = MatchingEngine::score($listing, $exactly80);
$check("exactly 80.0 does not alert (score {$s})", $s === 80.0 && !($s > MatchingEngine::ALERT_THRESHOLD));

$check('numeric strings with $ and commas parse', MatchingEngine::score($listing, ['model' => 'D24x40', 'budget_max' => '$150,000']) === 100.0);

$check('make alone never matches', MatchingEngine::score($listing, ['make' => 'Vermeer']) === 0.0);
$check('make + price alone never matches', MatchingEngine::score($listing, ['make' => 'Vermeer', 'budget_max' => 150000]) === 0.0);

$cat = ['make' => 'CAT', 'model' => '416C', 'category' => 'Backhoes'];
$check('CAT and Caterpillar are the same make', MatchingEngine::score($cat, ['make' => 'Caterpillar', 'model' => '416C', 'category' => 'Backhoe']) === 100.0);

$check('short listing model does not match by containment', MatchingEngine::score(['model' => '20'], ['model' => 'D20x22']) === 0.0);
$check('short category does not match by containment', MatchingEngine::score(['category' => 'x'], ['category' => 'Excavators']) === 0.0);
$check('equal short models still match', MatchingEngine::score(['model' => 'D7'], ['model' => 'D7']) === 100.0);
$check('same series scores partial credit', MatchingEngine::score(['model' => 'D24x26'], ['model' => 'D24x40']) === 70.0);

// Match timing: only a Live AND verified unit is matched (never an unverified Draft save).
$check('Live + verified is matchable', MatchingEngine::isMatchable(['status' => 'Live', 'verified_at' => '2026-10-20 09:15:00']));
$check('Live but unverified is not matchable', !MatchingEngine::isMatchable(['status' => 'Live', 'verified_at' => null]));
$check('Draft even when verified is not matchable', !MatchingEngine::isMatchable(['status' => 'Draft', 'verified_at' => '2026-10-20 09:15:00']));
$check('zero-date verified_at is not matchable', !MatchingEngine::isMatchable(['status' => 'Live', 'verified_at' => '0000-00-00 00:00:00']));
$check('missing verified_at is not matchable', !MatchingEngine::isMatchable(['status' => 'Live']));

// Horsepower comes from the flat ai_specs `hp` key (SpecParser, OEM-filled or not), else the legacy "Horsepower" entry.
$row = ['year' => 2020, 'make' => 'Ditch Witch', 'model' => 'RT125', 'category' => 'Trenchers', 'hours' => 1140, 'public_price' => 95000];
$check('flat ai_specs hp feeds matching', MatchingEngine::unitSpecs($row + ['ai_specs' => '{"hp":121,"hp_source":"oem"}'])['hp'] === 121.0);
$check('legacy Horsepower entry still works', MatchingEngine::unitSpecs($row + ['ai_specs' => '{"Horsepower":"130 HP"}'])['hp'] === 130.0);
$check('flat hp wins over the legacy entry', MatchingEngine::unitSpecs($row + ['ai_specs' => '{"hp":121,"Horsepower":"130 HP"}'])['hp'] === 121.0);
$check('no hp recorded stays null (not guessed)', MatchingEngine::unitSpecs($row + ['ai_specs' => '{"make":"Ditch Witch"}'])['hp'] === null);
$check('missing ai_specs stays null', MatchingEngine::unitSpecs($row)['hp'] === null);

exit($failures === 0 ? 0 : 1);
