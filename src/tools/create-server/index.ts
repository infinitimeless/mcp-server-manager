import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import path from 'path';
import fs from 'fs/promises';
import { fileExists, resolvePath, ensureDir } from '../../utils/fs.js';
import { executeFile, executeCommand } from '../../utils/exec.js';

/**
 * Schema for the create-server tool
 */
const createServerSchema = z.object({
  name: z.string().min(1).describe("Name of the MCP server to create"),
  language: z.enum(["typescript", "python", "java"]).describe("Programming language to use"),
  directory: z.string().min(1).describe("Directory where the server should be created"),
});

/**
 * Register the create-server tool with the MCP server
 * 
 * @param server The MCP server instance
 */
export function createServerTool(server: Server): void {
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
        
        // Resolve and validate directory
        const resolvedDir = resolvePath(directory);
        const fullPath = path.join(resolvedDir, name);
        
        // Check if the directory already exists
        if (await fileExists(fullPath)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: Directory ${fullPath} already exists. Please choose a different name or directory.`,
              },
            ],
          };
        }
        
        // Create directory
        await ensureDir(fullPath);
        
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
}

/**
 * Create a TypeScript MCP server project
 * 
 * @param name Project name
 * @param directory Project directory
 */
async function createTypeScriptProject(name: string, directory: string) {
  try {
    // Initialize npm project
    await executeCommand('npm init -y', directory);
    
    // Install dependencies
    await executeCommand('npm install @modelcontextprotocol/sdk zod', directory);
    await executeCommand('npm install -D typescript @types/node', directory);
    
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
    const packageJsonPath = path.join(directory, "package.json");
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    
    packageJson.type = "module";
    packageJson.scripts = {
      build: "tsc",
      start: "node build/index.js",
    };
    
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create src directory
    const srcDir = path.join(directory, "src");
    await ensureDir(srcDir);
    
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

    await fs.writeFile(path.join(srcDir, "index.ts"), indexContent);
    
    // Create README
    const readmeContent = `# ${name}

An MCP server created with mcp-server-manager.

## Development

Install dependencies:
\`\`\`bash
npm install
\`\`\`

Build the server:
\`\`\`bash
npm run build
\`\`\`

Run the server:
\`\`\`bash
npm start
\`\`\`

## Using with Claude Desktop

Add this server to your Claude Desktop configuration (\`~/Library/Application Support/Claude/claude_desktop_config.json\` on MacOS or \`%APPDATA%\\Claude\\claude_desktop_config.json\` on Windows):

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "node",
      "args": ["${path.join(directory, "build", "index.js")}"]
    }
  }
}
\`\`\`
`;

    await fs.writeFile(path.join(directory, "README.md"), readmeContent);
  } catch (error) {
    throw new Error(`Failed to create TypeScript project: ${(error as Error).message}`);
  }
}

/**
 * Create a Python MCP server project
 * 
 * @param name Project name
 * @param directory Project directory
 */
async function createPythonProject(name: string, directory: string) {
  try {
    // Create virtual environment
    try {
      await executeCommand('uv venv', directory);
    } catch (error) {
      // Fall back to python -m venv if uv is not available
      await executeCommand('python -m venv .venv', directory);
    }
    
    // Create requirements.txt
    await fs.writeFile(
      path.join(directory, "requirements.txt"),
      "mcp[cli]\n"
    );
    
    // Install dependencies
    try {
      await executeCommand('uv pip install -r requirements.txt', directory);
    } catch (error) {
      // Fall back to pip if uv is not available
      if (process.platform === 'win32') {
        await executeCommand('.venv\\Scripts\\pip install -r requirements.txt', directory);
      } else {
        await executeCommand('.venv/bin/pip install -r requirements.txt', directory);
      }
    }
    
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
    
    // Create README
    const readmeContent = `# ${name}

An MCP server created with mcp-server-manager.

## Development

Activate the virtual environment:

\`\`\`bash
# On Windows
.venv\\Scripts\\activate

# On MacOS/Linux
source .venv/bin/activate
\`\`\`

Run the server:
\`\`\`bash
python server.py
\`\`\`

## Using with Claude Desktop

Add this server to your Claude Desktop configuration (\`~/Library/Application Support/Claude/claude_desktop_config.json\` on MacOS or \`%APPDATA%\\Claude\\claude_desktop_config.json\` on Windows):

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "uv",
      "args": ["--directory", "${directory}", "run", "server.py"]
    }
  }
}
\`\`\`
`;

    await fs.writeFile(path.join(directory, "README.md"), readmeContent);
  } catch (error) {
    throw new Error(`Failed to create Python project: ${(error as Error).message}`);
  }
}

/**
 * Create a Java MCP server project
 * 
 * @param name Project name
 * @param directory Project directory
 */
async function createJavaProject(name: string, directory: string) {
  try {
    // Create src/main/java directory structure
    const javaPackageName = name.toLowerCase().replace(/-/g, "");
    const javaClassName = name
      .split("-")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    
    const mainJavaDir = path.join(directory, "src", "main", "java", ...javaPackageName.split("."));
    await ensureDir(mainJavaDir);
    
    // Create a basic Java MCP server class
    const javaContent = `package ${javaPackageName};

import io.modelcontextprotocol.sdk.McpServer;
import io.modelcontextprotocol.sdk.ServerCapabilities;
import io.modelcontextprotocol.sdk.transport.StdioServerTransport;
import io.modelcontextprotocol.sdk.types.CallToolResult;
import io.modelcontextprotocol.sdk.types.TextContent;
import io.modelcontextprotocol.sdk.types.Tool;

import java.util.List;
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
      path.join(mainJavaDir, `${javaClassName}Server.java`),
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
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.modelcontextprotocol.sdk</groupId>
            <artifactId>mcp</artifactId>
            <version>0.7.0</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>17</source>
                    <target>17</target>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-assembly-plugin</artifactId>
                <version>3.6.0</version>
                <configuration>
                    <descriptorRefs>
                        <descriptorRef>jar-with-dependencies</descriptorRef>
                    </descriptorRefs>
                    <archive>
                        <manifest>
                            <mainClass>${javaPackageName}.${javaClassName}Server</mainClass>
                        </manifest>
                    </archive>
                </configuration>
                <executions>
                    <execution>
                        <id>make-assembly</id>
                        <phase>package</phase>
                        <goals>
                            <goal>single</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>`;

    await fs.writeFile(path.join(directory, "pom.xml"), pomContent);
    
    // Create README
    const readmeContent = `# ${name}

An MCP server created with mcp-server-manager.

## Development

Build the server:
\`\`\`bash
mvn clean package
\`\`\`

Run the server:
\`\`\`bash
java -jar target/${name}-1.0.0-jar-with-dependencies.jar
\`\`\`

## Using with Claude Desktop

Add this server to your Claude Desktop configuration (\`~/Library/Application Support/Claude/claude_desktop_config.json\` on MacOS or \`%APPDATA%\\Claude\\claude_desktop_config.json\` on Windows):

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "java",
      "args": ["-jar", "${path.join(directory, "target", name + "-1.0.0-jar-with-dependencies.jar")}"]
    }
  }
}
\`\`\`
`;

    await fs.writeFile(path.join(directory, "README.md"), readmeContent);
  } catch (error) {
    throw new Error(`Failed to create Java project: ${(error as Error).message}`);
  }
}
