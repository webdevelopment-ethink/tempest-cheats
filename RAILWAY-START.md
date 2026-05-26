# Railway setup — start here (simple version)

**You already finished Part A** (shop on AWS at `southernoptimisation.com`).

**What’s left:** put the **key server + admin panel** on Railway so Stripe payments automatically email license keys.

You only need a **browser** — no Railway desktop app.

---

## The big picture (30 seconds)

```
Customer pays on yourdomain.com (AWS S3)
        ↓
Stripe sends webhook → admin.yourdomain.com (Railway)
        ↓
Railway picks a key from database → Resend emails it to buyer
        ↓
You manage keys at admin.yourdomain.com/admin
```

For you, use **`southernoptimisation.com`** everywhere it says `yourdomain.com`.

---

## Step 1 — GitHub (10 min)

Railway deploys from GitHub. In **Terminal**:

```bash
cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
git init
git add .
git commit -m "Project Tempest"
```

1. Open [github.com/new](https://github.com/new)  
2. Name: e.g. `tempest-cheats`  
3. **Private** repo → Create (empty, no README)  
4. Copy the repo URL, then:

```bash
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/tempest-cheats.git
git branch -M main
git push -u origin main
```

*(GitHub may ask you to sign in in the browser.)*

**Done when:** you see your files on github.com in that repo.

---

## Step 2 — Railway project (5 min)

1. Go to [railway.com](https://railway.com) → **Login with GitHub**  
2. **New Project** → **Deploy from GitHub repo**  
3. Pick **`tempest-cheats`** (or whatever you named it)  
4. Wait until status is **Active** / green (first deploy can take 2–5 min)

**Done when:** Railway shows a running service (not “crashed”).

If it crashes: open the service → **Deployments** → latest → **View logs**. Often missing env vars — that’s OK until Step 4.

---

## Step 3 — Volume (keys survive redeploys) (3 min)

1. Click your **service** (the box under the project)  
2. Tab **Volumes** → **Add Volume**  
3. **Mount path:** `/data`  
4. **Variables** tab → **New Variable**  
   - Name: `KEY_DB_PATH`  
   - Value: `/data/keys.db`  
5. If Railway offers **Redeploy**, click it

**Done when:** Volume shows mounted at `/data`.

---

## Step 4 — Environment variables (10 min)

Still on the service → **Variables** → **RAW Editor** (or add one by one).

Replace placeholders with your real values:

| Variable | What to put |
|----------|-------------|
| `ADMIN_PASSWORD` | A strong password your team will share (e.g. `TempestTeam2026!`) |
| `ADMIN_SESSION_SECRET` | Long random string (see below) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → **Secret key** (`sk_live_...` or `sk_test_...` for testing) |
| `RESEND_API_KEY` | [resend.com](https://resend.com) → API Keys → Create |
| `KEY_EMAIL_FROM` | `Project Tempest <keys@southernoptimisation.com>` *(must verify domain in Resend first)* |
| `KEY_EMAIL_REPLY_TO` | Your support email |
| `KEY_DB_PATH` | `/data/keys.db` |
| `NODE_ENV` | `production` |

**Do not add yet:** `STRIPE_WEBHOOK_SECRET` (Step 8).

**Suggested session secret** (copy this or run `openssl rand -hex 32`):

```
3a14090d9e67b5b44a09e7439024e667e255d0dff187c93d85ce2f3eb21a0617
```

After saving variables → **Redeploy** if Railway doesn’t auto-redeploy.

**Done when:** deploy is green again.

---

## Step 5 — Test Railway URL (2 min)

1. Service → **Settings** → **Networking** → **Generate Domain**  
2. You get something like: `https://tempest-cheats-production-xxxx.up.railway.app`  
3. Open in browser:  
   - `https://YOUR-APP.up.railway.app/health` → should show `"ok": true`  
   - `https://YOUR-APP.up.railway.app/admin` → login with `ADMIN_PASSWORD`

**Done when:** admin login works on the `.railway.app` URL.

---

## Step 6 — Custom domain `admin.southernoptimisation.com` (15 min)

### On Railway

1. **Settings** → **Networking** → **Custom Domain**  
2. Enter: `admin.southernoptimisation.com`  
3. Copy the **CNAME target** Railway shows (e.g. `something.up.railway.app`)

### On Route 53 (or your DNS)

1. Hosted zone for **southernoptimisation.com**  
2. **Create record**  
   - Type: **CNAME**  
   - Name: `admin`  
   - Value: *(paste Railway’s CNAME target)*  
   - TTL: 300  
3. Save

Wait **5–30 minutes**. Railway should show the custom domain as **Active** with SSL.

**Done when:** `https://admin.southernoptimisation.com/admin` loads and you can log in.

---

## Step 7 — Stripe webhook (5 min)

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**  
2. **Endpoint URL:**  
   `https://admin.southernoptimisation.com/webhooks/stripe`  
3. **Events:** select only **`checkout.session.completed`**  
4. Create → copy **Signing secret** (`whsec_...`)  
5. Railway → **Variables** → add:  
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`  
6. **Redeploy**

**Done when:** Stripe webhook shows recent deliveries as successful after a test payment.

---

## Step 8 — Import keys before selling (5 min)

1. Open `https://admin.southernoptimisation.com/admin`  
2. **Import Keys** → pick product (1 / 3 / 7 / 30 day)  
3. Paste keys **one per line** → **Import**  
4. **Dashboard** → stock should show available keys  

Repeat for each product you sell.

---

## Step 9 — Test purchase

1. On your site, buy with Stripe **test mode** (or a small real charge)  
2. Check buyer email for the key  
3. Admin → **Lookup** → search buyer email  

---

## Bookmarks

| Who | URL |
|-----|-----|
| Customers | https://southernoptimisation.com |
| Your team | https://admin.southernoptimisation.com/admin |

---

## What I (Cursor) cannot do for you

These need **your** logins in the browser:

- Creating the GitHub repo and pushing (you run `git push` once)  
- Clicking through railway.com  
- Stripe / Resend / Route 53 dashboards  

After **Step 1** (code on GitHub), tell me your repo name and I can help fix deploy errors from logs.

---

## Quick fixes

| Problem | Fix |
|---------|-----|
| Railway build fails | Check **Deployments** logs; ensure `package.json` has `start:server` |
| `/health` not ok | Add all variables from Step 4; redeploy |
| Admin 401 | Wrong `ADMIN_PASSWORD` |
| Paid, no email | Resend domain verified? `KEY_EMAIL_FROM` matches? Check Railway logs |
| Webhook failed | URL must be exactly `https://admin.southernoptimisation.com/webhooks/stripe` |
