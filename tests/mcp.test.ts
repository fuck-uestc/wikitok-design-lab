import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, password, record } from './helpers.js';

async function mcp(base: string, token: string, body: unknown) {
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json() as any };
}

test('MCP authenticates with the current admin password and manages artifact details', async t => {
  const { base } = await fixture(t);
  const unauthorized = await mcp(base, 'wrong-token', { jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(unauthorized.response.status, 401);
  const initialized = await mcp(base, password, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(initialized.response.status, 200);
  assert.deepEqual(initialized.data.result.capabilities.tools, {});
  const listed = await mcp(base, password, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.ok(listed.data.result.tools.some((tool: { name: string }) => tool.name === 'artifact_update'));
  const createTool = listed.data.result.tools.find((tool: { name: string }) => tool.name === 'artifact_create');
  assert.deepEqual(createTool.outputSchema.required.slice(0, 4), ['id', 'version', 'title', 'slug']);
  const created = await mcp(base, password, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'artifact_create', arguments: { artifact: record('MCP 条目', { status: 'draft' }) } } });
  const artifact = created.data.result.structuredContent;
  assert.equal(artifact.title, 'MCP 条目');
  const fetched = await mcp(base, password, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'artifact_get', arguments: { id: artifact.id } } });
  assert.equal(fetched.data.result.structuredContent.content, artifact.content);
  const updated = await mcp(base, password, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'artifact_update', arguments: { id: artifact.id, version: artifact.version, artifact: record('MCP 更新条目', { status: 'published' }) } } });
  const updatedArtifact = updated.data.result.structuredContent;
  assert.equal(updatedArtifact.version, 2);
  const archived = await mcp(base, password, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'artifact_delete', arguments: { id: artifact.id, version: updatedArtifact.version } } });
  assert.equal(archived.data.result.structuredContent.status, 'archived');
  const all = await mcp(base, password, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'artifact_list', arguments: { status: 'archived' } } });
  assert.equal(all.data.result.structuredContent.total, 1);
});
