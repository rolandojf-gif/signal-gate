/**
 * Scheduled function (cron). Once a day it triggers the background generator so
 * the briefing has a freshness floor even with no visitors. On-demand refresh
 * (the app's "Actualizar foto del momento" button) covers everything else. It
 * does no slow work itself — it just kicks the background function and returns.
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

// Netlify reads this to register the cron schedule. Once a day at 06:00 UTC.
export const config = { schedule: '0 6 * * *' };
