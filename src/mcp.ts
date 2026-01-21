import { executeCommand } from './execute.js';

// MCP Protocol version
export const MCP_PROTOCOL_VERSION = '2025-06-18';

// JSON-RPC types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// MCP Server Info
const SERVER_INFO = {
  name: 'voice-mcp-server',
  version: '1.0.0',
};

const SERVER_CAPABILITIES = {
  tools: {},
};

// Tool definitions
const TOOLS = [
  {
    name: 'execute_command',
    description: 'Execute a shell command on the VM and return the output. Use this to run any command like git, npm, ls, cat, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional, defaults to home)',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'tmux_send',
    description: 'Send keys to a tmux session. Useful for interacting with running processes.',
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'tmux session name (optional, uses default if not specified)',
        },
        keys: {
          type: 'string',
          description: 'Keys/text to send to the tmux session',
        },
      },
      required: ['keys'],
    },
  },
  {
    name: 'tmux_capture',
    description: 'Capture the current output from a tmux pane.',
    inputSchema: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'tmux session name (optional, uses default if not specified)',
        },
        lines: {
          type: 'number',
          description: 'Number of lines to capture (default 50)',
        },
      },
      required: [],
    },
  },
];

// Handle MCP requests
export async function handleMcpRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: SERVER_CAPABILITIES,
        },
      };

    case 'initialized':
      // Client acknowledgment, no response needed but we return success
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call':
      return handleToolCall(id, params as { name: string; arguments?: Record<string, unknown> });

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

async function handleToolCall(
  id: string | number,
  params: { name: string; arguments?: Record<string, unknown> }
): Promise<JsonRpcResponse> {
  const { name, arguments: args } = params;

  try {
    switch (name) {
      case 'execute_command': {
        const command = args?.command as string;
        const cwd = args?.cwd as string | undefined;

        if (!command) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: command' },
          };
        }

        const result = await executeCommand(command, cwd);

        let content = '';
        if (result.stdout) content += result.stdout;
        if (result.stderr) content += (content ? '\n\nSTDERR:\n' : '') + result.stderr;
        if (!content) content = `Command completed with exit code ${result.exitCode}`;

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: content }],
            isError: result.exitCode !== 0,
          },
        };
      }

      case 'tmux_send': {
        const session = (args?.session as string) || '';
        const keys = args?.keys as string;

        if (!keys) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing required parameter: keys' },
          };
        }

        const target = session ? `-t ${session}` : '';
        const result = await executeCommand(`tmux send-keys ${target} ${JSON.stringify(keys)} Enter`);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: result.stderr || 'Keys sent successfully' }],
            isError: result.exitCode !== 0,
          },
        };
      }

      case 'tmux_capture': {
        const session = (args?.session as string) || '';
        const lines = (args?.lines as number) || 50;

        const target = session ? `-t ${session}` : '';
        const result = await executeCommand(
          `tmux capture-pane ${target} -p -S -${lines}`
        );

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: result.stdout || result.stderr || '(empty)' }],
            isError: result.exitCode !== 0,
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown tool: ${name}` },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: String(error) },
    };
  }
}
