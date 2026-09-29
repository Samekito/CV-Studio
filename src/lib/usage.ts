// Daily generation allowance per user, counted in the usage table (see supabase/migrations/).
// The admin is exempt. The count lives in Postgres so it holds across serverless instances.
import type { SessionUser } from "./auth";
import { log } from "./log";
import { adminClient } from "./supabase";

export function dailyLimit(): number {
  const n = Number(process.env.DAILY_GENERATION_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

// True when a generation was taken from today's allowance.
export async function claimGeneration(user: SessionUser): Promise<boolean> {
  if (user.isAdmin) return true;
  const { data, error } = await adminClient().rpc("claim_generation", { p_user: user.id, p_limit: dailyLimit() });
  if (error) throw new Error(`Usage check failed: ${error.message}`);
  return data === true;
}

export async function releaseGeneration(user: SessionUser): Promise<void> {
  if (user.isAdmin) return;
  const { error } = await adminClient().rpc("release_generation", { p_user: user.id });
  // Losing one refund is harmless; do not turn the original error into a different one.
  if (error) log.warn("usage.refund_failed", { error: error.message });
}

// Read through usage_today(), which uses the database's current_date like claim_generation, so the
// count shown always matches the count the limit enforces. No user id returns everyone's.
export async function usageToday(userId?: string): Promise<Map<string, number>> {
  const { data, error } = await adminClient().rpc("usage_today", { p_user: userId ?? null });
  if (error) throw new Error(`Usage lookup failed: ${error.message}`);
  return new Map((data as { user_id: string; count: number }[]).map((row) => [row.user_id, row.count]));
}
