import { randomBytes } from "node:crypto";

const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomString(len: number, alphabet = ID_ALPHABET): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newId(prefix = "m"): string {
  return `${prefix}_${randomString(16)}`;
}

export function newGroupId(): string {
  return randomString(12);
}

export function newToken(): string {
  return `pachat_${randomString(32)}`;
}

// Pairing codes are read aloud and typed by hand: avoid look-alike characters.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPairingCode(): string {
  const a = randomString(4, CODE_ALPHABET);
  const b = randomString(4, CODE_ALPHABET);
  return `${a}-${b}`;
}

export function newInviteCode(): string {
  return randomString(20);
}

export function newCardCode(): string {
  return randomString(12);
}

export function newOpKey(): string {
  return randomString(20);
}

export function newVerifyCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += String(bytes[i] % 10);
  return out;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "group";
}
