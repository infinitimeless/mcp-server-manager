import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Check if a file exists
 * 
 * @param filePath Path to check
 * @returns Boolean indicating if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default Claude Desktop config path based on OS
 * 
 * @returns The path to the Claude Desktop config file
 */
export function getDefaultClaudeConfigPath(): string {
  const homeDir = os.homedir();
  const isWindows = os.platform() === 'win32';
  
  if (isWindows) {
    return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
  } else {
    // Assume macOS
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
}

/**
 * Read and parse a JSON file
 * 
 * @param filePath Path to the JSON file
 * @returns Parsed JSON object
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw new Error(`Failed to read JSON file ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Write a JSON object to a file
 * 
 * @param filePath Path to write the JSON file
 * @param data Data to write
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  try {
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write JSON file ${filePath}: ${(error as Error).message}`);
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 * 
 * @param dirPath Directory path to ensure exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${(error as Error).message}`);
  }
}

/**
 * Resolve a path, expanding ~ to home directory
 * 
 * @param inputPath Path to resolve
 * @returns Resolved absolute path
 */
export function resolvePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}
