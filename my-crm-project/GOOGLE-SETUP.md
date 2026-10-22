# Google setup for Bulk Pitch (one time, about 10 minutes)

Bulk Pitch creates **Gmail drafts** in the **sales@bigassmotors.com** mailbox, each with a personalized feature sheet (PDF)
attached. It never sends anything: you review each draft in Gmail and press Send yourself.

Your CRM needs its own Google sign-in for that mailbox. Only you can create these keys (they belong to your Google account).

## 1. Create the Google project
1. Go to https://console.cloud.google.com signed in as **sales@bigassmotors.com** (or a Workspace admin).
2. Top bar > project picker > **New project** > name it `BAM CRM` > **Create**.

## 2. Turn on the Gmail API
**APIs & Services > Library** > search **Gmail API** > **Enable**.

## 3. Consent screen
**APIs & Services > OAuth consent screen** (shown as "Google Auth Platform" in newer consoles):
- User type: **Internal**. This limits sign-in to your Workspace and avoids Google's app verification.
- App name `BAM CRM`, support email sales@bigassmotors.com.
- Scopes: add `https://www.googleapis.com/auth/gmail.compose` (the only scope the app asks for).

> If "Internal" is not offered, bigassmotors.com is not a Google Workspace organization. Choose **External**, add
> sales@bigassmotors.com under **Test users**, and expect Google's "unverified app" warning on sign-in (click Advanced > continue).

## 4. Create the keys
**APIs & Services > Credentials > Create credentials > OAuth client ID**
- Application type: **Web application**
- **Authorized redirect URI:** `http://localhost:4000/api/google/callback`
  (use the port your API runs on; it must match exactly)
- Create, then copy the **Client ID** and **Client secret**.

## 5. Put them in the CRM
Copy `server/.env.example` to `server/.env` and fill it in:

```
GOOGLE_CLIENT_ID=paste-client-id-here
GOOGLE_CLIENT_SECRET=paste-client-secret-here
GOOGLE_SENDER=sales@bigassmotors.com
```

Then **restart the server** (close and reopen start.bat, or stop and re-run `npm run dev`). `.env` is private: it is never
sent to the browser and is excluded from backups/sharing by `.gitignore`. Do not paste the secret into chat or email.

## 6. Connect
Open **Match Inbox**, tick a buyer, click **Connect Google (sales@bigassmotors.com)**, sign in as sales@ and click Allow.
You come back to the CRM showing "Google connected". If you sign in with any other account, the CRM refuses and saves nothing.

## Using it
1. Pick a unit in Match Inbox. Tick buyers (checkbox on each card, or **Tick top 5** / **Tick all**). Buyers without an email can't be ticked.
2. Click **Draft N emails + feature sheets**. For each buyer the CRM renders a feature sheet addressed to them ("Prepared for…", estimated haul to their city, no internal pricing, no serial) and creates the Gmail draft.
3. A panel lists each result and tries to open every draft in Gmail. Browsers usually allow only the first pop-up, so the panel also has an **Open draft** link per buyer and an **Open all drafts** button. Allowing pop-ups for localhost makes them all open at once.
4. Each buyer's history gets a "Gmail draft created (not sent yet)" note and their card shows **draft ready**.

Up to 25 buyers per click. A failure for one buyer (no email, Gmail error) never stops the others.

## Troubleshooting
| Message | Fix |
|---|---|
| `redirect_uri_mismatch` | The redirect URI in step 4 must be exactly `http://localhost:4000/api/google/callback` (or set `GOOGLE_REDIRECT_URI` in `.env` to what you registered). |
| "Access blocked / app not verified" | Step 3: choose Internal, or add sales@ as a Test user. |
| "Signed in as X, but drafts must come from sales@…" | Sign in with the sales@ account (use a private window if Chrome picks another profile). |
| "Google did not issue a refresh token" | Remove the app at https://myaccount.google.com/permissions and connect again. |
| "Google rejected the saved sign-in" | Click Connect Google again (the saved sign-in was revoked or expired). |
| Drafts open in the wrong Google account | Sign in to sales@ in this browser; the link selects it with `authuser=`. |

To disconnect: click **disconnect** in the bulk bar (or revoke at myaccount.google.com/permissions).
