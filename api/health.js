const startedAt = Date.now();

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const checks = {
    runtime: 'ok',
    supabaseConfigured: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    agentRouterConfigured: Boolean(process.env.AGENT_ROUTER_URL && process.env.AGENT_ROUTER_API_KEY),
    crmConfigured: Boolean(process.env.DPF_CRM_API_URL && process.env.DPF_CRM_API_KEY),
  };

  // This endpoint deliberately returns configuration presence only.
  // It never exposes secret values, URLs, tokens, or buyer information.
  const optionalIntegrations = [checks.supabaseConfigured, checks.agentRouterConfigured, checks.crmConfigured];
  const configuredCount = optionalIntegrations.filter(Boolean).length;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json({
    ok: true,
    service: 'dpf-intelligence-web',
    status: configuredCount === optionalIntegrations.length ? 'configured' : 'operational_with_pending_integrations',
    checks,
    uptimeMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  });
}
