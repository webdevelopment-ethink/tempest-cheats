import { Resend } from "resend";
import { productDisplayName } from "./db.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let resendClient = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export async function sendKeyEmail({ email, productId, keyCode }) {
  const resend = getResend();
  if (!resend || !process.env.KEY_EMAIL_FROM) {
    throw new Error("Email not configured (RESEND_API_KEY, KEY_EMAIL_FROM)");
  }

  const productName = productDisplayName(productId);
  const safeKey = escapeHtml(keyCode);
  const loaderUrl = "https://fellaspanel.com/LoaderDownload/";

  const response = await resend.emails.send({
    from: process.env.KEY_EMAIL_FROM,
    to: [email],
    replyTo: process.env.KEY_EMAIL_REPLY_TO || undefined,
    subject: `Your ${productName} license key`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px">
        <h2 style="margin:0 0 12px">Your purchase is complete</h2>
        <p style="margin:0 0 18px">Thanks for your order — follow the two steps below to get up and running.</p>

        <h3 style="margin:24px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.5px;color:#666">Step 1 — Your license key</h3>
        <p style="font-size:18px;font-weight:700;letter-spacing:1px;padding:12px 16px;background:#f4f4f4;border-radius:8px;margin:0">${safeKey}</p>

        <h3 style="margin:28px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.5px;color:#666">Step 2 — Download the loader</h3>
        <p style="margin:0 0 14px">You'll need the loader to activate your key. Download it from the official link below:</p>
        <p style="margin:0 0 14px">
          <a href="${loaderUrl}"
             style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">
            Download Loader
          </a>
        </p>
        <p style="margin:0 0 18px;font-size:13px;color:#666">
          Or copy and paste this link into your browser:<br>
          <a href="${loaderUrl}" style="color:#0a58ca;word-break:break-all">${loaderUrl}</a>
        </p>

        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
        <p style="margin:0 0 8px">Keep this email safe. If you need help, open a Discord support ticket using the <strong>same email address</strong> you used at checkout.</p>
        <p style="margin:0;font-size:13px;color:#666">Product: ${escapeHtml(productName)}</p>
      </div>
    `,
  });

  // The Resend SDK does NOT throw on invalid API key / bad sender / etc.
  // It returns { data, error } — we have to surface the error explicitly,
  // otherwise the CLI (and the Stripe webhook handler) will think the
  // email succeeded when it silently failed.
  if (response?.error) {
    const err = response.error;
    const message = err.message || err.name || "Resend rejected the email";
    const detail = JSON.stringify(err);
    throw new Error(`Email send failed: ${message} (${detail})`);
  }

  return response;
}
