import express from 'express';
import {
  registerClient,
  getClient,
  createAuthCode,
  validateAuthCode,
  createAccessToken,
  validateAccessToken,
  validatePin,
  getAuthorizePage,
} from './oauth.js';
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from './mcp.js';

const app = express();

// Trust proxy headers (for X-Forwarded-Proto, X-Forwarded-Host)
app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Public base URL - set via env var or detect from headers
const PUBLIC_URL = process.env.PUBLIC_URL || '';

// Helper to get the public base URL
function getBaseUrl(req: express.Request): string {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = req.get('X-Forwarded-Proto') || req.protocol;
  const host = req.get('X-Forwarded-Host') || req.get('host');
  return `${proto}://${host}`;
}

// CORS middleware - allow Claude.ai
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
    res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log(`  Body: ${JSON.stringify(req.body)}`);
    console.log(`  Auth: ${req.headers.authorization ? 'Bearer ***' : 'none'}`);
  }
  next();
});

// ============================================
// OAuth 2.1 Endpoints
// ============================================

// Well-known OAuth metadata (RFC 8414)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  });
});

// Claude sends MCP requests to this path for some reason - handle it
app.post('/.well-known/oauth-authorization-server', requireAuth, async (req, res) => {
  const request = req.body;
  if (request.method && request.jsonrpc) {
    // It's an MCP request
    const response = await handleMcpRequest(request);
    return res.json(response);
  }
  // Not an MCP request, return error
  res.status(400).json({ error: 'invalid_request' });
});

// Protected Resource Metadata (RFC 9728) - required by Claude
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
  });
});

// Dynamic Client Registration (RFC 7591)
app.post('/oauth/register', (req, res) => {
  const { redirect_uris, client_name } = req.body;

  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uris required' });
  }

  const client = registerClient({ redirect_uris, client_name });
  console.log(`Registered client: ${client.client_id} (${client_name || 'unnamed'})`);

  res.status(201).json({
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uris: client.redirect_uris,
    client_name: client.client_name,
  });
});

// Authorization endpoint - GET shows form
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query;

  if (!client_id || !redirect_uri) {
    return res.status(400).send('Missing client_id or redirect_uri');
  }

  const client = getClient(client_id as string);
  if (!client) {
    return res.status(400).send('Unknown client_id');
  }

  if (!client.redirect_uris.includes(redirect_uri as string)) {
    return res.status(400).send('Invalid redirect_uri');
  }

  res.send(
    getAuthorizePage(
      client_id as string,
      redirect_uri as string,
      state as string,
      code_challenge as string,
      code_challenge_method as string
    )
  );
});

// Authorization endpoint - POST handles PIN submission
app.post('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, pin } = req.body;

  if (!validatePin(pin)) {
    return res.send(
      getAuthorizePage(client_id, redirect_uri, state, code_challenge, code_challenge_method, 'Invalid PIN')
    );
  }

  const code = createAuthCode(client_id, redirect_uri, code_challenge, code_challenge_method);

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);

  console.log(`Auth code issued for client: ${client_id}`);
  res.redirect(redirectUrl.toString());
});

// Token endpoint
app.post('/oauth/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  if (!validateAuthCode(code, client_id, redirect_uri, code_verifier)) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  const accessToken = createAccessToken(client_id);
  console.log(`Access token issued for client: ${client_id}`);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 86400, // 24 hours
  });
});

// ============================================
// MCP Endpoints (Streamable HTTP)
// ============================================

// HEAD for protocol version discovery
app.head('/mcp', (req, res) => {
  res.set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
  res.status(200).end();
});

// Also support HEAD on root
app.head('/', (req, res) => {
  res.set('MCP-Protocol-Version', MCP_PROTOCOL_VERSION);
  res.status(200).end();
});

// GET for server info
app.get('/mcp', (req, res) => {
  res.json({
    name: 'voice-mcp-server',
    version: '1.0.0',
    protocol_version: MCP_PROTOCOL_VERSION,
  });
});

// Auth middleware for MCP endpoints
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
  }

  const token = authHeader.slice(7);
  if (!validateAccessToken(token)) {
    return res.status(401).json({ error: 'invalid_token', error_description: 'Token expired or invalid' });
  }

  next();
}

// POST for MCP requests
app.post('/mcp', requireAuth, async (req, res) => {
  const request = req.body;

  // Handle single request
  if (!Array.isArray(request)) {
    const response = await handleMcpRequest(request);
    return res.json(response);
  }

  // Handle batch requests
  const responses = await Promise.all(request.map(handleMcpRequest));
  res.json(responses);
});

// Also support POST on root for MCP
app.post('/', requireAuth, async (req, res) => {
  const request = req.body;

  if (!Array.isArray(request)) {
    const response = await handleMcpRequest(request);
    return res.json(response);
  }

  const responses = await Promise.all(request.map(handleMcpRequest));
  res.json(responses);
});

// ============================================
// Health check
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Root info
app.get('/', (req, res) => {
  res.json({
    name: 'voice-mcp-server',
    description: 'Remote MCP server for voice control via Claude Mobile',
    mcp_endpoint: '/mcp',
    oauth_metadata: '/.well-known/oauth-authorization-server',
  });
});

// ============================================
// Start server
// ============================================

app.listen(PORT, () => {
  console.log(`Voice MCP Server running on port ${PORT}`);
  console.log(`MCP Protocol Version: ${MCP_PROTOCOL_VERSION}`);
  console.log(`PIN: ${process.env.MCP_PIN ? '(set via MCP_PIN env var)' : 'changeme (default - please set MCP_PIN!)'}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  OAuth metadata: /.well-known/oauth-authorization-server`);
  console.log(`  MCP endpoint:   /mcp`);
  console.log(`  Health check:   /health`);
});
