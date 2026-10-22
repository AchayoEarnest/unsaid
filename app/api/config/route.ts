export async function GET() { return Response.json({ ws: process.env.WS_URL ?? null, vapid: process.env.VAPID_PUBLIC_KEY ?? null }, { headers: { "Cache-Control": "public, max-age=300" } }); }
