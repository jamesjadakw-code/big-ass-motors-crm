<?php

declare(strict_types=1);

namespace Bam\Hunter\Enum;

enum TaskStatus: string
{
    case Pending = 'PENDING';
    case Completed = 'COMPLETED';
    case Snoozed = 'SNOOZED';
}
