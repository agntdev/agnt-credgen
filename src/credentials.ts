export type PasswordPolicy = "standard" | "strong" | "maximum";

export interface UserSettings {
  username_pattern: string;
  password_policy: PasswordPolicy;
  max_batch_size: number;
  include_csv_header: boolean;
}

export interface CredentialItem {
  username: string;
  password: string;
}

export interface CredentialBatch {
  timestamp: number;
  items: CredentialItem[];
  note?: string;
}

export interface CredentialData {
  settings: UserSettings;
  batches: CredentialBatch[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  username_pattern: "account{n}",
  password_policy: "strong",
  max_batch_size: 25,
  include_csv_header: true,
};

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SAVED_BATCHES = 100;

let clock: () => number = () => Date.now();

/** Single time seam for retention logic; tests can replace it without changing production code. */
export function now(): number {
  return clock();
}

export function setClockForTesting(replacement: () => number): void {
  clock = replacement;
}

export function dataFor(data: CredentialData | undefined, current = now()): CredentialData {
  const cleanBatches = (data?.batches ?? []).filter((batch) => batch.timestamp >= current - RETENTION_MS);
  return {
    settings: { ...DEFAULT_SETTINGS, ...data?.settings },
    batches: cleanBatches.slice(-MAX_SAVED_BATCHES),
  };
}

export function validatePattern(value: string): string | undefined {
  if (value.length < 3 || value.length > 40) return "Use 3–40 characters.";
  if (!value.includes("{n}")) return "Include {n} so every username is unique.";
  if (!/^[a-z0-9._{}-]+$/.test(value)) return "Use lowercase letters, numbers, dots, hyphens, underscores, and {n}.";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "Dots cannot start, end, or repeat.";
  return undefined;
}

export function usernameFor(pattern: string, sequence: number): string {
  return pattern.replaceAll("{n}", String(sequence));
}

function randomIndex(upperExclusive: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]! % upperExclusive;
}

function take(chars: string): string {
  return chars[randomIndex(chars.length)]!;
}

export function createPassword(policy: PasswordPolicy): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*+-_";
  const length = policy === "standard" ? 14 : policy === "strong" ? 18 : 24;
  const required = [take(lower), take(upper), take(digits), take(symbols)];
  const alphabet = lower + upper + digits + symbols;
  while (required.length < length) required.push(take(alphabet));
  for (let i = required.length - 1; i > 0; i--) {
    const swap = randomIndex(i + 1);
    [required[i], required[swap]] = [required[swap]!, required[i]!];
  }
  return required.join("");
}

export function makeBatch(settings: UserSettings, size: number, current = now()): CredentialBatch {
  const seed = Math.floor(current / 1000) * 1000;
  return {
    timestamp: current,
    items: Array.from({ length: size }, (_, index) => ({
      username: usernameFor(settings.username_pattern, seed + index + 1),
      password: createPassword(settings.password_policy),
    })),
  };
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function formatCsv(batch: CredentialBatch, includeHeader: boolean): string {
  const lines = batch.items.map((item) => `${csvCell(item.username)},${csvCell(item.password)}`);
  return (includeHeader ? ["username,password", ...lines] : lines).join("\n") + "\n";
}

export function formatText(batch: CredentialBatch): string {
  return batch.items.map((item) => `${item.username} | ${item.password}`).join("\n") + "\n";
}

export function preview(batch: CredentialBatch): string {
  const shown = batch.items.slice(0, 3).map((item) => `${item.username} | ${item.password}`).join("\n");
  return batch.items.length > 3 ? `${shown}\n…plus ${batch.items.length - 3} more in the files.` : shown;
}
