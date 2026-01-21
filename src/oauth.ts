import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// In-memory stores (would use Redis/SQLite in production)
const clients = new Map<string, OAuthClient>();
const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();

interface OAuthClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  created_at: number;
}

interface AuthCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge?: string;
  code_challenge_method?: string;
  expires_at: number;
}

interface AccessToken {
  token: string;
  client_id: string;
  expires_at: number;
}

const PIN = process.env.MCP_PIN || 'changeme';

// Dynamic Client Registration (RFC 7591)
export function registerClient(metadata: {
  redirect_uris: string[];
  client_name?: string;
}): OAuthClient {
  const client: OAuthClient = {
    client_id: uuidv4(),
    client_secret: uuidv4(),
    redirect_uris: metadata.redirect_uris,
    client_name: metadata.client_name,
    created_at: Date.now(),
  };
  clients.set(client.client_id, client);
  return client;
}

export function getClient(clientId: string): OAuthClient | undefined {
  return clients.get(clientId);
}

// Authorization endpoint helpers
export function createAuthCode(
  clientId: string,
  redirectUri: string,
  codeChallenge?: string,
  codeChallengeMethod?: string
): string {
  const code = uuidv4();
  authCodes.set(code, {
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    expires_at: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
  return code;
}

export function validateAuthCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier?: string
): boolean {
  const authCode = authCodes.get(code);
  if (!authCode) return false;
  if (authCode.client_id !== clientId) return false;
  if (authCode.redirect_uri !== redirectUri) return false;
  if (authCode.expires_at < Date.now()) {
    authCodes.delete(code);
    return false;
  }

  // PKCE validation
  if (authCode.code_challenge) {
    if (!codeVerifier) return false;

    let computed: string;
    if (authCode.code_challenge_method === 'S256') {
      computed = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    } else {
      computed = codeVerifier; // plain method
    }

    if (computed !== authCode.code_challenge) return false;
  }

  authCodes.delete(code); // Single use
  return true;
}

export function createAccessToken(clientId: string): string {
  const token = uuidv4();
  accessTokens.set(token, {
    token,
    client_id: clientId,
    expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });
  return token;
}

export function validateAccessToken(token: string): boolean {
  const accessToken = accessTokens.get(token);
  if (!accessToken) return false;
  if (accessToken.expires_at < Date.now()) {
    accessTokens.delete(token);
    return false;
  }
  return true;
}

export function validatePin(pin: string): boolean {
  return pin === PIN;
}

// Generate the HTML form for PIN entry
export function getAuthorizePage(
  clientId: string,
  redirectUri: string,
  state?: string,
  codeChallenge?: string,
  codeChallengeMethod?: string,
  error?: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Voice MCP - Authorize</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui; max-width: 400px; margin: 50px auto; padding: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; box-sizing: border-box; font-size: 18px; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; cursor: pointer; font-size: 18px; }
    button:hover { background: #0056b3; }
    .error { color: red; margin-bottom: 10px; }
    h1 { font-size: 24px; }
  </style>
</head>
<body>
  <h1>Voice MCP Server</h1>
  <p>Enter your PIN to authorize Claude to execute commands on this VM.</p>
  ${error ? `<p class="error">${error}</p>` : ''}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${clientId}">
    <input type="hidden" name="redirect_uri" value="${redirectUri}">
    <input type="hidden" name="state" value="${state || ''}">
    <input type="hidden" name="code_challenge" value="${codeChallenge || ''}">
    <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod || ''}">
    <input type="password" name="pin" placeholder="Enter PIN" required autofocus>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>
`;
}
