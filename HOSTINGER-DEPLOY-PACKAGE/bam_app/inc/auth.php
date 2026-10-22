<?php
declare(strict_types=1);
if (!defined('BAM_APP')) { http_response_code(403); exit; }
require_once __DIR__ . '/roles.php';

const SESSION_IDLE_SECONDS = 8 * 3600;

function current_user(): ?array
{
    start_session();
    static $u = false;
    if ($u !== false) { return $u; }
    $u = null;
    if (!empty($_SESSION['uid'])) {
        if (time() - (int) ($_SESSION['last_seen'] ?? 0) > SESSION_IDLE_SECONDS) {
            try {   // Activity feed: the session ended by inactivity (length = log-in → last click)
                require_once __DIR__ . '/roles.php';
                if (!empty($_SESSION['login_at']) && ($idle = q_one('SELECT id, email, role FROM users WHERE id = ?', [(int) $_SESSION['uid']]))) {
                    audit('session_idle', 'timed out · session ' . crm_session_len((int) ($_SESSION['last_seen'] ?? time()) - (int) $_SESSION['login_at']), $idle);
                }
            } catch (Throwable) {}
            unset($_SESSION['uid'], $_SESSION['login_at']);
            return null;
        }
        $row = q_one('SELECT * FROM users WHERE id = ? AND is_active = 1', [(int) $_SESSION['uid']]);
        // "Force log-out" (Users page) bumps users.session_epoch: every session started before that ends here.
        if ($row && (int) ($row['session_epoch'] ?? 0) !== (int) ($_SESSION['epoch'] ?? 0)) {
            require_once __DIR__ . '/roles.php';
            audit('session_ended', 'session closed by a forced log-out', $row);
            unset($_SESSION['uid'], $_SESSION['epoch']);
            return null;
        }
        if (!$row) { unset($_SESSION['uid']); return null; }
        $_SESSION['last_seen'] = time();
        if (array_key_exists('last_seen_at', $row) && time() - (int) ($_SESSION['seen_db'] ?? 0) > 300) {
            $_SESSION['seen_db'] = time();
            q('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [(int) $row['id']]);
        }
        $row['has_password'] = (string) $row['password_hash'] !== '';
        unset($row['password_hash'], $row['google_sub']);
        $u = $row;
    }
    return $u;
}

/** One place that starts a CRM session (password or Google): new session id, force-logout epoch, last log-in, audit row. */
function crm_session_login(array $u, string $method): void
{
    require_once __DIR__ . '/roles.php';
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    $_SESSION['last_seen'] = time();
    $_SESSION['seen_db'] = time();
    $_SESSION['epoch'] = (int) ($u['session_epoch'] ?? 0);
    $_SESSION['login_at'] = time();
    try {
        q('UPDATE users SET last_login_at = NOW(), last_seen_at = NOW(), last_login_ip = ?, last_login_method = ? WHERE id = ?', [client_ip(), $method, (int) $u['id']]);
    } catch (Throwable) {
        q('UPDATE users SET last_login_at = NOW() WHERE id = ?', [(int) $u['id']]);   // before the update_users migration
    }
    staff_cookie_set((int) $u['id']);   // public site then skips engagement logging for staff
    audit('login', $method, $u);
}

/** "1 h 12 min" / "7 min" — session length for the Activity feed. */
function crm_session_len(int $sec): string
{
    $sec = max(0, $sec);
    return $sec >= 3600 ? intdiv($sec, 3600) . ' h ' . intdiv($sec % 3600, 60) . ' min' : max(1, intdiv($sec, 60)) . ' min';
}

function require_admin(): array
{
    $u = current_user();
    if (!$u) {
        $next = $_SERVER['REQUEST_URI'] ?? '';
        redirect('login.php' . ($next ? '?next=' . rawurlencode($next) : ''));
    }
    header('Cache-Control: no-store, private');
    header('X-Robots-Tag: noindex, nofollow');
    require_once __DIR__ . '/roles.php';
    return $u;
}

function login_throttled(string $email): bool
{
    q('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
    $n = (int) q_val('SELECT COUNT(*) FROM login_attempts WHERE (ip = ? OR email = ?) AND attempted_at > (NOW() - INTERVAL 15 MINUTE)', [client_ip(), $email]);
    return $n >= 8;
}

function record_failed_login(string $email): void
{
    q('INSERT INTO login_attempts (ip, email) VALUES (?, ?)', [client_ip(), mb_substr($email, 0, 190)]);
}

/** Generic password check used by admins and sellers. $table = users|sellers. */
function verify_account(string $table, string $email, string $password): ?array
{
    if (!in_array($table, ['users', 'sellers'], true)) { return null; }
    $row = q_one("SELECT * FROM $table WHERE email = ? AND is_active = 1", [mb_strtolower(trim($email))]);
    // Always run a hash check to keep timing similar for unknown e-mails.
    $hash = $row['password_hash'] ?? '$2y$12$vV3wQV2LlwfBMQqIYpKCmeja6IlPUhmvdzz5gKzlHmQ/QopGxCVEe';
    if (!password_verify($password, $hash) || !$row) { return null; }
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        q("UPDATE $table SET password_hash = ? WHERE id = ?", [password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }
    return $row;
}

function password_problem(string $pw): ?string
{
    if (mb_strlen($pw) < 10) { return 'Password must be at least 10 characters.'; }
    if (mb_strlen($pw) > 200) { return 'Password is too long.'; }
    return null;
}

function logout_all(): void
{
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
    }
    session_destroy();
}
