import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/index.js";

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

// Register all tools
registerTools(server);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server Manager running on stdio transport");
  } catch (error) {
    console.error("Failed to start MCP Server Manager:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Uncaught error in main:", error);
  process.exit(1);
});
