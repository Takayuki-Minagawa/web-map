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

    // 主要都市の座標（定数）
    const CITIES = {
        tokyo: { lat: 35.6762, lng: 139.6503, name: '東京' },
        osaka: { lat: 34.6937, lng: 135.5023, name: '大阪' },
        kyoto: { lat: 35.0116, lng: 135.7681, name: '京都' }
    };

    // マーカーアイコンの定義
    const MARKER_ICONS = {
        default: { emoji: '📍', color: '#ff0000' },
        home: { emoji: '🏠', color: '#4CAF50' },
        work: { emoji: '🏢', color: '#2196F3' },
        food: { emoji: '🍽️', color: '#FF9800' },
        shop: { emoji: '🛒', color: '#9C27B0' },
        hospital: { emoji: '🏥', color: '#f44336' },
        school: { emoji: '🏫', color: '#607D8B' },
        park: { emoji: '🌳', color: '#4CAF50' },
        star: { emoji: '⭐', color: '#FFC107' }
    };

    // DOM要素のキャッシュ
    const elements = {};

    // 初期化
    function initMap() {
        try {
            // DOM要素をキャッシュ
            cacheElements();

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

                        marker.customData = data;
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

        if (markers.length === 0) {
            listContainer.innerHTML = '<div class="empty-marker-list">まだマーカーが設定されていません</div>';
            return;
        }

        listContainer.innerHTML = '';

        markers.forEach((marker, index) => {
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
                    markers.splice(index, 1);
                    saveMarkersToStorage();
                    refreshMarkerList();
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
