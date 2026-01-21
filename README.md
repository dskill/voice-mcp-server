# Voice MCP Server

A remote MCP (Model Context Protocol) server that enables Claude to execute commands on your machine via voice through the Claude mobile app.

## 🎤 Meta Moment

**This repository was created and committed using the very MCP connector it contains.**

The initial commit was made by Claude through the Claude iOS app, using voice commands to interact with the Bice-box VM via this MCP server. It's MCP all the way down.

## What is this?

This server implements the MCP Streamable HTTP transport with OAuth 2.1 authentication, allowing Claude.ai (including the mobile app) to securely connect to your machine and execute commands.

### Features

- **OAuth 2.1 Authentication** - Secure PIN-based authorization flow
- **MCP Streamable HTTP** - Modern HTTP-based MCP transport
- **Shell Command Execution** - Run any command on the host machine
- **Tmux Integration** - Send keys to and capture output from tmux sessions
- **CORS Support** - Works with Claude.ai web and mobile apps

## Tools Provided

| Tool | Description |
|------|-------------|
| `execute_command` | Run shell commands and get output |
| `tmux_send` | Send keystrokes to a tmux session |
| `tmux_capture` | Capture current tmux pane output |

## Setup

### Prerequisites

- Node.js 18+
- A publicly accessible URL (or tunnel like ngrok/Cloudflare)

### Installation

```bash
npm install
npm run build
```

### Running

```bash
# Set your PIN (required for auth)
export MCP_PIN=your-secret-pin

# Set your public URL
export PUBLIC_URL=https://your-domain.com

# Start the server
npm start
```

### Connecting from Claude

1. Go to Claude.ai Settings → Connectors
2. Add a new MCP connector
3. Enter your server URL (e.g., `https://your-domain.com`)
4. Complete the OAuth flow by entering your PIN
5. Start talking to Claude and use voice commands!

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Claude Mobile  │────▶│  Voice MCP Server │────▶│   Your VM   │
│  (Voice Input)  │◀────│  (OAuth + MCP)    │◀────│  (Commands) │
└─────────────────┘     └──────────────────────┘     └─────────────┘
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/.well-known/oauth-authorization-server` | OAuth 2.1 metadata |
| `/.well-known/oauth-protected-resource` | Protected resource metadata |
| `/oauth/register` | Dynamic client registration |
| `/oauth/authorize` | Authorization endpoint (PIN entry) |
| `/oauth/token` | Token endpoint |
| `/mcp` | MCP JSON-RPC endpoint |
| `/health` | Health check |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `PUBLIC_URL` | Public base URL | Auto-detected |
| `MCP_PIN` | Authorization PIN | `changeme` |

## Security Notes

- Always set a strong `MCP_PIN` in production
- Use HTTPS in production (via reverse proxy or tunnel)
- Tokens expire after 24 hours
- Consider network-level restrictions for sensitive environments

## License

MIT

---

*Built for the [Bice-box](https://github.com/dskill/bice-box) project - a multi-platform, SuperCollider-powered audio/visual guitar effects pedal.*
