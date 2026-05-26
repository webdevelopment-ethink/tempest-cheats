# Upload Project Tempest to AWS S3

**Your bucket:** `southernoptimisation.com`  
**Region:** `ap-southeast-2` (Sydney)  
**Test URL after upload:** `http://southernoptimisation.com.s3-website-ap-southeast-2.amazonaws.com`

## Easiest fix (console upload — use this folder)

**Do not upload `dist` or the whole project.**

1. Open Finder → **Desktop → Tempest Cheats → `s3-upload`**
2. In S3 → **Upload** → **Add folder** → select **`s3-upload`** (not `dist`)
3. Click **Upload** and wait for all **20 files** to succeed
4. In the bucket, you must see **`index.html` at the top level** (same level as `assets/` and `images/`)

If you see `dist/index.html` or `s3-upload/index.html`, the site will **not** work. Delete those objects and re-upload using the folder above.

Rebuild this folder anytime:

```bash
cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
./scripts/prepare-s3-upload.sh
```

---

## Bucket must allow public reads

**Permissions → Block public access** — turn **off** all four blocks (for a public website).

**Permissions → Bucket policy** (replace `YOUR-BUCKET-NAME`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
  }]
}
```

---

## Static website hosting

**Properties → Static website hosting → Enable**

| Setting | Value |
|---------|--------|
| Index document | `index.html` |
| Error document | `index.html` |

Open the **Bucket website endpoint** URL shown there (not the `s3.amazonaws.com` object URL).

**Sydney (ap-southeast-2):**

`http://YOUR-BUCKET-NAME.s3-website-ap-southeast-2.amazonaws.com`

---

## CLI upload (after `aws configure`)

```bash
export PATH="$HOME/Library/Python/3.9/bin:$PATH"
aws configure
# Enter Access Key ID, Secret Key, region: ap-southeast-2

cd "/Users/eliasmanolis/Desktop/Tempest Cheats"
chmod +x scripts/deploy-s3.sh
./scripts/deploy-s3.sh YOUR-BUCKET-NAME
```

Create access keys: **IAM → Users → your user → Security credentials → Create access key**.

---

## Still broken?

| Symptom | Fix |
|---------|-----|
| 403 Forbidden | Bucket policy + unblock public access |
| Blank page | `index.html` not at bucket root |
| No CSS / images | Upload full `s3-upload` (all 20 files), including `assets/` and `images/` |
| Old content | Hard refresh or re-upload after `./scripts/prepare-s3-upload.sh` |
