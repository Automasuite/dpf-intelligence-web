export function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(header).trim())
  return match?.[1] || null
}
