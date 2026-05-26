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

  return resend.emails.send({
    from: process.env.KEY_EMAIL_FROM,
    to: [email],
    replyTo: process.env.KEY_EMAIL_REPLY_TO || undefined,
    subject: `Your ${productName} license key`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:520px">
        <h2>Your purchase is complete</h2>
        <p>Thanks for your order. Here is your license key:</p>
        <p style="font-size:18px;font-weight:700;letter-spacing:1px;padding:12px 16px;background:#f4f4f4;border-radius:8px">${safeKey}</p>
        <p>Keep this email safe. If you need help, open a Discord support ticket using the <strong>same email address</strong> you used at checkout.</p>
        <p style="font-size:13px;color:#666">Product: ${escapeHtml(productName)}</p>
      </div>
    `,
  });
}
