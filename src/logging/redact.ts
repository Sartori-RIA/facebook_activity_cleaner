const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'cookie',
  'cookies',
  'token',
  'authorization',
  'session',
  'c_user',
  'xs',
  'datr',
  'sb',
  'fr',
]);

const SECRET_PATTERNS = [
  /c_user=[^;\s]+/gi,
  /xs=[^;\s]+/gi,
  /datr=[^;\s]+/gi,
  /sb=[^;\s]+/gi,
  /fr=[^;\s]+/gi,
  /password=[^&\s]+/gi,
  /access_token=[^&\s]+/gi,
  /authorization:\s*\S+/gi,
];

export function sanitizeLogMessage(message: string): string {
  let output = message;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[Redacted]');
  }
  return output;
}

export function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[MaxDepth]';
  }
  if (typeof value === 'string') {
    return sanitizeLogMessage(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry, depth + 1));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SECRET_KEYS.has(key.toLowerCase())
        ? '[Redacted]'
        : sanitizeUnknown(entry, depth + 1);
    }
    return output;
  }
  return value;
}
