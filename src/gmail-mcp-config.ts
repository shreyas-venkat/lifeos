export const GMAIL_MCP_CONFIG = {
  command: 'npx',
  args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
  env: {}, // Uses file-based auth from ~/.gmail-mcp/
};
