<?php
/** /new/ entry shim: same app, same config, same session as /inventory/ (it reuses that folder's locator). */
declare(strict_types=1);
define('BAM_SITE', 'crm');
define('BAM_DOCROOT', __DIR__);
require dirname(__DIR__) . '/inventory/bam_locate.php';
