import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Initialize the server
const server = new Server(
  {
    name: "mcp-server-manager",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}, // Enable tools capability
    },
  }
);

// Define schemas for our tools
const createServerSchema = z.object({
  name: z.string().min(1).describe("Name of the MCP server to create"),
  language: z.enum(["typescript", "python", "java"]).describe("Programming language to use"),
  directory: z.string().min(1).describe("Directory where the server should be created"),
});

const buildServerSchema = z.object({
  directory: z.string().min(1).describe("Directory of the MCP server to build"),
});

const installServerSchema = z.object({
  directory: z.string().min(1).describe("Directory of the built MCP server"),
  configPath: z.string().optional().describe("Path to Claude Desktop config (optional)"),
});

// Register tools
server.tool(
  "create-server",
  "Create a new MCP server project with proper scaffolding",
  {
    name: z.string().min(1).describe("Name of the MCP server to create"),
    language: z.enum(["typescript", "python", "java"]).describe("Programming language to use"),
    directory: z.string().min(1).describe("Directory where the server should be created"),
  },
  async (params) => {
    try {
      const { name, language, directory } = params;
      
      // Create directory if it doesn't exist
      const fullPath = path.resolve(directory, name);
      await fs.mkdir(fullPath, { recursive: true });
      
      // Create scaffolding based on language
      if (language === "typescript") {
        await createTypeScriptProject(name, fullPath);
      } else if (language === "python") {
        await createPythonProject(name, fullPath);
      } else if (language === "java") {
        await createJavaProject(name, fullPath);
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully created ${language} MCP server project "${name}" at ${fullPath}`,
          },
        ],
      };
    } catch (error) {
      console.error("Error creating server:", error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to create server: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "build-server",
  "Build an existing MCP server from source code",
  {
    directory: z.string().min(1).describe("Directory of the MCP server to build"),
  },
  async (params) => {
    try {
      const { directory } = params;
      const fullPath = path.resolve(directory);
      
      // Check if directory exists
      await fs.access(fullPath);
      
      // Determine build approach based on project files
      const files = await fs.readdir(fullPath);
      
      if (files.includes("package.json")) {
        // TypeScript/JavaScript project
        await buildTypeScriptProject(fullPath);
      } else if (files.includes("requirements.txt") || files.includes("pyproject.toml")) {
        // Python project
        await buildPythonProject(fullPath);
      } else if (files.includes("pom.xml") || files.includes("build.gradle")) {
        // Java project
        await buildJavaProject(fullPath);
      } else {
        throw new Error("Unable to determine project type. Make sure it's a valid MCP server project.");
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully built MCP server at ${fullPath}`,
          },
        ],
      };
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
      const fullPath = path.resolve(directory);
      
      // Check if directory exists
      await fs.access(fullPath);
      
      // Determine server type
      const serverType = await determineServerType(fullPath);
      
      // Get Claude Desktop config path if not provided
      const claudeConfigPath = configPath || await getDefaultClaudeConfigPath();
      
      // Update Claude Desktop config
      await updateClaudeConfig(claudeConfigPath, serverType, fullPath);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully installed MCP server at ${fullPath} in Claude Desktop config at ${claudeConfigPath}`,
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

// Helper functions for creating projects
async function createTypeScriptProject(name: string, directory: string) {
  // Initialize npm project
  await execFileAsync("npm", ["init", "-y"], { cwd: directory });
  
  // Install dependencies
  await execFileAsync("npm", ["install", "@modelcontextprotocol/sdk", "zod"], { cwd: directory });
  await execFileAsync("npm", ["install", "-D", "typescript", "@types/node"], { cwd: directory });
  
  // Create tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "./build",
      rootDir: "./src",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ["src/**/*"],
  };
  
  await fs.writeFile(
    path.join(directory, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2)
  );
  
  // Update package.json
  const packageJson = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf-8")
  );
  
  packageJson.type = "module";
  packageJson.scripts = {
    build: "tsc",
    start: "node build/index.js",
  };
  
  await fs.writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create src directory
  await fs.mkdir(path.join(directory, "src"), { recursive: true });
  
  // Create index.ts with basic MCP server
  const indexContent = `import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Initialize the server
const server = new Server(
  {
    name: "${name}",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}, // Enable tools capability
    },
  }
);

