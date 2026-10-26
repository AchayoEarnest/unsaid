// Generates the Unsaid logo files from one shape. Run: node brand/make-icons.mjs
// The mark is the speech bubble the header always used (round on three corners, a sharp tail bottom-left)
// holding a typing indicator that fades out: the moment before something is said.
import fs from "fs";
import sharp from "sharp";

const BUBBLE = "M4 32A28 28 0 0 1 32 4A28 28 0 0 1 60 32A28 28 0 0 1 32 60H8Q4 60 4 56Z"; // 64x64 grid
const DOTS = [[20, 1], [32, 0.7], [44, 0.38]];                                         // x, opacity
const dots = fill => DOTS.map(([x, o]) => `<circle cx="${x}" cy="32" r="4.6" fill="${fill}" fill-opacity="${o}"/>`).join("");
const grad = (id, a, b) => `<linearGradient id="${id}" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const LIGHT = ["#5a46d6", "#c2386a"], DARK = ["#9b8cff", "#ff8fb1"], NAVY = "#0d0f1f";

const out = {
  // Mark on its own, for light backgrounds.
  "public/logo.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Unsaid"><defs>${grad("g", ...LIGHT)}</defs><path d="${BUBBLE}" fill="url(#g)"/>${dots("#fff")}</svg>`,
  // Browser tab icon: follows the system theme.
  "public/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.a{stop-color:${LIGHT[0]}}.b{stop-color:${LIGHT[1]}}.d{fill:#fff}@media (prefers-color-scheme:dark){.a{stop-color:${DARK[0]}}.b{stop-color:${DARK[1]}}.d{fill:${NAVY}}}</style><defs><linearGradient id="g" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" class="a"/><stop offset="1" class="b"/></linearGradient></defs><path d="${BUBBLE}" fill="url(#g)"/>${DOTS.map(([x, o]) => `<circle class="d" cx="${x}" cy="32" r="4.6" fill-opacity="${o}"/>`).join("")}</svg>`,
};
// App icon: bright mark on the app's navy. `pad` keeps the bubble's sharp corner inside the maskable safe zone.
const icon = (rx, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${grad("g", ...DARK)}</defs><rect width="512" height="512" rx="${rx}" fill="${NAVY}"/><g transform="translate(${256 - 32 * scale} ${256 - 32 * scale}) scale(${scale})"><path d="${BUBBLE}" fill="url(#g)"/>${dots(NAVY)}</g></svg>`;
out["brand/icon.svg"] = icon(112, 5.2);
for (const [f, s] of Object.entries(out)) fs.writeFileSync(f, s + "\n");

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
await png(icon(112, 5.2), 192, "public/icon-192.png");
await png(icon(112, 5.2), 512, "public/icon-512.png");
await png(icon(0, 4.4), 512, "public/icon-maskable-512.png");   // full-bleed; the OS applies its own mask
await png(icon(0, 4.8), 180, "public/apple-touch-icon.png");     // iOS rounds the corners itself
await png(out["public/logo.svg"], 1024, "brand/logo-1024.png");  // for social profiles and docs
console.log("icons written");
