import { send, methodNotAllowed } from '../../_lib/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, ['GET', 'HEAD']);
  return send(res, 200, { ok: true, status: 'alive', timestamp: new Date().toISOString() });
}
