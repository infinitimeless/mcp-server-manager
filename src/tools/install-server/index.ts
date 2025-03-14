import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import path from 'path';
import fs from 'fs/promises';
import { fileExists, resolvePath, getDefaultClaudeConfigPath, readJsonFile, writeJsonFile } from '../../utils/fs.js';

/**
 * Schema for the install-server tool
 */
const installServerSchema = z.object({
  directory: z.string().min(1).describe("Directory of the built MCP server"),
  configPath: z.string().optional().describe("Path to Claude Desktop config (optional)"),
});

/**
 * Register the install-server tool with the MCP server
 * 
 * @param server The MCP server instance
 */
export function installServerTool(server: Server): void {
  server.tool(
    "install-server",
    "Install an MCP server for use with clients like Claude Desktop",
    {
      directory: z.string().min(1).describe("Directory of the built MCP server"),
      configPath: z.string().optional().describe("Path to Claude Desktop config (optional)"),
    },
    async (params) => {
      try {
        const { directory, configPath } = params;
        
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
        
        // Determine server type and name
        const serverType = await determineServerType(fullPath);
        const serverName = path.basename(fullPath);
        
        // Get Claude Desktop config path
        const claudeConfigPath = configPath ? resolvePath(configPath) : getDefaultClaudeConfigPath();
        
        // Update Claude Desktop config
        await updateClaudeConfig(claudeConfigPath, serverType, serverName, fullPath);
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully installed MCP server "${serverName}" at ${fullPath} in Claude Desktop config at ${claudeConfigPath}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error installing server:", error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to install server: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}

/**
 * Determine the server type based on the files in the directory
 * 
 * @param directory Project directory
 * @returns Server type: "nodejs", "python", or "java"
 */
async function determineServerType(directory: string): Promise<"nodejs" | "python" | "java"> {
  try {
    const files = await fs.readdir(directory);
    
    if (files.includes("package.json")) {
      return "nodejs";
    } else if (files.includes("server.py") || files.some(file => file.endsWith(".py")) || 
               files.includes("requirements.txt") || files.includes("pyproject.toml")) {
      return "python";
    } else if (files.includes("pom.xml") || files.includes("build.gradle") || 
              (await fileExists(path.join(directory, "target"))) || 
              (await fileExists(path.join(directory, "build", "libs")))) {
      return "java";
    }
    
    throw new Error(`Unable to determine server type in directory: ${directory}`);
  } catch (error) {
    throw new Error(`Failed to determine server type: ${(error as Error).message}`);
  }
}

/**
 * Update Claude Desktop config to include the server
 * 
 * @param configPath Path to Claude Desktop config
 * @param serverType Server type: "nodejs", "python", or "java"
 * @param serverName Name of the server
 * @param serverDir Directory of the server
 */
async function updateClaudeConfig(
  configPath: string, 
  serverType: "nodejs" | "python" | "java", 
  serverName: string, 
  serverDir: string
): Promise<void> {
  try {
    // Create config if it doesn't exist
    let config: any = { mcpServers: {} };
    
    try {
      if (await fileExists(configPath)) {
        config = await readJsonFile<any>(configPath);
        
        // Ensure mcpServers exists
        if (!config.mcpServers) {
          config.mcpServers = {};
        }
      } else {
        // Create config directory if it doesn't exist
        const configDir = path.dirname(configPath);
        await fs.mkdir(configDir, { recursive: true });
      }
    } catch (error) {
      console.error(`Warning: Failed to read config, using default: ${(error as Error).message}`);
    }
    
    // Configure based on server type
    if (serverType === "nodejs") {
      config.mcpServers[serverName] = {
        command: "node",
        args: [path.join(serverDir, "build", "index.js")],
      };
    } else if (serverType === "python") {
      // Determine if server.py or a module path should be used
      const hasPyFile = await fileExists(path.join(serverDir, "server.py"));
      
      if (hasPyFile) {
        try {
          // Try with uv first
          config.mcpServers[serverName] = {
            command: "uv",
            args: ["--directory", serverDir, "run", "server.py"],
          };
        } catch (error) {
          // Fall back to python
          config.mcpServers[serverName] = {
            command: "python",
            args: [path.join(serverDir, "server.py")],
          };
        }
      } else {
        // Assume it's a module
        const moduleName = serverName.replace(/-/g, "_");
        config.mcpServers[serverName] = {
          command: "python",
          args: ["-m", moduleName],
        };
      }
    } else if (serverType === "java") {
      // Determine if it's a Maven or Gradle project
      const hasMavenTarget = await fileExists(path.join(serverDir, "target"));
      const hasGradleBuild = await fileExists(path.join(serverDir, "build", "libs"));
      
      if (hasMavenTarget) {
        // Find the first jar file
        const files = await fs.readdir(path.join(serverDir, "target"));
        const jarFile = files.find(file => file.endsWith("-jar-with-dependencies.jar")) || 
                       files.find(file => file.endsWith(".jar"));
        
        if (!jarFile) {
          throw new Error(`No jar file found in ${path.join(serverDir, "target")}`);
        }
        
        config.mcpServers[serverName] = {
          command: "java",
          args: ["-jar", path.join(serverDir, "target", jarFile)],
        };
      } else if (hasGradleBuild) {
        // Find the first jar file
        const files = await fs.readdir(path.join(serverDir, "build", "libs"));
        const jarFile = files.find(file => file.endsWith(".jar"));
        
        if (!jarFile) {
          throw new Error(`No jar file found in ${path.join(serverDir, "build", "libs")}`);
        }
        
        config.mcpServers[serverName] = {
          command: "java",
          args: ["-jar", path.join(serverDir, "build", "libs", jarFile)],
        };
      } else {
        throw new Error(`No Maven or Gradle build artifacts found in ${serverDir}`);
      }
    }
    
    // Write updated config
    await writeJsonFile(configPath, config);
  } catch (error) {
    throw new Error(`Failed to update Claude Desktop config: ${(error as Error).message}`);
  }
}
