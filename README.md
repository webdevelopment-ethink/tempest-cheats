# Project Tempest

Marketing + product checkout site with Stripe Payment Links and optional automated key-by-email webhook.

## Development

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host (Netlify, Vercel, Cloudflare Pages, etc.).

## Checkout flow

- `Buy Now` on `/products.html` now opens a dedicated `/checkout.html` page.
- Customer enters email + accepts Terms, then gets redirected to Stripe Payment Link with:
  - `prefilled_email`
  - `client_reference_id` (selected product id)

## Keys, admin & Railway

Shop stays on **AWS S3**. Team admin + automatic key emails run on **Railway** at `admin.yourdomain.com`.

**Full setup (one doc):** [SETUP.md](./SETUP.md) — no Railway app download required.

## Updating links

- **Stripe:** Edit pricing URLs in `index.html` (`#pricing` section).
- **Instagram:** Replace the placeholder `href="#"` on the Instagram social link when you have the URL.
- **Discord / YouTube / TikTok:** Footer and CTA links in `index.html`.

## Assets

UI screenshots live in `public/images/`:

- `arc-aimbot.png`
- `arc-visuals.png`
- `arc-misc.png`
- `arc-world.png`

Favicon: `public/favicon.svg` and `public/favicon.ico`.


## Pages

- `/` Home page
- `/products.html` Arc Raiders products and checkout entry
- `/checkout.html` Dedicated email + payment step
- `/terms.html` Terms of Service
