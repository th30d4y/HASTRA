"""
Import MCP servers from opencode.json into HASTRA.
Run: python scripts/import_mcp.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.mcp_server import McpServer
from app.models.user import User

MCP_SERVERS = [
    {
        "name": "Playwright MCP",
        "description": "Browser automation — navigate, click, fill forms, screenshot, inspect DOM",
        "transport": "stdio",
        "endpoint": "npx -y @playwright/mcp",
        "extra_config": json.dumps({"command": ["npx", "-y", "@playwright/mcp"], "type": "local"}),
        "available_tools": ["browser_navigate", "browser_click", "browser_fill", "browser_screenshot", "browser_get_text", "browser_wait"],
        "is_connected": True,
    },
    {
        "name": "Browser MCP",
        "description": "Browser control via @browsermcp/mcp — real browser session control",
        "transport": "stdio",
        "endpoint": "npx -y @browsermcp/mcp",
        "extra_config": json.dumps({"command": ["npx", "-y", "@browsermcp/mcp"], "type": "local"}),
        "available_tools": ["browser_navigate", "browser_click", "browser_screenshot"],
        "is_connected": True,
    },
    {
        "name": "Burp Suite MCP",
        "description": "Burp Suite integration for web security testing — proxy, scanner, interceptor",
        "transport": "http",
        "endpoint": "http://127.0.0.1:9876",
        "extra_config": json.dumps({"type": "remote", "url": "http://127.0.0.1:9876"}),
        "available_tools": ["burp_scan", "burp_intercept", "burp_proxy", "burp_spider"],
        "is_connected": False,  # requires Burp running
    },
    {
        "name": "Filesystem MCP",
        "description": "File system access — read, write, list files in /home/w4nn4d13/Projects/Hira",
        "transport": "stdio",
        "endpoint": "npx -y @modelcontextprotocol/server-filesystem /home/w4nn4d13/Projects/Hira",
        "extra_config": json.dumps({"command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/home/w4nn4d13/Projects/Hira"], "type": "local", "allowed_path": "/home/w4nn4d13/Projects/Hira"}),
        "available_tools": ["read_file", "write_file", "list_directory", "search_files"],
        "is_connected": True,
    },
    {
        "name": "Gmail MCP",
        "description": "Gmail integration — read, send, search emails",
        "transport": "stdio",
        "endpoint": "npx -y @gongrzhe/server-gmail-autoauth-mcp@latest",
        "extra_config": json.dumps({"command": ["npx", "-y", "@gongrzhe/server-gmail-autoauth-mcp@latest"], "type": "local"}),
        "available_tools": ["gmail_read", "gmail_send", "gmail_search", "gmail_list"],
        "is_connected": False,  # requires Gmail auth
    },
    {
        "name": "Notion MCP",
        "description": "Notion integration — read pages, databases, blocks",
        "transport": "http",
        "endpoint": "https://mcp.notion.com/mcp",
        "extra_config": json.dumps({"type": "remote", "url": "https://mcp.notion.com/mcp", "oauth": True}),
        "available_tools": ["notion_read_page", "notion_search", "notion_list_databases"],
        "is_connected": False,  # requires Notion OAuth
    },
    {
        "name": "SSH MCP",
        "description": "SSH access to remote host 10.147.68.100 (hira@nexulean)",
        "transport": "stdio",
        "endpoint": "npx -y ssh-mcp -- --host=10.147.68.100 --port=22 --user=hira",
        "extra_config": json.dumps({"command": ["npx", "-y", "ssh-mcp", "--", "--host=10.147.68.100", "--port=22", "--user=hira", "--timeout=30000"], "type": "local", "host": "10.147.68.100", "user": "hira"}),
        "available_tools": ["ssh_exec", "ssh_upload", "ssh_download"],
        "is_connected": False,
    },
    {
        "name": "Firecrawl MCP",
        "description": "Web scraping and crawling — scrape pages, crawl sites, extract structured data",
        "transport": "stdio",
        "endpoint": "npx -y firecrawl-mcp",
        "extra_config": json.dumps({"command": ["npx", "-y", "firecrawl-mcp"], "type": "local", "env": {"FIRECRAWL_API_KEY": "fc-41de553e105b4d6ca3d396569ca90cc1"}}),
        "available_tools": ["firecrawl_scrape", "firecrawl_crawl", "firecrawl_search", "firecrawl_extract"],
        "is_connected": True,
    },
    {
        "name": "Ghidra MCP",
        "description": "Ghidra reverse engineering — decompile binaries, analyze functions, inspect symbols",
        "transport": "stdio",
        "endpoint": "/home/w4nn4d13/.config/ghidra/ghidra_12.1_PUBLIC/Extensions/GhidraMCP/data/os/linux_x86_64/mcp_bridge",
        "extra_config": json.dumps({"command": ["/home/w4nn4d13/.config/ghidra/ghidra_12.1_PUBLIC/Extensions/GhidraMCP/data/os/linux_x86_64/mcp_bridge", "--host", "localhost", "--port", "8765"], "type": "local", "host": "localhost", "port": 8765}),
        "available_tools": ["ghidra_decompile", "ghidra_list_functions", "ghidra_get_symbols", "ghidra_analyze"],
        "is_connected": False,  # requires Ghidra server running
    },
]


def import_mcp():
    db = SessionLocal()
    try:
        # Get the admin user
        admin = db.query(User).filter(User.role == "admin").first()
        if not admin:
            print("ERROR: No admin user found. Run init_db.py first.")
            return

        print(f"Importing MCP servers for user: {admin.email}")
        added = 0
        skipped = 0

        for cfg in MCP_SERVERS:
            existing = db.query(McpServer).filter(
                McpServer.user_id == admin.id,
                McpServer.name == cfg["name"],
            ).first()

            if existing:
                print(f"  SKIP (exists): {cfg['name']}")
                skipped += 1
                continue

            server = McpServer(
                user_id=admin.id,
                name=cfg["name"],
                description=cfg.get("description", ""),
                transport=cfg.get("transport", "stdio"),
                endpoint=cfg.get("endpoint", ""),
                auth_config=cfg.get("extra_config"),
                available_tools=cfg.get("available_tools", []),
                is_connected=cfg.get("is_connected", False),
                max_actions=100,
                timeout_seconds=60,
            )
            db.add(server)
            print(f"  + Added: {cfg['name']} ({cfg['transport']}) connected={cfg.get('is_connected',False)}")
            added += 1

        db.commit()
        print(f"\nDone. Added {added}, skipped {skipped}.")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import_mcp()
