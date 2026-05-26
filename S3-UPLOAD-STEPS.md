# What to upload to S3 (southernoptimisation.com)

## Your site looks unstyled (plain HTML)?

**Cause:** `assets/` and/or `images/` were not uploaded. `index.html` works; CSS does not.

Test in browser (should NOT be 404):

- `http://southernoptimisation.com.s3-website-ap-southeast-2.amazonaws.com/assets/index-BnQh0tZy.css`

If that URL is **404**, upload Step 2 and 3 below.

---

# What to upload to S3 (southernoptimisation.com)

**Source folder on your Mac:**

```
Desktop/Tempest Cheats/s3-upload
```

Do **not** upload `dist`, `Tempest Cheats`, or the whole project.

---

## If "Add folder" breaks the site (404)

Use **3 separate uploads** with **Add files** (not Add folder).

### Upload 1 — Root files (bucket top level)

1. S3 → bucket **southernoptimisation.com** → **Upload**
2. **Add files** (not Add folder)
3. Open `s3-upload` on your Mac
4. Select **only these 8 files** (not the folders):

   - `index.html`
   - `favicon.ico`
   - `favicon.svg`
   - `apple-touch-icon.png`
   - `apple-touch-icon-precomposed.png`
   - `icon-192.png`
   - `icon-512.png`
   - `site.webmanifest`
   - `terms.html`

5. Upload → wait for success

### Upload 2 — CSS and JS

1. In the bucket, click **Create folder** → name it `assets` (skip if `assets/` already exists)
2. Open the **`assets`** folder inside the bucket
3. **Upload** → **Add files**
4. On Mac: `s3-upload/assets/` → select **both** files:

   - `index-BH0tto17.js`
   - `index-BnQh0tZy.css`

5. Upload

### Upload 3 — Images

1. Go back to bucket root → **Create folder** → `images` (skip if exists)
2. Open the **`images`** folder inside the bucket
3. **Upload** → **Add files**
4. On Mac: `s3-upload/images/` → **Cmd+A** to select all **10** files
5. Upload

---

## Final check in S3

Bucket root must show:

```
index.html
assets/          (folder with 2 files inside)
images/          (folder with 10 files inside)
favicon.ico
... (other root files)
```

**Wrong (causes 404):**

```
s3-upload/index.html
dist/index.html
```

---

## Refresh upload folder anytime

```bash
cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
./scripts/prepare-s3-upload.sh
```

Then repeat the 3 uploads above.
