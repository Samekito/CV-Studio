// One-time invite codes. The admin gets the code once when it is made and passes it on with
// the app link; sign-up needs the email and the code together. Only a SHA-256 of the code is
// stored (invites.code_hash), which is enough for a random, high-entropy code.
import { createHash, randomBytes } from "node:crypto";

// No 0/O/1/I/L, so a code read out loud or copied by hand survives.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// 12 characters from 31 symbols is about 59 bits: far beyond guessing under the sign-up rate limit.
export function newInviteCode(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// Case and spaces are forgiven, so "abcd efgh jkmn" matches "ABCDEFGHJKMN".
export function normaliseInviteCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(normaliseInviteCode(code)).digest("hex");
}
