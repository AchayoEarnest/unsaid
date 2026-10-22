import { redirect } from "next/navigation";
// The UI lives in public/app.html (progressively wired to the /api routes via public/api.js).
export default function Home() { redirect("/app.html"); }
