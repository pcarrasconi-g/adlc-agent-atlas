const patterns: Array<[RegExp, string]> = [
  [/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]"],
  // This expression intentionally has no capture group: replacement must not retain sk-*.
  [/(?:sk-[A-Za-z0-9_-]{16,})/g, "[REDACTED]"],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]"],
];
export function redact(value: string): string { return patterns.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value); }
export function bounded(value: unknown, max = 200_000): string { return redact(String(value ?? "").slice(0, max)); }
export function redactDeep(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]));
  return value;
}
