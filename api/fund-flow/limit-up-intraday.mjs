import { handleLimitUpIntraday } from '../../scripts/fund-flow-proxy.mjs';

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.writeHead(405, {
      'content-type': 'application/json; charset=utf-8',
      allow: 'GET'
    });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  await handleLimitUpIntraday(url, res);
}
