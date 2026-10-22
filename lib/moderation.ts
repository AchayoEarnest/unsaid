// Automated first pass. Replace with a real classifier service; keep humans in the loop.
const RULES: [string, RegExp][] = [
  ["harassment", /\b(you('| a)?re (stupid|worthless|pathetic)|shut up|nobody likes you)\b/i],
  ["hate", /\b(go back to your country|subhuman)\b/i],
  ["sexual", /\b(send nudes|sexy pics|hook ?up)\b/i],
  ["spam", /(https?:\/\/\S+.*){2,}|\b(buy now|click here|free money|whatsapp me)\b/i],
  ["contact_grooming", /\b(add me on (snap|insta|telegram)|how old are you|are you alone)\b/i],
];
export function screen(text: string): "approved" | "flagged" {
  return RULES.some(([, r]) => r.test(text)) ? "flagged" : "approved";
}
export const reasons = (text: string) => RULES.filter(([, r]) => r.test(text)).map(([n]) => n);
