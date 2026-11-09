import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchUpstreamText } from '../../../../server/ai/upstreamRequest';
import { normalizeProviderError } from '../../../../server/ai/providerError';

let server: http.Server | undefined;

function startUpstream(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/`));
  });
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  server = undefined;
});

const options = (callerSignal: AbortSignal, timeoutMs = 2000) => ({ timeoutMs, callerSignal, provider: 'test', model: 'm' });
const sendHeadersThenStall: http.RequestListener = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write('{');
};

describe('fetchUpstreamText', () => {
  it('returns the full response body', async () => {
    const url = await startUpstream((_req, res) => res.end('{"ok":true}'));
    const { response, text } = await fetchUpstreamText(url, { method: 'POST' }, options(new AbortController().signal));
    expect(response.status).toBe(200);
    expect(text).toBe('{"ok":true}');
  });

  it('times out when the body stalls after a 200 response', async () => {
    const url = await startUpstream(sendHeadersThenStall);
    await expect(fetchUpstreamText(url, { method: 'POST' }, options(new AbortController().signal, 150))).rejects.toMatchObject({
      category: 'timeout',
      retryable: true,
      message: expect.stringContaining('内容在')
    });
  });

  it('cancels the upstream request and marks it non-retryable when the caller leaves', async () => {
    let upstreamClosedEarly = false;
    const url = await startUpstream((req, res) => {
      res.on('close', () => {
        upstreamClosedEarly = !res.writableEnded;
      });
      sendHeadersThenStall(req, res);
    });
    const caller = new AbortController();
    const pending = fetchUpstreamText(url, { method: 'POST' }, options(caller.signal));
    setTimeout(() => caller.abort(), 100);
    await expect(pending).rejects.toMatchObject({ statusCode: 499, retryable: false });
    await expect.poll(() => upstreamClosedEarly).toBe(true);
  });

  it('does not contact the upstream once the caller has left', async () => {
    let calls = 0;
    const url = await startUpstream((_req, res) => {
      calls += 1;
      res.end('{}');
    });
    const caller = new AbortController();
    caller.abort();
    await expect(fetchUpstreamText(url, { method: 'POST' }, options(caller.signal))).rejects.toMatchObject({ retryable: false });
    expect(calls).toBe(0);
  });

  it('keeps a dropped connection retryable while the caller is still waiting', async () => {
    const url = await startUpstream((_req, res) => {
      res.writeHead(200);
      res.write('{');
      setTimeout(() => res.destroy(), 30);
    });
    const error = await fetchUpstreamText(url, { method: 'POST' }, options(new AbortController().signal)).catch((e) => e);
    const normalized = normalizeProviderError(error, { provider: 'test', model: 'm' });
    expect(normalized.category).toBe('upstream_unavailable');
    expect(normalized.upstreamStatus).toBeUndefined();
  });
});
