// パフォーマンス最適化版
(function() {
    'use strict';

    // グローバル変数
    let map;
    // 永続化対象のマーカー
    const markers = [];
    // 一時的なマーカー（検索結果・都市移動など）
    const tempMarkers = [];
    let currentEditingMarker = null;
    let nextMarkerId = 1;
    let userLocationMarker = null;
    let userAccuracyCircle = null;
    let measurementMode = null; // 'distance' | 'area' | null
    const measurementState = {
        points: [],
        markers: [],
        layer: null,
        summary: '',
        summaryStatus: 'neutral'
    };
    const routeState = {
        start: null,
        end: null,
        startMarker: null,
        endMarker: null,
        routeLayer: null,
        selectionMode: null,
        summary: '',
        summaryStatus: 'neutral'
    };
    let currentMarkerFilter = 'all';

    // 主要都市の座標（定数）
    const CITIES = {
        tokyo: { lat: 35.6762, lng: 139.6503, name: '東京' },
        osaka: { lat: 34.6937, lng: 135.5023, name: '大阪' },
        kyoto: { lat: 35.0116, lng: 135.7681, name: '京都' }
    };

    // マーカーアイコンの定義
    const MARKER_ICONS = {
        default: { emoji: '📍', color: '#ff0000', label: 'デフォルト' },
        home: { emoji: '🏠', color: '#4CAF50', label: '家' },
        work: { emoji: '🏢', color: '#2196F3', label: '職場' },
        food: { emoji: '🍽️', color: '#FF9800', label: 'レストラン' },
        shop: { emoji: '🛒', color: '#9C27B0', label: 'ショップ' },
        hospital: { emoji: '🏥', color: '#f44336', label: '病院' },
        school: { emoji: '🏫', color: '#607D8B', label: '学校' },
        park: { emoji: '🌳', color: '#4CAF50', label: '公園' },
        star: { emoji: '⭐', color: '#FFC107', label: 'お気に入り' }
    };

    // DOM要素のキャッシュ
    const elements = {};

    // 初期化
    function initMap() {
        try {
            // DOM要素をキャッシュ
            cacheElements();
            setCurrentLocationStatus('未取得');
            setMeasurementResult('-');
            setRouteResult('-');
            initializeMarkerFilter();
            updateMarkerFilterStatus();

            // 地図の作成
            map = L.map('map', {
                center: [35.6762, 139.6503],
                zoom: 10,
                zoomControl: true,
                attributionControl: true
            });

            // OpenStreetMapタイルレイヤーを追加
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors',
                updateWhenIdle: true,
                updateWhenZooming: false
            }).addTo(map);

            // イベントリスナーの設定
            setupEventListeners();

            // 初期値の設定
            updateZoomLevel();

            // 保存されたマーカーを読み込み
            loadSavedMarkers();

            console.log('地図の初期化完了');

        } catch (error) {
            console.error('地図の初期化エラー:', error);
            alert('地図の読み込みに失敗しました: ' + error.message);
        }
    }

    // 簡易エスケープ（XSS対策）
    function escapeHTML(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // DOM要素をキャッシュ
    function cacheElements() {
        elements.clickLocation = document.getElementById('clickLocation');
        elements.zoomLevel = document.getElementById('zoomLevel');
        elements.controls = document.querySelector('.controls');
        elements.zoomToTokyo = document.getElementById('zoomToTokyo');
        elements.zoomToOsaka = document.getElementById('zoomToOsaka');
        elements.zoomToKyoto = document.getElementById('zoomToKyoto');
        elements.clearMarkers = document.getElementById('clearMarkers');
        elements.routeStart = document.getElementById('routeStart');
        elements.routeEnd = document.getElementById('routeEnd');
        elements.routeShow = document.getElementById('routeShow');
        elements.routeClear = document.getElementById('routeClear');
        elements.markerFilter = document.getElementById('markerFilter');
        elements.markerFilterReset = document.getElementById('markerFilterReset');
        elements.measureDistance = document.getElementById('measureDistance');
        elements.measureArea = document.getElementById('measureArea');
        elements.measureClear = document.getElementById('measureClear');
        elements.locateMe = document.getElementById('locateMe');
        elements.addressInput = document.getElementById('addressInput');
        elements.searchButton = document.getElementById('searchButton');
        elements.searchResults = document.getElementById('searchResults');
        elements.markerDialog = document.getElementById('markerDialog');
        elements.markerTitle = document.getElementById('markerTitle');
        elements.markerDescription = document.getElementById('markerDescription');
        elements.saveMarker = document.getElementById('saveMarker');
        elements.cancelMarker = document.getElementById('cancelMarker');
        elements.deleteMarker = document.getElementById('deleteMarker');
        elements.saveImage = document.getElementById('saveImage');
        elements.manageMarkers = document.getElementById('manageMarkers');
        elements.markerManagerDialog = document.getElementById('markerManagerDialog');
        elements.markerList = document.getElementById('markerList');
        elements.closeMarkerManager = document.getElementById('closeMarkerManager');
        elements.exportMarkers = document.getElementById('exportMarkers');
        elements.importMarkers = document.getElementById('importMarkers');
        elements.importFile = document.getElementById('importFile');
        elements.currentLocation = document.getElementById('currentLocation');
        elements.measurementResult = document.getElementById('measurementResult');
        elements.markerFilterStatus = document.getElementById('markerFilterStatus');
        elements.routeResult = document.getElementById('routeResult');
    }

    // イベントリスナーの設定
    function setupEventListeners() {
        // 地図イベント（デバウンス付き）
        map.on('click', debounce(handleMapClick, 100));
        map.on('zoomend', updateZoomLevel);

        // ボタンイベント（イベント委譲）
        elements.controls.addEventListener('click', handleButtonClick);

        // 検索機能
        elements.searchButton.addEventListener('click', performSearch);
        elements.addressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        // マーカーダイアログ
        setupMarkerDialog();

        // マーカー管理
        setupMarkerManager();
    }

    // ボタンクリックハンドラー（イベント委譲）
    function handleButtonClick(e) {
        const button = e.target.closest('button');
        if (!button) return;

        switch (button.id) {
            case 'zoomToTokyo':
                zoomToCity('tokyo');
                break;
            case 'zoomToOsaka':
                zoomToCity('osaka');
                break;
            case 'zoomToKyoto':
                zoomToCity('kyoto');
                break;
            case 'clearMarkers':
                clearMarkers();
                break;
            case 'markerFilterReset':
                resetMarkerFilter();
                break;
            case 'routeStart':
                setRouteSelectionMode('start');
                break;
            case 'routeEnd':
                setRouteSelectionMode('end');
                break;
            case 'routeShow':
                requestRoute();
                break;
            case 'routeClear':
                handleRouteClear();
                break;
            case 'measureDistance':
                setMeasurementMode('distance');
                break;
            case 'measureArea':
                setMeasurementMode('area');
                break;
            case 'measureClear':
                handleMeasurementReset();
                break;
            case 'locateMe':
                locateUser();
                break;
            case 'saveImage':
                captureMapImage();
                break;
            case 'manageMarkers':
                openMarkerManager();
                break;
        }
    }

    // 地図クリックハンドラー
    function handleMapClick(e) {
        if (routeState.selectionMode) {
            handleRouteSelection(e.latlng);
            return;
        }

        if (measurementMode) {
            handleMeasurementClick(e.latlng);
            return;
        }

        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);

        // テキスト更新（リフローを最小化）
        elements.clickLocation.textContent = `${lat}, ${lng}`;

        // マーカーカスタマイズダイアログを開く
        openMarkerDialog(e.latlng);
    }

    // ズームレベル更新
    function updateZoomLevel() {
        elements.zoomLevel.textContent = map.getZoom();
    }

    // 都市にズーム
    function zoomToCity(cityName) {
        const city = CITIES[cityName];
        if (!city || !map) return;

        map.setView([city.lat, city.lng], 12);

        const marker = L.marker([city.lat, city.lng])
            .addTo(map)
            .bindPopup(`<b>${escapeHTML(city.name)}</b>`)
            .openPopup();

        // 一時マーカーとして管理（保存対象に含めない）
        tempMarkers.push(marker);
    }

    // マーカーをクリア
    function clearMarkers() {
        if (!map) return;

        // 永続マーカーを削除
        markers.forEach(marker => {
            map.removeLayer(marker);
        });
        markers.length = 0;

        // 一時マーカーも削除
        tempMarkers.forEach(marker => {
            map.removeLayer(marker);
        });
        tempMarkers.length = 0;

        // ストレージも更新
        saveMarkersToStorage();

        // 現在地マーカーも片付け
        clearUserLocationMarker();
        setCurrentLocationStatus('未取得');

        // ルート状態もリセット
        clearRoute({ silent: true });
        setRouteResult('-');

        // フィルターを初期化
        resetMarkerFilter();

        // 計測状態もリセット
        handleMeasurementReset();
    }

    // 計測モードの切り替え
    function setMeasurementMode(mode) {
        if (!map) return;

        if (measurementMode === mode) {
            measurementMode = null;
            updateMeasurementButtons();
            if (measurementState.summary) {
                setMeasurementResult(measurementState.summary, measurementState.summaryStatus || 'success');
            } else {
                setMeasurementResult('-');
            }
            return;
        }

        if (routeState.selectionMode) {
            routeState.selectionMode = null;
            updateRouteButtons();
            if (routeState.summary) {
                setRouteResult(routeState.summary, routeState.summaryStatus || 'success');
            } else {
                setRouteResult('-');
            }
        }

        measurementMode = mode;
        updateMeasurementButtons();
        resetMeasurementState({ keepMode: true });
        setMeasurementResult(getMeasurementInstruction(mode));
    }

    // 計測用クリック処理
    function handleMeasurementClick(latlng) {
        if (!map || !latlng) return;

        measurementState.points.push(latlng);

        const marker = L.circleMarker(latlng, {
            radius: 5,
            color: measurementMode === 'area' ? '#E91E63' : '#009688',
            weight: 2,
            fillColor: '#ffffff',
            fillOpacity: 1
        }).addTo(map);
        measurementState.markers.push(marker);

        if (measurementMode === 'distance') {
            updateDistanceMeasurement();
        } else if (measurementMode === 'area') {
            updateAreaMeasurement();
        }
    }

    // 距離計測の更新
    function updateDistanceMeasurement() {
        const points = measurementState.points;
        if (!map || points.length < 1) return;

        updateMeasurementLayer('distance');

        if (points.length < 2) {
            setMeasurementResult('距離計測: 次の点をクリックしてください。');
            return;
        }

        let total = 0;
        for (let i = 1; i < points.length; i++) {
            total += map.distance(points[i - 1], points[i]);
        }

        const formatted = formatDistance(total);
        setMeasurementResult(`距離: ${formatted} (${points.length}点)`, 'success');
    }

    // 面積計測の更新
    function updateAreaMeasurement() {
        const points = measurementState.points;
        if (!map || points.length < 1) return;

        updateMeasurementLayer('area');

        if (points.length < 3) {
            const msg = points.length < 2
                ? '面積計測: 1点目が登録されました。続けてクリックしてください。'
                : '面積計測: 3点以上で面積を計算します。';
            setMeasurementResult(msg);
            return;
        }

        const area = computePolygonArea(points);
        const perimeter = computePerimeter(points, true);

        const areaText = formatArea(area);
        const perimeterText = formatDistance(perimeter);
        setMeasurementResult(`面積: ${areaText} / 周長: ${perimeterText}`, 'success');
    }

    // 計測レイヤーを更新
    function updateMeasurementLayer(mode) {
        if (!map) return;

        if (measurementState.layer) {
            map.removeLayer(measurementState.layer);
            measurementState.layer = null;
        }

        const points = measurementState.points;
        if (points.length < 2) return;

        if (mode === 'distance' || points.length < 3) {
            const color = mode === 'area' ? '#E91E63' : '#009688';
            const dash = mode === 'area' ? '4,6' : '6,6';
            measurementState.layer = L.polyline(points, {
                color,
                weight: 3,
                dashArray: dash
            }).addTo(map);
        } else {
            measurementState.layer = L.polygon(points, {
                color: '#E91E63',
                weight: 2,
                fillColor: '#E91E63',
                fillOpacity: 0.15
            }).addTo(map);
        }
    }

    // 面積計算（球面）
    function computePolygonArea(points) {
        if (points.length < 3) return 0;

        const R = 6378137; // WGS84準拠
        let total = 0;

        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];

            const lon1 = toRadians(p1.lng);
            const lon2 = toRadians(p2.lng);
            const lat1 = toRadians(p1.lat);
            const lat2 = toRadians(p2.lat);

            total += (lon2 - lon1) * (Math.sin(lat1) + Math.sin(lat2));
        }

        return Math.abs(total * R * R / 2.0);
    }

    function computePerimeter(points, closeLoop = false) {
        if (points.length < 2 || !map) return 0;
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            total += map.distance(points[i - 1], points[i]);
        }
        if (closeLoop && points.length > 2) {
            total += map.distance(points[points.length - 1], points[0]);
        }
        return total;
    }

    function toRadians(deg) {
        return deg * Math.PI / 180;
    }

    function formatDistance(meters) {
        if (!Number.isFinite(meters)) return '-';
        if (meters < 1000) {
            return `${Math.round(meters)} m`;
        }
        return `${(meters / 1000).toFixed(2)} km`;
    }

    function formatArea(squareMeters) {
        if (!Number.isFinite(squareMeters)) return '-';
        if (squareMeters < 1_000_000) {
            return `${Math.round(squareMeters)} m²`;
        }
        return `${(squareMeters / 1_000_000).toFixed(2)} km²`;
    }

    function formatDuration(seconds) {
        if (!Number.isFinite(seconds)) return '-';

        const totalSeconds = Math.max(0, Math.round(seconds));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}時間${minutes}分`;
        }

        return `${Math.max(minutes, 1)}分`;
    }

    function handleMeasurementReset() {
        resetMeasurementState({ keepMode: Boolean(measurementMode) });

        if (measurementMode) {
            setMeasurementResult(getMeasurementInstruction(measurementMode));
        } else if (measurementState.summary) {
            setMeasurementResult(measurementState.summary, measurementState.summaryStatus || 'success');
        } else {
            setMeasurementResult('-');
        }
    }

    function resetMeasurementState({ keepMode = false } = {}) {
        if (!map) return;

        measurementState.points.length = 0;
        measurementState.markers.forEach(marker => {
            try {
                map.removeLayer(marker);
            } catch (error) {
                console.error('計測マーカー削除エラー:', error);
            }
        });
        measurementState.markers.length = 0;

        if (measurementState.layer) {
            map.removeLayer(measurementState.layer);
            measurementState.layer = null;
        }

        measurementState.summary = '';
        measurementState.summaryStatus = 'neutral';

        if (!keepMode) {
            measurementMode = null;
            updateMeasurementButtons();
        }
    }

    function updateMeasurementButtons() {
        const distanceBtn = elements.measureDistance;
        const areaBtn = elements.measureArea;

        if (distanceBtn) distanceBtn.classList.remove('active');
        if (areaBtn) areaBtn.classList.remove('active');

        if (measurementMode === 'distance' && distanceBtn) {
            distanceBtn.classList.add('active');
        } else if (measurementMode === 'area' && areaBtn) {
            areaBtn.classList.add('active');
        }
    }

    function getMeasurementInstruction(mode) {
        if (mode === 'distance') {
            return '距離計測: 地図をクリックして経路を追加（計測リセットでやり直し）。';
        }
        if (mode === 'area') {
            return '面積計測: 地図をクリックして頂点を追加（3点以上で面積算出）。';
        }
        return '-';
    }

    // マーカーフィルター制御
    function initializeMarkerFilter() {
        const select = elements.markerFilter;
        if (!select) return;

        Object.entries(MARKER_ICONS).forEach(([key, info]) => {
            if (select.querySelector(`option[value="${key}"]`)) return;
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${info.emoji} ${info.label}`;
            select.appendChild(option);
        });

        select.value = currentMarkerFilter;
        select.addEventListener('change', handleMarkerFilterChange);
    }

    function handleMarkerFilterChange() {
        if (!elements.markerFilter) return;
        applyMarkerFilter(elements.markerFilter.value, { updateSelect: false });
    }

    function resetMarkerFilter() {
        applyMarkerFilter('all', { updateSelect: true });
    }

    function applyMarkerFilter(filterValue = 'all', { refreshList = true, updateSelect = false } = {}) {
        if (!map) return;

        const normalized = filterValue || 'all';
        currentMarkerFilter = normalized;

        markers.forEach(marker => {
            if (!marker) return;
            const matches = markerMatchesFilter(marker, normalized);
            const isVisible = map.hasLayer(marker);

            if (matches && !isVisible) {
                marker.addTo(map);
            } else if (!matches && isVisible) {
                map.removeLayer(marker);
                marker.closePopup();
            }
        });

        if (updateSelect && elements.markerFilter) {
            elements.markerFilter.value = normalized;
        }

        updateMarkerFilterStatus();

        if (refreshList) {
            refreshMarkerList();
        }
    }

    function markerMatchesFilter(marker, filterValue) {
        if (!marker || !marker.customData) return true;
        if (filterValue === 'all') return true;
        return marker.customData.iconType === filterValue;
    }

    function updateMarkerFilterStatus() {
        if (!elements.markerFilterStatus) return;

        const total = markers.length;
        const visible = markers.reduce((count, marker) => {
            return count + (markerMatchesFilter(marker, currentMarkerFilter) ? 1 : 0);
        }, 0);

        let label;
        if (currentMarkerFilter === 'all') {
            label = 'すべて';
        } else {
            const info = MARKER_ICONS[currentMarkerFilter];
            label = info ? `${info.emoji} ${info.label}` : currentMarkerFilter;
        }

        const text = total === 0
            ? 'すべて (0/0)'
            : `${label} (${visible}/${total})`;

        elements.markerFilterStatus.classList.remove('status-success', 'status-error');
        if (currentMarkerFilter !== 'all' && total > 0) {
            elements.markerFilterStatus.classList.add('status-success');
        }

        elements.markerFilterStatus.textContent = text;

        if (elements.markerFilterReset) {
            elements.markerFilterReset.disabled = currentMarkerFilter === 'all';
        }
    }

    // ルート選択モードの切り替え
    function setRouteSelectionMode(mode) {
        if (!map) return;

        if (routeState.selectionMode === mode) {
            routeState.selectionMode = null;
            updateRouteButtons();
            if (routeState.summary) {
                setRouteResult(routeState.summary, routeState.summaryStatus || 'success');
            } else {
                setRouteResult('-');
            }
            return;
        }

        routeState.selectionMode = mode;
        updateRouteButtons();

        if (measurementMode) {
            resetMeasurementState();
            setMeasurementResult('-');
        }

        const instruction = mode === 'start'
            ? '出発地を地図でクリックしてください。'
            : '到着地を地図でクリックしてください。';

        setRouteResult(instruction);
    }

    function handleRouteSelection(latlng) {
        if (!map || !latlng || !routeState.selectionMode) return;

        clearRouteLayer();
        routeState.summary = '';
        routeState.summaryStatus = 'neutral';

        if (routeState.selectionMode === 'start') {
            setRoutePoint('start', latlng);
            if (routeState.end) {
                routeState.selectionMode = null;
                updateRouteButtons();
                setRouteResult('ルートを計算しています…');
                requestRoute(true);
            } else {
                routeState.selectionMode = 'end';
                updateRouteButtons();
                setRouteResult('出発地を設定しました。到着地を地図でクリックしてください。');
            }
            return;
        }

        if (routeState.selectionMode === 'end') {
            setRoutePoint('end', latlng);
            routeState.selectionMode = null;
            updateRouteButtons();

            if (!routeState.start) {
                routeState.selectionMode = 'start';
                updateRouteButtons();
                setRouteResult('到着地を設定しました。出発地を地図でクリックしてください。');
                return;
            }

            setRouteResult('ルートを計算しています…');
            requestRoute(true);
        }
    }

    function setRoutePoint(type, latlng) {
        const point = L.latLng(latlng.lat, latlng.lng);
        if (type === 'start') {
            routeState.start = point;
            if (routeState.startMarker) {
                map.removeLayer(routeState.startMarker);
            }
            routeState.startMarker = createRouteMarker(point, 'start');
        } else {
            routeState.end = point;
            if (routeState.endMarker) {
                map.removeLayer(routeState.endMarker);
            }
            routeState.endMarker = createRouteMarker(point, 'end');
        }
    }

    function createRouteMarker(latlng, type) {
        const isStart = type === 'start';
        const color = isStart ? '#4CAF50' : '#F44336';
        const label = isStart ? '出発地' : '到着地';

        const marker = L.circleMarker(latlng, {
            radius: 9,
            weight: 3,
            color,
            fillColor: '#ffffff',
            fillOpacity: 1
        }).addTo(map);

        marker.bindTooltip(label, {
            permanent: true,
            direction: 'top',
            offset: [0, -12]
        });

        return marker;
    }

    function requestRoute(auto = false) {
        if (!map) return;

        if (!routeState.start || !routeState.end) {
            if (!auto) {
                setRouteResult('出発地と到着地を設定してください。', 'error');
            }
            return;
        }

        toggleRouteLoading(true);
        setRouteResult('ルート取得中…');

        const start = routeState.start;
        const end = routeState.end;

        const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data?.code && data.code !== 'Ok') {
                    throw new Error(`API応答コード: ${data.code}`);
                }

                const routes = data?.routes;
                if (!Array.isArray(routes) || routes.length === 0) {
                    throw new Error('ルートが見つかりませんでした');
                }

                const route = routes[0];
                drawRouteGeometry(route.geometry);

                const distanceText = formatDistance(route.distance);
                const durationText = formatDuration(route.duration);
                const summaryText = `距離: ${distanceText} / 所要時間: ${durationText}`;

                setRouteResult(summaryText, 'success');

                if (routeState.routeLayer) {
                    try {
                        map.fitBounds(routeState.routeLayer.getBounds(), { padding: [40, 40] });
                    } catch (error) {
                        console.error('ルートの表示調整エラー:', error);
                    }
                }
            })
            .catch(error => {
                console.error('ルート取得エラー:', error);
                setRouteResult(`ルート取得に失敗しました: ${error.message}`, 'error');
            })
            .finally(() => {
                toggleRouteLoading(false);
                routeState.selectionMode = null;
                updateRouteButtons();
            });
    }

    function drawRouteGeometry(geometry) {
        if (!map || !geometry) return;

        clearRouteLayer();

        let coordinates = [];

        if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
            coordinates = geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else if (Array.isArray(geometry)) {
            coordinates = geometry.map(coord => [coord[1], coord[0]]);
        } else if (geometry.coordinates) {
            coordinates = geometry.coordinates.map(coord => [coord[1], coord[0]]);
        }

        if (!coordinates.length) return;

        routeState.routeLayer = L.polyline(coordinates, {
            color: '#2196F3',
            weight: 5,
            opacity: 0.9
        }).addTo(map);
    }

    function handleRouteClear() {
        clearRoute();
    }

    function clearRoute({ silent = false } = {}) {
        if (!map) return;

        if (routeState.startMarker) {
            map.removeLayer(routeState.startMarker);
            routeState.startMarker = null;
        }
        if (routeState.endMarker) {
            map.removeLayer(routeState.endMarker);
            routeState.endMarker = null;
        }

        clearRouteLayer();

        routeState.start = null;
        routeState.end = null;
        routeState.selectionMode = null;
        routeState.summary = '';
        routeState.summaryStatus = 'neutral';

        updateRouteButtons();
        toggleRouteLoading(false);

        if (!silent) {
            setRouteResult('-');
        }
    }

    function clearRouteLayer() {
        if (routeState.routeLayer && map) {
            map.removeLayer(routeState.routeLayer);
            routeState.routeLayer = null;
        }
    }

    function updateRouteButtons() {
        const { routeStart, routeEnd } = elements;
        if (routeStart) routeStart.classList.remove('active');
        if (routeEnd) routeEnd.classList.remove('active');

        if (routeState.selectionMode === 'start' && routeStart) {
            routeStart.classList.add('active');
        } else if (routeState.selectionMode === 'end' && routeEnd) {
            routeEnd.classList.add('active');
        }
    }

    function toggleRouteLoading(isLoading) {
        if (elements.routeShow) {
            elements.routeShow.disabled = Boolean(isLoading);
        }
    }

    // 現在地取得
    function locateUser() {
        if (!map) {
            setCurrentLocationStatus('地図がまだ利用できません', 'error');
            return;
        }

        if (!navigator.geolocation) {
            setCurrentLocationStatus('非対応', 'error');
            alert('このブラウザは現在地取得に対応していません。');
            return;
        }

        setCurrentLocationStatus('取得中…');
        toggleLocateButton(true);

        try {
            navigator.geolocation.getCurrentPosition(
                handleLocationSuccess,
                handleLocationError,
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000
                }
            );
        } catch (error) {
            toggleLocateButton(false);
            console.error('現在地取得エラー:', error);
            setCurrentLocationStatus('現在地取得でエラーが発生しました', 'error');
            alert('現在地を取得できませんでした。ページをHTTPSで開いているか確認してください。');
        }
    }

    function handleLocationSuccess(position) {
        toggleLocateButton(false);

        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            setCurrentLocationStatus('位置情報が取得できませんでした', 'error');
            return;
        }

        clearUserLocationMarker();

        const latlng = [lat, lng];

        userLocationMarker = L.circleMarker(latlng, {
            radius: 8,
            color: '#1E88E5',
            weight: 2,
            fillColor: '#2196F3',
            fillOpacity: 0.9
        }).addTo(map);

        let accuracyText = '';

        if (Number.isFinite(accuracy) && accuracy > 0) {
            const roundedAccuracy = Math.max(Math.round(accuracy), 1);
            accuracyText = ` (±${roundedAccuracy}m)`;

            userAccuracyCircle = L.circle(latlng, {
                radius: accuracy,
                color: '#64B5F6',
                weight: 1,
                fillColor: '#64B5F6',
                fillOpacity: 0.15
            }).addTo(map);

            userLocationMarker.bindPopup(`現在地${accuracyText}`).openPopup();
        } else {
            userLocationMarker.bindPopup('現在地').openPopup();
        }

        const desiredZoom = accuracy > 1000 ? 14 : 16;
        map.flyTo(latlng, desiredZoom, { duration: 0.8 });

        setCurrentLocationStatus(`${lat.toFixed(4)}, ${lng.toFixed(4)}${accuracyText}`, 'success');
    }

    function handleLocationError(error) {
        toggleLocateButton(false);

        const code = Number(error?.code);
        let message = '不明なエラーが発生しました';

        if (code === 1) {
            message = '位置情報の利用が拒否されました';
        } else if (code === 2) {
            message = '位置情報を取得できませんでした';
        } else if (code === 3) {
            message = '位置情報の取得がタイムアウトしました';
        }

        setCurrentLocationStatus(message, 'error');
        console.error('現在地取得エラー:', error);
        alert('現在地を取得できませんでした: ' + message);
    }

    function clearUserLocationMarker() {
        if (userLocationMarker && map) {
            map.removeLayer(userLocationMarker);
            userLocationMarker = null;
        }
        if (userAccuracyCircle && map) {
            map.removeLayer(userAccuracyCircle);
            userAccuracyCircle = null;
        }
    }

    function toggleLocateButton(isLoading) {
        if (!elements.locateMe) return;
        elements.locateMe.disabled = Boolean(isLoading);
    }

    function setMeasurementResult(text, status = 'neutral') {
        if (!elements.measurementResult) return;

        elements.measurementResult.textContent = text;
        elements.measurementResult.classList.remove('status-success', 'status-error');

        if (status === 'success') {
            elements.measurementResult.classList.add('status-success');
            measurementState.summary = text;
            measurementState.summaryStatus = 'success';
        } else if (status === 'error') {
            elements.measurementResult.classList.add('status-error');
            measurementState.summary = '';
            measurementState.summaryStatus = 'error';
        } else if (!measurementMode && measurementState.points.length === 0) {
            measurementState.summary = '';
            measurementState.summaryStatus = 'neutral';
        }
    }

    function setRouteResult(text, status = 'neutral') {
        if (!elements.routeResult) return;

        elements.routeResult.textContent = text;
        elements.routeResult.classList.remove('status-success', 'status-error');

        if (status === 'success') {
            elements.routeResult.classList.add('status-success');
            routeState.summary = text;
            routeState.summaryStatus = 'success';
        } else if (status === 'error') {
            elements.routeResult.classList.add('status-error');
            routeState.summary = '';
            routeState.summaryStatus = 'error';
        } else if (text === '-' || !text) {
            routeState.summary = '';
            routeState.summaryStatus = 'neutral';
        }
    }

    function setCurrentLocationStatus(text, status = 'neutral') {
        if (!elements.currentLocation) return;

        elements.currentLocation.textContent = text;
        elements.currentLocation.classList.remove('status-success', 'status-error');

        if (status === 'success') {
            elements.currentLocation.classList.add('status-success');
        } else if (status === 'error') {
            elements.currentLocation.classList.add('status-error');
        }
    }

    // マーカーダイアログの設定
    function setupMarkerDialog() {
        // アイコン選択
        document.querySelectorAll('.icon-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
            });
        });

        // 保存ボタン
        elements.saveMarker.addEventListener('click', saveMarker);

        // キャンセルボタン
        elements.cancelMarker.addEventListener('click', closeMarkerDialog);

        // 削除ボタン
        elements.deleteMarker.addEventListener('click', deleteCurrentMarker);

        // ダイアログの外側クリックで閉じる
        elements.markerDialog.addEventListener('click', (e) => {
            if (e.target === elements.markerDialog) {
                closeMarkerDialog();
            }
        });
    }

    // マーカーダイアログを開く
    function openMarkerDialog(latlng, existingMarker = null) {
        currentEditingMarker = existingMarker;

        if (existingMarker) {
            // 既存マーカーの編集
            elements.markerTitle.value = existingMarker.customData?.title || '';
            elements.markerDescription.value = existingMarker.customData?.description || '';
            elements.deleteMarker.style.display = 'block';

            // アイコン選択
            const iconType = existingMarker.customData?.iconType || 'default';
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            document.querySelector(`[data-icon="${iconType}"]`)?.classList.add('selected');
        } else {
            // 新規マーカー
            elements.markerTitle.value = '';
            elements.markerDescription.value = '';
            elements.deleteMarker.style.display = 'none';

            // デフォルトアイコンを選択
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            document.querySelector('[data-icon="default"]').classList.add('selected');
        }

        // 位置情報を保存
        currentEditingMarker = currentEditingMarker || { latlng };

        elements.markerDialog.classList.add('active');
        elements.markerTitle.focus();
    }

    // マーカーダイアログを閉じる
    function closeMarkerDialog() {
        elements.markerDialog.classList.remove('active');
        currentEditingMarker = null;
    }

    // マーカーを保存
    function saveMarker() {
        const title = elements.markerTitle.value.trim();
        const description = elements.markerDescription.value.trim();
        const selectedIcon = document.querySelector('.icon-option.selected');
        const iconType = selectedIcon ? selectedIcon.dataset.icon : 'default';

        if (!title) {
            alert('タイトルを入力してください');
            return;
        }

        const customData = {
            title,
            description,
            iconType,
            emoji: MARKER_ICONS[iconType].emoji
        };

        if (currentEditingMarker.customData) {
            // 既存マーカーの更新
            updateExistingMarker(currentEditingMarker, customData);
        } else {
            // 新規マーカーの作成
            createNewMarker(currentEditingMarker.latlng, customData);
        }

        closeMarkerDialog();
    }

    // 新規マーカーを作成
    function createNewMarker(latlng, customData) {
        // IDが未設定の場合は新しいIDを割り当て
        if (!customData.id) {
            customData.id = nextMarkerId++;
        }

        const icon = createCustomIcon(customData.iconType, customData.title);

        const marker = L.marker(latlng, { icon })
            .addTo(map);

        // カスタムデータを保存
        marker.customData = { ...customData, lat: latlng.lat, lng: latlng.lng };

        // ポップアップを設定
        updateMarkerPopup(marker);

        // クリックイベントで編集
        marker.on('click', () => {
            openMarkerDialog(null, marker);
        });

        markers.push(marker);

        // ローカルストレージに保存
        saveMarkersToStorage();

        const shouldRefreshList = Boolean(elements.markerManagerDialog?.classList.contains('active'));
        applyMarkerFilter(currentMarkerFilter, {
            refreshList: shouldRefreshList,
            updateSelect: false
        });
    }

    // 既存マーカーを更新
    function updateExistingMarker(marker, customData) {
        const icon = createCustomIcon(customData.iconType, customData.title);
        marker.setIcon(icon);

        // 位置情報を保持
        const latlng = marker.getLatLng();
        marker.customData = { ...customData, lat: latlng.lat, lng: latlng.lng };

        updateMarkerPopup(marker);

        // ローカルストレージに保存
        saveMarkersToStorage();

        const shouldRefreshList = Boolean(elements.markerManagerDialog?.classList.contains('active'));
        applyMarkerFilter(currentMarkerFilter, {
            refreshList: shouldRefreshList,
            updateSelect: false
        });
    }

    // カスタムアイコンを作成（タイトル表示付き）
    function createCustomIcon(iconType, title) {
        const iconData = MARKER_ICONS[iconType];
        const safeTitle = escapeHTML(title);

        return L.divIcon({
            html: `<div class="marker-container">
                <div class="marker-icon" style="
                    background: ${iconData.color};
                    width: 30px;
                    height: 30px;
                    border-radius: 50% 50% 50% 0;
                    border: 2px solid white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    transform: rotate(-45deg);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">
                    <span style="transform: rotate(45deg);">${iconData.emoji}</span>
                </div>
                <div class="marker-label" style="
                    position: absolute;
                    top: -25px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 12px;
                    font-weight: bold;
                    white-space: nowrap;
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                ">${safeTitle}</div>
            </div>`,
            className: 'custom-marker-with-label',
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });
    }

    // マーカーのポップアップを更新
    function updateMarkerPopup(marker) {
        const data = marker.customData;
        const latlng = marker.getLatLng();

        const safeTitle = escapeHTML(data.title);
        const safeDesc = escapeHTML(data.description || '');
        const editBtnId = `edit-btn-${data.id}`;

        let popupContent = `<div style="min-width: 220px;">
            <h4 style="margin: 0 0 5px 0; color: #333;">${data.emoji} ${safeTitle}</h4>`;

        if (data.description) {
            popupContent += `<p style="margin: 5px 0; color: #666; font-size: 14px;">${safeDesc}</p>`;
        }

        popupContent += `<p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">
            緯度: ${latlng.lat.toFixed(6)}<br>
            経度: ${latlng.lng.toFixed(6)}
        </p>
        <div style="text-align: center; margin-top: 10px;">
            <button id="${editBtnId}" style="
                background: #4CAF50; color: white; border: none; padding: 5px 10px;
                border-radius: 3px; cursor: pointer; font-size: 12px;">編集</button>
        </div></div>`;

        marker.bindPopup(popupContent);

        // ポップアップ表示時にボタンのイベントをバインド（グローバル依存を排除）
        if (marker._editHandler) {
            marker.off('popupopen', marker._editHandler);
        }
        marker._editHandler = () => {
            const btn = document.getElementById(editBtnId);
            if (btn) {
                btn.addEventListener('click', () => openMarkerDialog(null, marker));
            }
        };
        marker.on('popupopen', marker._editHandler);
    }

    // 現在のマーカーを削除
    function deleteCurrentMarker() {
        if (currentEditingMarker && currentEditingMarker.customData) {
            const index = markers.indexOf(currentEditingMarker);
            if (index > -1) {
                map.removeLayer(currentEditingMarker);
                markers.splice(index, 1);
            }
            closeMarkerDialog();

            // ローカルストレージに保存
            saveMarkersToStorage();

            const shouldRefreshList = Boolean(elements.markerManagerDialog?.classList.contains('active'));
            applyMarkerFilter(currentMarkerFilter, {
                refreshList: shouldRefreshList,
                updateSelect: false
            });
        }
    }

    // マーカーをローカルストレージに保存
    function saveMarkersToStorage() {
        try {
            const markerData = markers.map(marker => marker.customData);
            localStorage.setItem('webmap_markers', JSON.stringify(markerData));
            console.log('マーカーデータを保存しました:', markerData.length + '件');
        } catch (error) {
            console.error('マーカーデータの保存に失敗:', error);
        }
    }

    // 保存されたマーカーを読み込み
    function loadSavedMarkers() {
        try {
            const savedData = localStorage.getItem('webmap_markers');
            if (savedData) {
                const markerData = JSON.parse(savedData);
                let maxId = 0;
                markerData.forEach(data => {
                    const latOk = Number.isFinite(Number(data.lat));
                    const lngOk = Number.isFinite(Number(data.lng));
                    if (latOk && lngOk && data.title) {
                        // IDの補完と最大IDの更新
                        if (typeof data.id !== 'number' || !Number.isFinite(data.id)) {
                            data.id = ++maxId;
                        } else {
                            maxId = Math.max(maxId, data.id);
                        }

                        const latlng = L.latLng(Number(data.lat), Number(data.lng));

                        const icon = createCustomIcon(data.iconType || 'default', data.title);
                        const marker = L.marker(latlng, { icon }).addTo(map);

                        const iconType = data.iconType || 'default';
                        marker.customData = {
                            ...data,
                            iconType,
                            emoji: MARKER_ICONS[iconType]?.emoji || data.emoji || '📍'
                        };
                        updateMarkerPopup(marker);

                        marker.on('click', () => {
                            openMarkerDialog(null, marker);
                        });

                        markers.push(marker);
                    }
                });

                // 次のIDを設定
                if (maxId > 0) {
                    nextMarkerId = maxId + 1;
                }

                console.log('保存されたマーカーを読み込みました:', markers.length + '件');
            }
        } catch (error) {
            console.error('マーカーデータの読み込みに失敗:', error);
        }

        applyMarkerFilter(currentMarkerFilter, {
            refreshList: false,
            updateSelect: true
        });
    }

    // マーカー管理の設定
    function setupMarkerManager() {
        // 管理ダイアログを閉じる
        elements.closeMarkerManager.addEventListener('click', closeMarkerManager);

        // エクスポートボタン
        elements.exportMarkers.addEventListener('click', exportMarkers);

        // インポートボタン
        elements.importMarkers.addEventListener('click', () => {
            elements.importFile.click();
        });

        // ファイル選択
        elements.importFile.addEventListener('change', importMarkers);

        // ダイアログの外側クリックで閉じる
        elements.markerManagerDialog.addEventListener('click', (e) => {
            if (e.target === elements.markerManagerDialog) {
                closeMarkerManager();
            }
        });
    }

    // マーカー管理ダイアログを開く
    function openMarkerManager() {
        refreshMarkerList();
        elements.markerManagerDialog.classList.add('active');
    }

    // マーカー管理ダイアログを閉じる
    function closeMarkerManager() {
        elements.markerManagerDialog.classList.remove('active');
    }

    // マーカーリストを更新（安全なDOM操作）
    function refreshMarkerList() {
        const listContainer = elements.markerList;
        if (!listContainer) return;

        updateMarkerFilterStatus();

        const filteredMarkers = markers.filter(marker => markerMatchesFilter(marker, currentMarkerFilter));

        if (filteredMarkers.length === 0) {
            const message = markers.length === 0
                ? 'まだマーカーが設定されていません'
                : '現在のフィルターに一致するマーカーがありません';
            listContainer.innerHTML = `<div class="empty-marker-list">${message}</div>`;
            return;
        }

        listContainer.innerHTML = '';

        filteredMarkers.forEach((marker) => {
            const data = marker.customData;
            const markerItem = document.createElement('div');
            markerItem.className = 'marker-item';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'marker-icon-display';
            iconDiv.textContent = data.emoji;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'marker-info';

            const titleEl = document.createElement('h4');
            titleEl.textContent = data.title;

            const descEl = document.createElement('p');
            const desc = data.description || '説明なし';
            descEl.textContent = `${desc} • ${Number(data.lat).toFixed(4)}, ${Number(data.lng).toFixed(4)}`;

            infoDiv.appendChild(titleEl);
            infoDiv.appendChild(descEl);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'marker-actions';

            const gotoBtn = document.createElement('button');
            gotoBtn.className = 'btn-goto';
            gotoBtn.textContent = '移動';
            gotoBtn.addEventListener('click', () => {
                const latlng = marker.getLatLng();
                map.setView(latlng, 15);
                marker.openPopup();
                closeMarkerManager();
            });

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-edit';
            editBtn.textContent = '編集';
            editBtn.addEventListener('click', () => {
                closeMarkerManager();
                openMarkerDialog(null, marker);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete';
            delBtn.textContent = '削除';
            delBtn.addEventListener('click', () => {
                if (confirm('このマーカーを削除しますか？')) {
                    map.removeLayer(marker);
                    const markerIndex = markers.indexOf(marker);
                    if (markerIndex > -1) {
                        markers.splice(markerIndex, 1);
                    }
                    saveMarkersToStorage();
                    applyMarkerFilter(currentMarkerFilter, {
                        refreshList: true,
                        updateSelect: false
                    });
                }
            });

            actionsDiv.appendChild(gotoBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            markerItem.appendChild(iconDiv);
            markerItem.appendChild(infoDiv);
            markerItem.appendChild(actionsDiv);

            listContainer.appendChild(markerItem);
        });
    }

    // マーカーデータをエクスポート
    function exportMarkers() {
        try {
            const markerData = markers.map(marker => marker.customData);
            const dataStr = JSON.stringify(markerData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const now = new Date();
            const timestamp = now.getFullYear() +
                ('0' + (now.getMonth() + 1)).slice(-2) +
                ('0' + now.getDate()).slice(-2) + '_' +
                ('0' + now.getHours()).slice(-2) +
                ('0' + now.getMinutes()).slice(-2);

            const filename = `webmap_markers_${timestamp}.json`;

            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log(`マーカーデータをエクスポートしました: ${filename}`);
        } catch (error) {
            console.error('エクスポートエラー:', error);
            alert('エクスポートに失敗しました。');
        }
    }

    // マーカーデータをインポート
    function importMarkers(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);

                if (!Array.isArray(importedData)) {
                    throw new Error('無効なファイル形式です');
                }

                // 既存マーカーをクリア
                clearMarkers();

                // インポートしたマーカーを作成
                importedData.forEach(data => {
                    const latOk = Number.isFinite(Number(data.lat));
                    const lngOk = Number.isFinite(Number(data.lng));
                    if (latOk && lngOk && data.title) {
                        const latlng = L.latLng(Number(data.lat), Number(data.lng));
                        createNewMarker(latlng, data);
                    }
                });

                refreshMarkerList();
                alert(`${importedData.length}件のマーカーをインポートしました。`);

            } catch (error) {
                console.error('インポートエラー:', error);
                alert('ファイルの読み込みに失敗しました。正しいJSONファイルを選択してください。');
            }
        };

        reader.readAsText(file);
        event.target.value = ''; // ファイル選択をリセット
    }

    // 地図画像をキャプチャして保存
    function captureMapImage() {
        // ボタンを無効化
        elements.saveImage.textContent = '📷 保存中...';
        elements.saveImage.disabled = true;

        const mapEl = document.getElementById('map');
        const rect = mapEl.getBoundingClientRect();

        setTimeout(() => {
            html2canvas(mapEl, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                width: rect.width,
                height: rect.height,
                scrollX: 0,
                scrollY: 0
            }).then(canvas => {
                // 画像をダウンロード
                downloadImage(canvas);

                // ボタンを元に戻す
                elements.saveImage.textContent = '📷 画像保存';
                elements.saveImage.disabled = false;
            }).catch(error => {
                console.error('スクリーンショット撮影エラー:', error);

                // ボタンを元に戻す
                elements.saveImage.textContent = '📷 画像保存';
                elements.saveImage.disabled = false;

                alert('画像の保存に失敗しました。');
            });
        }, 50);
    }

    // 画像をダウンロード
    function downloadImage(canvas) {
        try {
            // 現在の日時でファイル名を生成
            const now = new Date();
            const timestamp = now.getFullYear() +
                ('0' + (now.getMonth() + 1)).slice(-2) +
                ('0' + now.getDate()).slice(-2) + '_' +
                ('0' + now.getHours()).slice(-2) +
                ('0' + now.getMinutes()).slice(-2) +
                ('0' + now.getSeconds()).slice(-2);

            const filename = `webmap_${timestamp}.png`;

            // Canvas を Blob に変換
            canvas.toBlob(blob => {
                if (blob) {
                    // ダウンロードリンクを作成
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;

                    // リンクをクリックしてダウンロード
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // URLを解放
                    URL.revokeObjectURL(url);

                    console.log(`地図画像を保存しました: ${filename}`);
                } else {
                    throw new Error('Blob作成に失敗しました');
                }
            }, 'image/png', 1.0);

        } catch (error) {
            console.error('ダウンロードエラー:', error);
            alert('画像のダウンロードに失敗しました。');
        }
    }

    // 住所検索を実行（改良版：段階的検索）
    async function performSearch() {
        const query = elements.addressInput.value.trim();
        if (!query) return;

        // 検索中の表示
        elements.searchResults.innerHTML = '<div style="padding: 10px; color: #666;">検索中...</div>';

        let allResults = [];

        // 1. まず入力されたままで検索
        try {
            const results1 = await searchAddress(query + ', Japan');
            allResults = allResults.concat(results1);
        } catch (error) {
            console.error('検索エラー1:', error);
        }

        // 2. 結果が少ない場合、より広い範囲で検索
        if (allResults.length < 3) {
            try {
                const results2 = await searchAddress(query);
                // 重複を除く
                results2.forEach(result => {
                    if (!allResults.some(r => r.place_id === result.place_id)) {
                        allResults.push(result);
                    }
                });
            } catch (error) {
                console.error('検索エラー2:', error);
            }
        }

        // 3. まだ結果が少ない場合、部分一致を試す
        if (allResults.length < 3 && query.length > 2) {
            const parts = query.split(/[\s　,、]+/); // スペースやカンマで分割
            for (let part of parts) {
                if (part.length > 1) {
                    try {
                        const results3 = await searchAddress(part + ', Japan');
                        results3.forEach(result => {
                            if (!allResults.some(r => r.place_id === result.place_id)) {
                                allResults.push(result);
                            }
                        });
                    } catch (error) {
                        console.error('部分検索エラー:', error);
                    }
                }
                if (allResults.length >= 5) break;
            }
        }

        // 結果を表示（最大5件）
        displaySearchResults(allResults.slice(0, 5), query);
    }

    // 住所検索API呼び出し
    function searchAddress(searchQuery) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&accept-language=ja&countrycodes=jp`;

        return fetch(url)
            .then(response => response.json())
            .then(data => data || []);
    }

    // 検索結果を表示（改良版）
    function displaySearchResults(results, originalQuery) {
        const container = elements.searchResults;
        if (results.length === 0) {
            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'padding: 10px; color: #666;';
            wrap.textContent = `「${originalQuery}」の検索結果が見つかりませんでした`;
            const small = document.createElement('small');
            small.style.color = '#999';
            small.textContent = 'より短いキーワードで試してください';
            wrap.appendChild(document.createElement('br'));
            wrap.appendChild(small);
            container.appendChild(wrap);
            return;
        }

        container.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding: 5px 10px; font-size: 12px; color: #666; border-bottom: 1px solid #eee;';
        header.textContent = `${results.length}件の候補が見つかりました`;
        container.appendChild(header);

        results.forEach((result) => {
            const div = document.createElement('div');
            div.className = 'search-result';

            // 場所の名前を取得（より見やすく）
            const display = String(result.display_name || '');
            const nameParts = display.split(',');
            const mainName = nameParts[0] || '';
            const subName = nameParts.slice(1, 3).join(', ');

            const nameEl = document.createElement('div');
            nameEl.className = 'search-result-name';
            nameEl.textContent = mainName;

            const addrEl = document.createElement('div');
            addrEl.className = 'search-result-address';
            addrEl.textContent = subName || nameParts[1] || '';

            div.appendChild(nameEl);
            div.appendChild(addrEl);

            div.addEventListener('click', () => {
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

                // 地図を移動
                map.setView([lat, lng], 15);

                // 一時マーカーを追加
                const marker = L.marker([lat, lng])
                    .addTo(map)
                    .bindPopup(`<b>${escapeHTML(mainName)}</b><br>${escapeHTML(display)}`)
                    .openPopup();

                tempMarkers.push(marker);

                // 検索結果をクリア
                container.innerHTML = '';
                elements.addressInput.value = '';
            });

            container.appendChild(div);
        });
    }

    // デバウンス関数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // DOMContentLoadedで初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMap);
    } else {
        initMap();
    }
})();
