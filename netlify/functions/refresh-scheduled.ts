/**
 * Scheduled function (cron). Every 6 hours it triggers the background generator
 * so the briefing stays fresh even with no visitors. It does no slow work
 * itself — it just kicks the background function and returns.
 */

export default async (): Promise<Response> => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) return new Response('no site URL', { status: 200 });
  try {
    await fetch(`${base}/.netlify/functions/generate-briefing-background`, { method: 'POST' });
  } catch {
    /* fire-and-forget */
  }
  return new Response('regen triggered', { status: 200 });
};

// Netlify reads this to register the cron schedule.
export const config = { schedule: '0 */6 * * *' };
