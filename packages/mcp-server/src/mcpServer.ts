import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolRequest,
	type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { WsBridge } from './bridge/wsBridge.js';
import { createToolRegistry } from './tools/toolRegistry.js';

export async function runMcpServer(opts: { bridge: WsBridge }): Promise<void> {
	const tools = createToolRegistry(opts.bridge);
	const toolByName = new Map(tools.map((t) => [t.name, t] as const));

	const server = new Server(
		{ name: 'jlceda-eda-mcp', version: '0.0.0' },
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async (_req: ListToolsRequest) => {
		return {
			tools: tools.map((t) => ({
				name: t.name,
				description: t.description,
				inputSchema: t.inputSchema,
			})),
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (req: CallToolRequest) => {
		const toolName = req.params.name;
		const args = req.params.arguments ?? {};

		const tool = toolByName.get(toolName);
		if (!tool) throw new Error(`Unknown tool: ${toolName}`);
		return await tool.run(args);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

