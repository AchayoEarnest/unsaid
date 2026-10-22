// Unsaid safety helpers. Pure functions so they are easy to unit test.
export type Risk = "none" | "support" | "crisis";

const CRISIS = /\b(kill myself|end my life|suicide|want to die|no reason to live|hurt myself)\b/i;
const DISTRESS = /\b(can'?t go on|hopeless|worthless|give up|so alone)\b/i;
const HARMFUL_ADVICE = /\b(you should (kill|hurt) yourself|just end it|nobody would miss you)\b/i;

/** Classify text. Never store the text itself with an alert, only a pointer. */
export function assessRisk(text: string): Risk {
  if (CRISIS.test(text)) return "crisis";
  if (DISTRESS.test(text)) return "support";
  return "none";
}

/** Replies that encourage self-harm are blocked and routed to moderators. */
export function isHarmfulReply(text: string): boolean {
  return HARMFUL_ADVICE.test(text);
}

/** Private contact between minors and adults is never allowed. */
export function canRequestPrivate(from: { isMinor: boolean; blockedBy?: boolean }, to: { isMinor: boolean; allowRequests: boolean }) {
  if (from.blockedBy) return false;
  if (from.isMinor !== to.isMinor) return false;
  return to.allowRequests;
}

/** What the public API may return about a post author. */
export function publicAuthor(p: { identity: "anonymous" | "nickname" | "real_name"; nickname: string; displayName?: string }) {
  if (p.identity === "anonymous") return { label: "Anonymous" };
  return { label: p.identity === "nickname" ? p.nickname : p.displayName ?? p.nickname };
}
