# Project Tempest — setup steps (in order)

**Confused about Railway?** Read **[RAILWAY-START.md](./RAILWAY-START.md)** first — same steps, simpler wording, uses `southernoptimisation.com`.

**No Railway download** — use [railway.com](https://railway.com) in your browser.  
**Cost:** ~$5/month on Railway after the free trial (shop stays on AWS S3).

Replace `yourdomain.com` with your real domain (e.g. `southernoptimisation.com`).

---

## Before you start (have these ready)

- [ ] GitHub account  
- [ ] Railway account (sign up with GitHub)  
- [ ] Stripe account (API keys)  
- [ ] Resend account ([resend.com](https://resend.com)) — for sending key emails  
- [ ] AWS Route 53 (or wherever your domain DNS is managed)  

---

## Part A — Shop on AWS (skip if your site is already live)

1. In Terminal:

```bash
cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
./scripts/prepare-s3-upload.sh
```

2. Upload the **`s3-upload`** folder to your S3 bucket (not `dist`, not the whole project).  
3. S3 → **Static website hosting** → Index: `index.html` → Error: `index.html`.  
4. Confirm the shop opens at `https://yourdomain.com`.

---

## Part B — Railway (key server + team admin)

### 1. Push code to GitHub

```bash
cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
git init
git add .
git commit -m "Project Tempest"
```

Create a **private** repo on github.com, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

### 2. Deploy on Railway

1. Go to [railway.com](https://railway.com) → sign in with **GitHub**.  
2. **New Project** → **Deploy from GitHub repo** → select this repo.  
3. Wait until the deploy finishes (green / “Active”).

---

### 3. Add storage (so keys are not lost on redeploy)

1. Open your service → **Volumes** → **Add Volume**.  
2. Mount path: `/data`  
3. **Variables** → add: `KEY_DB_PATH` = `/data/keys.db`  
4. Redeploy if Railway asks.

---

### 4. Add environment variables

Service → **Variables** → add each line:

| Variable | Value |
|----------|--------|
| `ADMIN_PASSWORD` | Password for your team (3–4 people) |
| `ADMIN_SESSION_SECRET` | Any long random string |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key |
| `RESEND_API_KEY` | Resend → API Keys |
| `KEY_EMAIL_FROM` | `Project Tempest <keys@yourdomain.com>` (must be verified in Resend) |
| `KEY_EMAIL_REPLY_TO` | Your support email |
| `KEY_DB_PATH` | `/data/keys.db` |
| `NODE_ENV` | `production` |

Leave `STRIPE_WEBHOOK_SECRET` for **step 9**.  
Do **not** add `PORT` — Railway sets it.

---

### 5. Get a temporary Railway URL and test

1. **Settings** → **Networking** → **Generate Domain**.  
2. Open `https://YOUR-APP.up.railway.app/health` — should show `"ok": true`.  
3. Open `https://YOUR-APP.up.railway.app/admin` — log in with `ADMIN_PASSWORD`.

---

### 6. Connect `admin.yourdomain.com` on Railway

1. **Settings** → **Networking** → **Custom Domain**.  
2. Enter: `admin.yourdomain.com`  
3. Copy the **CNAME target** Railway shows.

---

### 7. Add DNS record

In **Route 53** (or your DNS provider):

| Type | Name | Value |
|------|------|--------|
| CNAME | `admin` | *(Railway CNAME target from step 6)* |

Wait 5–30 minutes until Railway shows the domain as active (SSL on).

---

### 8. Test admin on your subdomain

Open: `https://admin.yourdomain.com/admin`  
Log in with `ADMIN_PASSWORD`.

---

### 9. Create Stripe webhook

1. Stripe → **Developers** → **Webhooks** → **Add endpoint**.  
2. URL: `https://admin.yourdomain.com/webhooks/stripe`  
3. Event: **`checkout.session.completed`** only.  
4. Create → copy **Signing secret**.  
5. Railway → **Variables** → add `STRIPE_WEBHOOK_SECRET` = that secret.  
6. Redeploy.

---

### 10. Import license keys (before selling)

1. Open `https://admin.yourdomain.com/admin`  
2. **Import Keys** → choose product (1 / 3 / 7 / 30 day)  
3. Paste keys — **one per line** → **Import**  
4. **Dashboard** → confirm stock shows available keys  

Repeat for each product you sell.

---

### 11. Test a purchase

1. Buy on your site with Stripe **test mode** (or a real small purchase).  
2. Confirm the key email arrives.  
3. **Admin** → **Lookup** → search the buyer’s email to verify.

---

## Done — what to bookmark

| Who | URL |
|-----|-----|
| Customers | `https://yourdomain.com` |
| Your team | `https://admin.yourdomain.com/admin` |

Share the admin URL + `ADMIN_PASSWORD` with your team in Discord (pinned message).

---

## If something breaks

| Problem | Check |
|---------|--------|
| Admin won’t load | Railway deploy logs; `ADMIN_PASSWORD` set? |
| Paid, no email | `RESEND_API_KEY`, `KEY_EMAIL_FROM`, Railway logs |
| Webhook errors | URL exactly `https://admin.yourdomain.com/webhooks/stripe`; `STRIPE_WEBHOOK_SECRET` matches Stripe |
| Keys vanished | Volume `/data` + `KEY_DB_PATH=/data/keys.db` |

Paste the error or a screenshot in Cursor and say which step you’re on.