// Example tool
server.tool(
  "hello-world",
  "A simple hello world tool",
  {
    name: z.string().describe("Name to greet"),
  },
  async (params) => {
    try {
      return {
        content: [
          {
            type: "text",
            text: \`Hello, \${params.name}!\`,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: \`Error: \${error instanceof Error ? error.message : String(error)}\`,
          },
        ],
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("${name} MCP server running");
}

main().catch(console.error);
`;

  await fs.writeFile(path.join(directory, "src", "index.ts"), indexContent);
}

async function createPythonProject(name: string, directory: string) {
  // Create virtual environment
  await execFileAsync("uv", ["venv"], { cwd: directory });
  
  // Install dependencies
  await execFileAsync("uv", ["add", "mcp[cli]"], { cwd: directory });
  
  // Create server.py
  const serverName = name.replace(/-/g, "_");
  const serverContent = `from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("${serverName}")

@mcp.tool()
async def hello_world(name: str) -> str:
    """A simple hello world tool.
    
    Args:
        name: Name to greet
    """
    try:
        return f"Hello, {name}!"
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    # Initialize and run the server
    mcp.run(transport='stdio')
`;

  await fs.writeFile(path.join(directory, "server.py"), serverContent);
  
  // Create requirements.txt
  await fs.writeFile(path.join(directory, "requirements.txt"), "mcp[cli]\n");
}

async function createJavaProject(name: string, directory: string) {
  // For Java, creating a basic structure without build system for now
  // In a real implementation, you'd want to use Maven/Gradle templates
  
  // Create src/main/java directory structure
  await fs.mkdir(path.join(directory, "src", "main", "java"), { recursive: true });
  
  // Create a basic Java MCP server class
  const javaPackageName = name.toLowerCase().replace(/-/g, "");
  const javaClassName = name
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  
  const javaContent = `package ${javaPackageName};

import io.modelcontextprotocol.sdk.McpServer;
import io.modelcontextprotocol.sdk.ServerCapabilities;
import io.modelcontextprotocol.sdk.StdioServerTransport;
import io.modelcontextprotocol.sdk.Tool;

import java.util.Map;

public class ${javaClassName}Server {
    public static void main(String[] args) {
        // Create server with capabilities
        var server = McpServer.sync(new StdioServerTransport())
            .serverInfo("${name}", "1.0.0")
            .capabilities(ServerCapabilities.builder()
                .tools(true)
                .build())
            .build();

        // Register a simple hello world tool
        server.addTool(new McpServerFeatures.SyncToolRegistration(
            new Tool("hello-world", "A simple hello world tool", Map.of(
                "name", "string"
            )),
            arguments -> {
                try {
                    String name = (String) arguments.get("name");
                    return new CallToolResult(
                        List.of(new TextContent("text", "Hello, " + name + "!")),
                        false
                    );
                } catch (Exception e) {
                    return new CallToolResult(
                        List.of(new TextContent("text", "Error: " + e.getMessage())),
                        true
                    );
                }
            }
        ));

        // Initialize server
        server.initialize();
        
        System.err.println("${name} MCP server running");
    }
}`;

  await fs.writeFile(
    path.join(directory, "src", "main", "java", `${javaClassName}Server.java`),
    javaContent
  );
  
  // Create a simple pom.xml
  const pomContent = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${javaPackageName}</groupId>
    <artifactId>${name}</artifactId>
    <version>1.0.0</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.modelcontextprotocol.sdk</groupId>
            <artifactId>mcp</artifactId>
            <version>0.7.0</version>
        </dependency>
    </dependencies>
</project>`;

  await fs.writeFile(path.join(directory, "pom.xml"), pomContent);
}

// Helper functions for building projects
async function buildTypeScriptProject(directory: string) {
  // Install dependencies
  await execFileAsync("npm", ["install"], { cwd: directory });
  
  // Build the project
  await execFileAsync("npm", ["run", "build"], { cwd: directory });
}

async function buildPythonProject(directory: string) {
  // Create virtual environment if it doesn't exist
  try {
    await fs.access(path.join(directory, ".venv"));
  } catch {
    await execFileAsync("uv", ["venv"], { cwd: directory });
  }
  
  // Install dependencies
  if (await fileExists(path.join(directory, "requirements.txt"))) {
    await execFileAsync("uv", ["pip", "install", "-r", "requirements.txt"], { cwd: directory });
  } else if (await fileExists(path.join(directory, "pyproject.toml"))) {
    await execFileAsync("uv", ["pip", "install", "-e", "."], { cwd: directory });
  }
}

async function buildJavaProject(directory: string) {
  // Check if it's a Maven or Gradle project
  if (await fileExists(path.join(directory, "pom.xml"))) {
    // Maven project
    await execFileAsync("mvn", ["clean", "package"], { cwd: directory });
  } else if (await fileExists(path.join(directory, "build.gradle"))) {
    // Gradle project
    await execFileAsync("./gradlew", ["build"], { cwd: directory });
  }
}

// Helper functions for installation
async function determineServerType(directory: string) {
  const files = await fs.readdir(directory);
  
  if (files.includes("package.json")) {
    return "nodejs";
  } else if (files.includes("server.py") || files.includes("main.py")) {
    return "python";
  } else if (files.includes("pom.xml") || files.includes("build.gradle")) {
    return "java";
  } else {
    throw new Error("Unable to determine server type");
  }
}

async function getDefaultClaudeConfigPath() {
  // Get home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error("Unable to determine home directory");
  }
  
  // Check if we're on macOS or Windows
  const isWindows = process.platform === "win32";
  
  if (isWindows) {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error("Unable to determine APPDATA directory");
    }
    return path.join(appData, "Claude", "claude_desktop_config.json");
  } else {
    // Assume macOS
    return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
}

async function updateClaudeConfig(configPath: string, serverType: string, serverDir: string) {
  // Create config if it doesn't exist
  let config: any = { mcpServers: {} };
  
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(configContent);
    
    // Ensure mcpServers exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
  } catch (error) {
    // Config doesn't exist or couldn't be parsed, use default
  }
  
  // Get server name from directory
  const serverName = path.basename(serverDir);
  
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
      config.mcpServers[serverName] = {
        command: "uv",
        args: ["--directory", serverDir, "run", "server.py"],
      };
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
    const isMaven = await fileExists(path.join(serverDir, "target"));
    const jarPath = isMaven 
      ? path.join(serverDir, "target") 
      : path.join(serverDir, "build", "libs");
    
    // Find the first jar file
    const files = await fs.readdir(jarPath);
    const jarFile = files.find(file => file.endsWith(".jar"));
    
    if (!jarFile) {
      throw new Error("No jar file found in build directory");
    }
    
    config.mcpServers[serverName] = {
      command: "java",
      args: ["-jar", path.join(jarPath, jarFile)],
    };
  }
  
  // Write updated config
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// Utility function
async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server Manager running");
}

main().catch(console.error);
