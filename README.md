# Voice MCP Server

A remote MCP (Model Context Protocol) server that enables Claude to execute commands on your machine via voice through the Claude mobile app.

## 🎤 Meta Moment

**This repository was created and committed using the very MCP connector it contains.**

The initial commit was made by Claude through the Claude iOS app, using voice commands to interact with a development VM via this MCP server. The Claude Code management tools were then designed by Claude, implemented by Claude Code, and tested by Claude—through this same server. It's recursion all the way down.

## What is this?

This server implements the MCP Streamable HTTP transport with OAuth 2.1 authentication, allowing Claude.ai (including the mobile app) to securely connect to your machine and execute commands.

### Features

- **OAuth 2.1 Authentication** - Secure PIN-based authorization flow
- **MCP Streamable HTTP** - Modern HTTP-based MCP transport
- **Shell Command Execution** - Run any command on the host machine
- **Tmux Integration** - Send keys to and capture output from tmux sessions
- **Claude Code Management** - Start, monitor, and control Claude Code sessions
- **CORS Support** - Works with Claude.ai web and mobile apps

## Tools Provided

### Shell & Tmux Tools

| Tool | Description |
|------|-------------|
| `execute_command` | Run shell commands and get output |
| `tmux_send` | Send keystrokes to a tmux session |
| `tmux_capture` | Capture current tmux pane output |

### Claude Code Management Tools

| Tool | Description |
|------|-------------|
| `start_claude_code_task` | Start a Claude Code task with a prompt and working directory |
| `get_claude_code_status` | Check task progress, runtime, and last output |
| `get_claude_code_output` | Get full output from a task |
| `send_to_claude_code` | Send a follow-up message to a running session |
| `list_claude_code_sessions` | List all tasks (running and completed) |
| `stop_claude_code_task` | Stop a running task |

## Setup

### Prerequisites

- Node.js 18+
- A publicly accessible URL (or tunnel like ngrok/Cloudflare)
- Claude Code CLI (for Claude Code management tools)

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
┌─────────────────┐     ┌───────────────────┐     ┌─────────────┐
│  Claude Mobile  │────▶│  Voice MCP Server │────▶│   Your VM   │
│  (Voice Input)  │◀────│  (OAuth + MCP)    │◀────│  (Commands) │
└─────────────────┘     └───────────────────┘     └─────────────┘
                                │
                                ▼
                        ┌───────────────┐
                        │  Claude Code  │
                        │  (Agentic)    │
                        └───────────────┘
```

## Example Workflow

```
You (voice): "Create a new reverb effect for my guitar pedal"

Claude:
1. start_claude_code_task({
     prompt: "Create a reverb effect...",
     workingDirectory: "/home/user/effects"
   })
   → Returns: { taskId: "task-123", status: "running" }

2. get_claude_code_status({ taskId: "task-123" })
   → Returns: { status: "running", runtimeSeconds: 15, lastOutput: "..." }

3. get_claude_code_output({ taskId: "task-123" })
   → Returns: { status: "completed", output: "Created reverb.sc..." }

You: "Nice!"
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
- Claude Code runs with `--dangerously-skip-permissions` (designed for VM environments)
- Consider network-level restrictions for sensitive environments

## License

MIT

---

*Built for [Doctor Rock](https://github.com/dskill/bice-box) - a multi-platform, SuperCollider-powered audio/visual guitar effects pedal.*
