import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createServerTool } from "./create-server/index.js";
import { buildServerTool } from "./build-server/index.js";
import { installServerTool } from "./install-server/index.js";

/**
 * Register all tools with the MCP server
 * 
 * @param server The MCP server instance
 */
export function registerTools(server: Server): void {
  // Register all tools
  createServerTool(server);
  buildServerTool(server);
  installServerTool(server);
}
