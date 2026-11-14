// Follows Google Maps short links (maps.app.goo.gl) to the full URL that contains coordinates.
export const config = { runtime: 'edge' };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
export default async function handler(req) {
  const target = new URL(req.url).searchParams.get('url');
  let u; try { u = new URL(target); } catch { return json({ error: 'Not a URL' }, 400); }
  if (!/^(maps\.app\.goo\.gl|goo\.gl|g\.co|www\.google\.[a-z.]+|google\.[a-z.]+|maps\.google\.[a-z.]+)$/i.test(u.hostname)) return json({ error: 'Only Google Maps links can be resolved.' }, 400);
  try {
    let url = u.href;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 Diorama' } });
      const loc = r.headers.get('location');
      if (!loc) { if (r.status === 200 && i === 0) { const html = await r.text(); const m = html.match(/https:\/\/www\.google\.[^"'\s]+\/maps\/[^"'\s]+/); if (m) url = m[0].replace(/\\u0026/g, '&'); } break; }
      url = new URL(loc, url).href;
      if (/@-?\d+\.\d+,-?\d+\.\d+|!3d-?\d/.test(url)) break;
    }
    return json({ url });
  } catch (e) { return json({ error: e.message }, 502); }
}
