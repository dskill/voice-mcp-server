import { executeCommand } from './execute.js';

// Claude Code binary path
const CLAUDE_BINARY = '/home/exedev/.local/bin/claude';

// Task states
export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface ClaudeCodeTask {
  taskId: string;
  prompt: string;
  workingDirectory: string;
  status: TaskStatus;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  tmuxSession: string;
}

// In-memory task storage
const tasks = new Map<string, ClaudeCodeTask>();

// Generate a unique task ID
function generateTaskId(): string {
  return `task-${Date.now()}`;
}

// Get tmux session name for a task
function getTmuxSession(taskId: string): string {
  return `claude-${taskId}`;
}

/**
 * Start a new Claude Code task
 */
export async function startClaudeCodeTask(
  prompt: string,
  workingDirectory: string,
  waitForCompletion: boolean = false,
  timeoutSeconds: number = 300
): Promise<{ taskId: string; status: TaskStatus; output?: string }> {
  const taskId = generateTaskId();
  const tmuxSession = getTmuxSession(taskId);

  // Create the task record
  const task: ClaudeCodeTask = {
    taskId,
    prompt,
    workingDirectory,
    status: 'running',
    startTime: Date.now(),
    tmuxSession,
  };
  tasks.set(taskId, task);

  // Escape the prompt for shell - use base64 to avoid escaping issues
  const promptBase64 = Buffer.from(prompt).toString('base64');

  // Build the Claude command
  const claudeCmd = `cd ${JSON.stringify(workingDirectory)} && echo ${JSON.stringify(promptBase64)} | base64 -d | ${CLAUDE_BINARY} --dangerously-skip-permissions --output-format stream-json --verbose -p -`;

  // Create a new tmux session and run the command
  const createResult = await executeCommand(
    `tmux new-session -d -s ${tmuxSession} -x 200 -y 50 ${JSON.stringify(claudeCmd)}`
  );

  if (createResult.exitCode !== 0) {
    task.status = 'failed';
    task.endTime = Date.now();
    return {
      taskId,
      status: 'failed',
      output: `Failed to start tmux session: ${createResult.stderr}`,
    };
  }

  // If not waiting for completion, return immediately
  if (!waitForCompletion) {
    return { taskId, status: 'running' };
  }

  // Wait for completion
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    // Check if tmux session still exists
    const checkResult = await executeCommand(`tmux has-session -t ${tmuxSession} 2>/dev/null && echo running || echo done`);

    if (checkResult.stdout.trim() === 'done') {
      // Session ended, get final output
      task.status = 'completed';
      task.endTime = Date.now();

      const outputResult = await getClaudeCodeOutput(taskId);
      const outputText = 'output' in outputResult ? outputResult.output : '(no output)';
      return { taskId, status: 'completed', output: outputText };
    }

    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Timeout reached
  return { taskId, status: 'running', output: 'Task still running after timeout' };
}

/**
 * Get the status of a Claude Code task
 */
export async function getClaudeCodeStatus(
  taskId: string
): Promise<{ status: TaskStatus; runtimeSeconds: number; lastOutput: string } | { error: string }> {
  const task = tasks.get(taskId);
  if (!task) {
    return { error: `Task not found: ${taskId}` };
  }

  // Check if tmux session still exists
  const checkResult = await executeCommand(`tmux has-session -t ${task.tmuxSession} 2>/dev/null && echo running || echo done`);

  if (task.status === 'running' && checkResult.stdout.trim() === 'done') {
    task.status = 'completed';
    task.endTime = Date.now();
  }

  const runtimeSeconds = Math.floor(
    ((task.endTime || Date.now()) - task.startTime) / 1000
  );

  // Get last output
  const captureResult = await executeCommand(
    `tmux capture-pane -t ${task.tmuxSession} -p -S -30 2>/dev/null || echo "(session ended)"`
  );

  return {
    status: task.status,
    runtimeSeconds,
    lastOutput: captureResult.stdout || '(no output)',
  };
}

/**
 * Get full output from a Claude Code task
 */
export async function getClaudeCodeOutput(
  taskId: string,
  lines?: number
): Promise<{ output: string; status: TaskStatus } | { error: string }> {
  const task = tasks.get(taskId);
  if (!task) {
    return { error: `Task not found: ${taskId}` };
  }

  // Check if session still exists and update status
  const checkResult = await executeCommand(`tmux has-session -t ${task.tmuxSession} 2>/dev/null && echo running || echo done`);

  if (task.status === 'running' && checkResult.stdout.trim() === 'done') {
    task.status = 'completed';
    task.endTime = Date.now();
  }

  const lineCount = lines || 500;
  const captureResult = await executeCommand(
    `tmux capture-pane -t ${task.tmuxSession} -p -S -${lineCount} 2>/dev/null || echo "(session ended)"`
  );

  return {
    output: captureResult.stdout || '(no output)',
    status: task.status,
  };
}

/**
 * Send a message to a running Claude Code session
 */
export async function sendToClaudeCode(
  taskId: string,
  message: string
): Promise<{ sent: boolean; error?: string }> {
  const task = tasks.get(taskId);
  if (!task) {
    return { sent: false, error: `Task not found: ${taskId}` };
  }

  if (task.status !== 'running') {
    return { sent: false, error: `Task is not running (status: ${task.status})` };
  }

  // Check if session still exists
  const checkResult = await executeCommand(`tmux has-session -t ${task.tmuxSession} 2>/dev/null && echo running || echo done`);

  if (checkResult.stdout.trim() === 'done') {
    task.status = 'completed';
    task.endTime = Date.now();
    return { sent: false, error: 'Task has already completed' };
  }

  // Send the message to the tmux session
  const sendResult = await executeCommand(
    `tmux send-keys -t ${task.tmuxSession} ${JSON.stringify(message)} Enter`
  );

  if (sendResult.exitCode !== 0) {
    return { sent: false, error: `Failed to send: ${sendResult.stderr}` };
  }

  return { sent: true };
}

/**
 * List all Claude Code sessions
 */
export async function listClaudeCodeSessions(): Promise<{
  sessions: Array<{
    taskId: string;
    prompt: string;
    status: TaskStatus;
    runtimeSeconds: number;
    workingDirectory: string;
  }>;
}> {
  // Update status of all running tasks
  for (const task of tasks.values()) {
    if (task.status === 'running') {
      const checkResult = await executeCommand(`tmux has-session -t ${task.tmuxSession} 2>/dev/null && echo running || echo done`);
      if (checkResult.stdout.trim() === 'done') {
        task.status = 'completed';
        task.endTime = Date.now();
      }
    }
  }

  const sessions = Array.from(tasks.values()).map(task => ({
    taskId: task.taskId,
    prompt: task.prompt.substring(0, 100) + (task.prompt.length > 100 ? '...' : ''),
    status: task.status,
    runtimeSeconds: Math.floor(((task.endTime || Date.now()) - task.startTime) / 1000),
    workingDirectory: task.workingDirectory,
  }));

  return { sessions };
}

/**
 * Stop a running Claude Code task
 */
export async function stopClaudeCodeTask(
  taskId: string
): Promise<{ stopped: boolean; error?: string }> {
  const task = tasks.get(taskId);
  if (!task) {
    return { stopped: false, error: `Task not found: ${taskId}` };
  }

  if (task.status !== 'running') {
    return { stopped: false, error: `Task is not running (status: ${task.status})` };
  }

  // Kill the tmux session
  const killResult = await executeCommand(`tmux kill-session -t ${task.tmuxSession} 2>/dev/null`);

  task.status = 'stopped';
  task.endTime = Date.now();

  return { stopped: true };
}
