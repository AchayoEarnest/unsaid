import webpush from "web-push";
import { q } from "@/lib/db";
// Call every few minutes with: Authorization: Bearer $CRON_SECRET
// Lifts expired sanctions, clears expired sessions and tokens, and sends generic push notifications.
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Forbidden", { status: 403 });
  await q("UPDATE users SET sanction='none', sanction_until=NULL WHERE sanction<>'none' AND sanction_until IS NOT NULL AND sanction_until<now()");
  await q("DELETE FROM sessions WHERE expires_at<now()");
  await q("DELETE FROM auth_tokens WHERE expires_at<now()-interval '1 day'");
  let sent = 0;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const due = await q<{ id: string; endpoint: string; p256dh: string; auth: string }>(`SELECT n.id,s.endpoint,s.p256dh,s.auth FROM notifications n JOIN push_subscriptions s ON s.user_id=n.user_id
      WHERE n.pushed_at IS NULL AND n.read_at IS NULL AND n.created_at>now()-interval '1 hour' LIMIT 200`);
    for (const d of due) {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, "gentle-update").then(() => sent++).catch(async e => { if (e.statusCode === 404 || e.statusCode === 410) await q("DELETE FROM push_subscriptions WHERE endpoint=$1", [d.endpoint]); });
      await q("UPDATE notifications SET pushed_at=now() WHERE id=$1", [d.id]);
    }
  }
  return Response.json({ ok: true, pushed: sent });
}
