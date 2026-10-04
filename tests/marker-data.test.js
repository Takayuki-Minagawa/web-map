const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMarkers, toGeoJSON } = require('../marker-data.js');

const marker = (overrides = {}) => ({ id: 1, title: '東京駅', description: '駅', iconType: 'star', lat: 35.6812, lng: 139.7671, ...overrides });

test('legacy backups keep data and accept numeric coordinate strings', () => {
    assert.deepEqual(normalizeMarkers([marker({ lat: '35.6812', lng: '139.7671', id: '1' })]), [marker()]);
    assert.deepEqual(normalizeMarkers([]), []);
});

test('rejects malformed records, invalid text, and coordinates without mutating input', () => {
    for (const bad of [null, false, [], marker({ lat: null }), marker({ lat: '' }), marker({ lat: false }),
        marker({ lat: 91 }), marker({ lng: -181 }), marker({ lng: Infinity }), marker({ title: ' ' }),
        marker({ title: {} }), marker({ description: [] })]) {
        assert.throws(() => normalizeMarkers([marker(), bad]), /2件目/);
    }
    const original = [marker(), null, marker({ lat: 100 })];
    assert.throws(() => normalizeMarkers(original), /2件のデータが無効/);
    assert.deepEqual(original, [marker(), null, marker({ lat: 100 })]);
    for (const value of [{}, null, 'markers', { type: 'FeatureCollection', features: null }]) {
        assert.throws(() => normalizeMarkers(value), /FeatureCollection/);
    }
});

test('reassigns duplicate and unsafe IDs while preserving later valid IDs', () => {
    const result = normalizeMarkers([marker({ id: null }), marker({ id: 1 }), marker({ id: 1 }),
        marker({ id: 1.5 }), marker({ id: Number.MAX_SAFE_INTEGER }), marker({ id: Number.MAX_SAFE_INTEGER + 1 }),
        marker({ id: true }), marker({ id: 0 })]);
    assert.deepEqual(result.map(data => data.id), [2, 1, 3, 4, Number.MAX_SAFE_INTEGER, 5, 6, 7]);
});

test('unknown icon names fall back and arbitrary imported properties are discarded', () => {
    const result = normalizeMarkers([marker({ iconType: '__proto__', emoji: '<img onerror=alert(1)>', extra: 'ignored' })]);
    assert.equal(result[0].iconType, 'default');
    assert.equal(Object.hasOwn(result[0], 'emoji'), false);
    assert.equal(Object.hasOwn(result[0], 'extra'), false);
});

test('GeoJSON roundtrip uses longitude first and preserves IDs and marker properties', () => {
    const geo = toGeoJSON([marker()]);
    assert.deepEqual(geo.features[0].geometry.coordinates, [139.7671, 35.6812]);
    assert.equal(geo.features[0].id, 1);
    assert.deepEqual(normalizeMarkers(geo), [marker()]);
});

test('GeoJSON imports names, optional altitude, null properties and boundary coordinates', () => {
    const feature = (properties, coordinates) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
    const data = normalizeMarkers({ type: 'FeatureCollection', features: [
        feature({ name: '北極' }, [180, 90, 100]), feature(null, [-180, -90])
    ] });
    assert.equal(data[0].title, '北極');
    assert.equal(data[1].title, '地点 2');
    assert.deepEqual([data[0].lng, data[0].lat], [180, 90]);
});

test('GeoJSON rejects non-points, malformed properties and nonnumeric positions', () => {
    for (const change of [
        { geometry: { type: 'LineString', coordinates: [[139, 35], [140, 36]] } },
        { geometry: null }, { properties: [] },
        { geometry: { type: 'Point', coordinates: ['139', 35] } },
        { geometry: { type: 'Point', coordinates: [139] } },
        { geometry: { type: 'Point', coordinates: [139, 35, null] } },
        { geometry: { type: 'Point', coordinates: [139, 35, 0, 1] } }
    ]) {
        const feature = { type: 'Feature', properties: { name: '地点' }, geometry: { type: 'Point', coordinates: [139, 35] }, ...change };
        assert.throws(() => normalizeMarkers({ type: 'FeatureCollection', features: [feature] }), /1件目/);
    }
});

test('migrates stored legacy world-copy longitudes without relaxing file import validation', () => {
    const rows = [139, 181, -181, 540, -540].map((lng, i) => ({ title: `地点${i}`, lat: 35, lng }));
    const before = JSON.stringify(rows);
    const migrated = normalizeMarkers(rows, { wrapLegacyLongitude: true });
    assert.deepEqual(migrated.map(row => row.lng), [139, -179, 179, -180, -180]);
    assert.equal(JSON.stringify(rows), before);
    assert.throws(() => normalizeMarkers(rows), /無効/);
});
