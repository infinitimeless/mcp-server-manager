import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import path from 'path';
import fs from 'fs/promises';
import { fileExists, resolvePath } from '../../utils/fs.js';
import { executeCommand } from '../../utils/exec.js';

/**
 * Schema for the build-server tool
 */
const buildServerSchema = z.object({
  directory: z.string().min(1).describe("Directory of the MCP server to build"),
});

/**
 * Register the build-server tool with the MCP server
 * 
 * @param server The MCP server instance
 */
export function buildServerTool(server: Server): void {
  server.tool(
    "build-server",
    "Build an existing MCP server from source code",
    {
      directory: z.string().min(1).describe("Directory of the MCP server to build"),
    },
    async (params) => {
      try {
        const { directory } = params;
        
        // Resolve and validate directory
        const fullPath = resolvePath(directory);
        
        // Check if directory exists
        if (!(await fileExists(fullPath))) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: Directory ${fullPath} does not exist.`,
              },
            ],
          };
        }
        
        // Determine project type
        const files = await fs.readdir(fullPath);
        
        if (files.includes("package.json")) {
          // TypeScript/JavaScript project
          await buildTypeScriptProject(fullPath);
          return {
            content: [
              {
                type: "text",
                text: `Successfully built TypeScript MCP server at ${fullPath}`,
              },
            ],
          };
        } else if (files.includes("requirements.txt") || files.includes("pyproject.toml") || files.includes("server.py")) {
          // Python project
          await buildPythonProject(fullPath);
          return {
            content: [
              {
                type: "text",
                text: `Successfully built Python MCP server at ${fullPath}`,
              },
            ],
          };
        } else if (files.includes("pom.xml") || files.includes("build.gradle")) {
          // Java project
          await buildJavaProject(fullPath);
          return {
            content: [
              {
                type: "text",
                text: `Successfully built Java MCP server at ${fullPath}`,
              },
            ],
          };
        } else {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Unable to determine project type in ${fullPath}. Make sure it's a valid MCP server project.`,
              },
            ],
          };
        }
      } catch (error) {
        console.error("Error building server:", error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to build server: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

/**
 * Build a TypeScript MCP server project
 * 
 * @param directory Project directory
 */
async function buildTypeScriptProject(directory: string): Promise<void> {
  try {
    // Install dependencies
    await executeCommand('npm install', directory);
    
    // Build the project
    await executeCommand('npm run build', directory);
  } catch (error) {
    throw new Error(`Failed to build TypeScript project: ${(error as Error).message}`);
  }
}

/**
 * Build a Python MCP server project
 * 
 * @param directory Project directory
 */
async function buildPythonProject(directory: string): Promise<void> {
  try {
    // Check if virtual environment exists, create it if it doesn't
    const venvExists = await fileExists(path.join(directory, '.venv'));
    
    if (!venvExists) {
      try {
        // Try using uv
        await executeCommand('uv venv', directory);
      } catch (error) {
        // Fall back to python -m venv
        await executeCommand('python -m venv .venv', directory);
      }
    }
    
    // Install dependencies
    const hasRequirements = await fileExists(path.join(directory, 'requirements.txt'));
    const hasPyprojectToml = await fileExists(path.join(directory, 'pyproject.toml'));
    
    if (hasRequirements) {
      try {
        // Try using uv
        await executeCommand('uv pip install -r requirements.txt', directory);
      } catch (error) {
        // Fall back to pip
        if (process.platform === 'win32') {
          await executeCommand('.venv\\Scripts\\pip install -r requirements.txt', directory);
        } else {
          await executeCommand('.venv/bin/pip install -r requirements.txt', directory);
        }
      }
    } else if (hasPyprojectToml) {
      try {
        // Try using uv
        await executeCommand('uv pip install -e .', directory);
      } catch (error) {
        // Fall back to pip
        if (process.platform === 'win32') {
          await executeCommand('.venv\\Scripts\\pip install -e .', directory);
        } else {
          await executeCommand('.venv/bin/pip install -e .', directory);
        }
      }
    } else {
      // No dependency file found, try installing mcp at least
      try {
        await executeCommand('uv pip install mcp[cli]', directory);
      } catch (error) {
        // Fall back to pip
        if (process.platform === 'win32') {
          await executeCommand('.venv\\Scripts\\pip install mcp[cli]', directory);
        } else {
          await executeCommand('.venv/bin/pip install mcp[cli]', directory);
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to build Python project: ${(error as Error).message}`);
  }
}

/**
 * Build a Java MCP server project
 * 
 * @param directory Project directory
 */
async function buildJavaProject(directory: string): Promise<void> {
  try {
    // Check if it's a Maven or Gradle project
    const hasPomXml = await fileExists(path.join(directory, 'pom.xml'));
    const hasBuildGradle = await fileExists(path.join(directory, 'build.gradle'));
    
    if (hasPomXml) {
      // Maven project
      await executeCommand('mvn clean package', directory);
    } else if (hasBuildGradle) {
      // Gradle project
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        await executeCommand('gradlew.bat build', directory);
      } else {
        await executeCommand('./gradlew build', directory);
      }
    } else {
      throw new Error('No Maven or Gradle build files found');
    }
  } catch (error) {
    throw new Error(`Failed to build Java project: ${(error as Error).message}`);
  }
}
