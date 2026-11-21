// PostEx shipping link. The PostEx login lives only in Supabase secrets (POSTEX_USER, POSTEX_PASSWORD),
// never in the site. Only signed-in dashboard admins can call this function.
// Actions:
//   test: checks the login works and returns a summary of PostEx's areas and delivery prices.
import { createClient } from 'npm:@supabase/supabase-js@2';

const API = 'https://postex-eg.com/api/shipment.php?action=';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function postex(action: string, extra: Record<string, unknown> = {}) {
  const user = Deno.env.get('POSTEX_USER'), password = Deno.env.get('POSTEX_PASSWORD');
  if (!user || !password) throw new Error('PostEx login is missing from Supabase secrets');
  const res = await fetch(API + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password, ...extra }),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error(`PostEx answered: ${text.slice(0, 200) || res.status}`); }
  if (!res.ok) throw new Error(`PostEx answered ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function test() {
  const sectors = await postex('getAllSectors');
  if (!Array.isArray(sectors)) return { ok: false, message: `PostEx refused: ${JSON.stringify(sectors).slice(0, 200)}` };
  const costs = await postex('getAllDeliveryCost').catch((e) => ({ error: e.message }));
  const govs = new Map<string, number>();
  for (const s of sectors as { gov_name?: string }[]) {
    const g = (s.gov_name || '').trim() || '—';
    govs.set(g, (govs.get(g) || 0) + 1);
  }
  const prices = Array.isArray(costs)
    ? (costs as { costing_delivery?: string }[]).map((c) => Number(c.costing_delivery)).filter((n) => n > 0)
    : [];
  return {
    ok: true,
    areas: sectors.length,
    governorates: [...govs].map(([name, areas]) => ({ name, areas })).sort((a, b) => b.areas - a.areas),
    prices: prices.length ? { count: prices.length, min: Math.min(...prices), max: Math.max(...prices) } : null,
    pricesError: Array.isArray(costs) ? null : JSON.stringify(costs).slice(0, 200),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  // Only dashboard admins.
  const auth = req.headers.get('Authorization') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: admin } = await sb.rpc('is_admin');
  if (!admin) return reply({ error: 'Not authorised' }, 401);

  try {
    const { action } = await req.json().catch(() => ({}));
    if (action === 'test') return reply(await test());
    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    return reply({ ok: false, message: (e as Error).message }, 502);
  }
});
