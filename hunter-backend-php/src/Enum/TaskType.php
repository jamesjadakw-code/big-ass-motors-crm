<?php

declare(strict_types=1);

namespace Bam\Hunter\Enum;

enum TaskType: string
{
    case MatchAlert = 'MATCH_ALERT';
    case FollowUp = 'FOLLOW_UP';
    case Nurture = 'NURTURE';
    case PriceDrop = 'PRICE_DROP';
}
