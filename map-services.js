(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WebMapServices = api;
})(globalThis, function() {
    'use strict';

    function checkAborted(signal) {
        if (signal?.aborted) throw new DOMException('キャンセルされました', 'AbortError');
    }

    async function requestJSON(url, { signal, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
        checkAborted(signal);
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs);
        try {
            const response = await fetchImpl(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(response.status === 429
                    ? 'アクセスが集中しています。時間をおいて再試行してください。'
                    : `HTTP ${response.status}`);
            }
            const data = await response.json();
            checkAborted(controller.signal);
            return data;
        } catch (error) {
            if (timedOut) throw new Error('通信がタイムアウトしました。再試行してください。', { cause: error });
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }

    function validateConfig(config) {
        const result = {};
        for (const key of ['searchUrl', 'routeUrl']) {
            const url = new URL(config?.[key]);
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
                throw new Error('サービス設定にはHTTPSのURLを指定してください。');
            }
            result[key] = url.href.replace(/\/$/, '');
        }
        return result;
    }

    function validCoordinate(lat, lng) {
        return typeof lat === 'number' && typeof lng === 'number' &&
            Number.isFinite(lat) && Number.isFinite(lng) &&
            Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    }

    function parseSearchResults(data) {
        if (!Array.isArray(data)) throw new Error('検索サービスの応答形式が不正です。');
        return data.filter(item => item &&
            (typeof item.lat === 'number' || typeof item.lat === 'string' && item.lat.trim() !== '') &&
            (typeof item.lon === 'number' || typeof item.lon === 'string' && item.lon.trim() !== '') &&
            validCoordinate(Number(item.lat), Number(item.lon)) &&
            typeof item.display_name === 'string').slice(0, 5);
    }

    // Serialize requests in this page, including requests waiting after a cancellation.
    function createSearchClient({ endpoint, request = requestJSON, minInterval = 1100,
        now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), cacheSize = 50 }) {
        const cache = new Map();
        let queue = Promise.resolve();
        let lastStart = -Infinity;
        return function search(query, { signal } = {}) {
            const key = query.trim();
            const pending = queue.catch(() => {}).then(async () => {
                checkAborted(signal);
                if (cache.has(key)) return cache.get(key);
                const wait = minInterval - (now() - lastStart);
                if (wait > 0) await delay(wait);
                checkAborted(signal);
                const url = new URL(endpoint);
                url.search = new URLSearchParams({ format: 'json', q: key, limit: '5',
                    'accept-language': 'ja', countrycodes: 'jp' }).toString();
                lastStart = now();
                const data = parseSearchResults(await request(url.href, { signal }));
                checkAborted(signal);
                cache.set(key, data);
                if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
                return data;
            });
            queue = pending;
            return pending;
        };
    }

    function parseRoute(data) {
        const route = data?.routes?.[0];
        if (data?.code !== 'Ok' || !route) throw new Error('ルートが見つかりませんでした。');
        if (!Number.isFinite(route.distance) || route.distance < 0 ||
            !Number.isFinite(route.duration) || route.duration < 0 ||
            route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) ||
            route.geometry.coordinates.length < 2 ||
            !route.geometry.coordinates.every(point => Array.isArray(point) && validCoordinate(point[1], point[0]))) {
            throw new Error('ルートサービスの応答形式が不正です。');
        }
        return route;
    }

    return { requestJSON, validateConfig, createSearchClient, parseSearchResults, parseRoute };
});
