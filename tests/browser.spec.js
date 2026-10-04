const { test: base, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const origin = 'http://127.0.0.1:4173';
const blankTile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const seedMarker = { id: 1, title: '保存済みの地点', description: '保持するデータ',
    iconType: 'home', lat: 35.68, lng: 139.76 };

// Run real Leaflet and html2canvas from locked local packages. No test request reaches
// a public CDN, map tile service, geocoder, or router.
const test = base.extend({
    page: async ({ page }, use) => {
        const unexpectedRequests = [];
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            if (url.hostname === 'unpkg.com' && url.pathname.startsWith('/leaflet@1.9.4/dist/')) {
                const asset = url.pathname.slice('/leaflet@1.9.4/dist/'.length);
                if (['leaflet.js', 'leaflet.css', 'images/marker-icon.png',
                    'images/marker-icon-2x.png', 'images/marker-shadow.png',
                    'images/layers.png', 'images/layers-2x.png'].includes(asset)) {
                    return route.fulfill({ path: resolve('node_modules/leaflet/dist', asset) });
                }
            }
            if (url.href === 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js') {
                return route.fulfill({ path: resolve('node_modules/html2canvas/dist/html2canvas.min.js') });
            }
            if (url.hostname === 'tile.openstreetmap.org') {
                return route.fulfill({ contentType: 'image/png', body: blankTile });
            }
            if (url.hostname === 'nominatim.openstreetmap.org') {
                return route.fulfill({ json: [] });
            }
            if (url.hostname === 'router.project-osrm.org') {
                return route.fulfill({ json: { code: 'NoRoute', routes: [] } });
            }
            unexpectedRequests.push(url.href);
            await route.abort();
        });
        await use(page);
        expect(unexpectedRequests, 'Unexpected external requests are blocked').toEqual([]);
        expect(pageErrors, 'Application has no uncaught browser errors').toEqual([]);
    }
});

async function openMap(page, markers) {
    if (markers) {
        await page.addInitScript(data => localStorage.setItem('webmap_markers', JSON.stringify(data)), markers);
    }
    await page.goto('/');
    await expect(page.locator('#zoomLevel')).toHaveText('10');
    await expect(page.locator('#map')).toHaveClass(/leaflet-container/);
}

async function readMarkers(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('webmap_markers')));
}

async function createMarker(page, title, icon = 'default', position = { x: 720, y: 500 }) {
    await page.locator('#map').click({ position });
    await expect(page.locator('#markerDialog')).toHaveClass(/active/);
    await page.locator('#markerTitle').fill(title);
    await page.locator('#markerDescription').fill('テスト用メモ');
    await page.locator(`[data-icon="${icon}"]`).click();
    await page.locator('#saveMarker').click();
    await expect(page.locator('#markerDialog')).not.toHaveClass(/active/);
}

async function importFile(page, data, name = 'markers.json') {
    await page.locator('#importFile').setInputFiles({
        name,
        mimeType: 'application/json',
        buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
    });
}

test('creates, edits, filters and reloads saved markers', async ({ page }) => {
    await openMap(page);
    await expect(page.locator('#markerFilterStatus')).toHaveText('すべて (0/0)');
    await createMarker(page, '自宅', 'home');
    await createMarker(page, '公園', 'park', { x: 850, y: 600 });
    await expect(page.locator('#markerFilterStatus')).toContainText('(2/2)');
    await page.locator('#manageMarkers').click();
    const homeRow = page.locator('.marker-item').filter({ hasText: '自宅' });
    await homeRow.getByRole('button', { name: '編集', exact: true }).click();
    await page.locator('#markerTitle').fill('お気に入りの自宅');
    await page.locator('[data-icon="star"]').click();
    await page.locator('#saveMarker').click();
    await page.locator('#markerFilter').selectOption('star');
    await expect(page.locator('#markerFilterStatus')).toContainText('(1/2)');
    await page.locator('#manageMarkers').click();
    await expect(page.locator('.marker-item')).toHaveCount(1);
    await expect(page.locator('.marker-item')).toContainText('お気に入りの自宅');
    await page.locator('#closeMarkerManager').click();
    await page.locator('#markerFilterReset').click();
    await expect(page.locator('#markerFilterStatus')).toContainText('(2/2)');
    await page.reload();
    await expect(page.locator('#markerFilterStatus')).toContainText('(2/2)');
    const saved = await readMarkers(page);
    expect(saved.map(marker => marker.title)).toEqual(['お気に入りの自宅', '公園']);
    expect(new Set(saved.map(marker => marker.id)).size).toBe(2);
});

