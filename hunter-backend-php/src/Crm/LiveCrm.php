<?php

declare(strict_types=1);

namespace Bam\Hunter\Crm;

/**
 * Conventions of the live CRM that Hunter reads but does not own (leads.lead_status, inventory.status,
 * call_log, tw_assign). Everything here is a hard-coded SQL fragment or value, never user input.
 */
final class LiveCrm
{
    /**
     * SQL condition on the CRM's free-text `leads.lead_status` ("new", "contacted", "lost", ...): true while a lead
     * is still being worked. Add any new closing status here, lower-case.
     */
    public const ACTIVE_LEAD = "LOWER(TRIM(lead_status)) NOT IN ('lost', 'won', 'closed', 'dead', 'sold')";

    /** The CRM keys a database lead as "db:<leads.id>" in call_log, tw_assign and tw_tasks. */
    public const LEAD_KEY_PREFIX = 'db:';

    /** call_log.kind of a contact a rep actually logged (the other kinds are drafts and suggestions). */
    public const CALL_LOGGED = 'log';

    /** Only units with this `inventory.status` are offered to buyers. */
    public const LIVE_UNIT_STATUS = 'Live';

    /**
     * SQL condition: the unit has been verified in the CRM (`inventory.verified_at` is set by hub/verify.php).
     * A unit is only matched when it is Live AND verified, never on an unverified Draft save.
     */
    public const VERIFIED_UNIT = 'verified_at IS NOT NULL';
}
