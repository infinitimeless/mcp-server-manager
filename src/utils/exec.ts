import { exec, execFile } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);
export const execFileAsync = promisify(execFile);

/**
 * Execute a command and return the stdout
 * 
 * @param command The command to execute
 * @param cwd The working directory
 * @returns The stdout of the command
 */
export async function executeCommand(command: string, cwd?: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, { cwd });
    return stdout.trim();
  } catch (error) {
    const typedError = error as { stderr?: string; message: string };
    const errorMessage = typedError.stderr || typedError.message;
    throw new Error(`Command execution failed: ${errorMessage}`);
  }
}

/**
 * Execute a file with arguments and return the stdout
 * 
 * @param file The file to execute
 * @param args The arguments to pass to the file
 * @param cwd The working directory
 * @returns The stdout of the command
 */
export async function executeFile(file: string, args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(file, args, { cwd });
    return stdout.trim();
  } catch (error) {
    const typedError = error as { stderr?: string; message: string };
    const errorMessage = typedError.stderr || typedError.message;
    throw new Error(`File execution failed: ${errorMessage}`);
  }
}
