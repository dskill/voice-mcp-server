import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function executeCommand(
  command: string,
  cwd?: string
): Promise<ExecuteResult> {
  const options = {
    cwd: cwd || process.env.HOME,
    timeout: 60000, // 60 second timeout
    maxBuffer: 1024 * 1024, // 1MB max output
    shell: '/bin/bash',
  };

  try {
    const { stdout, stderr } = await execAsync(command, options);
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout?.trim() || '',
      stderr: execError.stderr?.trim() || String(error),
      exitCode: execError.code || 1,
    };
  }
}
