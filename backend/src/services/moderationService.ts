const blockedPatterns = [
  /\bapi[_-]?key\b/i,
  /\bignore (all|previous) instructions\b/i,
  /\breveal (the )?(system prompt|hidden prompt|policy)\b/i
];

export function moderateUserInput(text: string): { allowed: boolean; reason?: string } {
  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) {
      return { allowed: false, reason: "Blocked by server-side moderation policy" };
    }
  }

  return { allowed: true };
}
