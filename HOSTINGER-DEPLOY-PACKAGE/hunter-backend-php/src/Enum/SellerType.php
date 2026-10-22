<?php

declare(strict_types=1);

namespace Bam\Hunter\Enum;

enum SellerType: string
{
    case PrivateSeller = 'PRIVATE';
    case Dealer = 'DEALER';
}
