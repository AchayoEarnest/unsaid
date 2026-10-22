import { q } from "@/lib/db";
// Public and cached: crisis resources must work even when signed out.
export async function GET(req: Request) {
  const cc = (new URL(req.url).searchParams.get("country") ?? "").toUpperCase().slice(0, 2);
  const rows = await q("SELECT label,contact,kind FROM help_resources WHERE active AND (country_code=$1 OR country_code IS NULL) ORDER BY (country_code IS NULL), kind", [cc || null]);
  return Response.json({ items: rows }, { headers: { "Cache-Control": "public, max-age=300" } });
}
