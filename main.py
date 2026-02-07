"""
MCP server entry point for Dedalus deploy.
Required by Dedalus: https://docs.dedaluslabs.ai/dmcp/deploy
Server name "tart" should match your deployment slug.
"""

from dedalus_mcp import MCPServer, tool


@tool(description="Return info about the Tart MCP server")
def tart_info() -> str:
    """Return a short description of the Tart server."""
    return "Tart MCP server — poker app tools and decision insights."


@tool(description="Echo a message (for testing connectivity)")
def echo(message: str) -> str:
    """Echo the given message."""
    return message


server = MCPServer("tart")
server.collect(tart_info, echo)

if __name__ == "__main__":
    import asyncio
    asyncio.run(server.serve())
