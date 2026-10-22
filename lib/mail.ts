// Sends via Resend when RESEND_API_KEY is set; otherwise logs the message (fine for local development).
export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.RESEND_API_KEY) { console.log(`[mail to ${to}] ${subject}\n${text}`); return; }
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? "Unsaid <no-reply@example.com>", to, subject, text }) });
}
