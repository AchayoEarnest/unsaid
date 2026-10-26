import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { q } from "@/lib/db";
import { handler, err } from "@/lib/http";
// Local-disk storage for development. For production, swap the write for S3/R2 and keep the same checks.
const dir = () => process.env.UPLOAD_DIR ?? "./uploads";
const sniff = (b: Buffer) => b.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg" : b.subarray(0, 4).toString("hex") === "89504e47" ? "image/png"
  : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
export const POST = (req: Request) => handler(req, async me => {
  const f = (await req.formData()).get("file");
  if (!(f instanceof File)) return err("Choose an image first.");
  if (f.size > 2_000_000) return err("Images must be under 2 MB.");
  const buf = Buffer.from(await f.arrayBuffer()), mime = sniff(buf);       // trust the bytes, not the filename
  if (!mime) return err("Please use a JPEG, PNG or WebP image.");
  const [u] = await q<{ id: string }>("INSERT INTO uploads (user_id,mime,bytes) VALUES ($1,$2,$3) RETURNING id", [me.id, mime, buf.length]);
  await mkdir(dir(), { recursive: true }); await writeFile(path.join(dir(), u.id), buf);
  return Response.json({ id: u.id, status: "pending" }, { status: 201 }); // shown publicly only after a moderator approves it
}, { rate: [10, 3600_000] });