test('narrow screens keep route, search and marker management controls reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openMap(page, [seedMarker]);
    await page.locator('#routeClear').click();
    await expect(page.locator('#routeResult')).toHaveText('-');
    await page.locator('#addressInput').fill('東京駅');
    await page.locator('#searchButton').click();
    await expect(page.locator('#searchResults')).toContainText('見つかりませんでした');
    await page.locator('#manageMarkers').click();
    await expect(page.locator('#markerManagerDialog')).toHaveClass(/active/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportGeoJSON').click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.geojson$/);
    await page.locator('.marker-item').getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.locator('#markerTitle')).toHaveValue(seedMarker.title);
    await page.locator('#cancelMarker').click();
    await page.locator('#manageMarkers').click();
    await page.locator('#closeMarkerManager').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('rejects a partly invalid import without losing existing markers or storage', async ({ page }) => {
    await openMap(page, [seedMarker]);
    const before = await page.evaluate(() => localStorage.getItem('webmap_markers'));
    await page.locator('#manageMarkers').click();
    const dialog = page.waitForEvent('dialog');
    await importFile(page, [
        { title: '途中まで有効な地点', lat: 35, lng: 139 },
        { title: '範囲外の緯度', lat: 91, lng: 139 }
    ]);
    expect((await dialog).message()).toMatch(/失敗|無効|緯度/);
    await expect(page.locator('.marker-item')).toHaveCount(1);
    await expect(page.locator('.marker-item')).toContainText(seedMarker.title);
    expect(await page.evaluate(() => localStorage.getItem('webmap_markers'))).toBe(before);
});

test('rejects null import records and preserves data when browser storage is full', async ({ page }) => {
    await openMap(page, [seedMarker]);
    const before = await page.evaluate(() => localStorage.getItem('webmap_markers'));
    await page.locator('#manageMarkers').click();
    let dialog = page.waitForEvent('dialog');
    await importFile(page, [null]);
    expect((await dialog).message()).toContain('インポートできません');
    expect(await page.evaluate(() => localStorage.getItem('webmap_markers'))).toBe(before);
    await expect(page.locator('.marker-item')).toContainText(seedMarker.title);

    await page.evaluate(() => {
        Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    });
    dialog = page.waitForEvent('dialog');
    await importFile(page, [{ title: '置き換えたい地点', lat: 34, lng: 135 }]);
    expect((await dialog).message()).toContain('保存できません');
    expect(await page.evaluate(() => localStorage.getItem('webmap_markers'))).toBe(before);
    await expect(page.locator('.marker-item')).toHaveCount(1);
    await expect(page.locator('.marker-item')).toContainText(seedMarker.title);
    await expect(page.locator('#markerFilterStatus')).toContainText('(1/1)');
});

test('exports standard GeoJSON and imports it back with metadata and coordinates', async ({ page }) => {
    await openMap(page, [seedMarker, { id: 2, title: '非表示の公園', description: '',
        iconType: 'park', lat: 35.7, lng: 139.8 }]);
    await page.locator('#markerFilter').selectOption('home');
    await page.locator('#manageMarkers').click();
    await expect(page.locator('.marker-item')).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportGeoJSON').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.geojson$/);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.type).toBe('FeatureCollection');
    expect(exported.features).toHaveLength(2);
    expect(exported.features[0].geometry).toEqual({ type: 'Point', coordinates: [139.76, 35.68] });
    expect(exported.features[0].properties).toMatchObject({ title: seedMarker.title,
        description: seedMarker.description, iconType: seedMarker.iconType });
    await page.locator('#closeMarkerManager').click();
    await page.locator('#markerFilterReset').click();
    await page.locator('#clearMarkers').click();
    await expect(page.locator('#markerFilterStatus')).toContainText('(0/0)');
    await page.locator('#manageMarkers').click();
    await importFile(page, exported, 'roundtrip.geojson');
    await expect(page.locator('.marker-item')).toHaveCount(2);
    expect((await readMarkers(page))[0]).toMatchObject(seedMarker);
});

test('shows an actionable error when the search service returns an HTTP error', async ({ page }) => {
    let requests = 0;
    await page.route('https://nominatim.openstreetmap.org/**', async route => {
        requests += 1;
        await route.fulfill({ status: 429, json: { error: 'Too many requests' } });
    });
    await openMap(page);
    await page.locator('#addressInput').fill('東京駅');
    await page.locator('#searchButton').click();
    await expect(page.locator('#searchResults')).toContainText(/失敗|エラー|制限|時間/);
    await expect(page.locator('#searchResults')).not.toContainText('検索中');
    await expect(page.locator('#searchButton')).toBeEnabled();
    expect(requests).toBe(1);
});

test('superseded searches cannot display stale results and repeated queries use the cache', async ({ page }) => {
    await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window);
        window.__searchRequests = [];
        window.fetch = (input, options) => {
            if (String(input).startsWith('https://nominatim.openstreetmap.org/')) {
                return new Promise(resolveResponse => {
                    window.__searchRequests.push({
                        signal: options?.signal,
                        finish(name) {
                            resolveResponse(new Response(JSON.stringify([{ place_id: 1,
                                display_name: name, lat: '35.68', lon: '139.76'
                            }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                        }
                    });
                });
            }
            return originalFetch(input, options);
        };
    });
    await openMap(page);
    await page.locator('#addressInput').fill('東京駅');
    await page.locator('#searchButton').click();
    await expect.poll(() => page.evaluate(() => window.__searchRequests.length)).toBe(1);
    await page.locator('#addressInput').fill('大阪駅');
    await page.locator('#searchButton').click();
    expect(await page.evaluate(() => window.__searchRequests[0].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__searchRequests[0].finish('古い東京駅の結果'));
    await expect.poll(() => page.evaluate(() => window.__searchRequests.length)).toBe(2);
    await expect(page.locator('#searchResults')).not.toContainText('古い東京駅');
    await page.evaluate(() => window.__searchRequests[1].finish('大阪駅の結果'));
    await expect(page.locator('#searchResults')).toContainText('大阪駅の結果');
    await page.locator('#searchButton').click();
    await expect(page.locator('#searchResults')).toContainText('大阪駅の結果');
    expect(await page.evaluate(() => window.__searchRequests.length)).toBe(2);
});

test('clearing and replacing routes prevents late responses from restoring stale routes', async ({ page }) => {
    // Deliberately emulate a transport that finishes after abort, so both abort and
    // stale-result protection are exercised through the actual route UI.
    await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window);
        window.__routeRequests = [];
        window.fetch = (input, options) => {
            if (String(input).startsWith('https://router.project-osrm.org/')) {
                return new Promise(resolveResponse => {
                    window.__routeRequests.push({
                        signal: options?.signal,
                        finish(distance) {
                            resolveResponse(new Response(JSON.stringify({ code: 'Ok', routes: [{
                                distance, duration: 600,
                                geometry: { type: 'LineString', coordinates: [[139.65, 35.67], [139.75, 35.7]] }
                            }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                        }
                    });
                });
            }
            return originalFetch(input, options);
        };
    });
    await openMap(page);
    await page.locator('#routeStart').click();
    await page.locator('#map').click({ position: { x: 650, y: 500 } });
    await page.locator('#map').click({ position: { x: 850, y: 600 } });
    await expect.poll(() => page.evaluate(() => window.__routeRequests.length)).toBe(1);
    await page.locator('#routeClear').click();
    expect(await page.evaluate(() => window.__routeRequests[0].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__routeRequests[0].finish(99000));
    await expect(page.locator('#routeResult')).toHaveText('-');
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.locator('#routeShow')).toBeEnabled();

    await page.locator('#routeStart').click();
    await page.locator('#map').click({ position: { x: 600, y: 500 } });
    await page.locator('#map').click({ position: { x: 850, y: 600 } });
    await expect.poll(() => page.evaluate(() => window.__routeRequests.length)).toBe(2);
    await page.locator('#routeStart').click();
    await page.locator('#map').click({ position: { x: 700, y: 650 } });
    await expect.poll(() => page.evaluate(() => window.__routeRequests.length)).toBe(3);
    expect(await page.evaluate(() => window.__routeRequests[1].signal.aborted)).toBe(true);
    await page.evaluate(() => window.__routeRequests[2].finish(2000));
    await expect(page.locator('#routeResult')).toContainText('2.00 km');
    const currentResult = await page.locator('#routeResult').textContent();
    await page.evaluate(() => window.__routeRequests[1].finish(95000));
    await expect(page.locator('#routeResult')).toHaveText(currentResult);
    await expect(page.locator('.leaflet-overlay-pane path[stroke="#2196F3"]')).toHaveCount(1);
    await expect(page.locator('#routeShow')).toBeEnabled();
});
