<?php
declare(strict_types=1);
require __DIR__ . '/bam.php';
require_once BAM_ROOT . '/inc/auth.php';
require_once BAM_ROOT . '/inc/google_auth.php';
start_session();
header('X-Robots-Tag: noindex, nofollow');
$err = '';
$next = (string) ($_GET['next'] ?? $_POST['next'] ?? '');
if (!preg_match('~^/[A-Za-z0-9/_\-.?=&%]*$~', $next) || str_starts_with($next, '//')) { $next = ''; }

if (current_user()) { redirect($next ?: 'index.php'); }
if (!(int) q_val('SELECT COUNT(*) FROM users')) { $err = 'No admin account yet. Run setup.php once to create the first admin.'; }
if (is_post()) {
    csrf_check();
    $email = mb_strtolower(trim((string) ($_POST['email'] ?? '')));
    $pw = (string) ($_POST['password'] ?? '');
    if (login_throttled($email)) {
        audit('login_throttled', '', null, 0, $email);
        $err = 'Too many attempts. Wait 15 minutes and try again.';
    } elseif ($pw !== '' && ($u = verify_account('users', $email, $pw))) {
        crm_session_login($u, 'password');
        redirect($next ?: 'index.php');
    } else {
        record_failed_login($email);
        audit('login_failed', '', null, 0, $email);
        $err = 'Wrong e-mail or password.';
    }
}
$refused = (($_GET['google'] ?? '') === 'refused') ? (string) ($_SESSION['crm_g_refused'] ?? '') : '';
if (!empty($_SESSION['crm_g_msg'])) { $err = (string) $_SESSION['crm_g_msg']; unset($_SESSION['crm_g_msg']); }
require_once BAM_ROOT . '/inc/i18n.php';
i18n_start();
?><!doctype html>
<html lang="<?= h(bam_lang()) ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Log in · BAM CRM</title><link rel="icon" href="<?= h(asset('img/favicon.png')) ?>"><link rel="stylesheet" href="<?= h(asset('css/crm.css')) ?>">
<meta name="theme-color" content="#121212"><link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="BAM CRM"><meta name="application-name" content="BAM CRM"><meta name="apple-mobile-web-app-status-bar-style" content="black"><script src="/assets/bam-intro.js?v=20261003"></script></head>
<body><div class="login-lang"><?= lang_toggle_html('lang-btn') ?></div><div class="login-wrap"><form class="login-card" method="post" autocomplete="on">
<img src="<?= h(asset('img/bam-logo-320.jpg')) ?>" alt="Big Ass Motors">
<div class="side-brand">BIG ASS MOTORS · CRM</div><div class="side-motto">YOU CAN'T DEPOSIT EXCUSES</div>
<?php if ($refused !== ''): ?><div class="flash flash-warn g-refused" data-testid="google-refused"><b>We couldn't sign you in with Google.</b><br>
  The Google account <b><!--i18n:off--><?= h($refused) ?><!--i18n:on--></b> isn't on the Big Ass Motors CRM access list. If you work with us, ask James to add this e-mail address for you — or log in below with your e-mail and password. Thank you!</div><?php endif; ?>
<?php if ($err): ?><div class="flash flash-err"><?= h($err) ?></div><?php endif; ?>
<?= google_crm_button($next) ?>
<?= csrf_field() ?><input type="hidden" name="next" value="<?= h($next) ?>">
<div class="f mb"><label>E-mail</label><input type="email" name="email" required autofocus value="<?= h($_POST['email'] ?? '') ?>"></div>
<div class="f mb"><label>Password</label><input type="password" name="password" required></div>
<button class="btn btn-y" style="width:100%">Log in</button>
<p class="hint mt" style="text-align:center"><a href="<?= h(public_link('')) ?>">← bigassmotors.com</a></p>
</form></div><?= lang_toggle_script() ?></body></html>
