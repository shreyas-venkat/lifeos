#!/usr/bin/env node

/**
 * Custom MotherDuck MCP Server for NanoClaw containers.
 *
 * Replaces the third-party mcp-server-motherduck (Python/uvx) with a
 * Node.js implementation using @duckdb/node-api. Runs USE my_db on
 * every connection to prevent the lifeos schema ambiguity issue.
 *
 * Env: MOTHERDUCK_TOKEN
 */

import { DuckDBInstance } from '@duckdb/node-api';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

let conn = null;

async function getConnection() {
  if (conn) return conn;
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) throw new Error('MOTHERDUCK_TOKEN environment variable is required');
  const instance = await DuckDBInstance.create(`md:?motherduck_token=${token}`);
  conn = await instance.connect();
  await conn.run('USE my_db');
  return conn;
}

function convertValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'object' && 'micros' in val) {
    return new Date(Number(BigInt(val.micros) / 1000n)).toISOString();
  }
  if (typeof val === 'object' && 'days' in val) {
    return new Date(Number(val.days) * 86400000).toISOString().split('T')[0];
  }
  if (typeof val === 'object' && 'value' in val) {
    // DuckDB Decimal type
    return Number(val.value);
  }
  return val;
}

const server = new McpServer({
  name: 'motherduck',
  version: '1.0.0',
});

server.tool(
  'query',
  'Run a SQL query against MotherDuck (cloud DuckDB). Tables are in the lifeos schema, e.g. lifeos.health_metrics, lifeos.supplements, lifeos.recipes, lifeos.meal_plans, lifeos.pantry, lifeos.calorie_log, lifeos.emails, lifeos.reminders, lifeos.preferences, lifeos.dietary_preferences, lifeos.bills, lifeos.grocery_lists, lifeos.supplement_log, lifeos.fitness_log, lifeos.fitness_nudges, lifeos.email_deletion_log, lifeos.calendar_events. Use gen_random_uuid() for ID columns.',
  {
    sql: z.string().describe('SQL query to execute. Use lifeos.table_name for all tables.'),
  },
  async ({ sql }) => {
    try {
      const connection = await getConnection();
      const result = await connection.runAndReadAll(sql);
      const columns = result.columnNames();
      const rows = result.getRows().map((row) => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = convertValue(row[i]);
        });
        return obj;
      });
      return {
        content: [{
          type: 'text',
          text: rows.length > 0
            ? JSON.stringify(rows, null, 2)
            : `Query executed successfully. ${columns.length > 0 ? 'No rows returned.' : 'Statement completed.'}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `SQL Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'list_tables',
  'List all tables in the lifeos schema with row counts.',
  {},
  async () => {
    try {
      const connection = await getConnection();
      const result = await connection.runAndReadAll(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'lifeos' ORDER BY table_name"
      );
      const tables = result.getRows().map((r) => r[0]);
      return {
        content: [{
          type: 'text',
          text: tables.length > 0
            ? `Tables in lifeos schema:\n${tables.map((t) => `- lifeos.${t}`).join('\n')}`
            : 'No tables found in lifeos schema.',
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'describe_table',
  'Show columns and types for a table in the lifeos schema.',
  {
    table: z.string().describe('Table name (without schema prefix, e.g. "health_metrics" not "lifeos.health_metrics")'),
  },
  async ({ table }) => {
    try {
      const connection = await getConnection();
      const result = await connection.runAndReadAll(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'lifeos' AND table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position`
      );
      const cols = result.getRows().map((r) => `- ${r[0]} (${r[1]}${r[2] === 'YES' ? ', nullable' : ''})`);
      return {
        content: [{
          type: 'text',
          text: cols.length > 0
            ? `Columns in lifeos.${table}:\n${cols.join('\n')}`
            : `Table lifeos.${table} not found.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
