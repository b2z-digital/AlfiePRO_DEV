export const sanitizePassword = (password: string): string => password.trim();

// Maps a raw auth error message to a clear, member-friendly explanation when it
// relates to the server-side password policy (length or leaked/weak password).
// Returns null when the error is not password-policy related, so callers can
// keep their own handling for other cases.
export const getPasswordPolicyError = (rawMessage?: string): string | null => {
  const msg = (rawMessage || '').toLowerCase();
  if (!msg) return null;

  if (
    msg.includes('weak') ||
    msg.includes('pwned') ||
    msg.includes('leaked') ||
    msg.includes('breach') ||
    msg.includes('compromised') ||
    msg.includes('easy to guess') ||
    msg.includes('commonly used')
  ) {
    return 'This password is too common or has appeared in a known data breach. Please choose a different, less common password.';
  }

  if (
    msg.includes('at least') ||
    msg.includes('minimum') ||
    msg.includes('too short') ||
    msg.includes('should be at least')
  ) {
    return 'That password is too short. Please use at least 6 characters.';
  }

  return null;
};
