export const HEADER_MENUS = {
	home: [
		{
			id: 'mcp_bridge_home',
			title: 'MCP Bridge',
			menuItems: [
				{ id: 'mcp_bridge_connect_home', title: 'Connect', registerFn: 'mcpConnect' },
				{ id: 'mcp_bridge_disconnect_home', title: 'Disconnect', registerFn: 'mcpDisconnect' },
				{ id: 'mcp_bridge_status_home', title: 'Status', registerFn: 'mcpStatus' },
				{ id: 'mcp_bridge_diagnostics_home', title: 'Diagnostics', registerFn: 'mcpDiagnostics' },
				{ id: 'mcp_bridge_configure_home', title: 'Configure...', registerFn: 'mcpConfigure' },
			],
		},
	],
	sch: [
		{
			id: 'mcp_bridge_sch',
			title: 'MCP Bridge',
			menuItems: [
				{ id: 'mcp_bridge_connect_sch', title: 'Connect', registerFn: 'mcpConnect' },
				{ id: 'mcp_bridge_disconnect_sch', title: 'Disconnect', registerFn: 'mcpDisconnect' },
				{ id: 'mcp_bridge_status_sch', title: 'Status', registerFn: 'mcpStatus' },
				{ id: 'mcp_bridge_diagnostics_sch', title: 'Diagnostics', registerFn: 'mcpDiagnostics' },
				{ id: 'mcp_bridge_configure_sch', title: 'Configure...', registerFn: 'mcpConfigure' },
			],
		},
	],
} as const;

