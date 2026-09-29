// Rate limits for login, sign-up and writes, counted in Postgres (hit_rate_limit in
// supabase/migrations/0002_hardening.sql) so they hold across serverless instances.
// Supabase Auth's own limits count by IP, but it only ever sees this server's IP, so without
// these one attacker could either guess passwords freely or lock every user out at once.
import { log } from "./log";
import { adminClient } from "./supabase";

export type Limit = { key: string; max: number; windowSeconds: number };

const FIFTEEN_MINUTES = 15 * 60;

export const limits = {
  loginByEmail: (email: string): Limit => ({ key: `login:email:${email}`, max: 5, windowSeconds: FIFTEEN_MINUTES }),
  loginByIp: (ip: string): Limit => ({ key: `login:ip:${ip}`, max: 20, windowSeconds: FIFTEEN_MINUTES }),
  signupByIp: (ip: string): Limit => ({ key: `signup:ip:${ip}`, max: 10, windowSeconds: 60 * 60 }),
  writesByUser: (userId: string): Limit => ({ key: `write:user:${userId}`, max: 60, windowSeconds: 60 }),
};

// True when every limit still has room. Each call counts as one attempt against all of them.
export async function withinLimits(...checks: Limit[]): Promise<boolean> {
  const admin = adminClient();
  const results = await Promise.all(
    checks.map(({ key, max, windowSeconds }) =>
      admin.rpc("hit_rate_limit", { p_key: key, p_limit: max, p_window_seconds: windowSeconds }),
    ),
  );
  for (const { error } of results) {
    // Failing open keeps login working if the counter table is unreachable; the log says so.
    if (error) {
      log.error("rate_limit.unavailable", { error: error.message });
      return true;
    }
  }
  const allowed = results.every(({ data }) => data === true);
  if (!allowed) log.warn("rate_limit.hit", { keys: checks.map((c) => c.key.split(":").slice(0, 2).join(":")) });
  return allowed;
}
