// WebAuthn Relying Party configuration
export const RP_NAME = 'Flaneur';
export const RP_ID = process.env.NODE_ENV === 'production' ? 'readflaneur.com' : 'localhost';
export const RP_ORIGIN = process.env.NODE_ENV === 'production'
  ? 'https://readflaneur.com'
  : 'http://localhost:3000';

// Challenge TTL in minutes
export const CHALLENGE_TTL_MINUTES = 5;
