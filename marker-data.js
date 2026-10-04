(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WebMapData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const ICON_TYPES = new Set(['default', 'home', 'work', 'food', 'shop', 'hospital', 'school', 'park', 'star']);

    function isRecord(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function coordinate(value, min, max, allowNumericString) {
        if (allowNumericString && typeof value === 'string' && value.trim() !== '') value = Number(value);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            throw new Error(`座標は ${min} ～ ${max} の数値で指定してください`);
        }
        return value;
    }

    // Validate the entire document before callers mutate their map or storage.
    function normalizeMarkers(payload) {
        const geoJSON = isRecord(payload) && payload.type === 'FeatureCollection';
        const rows = geoJSON ? payload.features : payload;
        if (!Array.isArray(rows)) throw new Error('マーカーのJSON配列またはGeoJSON FeatureCollectionを選択してください');

        const errors = [];
        const normalized = rows.map((row, index) => {
            try {
                if (!isRecord(row)) throw new Error('マーカーはオブジェクトで指定してください');
                let data = row;
                let lat = row.lat;
                let lng = row.lng;
                if (geoJSON) {
                    if (row.type !== 'Feature' || row.geometry?.type !== 'Point' || !Array.isArray(row.geometry.coordinates)) {
                        throw new Error('PointのFeatureのみ読み込めます');
                    }
                    if (row.geometry.coordinates.length < 2 || row.geometry.coordinates.length > 3 ||
                        row.geometry.coordinates.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
                        throw new Error('Pointの座標は [経度, 緯度] または [経度, 緯度, 高度] で指定してください');
                    }
                    if (row.properties != null && !isRecord(row.properties)) throw new Error('propertiesはオブジェクトで指定してください');
                    data = row.properties || {};
                    [lng, lat] = row.geometry.coordinates;
                }

                let title = data.title;
                if (geoJSON && (title == null || title === '')) title = data.name ?? `地点 ${index + 1}`;
                if (typeof title !== 'string' || !title.trim()) throw new Error('空でないタイトルを指定してください');
                if (data.description != null && typeof data.description !== 'string') throw new Error('説明は文字列で指定してください');

                return {
                    id: data.id ?? (geoJSON ? row.id : undefined),
                    title: title.trim(),
                    description: data.description ?? '',
                    iconType: ICON_TYPES.has(data.iconType) ? data.iconType : 'default',
                    lat: coordinate(lat, -90, 90, !geoJSON),
                    lng: coordinate(lng, -180, 180, !geoJSON)
                };
            } catch (error) {
                errors.push(`${index + 1}件目: ${error.message}`);
                return null;
            }
        });

        if (errors.length) throw new Error(`${errors.length}件のデータが無効です。${errors.slice(0, 3).join(' / ')}`);

        // Reserve all existing IDs before filling gaps, including IDs in later rows.
        const reserved = new Set();
        normalized.forEach(data => {
            const raw = typeof data.id === 'string' && data.id.trim() !== '' ? Number(data.id) : data.id;
            if (Number.isSafeInteger(raw) && raw > 0 && !reserved.has(raw)) {
                data.id = raw;
                reserved.add(raw);
            } else data.id = null;
        });
        let nextId = 1;
        normalized.forEach(data => {
            if (data.id !== null) return;
            while (reserved.has(nextId)) nextId += 1;
            data.id = nextId;
            reserved.add(nextId);
        });
        return normalized;
    }

    function toGeoJSON(markerData) {
        return {
            type: 'FeatureCollection',
            features: normalizeMarkers(markerData).map(data => ({
                type: 'Feature',
                id: data.id,
                geometry: { type: 'Point', coordinates: [data.lng, data.lat] },
                properties: {
                    title: data.title,
                    description: data.description,
                    iconType: data.iconType
                }
            }))
        };
    }

    return { normalizeMarkers, toGeoJSON };
});
