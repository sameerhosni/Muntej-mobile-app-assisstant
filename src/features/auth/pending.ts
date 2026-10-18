// Who is mid-sign-in (between "send code" and "verify"). Kept in memory instead of route params:
// a "+966…" phone in a URL param decodes to a space on native, which broke verification.

export type PendingLogin = { phone: string; email?: undefined } | { email: string; phone?: undefined };

let pending: PendingLogin | null = null;

export function setPendingLogin(p: PendingLogin) {
  pending = p;
}

export function getPendingLogin(): PendingLogin | null {
  return pending;
}

export function clearPendingLogin() {
  pending = null;
}
