
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { McpTool } from '../types';

/**
 * Service to interact with an MCP (Model Context Protocol) server.
 * This assumes an HTTP-based MCP bridge.
 */
export class McpService {
  private baseUrl: string;

  constructor(url: string) {
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  }

  /**
   * Fetches the list of tools available on the MCP server.
   */
  async listTools(): Promise<McpTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to fetch MCP tools');
      const data = await response.json();
      return data.tools || [];
    } catch (error) {
      console.error('MCP Tool List Error:', error);
      throw error;
    }
  }

  /**
   * Executes a tool on the MCP server.
   */
  async callTool(name: string, args: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          arguments: args,
        }),
      });
      if (!response.ok) throw new Error(`MCP Tool Call Failed: ${name}`);
      return await response.json();
    } catch (error) {
      console.error(`MCP Tool Execution Error (${name}):`, error);
      throw error;
    }
  }
}
