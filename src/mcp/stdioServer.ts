import { startOfficialStdioMcpServer } from "./sdkServer";

export { startOfficialStdioMcpServer as startStdioMcpServer };

if (require.main === module) {
  startOfficialStdioMcpServer().catch((error) => {
    console.error("MCP server error:", error);
    process.exit(1);
  });
}
