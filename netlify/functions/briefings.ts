import { briefings } from '../../src/data/mockBriefings';

/**
 * Phase 2 transport. Serves the briefing snapshots as JSON over HTTP so the
 * client fetches them through a real serverless endpoint instead of bundling
 * the data into the app.
 *
 * The payload is still mock — the point of this step is to prove the
 * fetch → normalize → validate → render pipeline end-to-end. Swapping in
 * OpenAI / Search / Supabase happens *inside this function*; the client
 * contract (an array of BriefingRun) never changes.
 *
 * Netlify Functions 2.0: default export, Web Request/Response.
 * Endpoint: /.netlify/functions/briefings
 */
export default async (): Promise<Response> => {
  return new Response(JSON.stringify(briefings), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
};
