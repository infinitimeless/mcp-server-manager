# MCP Server Manager

A tool to create, build, and manage MCP (Model Context Protocol) servers for use with Claude and other MCP clients.

## Features

- **Create new MCP servers** with proper scaffolding for TypeScript, Python, or Java
- **Build existing MCP servers** from source code 
- **Install MCP servers** for use with Claude Desktop and other MCP clients
- **Manage MCP server configurations**

## Installation

### Prerequisites

- Node.js 18 or higher
- For Python servers: Python 3.10+ and ideally `uv` package manager
- For Java servers: Java 17+ and Maven/Gradle

### Install using npm

```bash
npm install -g mcp-server-manager
```

### Local development

```bash
# Clone the repository
git clone https://github.com/infinitimeless/mcp-server-manager.git
cd mcp-server-manager

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
node build/index.js
```

## Using with Claude Desktop

To use the MCP Server Manager with Claude Desktop, add it to your Claude Desktop configuration.

Edit your Claude Desktop config file:
- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the following:

```json
{
  "mcpServers": {
    "mcp-server-manager": {
      "command": "node",
      "args": ["/path/to/mcp-server-manager/build/index.js"]
    }
  }
}
```

## Usage

Once installed and configured with Claude, you can use natural language commands like:

1. **Create a new server:**
   "Can you create a new MCP server for me? I'd like a Python server called 'weather-service' in my ~/Projects directory."

2. **Build an existing server:**
   "Please build my MCP server in ~/Projects/weather-service"

3. **Install a server to use with Claude:**
   "Install my weather-service server from ~/Projects/weather-service so I can use it with Claude"

## Tool Details

### create-server

Creates a new MCP server project with proper scaffolding.

**Parameters:**
- `name`: Name of the MCP server to create
- `language`: Programming language to use (typescript, python, or java)
- `directory`: Directory where the server should be created

### build-server

Builds an existing MCP server from source code.

**Parameters:**
- `directory`: Directory of the MCP server to build

### install-server

Installs an MCP server for use with clients like Claude Desktop.

**Parameters:**
- `directory`: Directory of the built MCP server
- `configPath`: (Optional) Path to Claude Desktop config

## Development

This project is open to contributions. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
