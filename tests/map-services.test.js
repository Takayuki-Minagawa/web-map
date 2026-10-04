const test = require('node:test');
const assert = require('node:assert/strict');
const { requestJSON, validateConfig, createSearchClient, parseSearchResults, parseRoute } = require('../map-services.js');

const result = [{ lat: '35.68', lon: '139.76', display_name: '東京駅' }];

test('search serializes starts, caches repeated queries, and keeps URL input intact', async () => {
    let time = 0;
    const calls = [];
    const search = createSearchClient({
        endpoint: 'https://example.com/search', now: () => time,
        delay: async ms => { time += ms; },
        request: async url => { calls.push({ url, time }); return result; }
    });
    await Promise.all([search('東京 & 駅'), search('大阪')]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].time - calls[0].time, 1100);
    assert.equal(new URL(calls[0].url).searchParams.get('q'), '東京 & 駅');
    assert.deepEqual(await search(' 東京 & 駅 '), result);
    assert.equal(calls.length, 2);
});

test('a cancelled queued search sends no request and does not block later searches', async () => {
    const controller = new AbortController();
    let calls = 0;
    const search = createSearchClient({ endpoint: 'https://example.com/search', minInterval: 0,
        request: async () => { calls++; return result; } });
    const cancelled = search('old', { signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    await search('new');
    assert.equal(calls, 1);
});

test('failed searches are retried instead of cached and the cache is bounded', async () => {
    let calls = 0;
    const search = createSearchClient({ endpoint: 'https://example.com/search', minInterval: 0, cacheSize: 1,
        request: async () => { if (++calls === 1) throw new Error('offline'); return result; } });
    await assert.rejects(search('a'), /offline/);
    await search('a');
    await search('b');
    await search('a');
    assert.equal(calls, 4);
});

test('search rejects invalid response shape and filters unusable coordinates', () => {
    assert.throws(() => parseSearchResults({ error: 'bad' }), /応答形式/);
    assert.deepEqual(parseSearchResults([...result, null, { lat: '', lon: null, display_name: 'bad' },
        { lat: true, lon: 1, display_name: 'bad' }, { lat: 91, lon: 0, display_name: 'bad' }]), result);
});

test('HTTP and invalid JSON failures propagate', async () => {
    await assert.rejects(requestJSON('https://example.com', { fetchImpl: async () => ({ ok: false, status: 429 }) }), /時間をおいて/);
    await assert.rejects(requestJSON('https://example.com', { fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
    await assert.rejects(requestJSON('https://example.com', { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }) }), /bad JSON/);
});

function pendingFetch(url, { signal }) {
    return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
}

test('request timeout is distinguishable from user cancellation', async () => {
    await assert.rejects(requestJSON('https://example.com', { fetchImpl: pendingFetch, timeoutMs: 5 }), /タイムアウト/);
    const controller = new AbortController();
    const request = requestJSON('https://example.com', { fetchImpl: pendingFetch, signal: controller.signal });
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
});

test('a pre-aborted request never reaches fetch', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await assert.rejects(requestJSON('https://example.com', { signal: controller.signal,
        fetchImpl: async () => { calls++; } }), { name: 'AbortError' });
    assert.equal(calls, 0);
});

test('service configuration accepts configurable HTTPS providers and rejects credentials/queries', () => {
    assert.deepEqual(validateConfig({ searchUrl: 'https://example.com/search/', routeUrl: 'https://route.example/driving' }),
        { searchUrl: 'https://example.com/search', routeUrl: 'https://route.example/driving' });
    for (const searchUrl of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?q=secret', null]) {
        assert.throws(() => validateConfig({ searchUrl, routeUrl: 'https://example.com' }));
    }
});

test('route requires usable GeoJSON and finite nonnegative metrics', () => {
    const route = { distance: 1000, duration: 100, geometry: { type: 'LineString', coordinates: [[139, 35], [140, 36]] } };
    assert.deepEqual(parseRoute({ code: 'Ok', routes: [route] }), route);
    assert.throws(() => parseRoute({ code: 'NoRoute', routes: [] }), /見つかりません/);
    for (const invalid of [{ ...route, distance: -1 }, { ...route, duration: Infinity },
        { ...route, geometry: { type: 'Point', coordinates: [139, 35] } },
        { ...route, geometry: { type: 'LineString', coordinates: [[139, 35], [140, 91]] } }]) {
        assert.throws(() => parseRoute({ code: 'Ok', routes: [invalid] }), /応答形式/);
    }
});
