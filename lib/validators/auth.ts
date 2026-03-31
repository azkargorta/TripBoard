export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(username: string) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string) {
  return password.length >= 8;
}