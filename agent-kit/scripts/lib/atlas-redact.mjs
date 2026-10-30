// Last line of defence before anything from a hook payload is written down.
// The adapter only ever stores short labels; this strips what must never be
// stored even inside a label (secrets, credentials, e-mails, home paths).
const RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[private-key]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, "[secret]"],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/g, "[secret]"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}/g, "[secret]"],
  [/\bAKIA[0-9A-Z]{12,}/g, "[secret]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, "[secret]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [secret]"],
  [/(:\/\/)[^\s/:@]+:[^\s/@]+@/g, "$1[credentials]@"],
  [/\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|auth|credential)[A-Za-z0-9_.-]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi, "$1=[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\/home\/[^/\s]+/g, "~"],
  [/\/Users\/[^/\s]+/g, "~"],
  [/[A-Za-z]:\\Users\\[^\\\s]+/g, "~"],
  [/\b[A-Fa-f0-9]{32,}\b/g, "[hex]"],
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[blob]"],
];

/** Collapse whitespace, mask secrets and cap the length. Returns undefined for non-strings. */
export function redactText(value, max = 120) {
  if (typeof value !== "string") return undefined;
  let s = value.replace(/\s+/g, " ").trim();
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
