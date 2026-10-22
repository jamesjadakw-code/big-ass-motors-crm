<?php

declare(strict_types=1);

namespace Bam\Hunter\Enum;

enum SourceType: string
{
    case FbMarketplace = 'FB_MARKETPLACE';
    case MachineryTrader = 'MACHINERY_TRADER';
    case PrivateImport = 'PRIVATE_IMPORT';
}
