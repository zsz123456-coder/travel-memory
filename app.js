// ==================== 小旅行 · 地点故事地图 ====================

const STORAGE_KEY = 'little_travel_app';

let appData = { trips: [], currentTripId: null, currentLocationId: null };
let map = null;
let markers = [];
let currentTripLocations = [];

// 时间轴相关变量
let timelineLocations = [];
let currentPlayIndex = -1;
let isPlaying = false;
let playInterval = null;
let movingManMarker = null;
let manAnimationId = null;

function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function loadData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            appData = JSON.parse(saved);
        } catch(e) {}
    }
    if (!appData.trips) appData.trips = [];
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    if (pageId === 'mapPage' && map) {
        setTimeout(() => map.invalidateSize(), 100);
        updateMapMarkers();
        renderTimeline();
    }
    if (pageId === 'tripListPage') renderTripList();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

// ========== 加载动画 ==========
function startLoading(callback) {
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const loadingTip = document.getElementById('loadingTip');
    const tips = ["🎈 正在准备起飞...", "🗺️ 加载地图中...", "🌟 整理回忆...", "✨ 即将出发！"];
    let tipIndex = 0;
    const tipInterval = setInterval(() => {
        tipIndex = (tipIndex + 1) % tips.length;
        if (loadingTip) loadingTip.textContent = tips[tipIndex];
    }, 800);
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            clearInterval(tipInterval);
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            setTimeout(callback, 500);
        }
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressText) progressText.textContent = Math.floor(progress) + '%';
    }, 200);
}

// ========== 地图 ==========
function initMap() {
    const container = document.getElementById('map');
    if (!container) return;
    map = L.map('map').setView([39.9042, 116.4074], 5);
    L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
        attribution: '© 高德地图',
        maxZoom: 18,
        subdomains: ['webrd01', 'webrd02', 'webrd03', 'webrd04']
    }).addTo(map);
}

function updateMapMarkers() {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    if (!trip || !trip.locations) return;
    currentTripLocations = trip.locations;
    currentTripLocations.forEach((loc, idx) => {
        if (!loc.lat || !loc.lng) return;
        const thumbHtml = (loc.images && loc.images[0]) ? `<img src="${loc.images[0]}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">` : '<span>📍</span>';
        const icon = L.divIcon({
            html: `<div class="custom-marker-wrapper">${thumbHtml}<span>${loc.name.substring(0, 10)}</span>${idx < currentTripLocations.length-1 ? '<span>→</span>' : ''}</div>`,
            className: 'custom-marker',
            iconSize: null
        });
        const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(map);
        marker.on('click', () => openLocationDetailDrawer(loc.id));
        markers.push(marker);
    });
    drawRouteLines();
    if (markers.length) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

function drawRouteLines() {
    if (!map) return;
    if (window.routeLayer) map.removeLayer(window.routeLayer);
    window.routeLayer = L.layerGroup().addTo(map);
    if (currentTripLocations.length < 2) return;
    const points = currentTripLocations.map(l => [l.lat, l.lng]);
    L.polyline(points, { color: '#FFB347', weight: 4, opacity: 0.7, dashArray: '8,8' }).addTo(window.routeLayer);
    points.forEach(p => L.circleMarker(p, { radius: 4, color: '#FF8C42', fillColor: '#FFF', weight: 2 }).addTo(window.routeLayer));
}

// ========== 小人平滑移动 ==========
function interpolatePoint(p1, p2, t) {
    return {
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lng: p1.lng + (p2.lng - p1.lng) * t
    };
}

function animateManBetweenPoints(startLoc, endLoc, duration, onComplete) {
    if (manAnimationId) {
        cancelAnimationFrame(manAnimationId);
        manAnimationId = null;
    }
    
    const startPoint = { lat: startLoc.lat, lng: startLoc.lng };
    const endPoint = { lat: endLoc.lat, lng: endLoc.lng };
    const startTime = performance.now();
    
    if (!movingManMarker) {
        const manIcon = L.divIcon({
            html: `<img src="resources/people.jpg" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">`,
            className: 'moving-man',
            iconSize: [36, 36]
        });
        movingManMarker = L.marker([startPoint.lat, startPoint.lng], { icon: manIcon }).addTo(map);
    }
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        let t = Math.min(1, elapsed / duration);
        t = 1 - Math.pow(1 - t, 2);
        const currentPos = interpolatePoint(startPoint, endPoint, t);
        movingManMarker.setLatLng([currentPos.lat, currentPos.lng]);
        
        if (t < 1) {
            manAnimationId = requestAnimationFrame(animate);
        } else {
            manAnimationId = null;
            if (onComplete) onComplete();
        }
    }
    
    manAnimationId = requestAnimationFrame(animate);
}

function stopManAnimation() {
    if (manAnimationId) {
        cancelAnimationFrame(manAnimationId);
        manAnimationId = null;
    }
}

function placeManAtLocation(loc) {
    if (!loc || !loc.lat || !loc.lng) return;
    if (movingManMarker) map.removeLayer(movingManMarker);
    const manIcon = L.divIcon({
        html: `<img src="resources/people.jpg" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">`,
        className: 'moving-man',
        iconSize: [36, 36]
    });
    movingManMarker = L.marker([loc.lat, loc.lng], { icon: manIcon }).addTo(map);
}

// ========== 搜索地点（天地图） ==========
function searchLocation(keyword, callback) {
    const tk = '3a71a344e27412745be1e7aedeb6c366';
    fetch(`https://api.tianditu.gov.cn/geocoder?ds={"keyWord":"${encodeURIComponent(keyword)}"}&tk=${tk}`)
        .then(r => r.json())
        .then(data => {
            if (data.status === '0' && data.location) {
                callback({ name: keyword, address: data.location.keyWord || keyword, lng: parseFloat(data.location.lon), lat: parseFloat(data.location.lat) });
            } else callback(null);
        })
        .catch(() => callback(null));
}

// ========== 时间轴功能 ==========
function renderTimeline() {
    const container = document.getElementById('timelineContent');
    const startDateSpan = document.getElementById('timelineStartDate');
    const endDateSpan = document.getElementById('timelineEndDate');
    
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    if (!trip || !trip.locations || trip.locations.length === 0) {
        if (container) container.innerHTML = '<div class="timeline-empty">📍 暂无地点<br>点击下方按钮添加</div>';
        if (startDateSpan) startDateSpan.textContent = '--';
        if (endDateSpan) endDateSpan.textContent = '--';
        timelineLocations = [];
        if (movingManMarker) {
            map.removeLayer(movingManMarker);
            movingManMarker = null;
        }
        return;
    }
    
    timelineLocations = [...trip.locations].sort((a, b) => {
        const dateA = a.visitDate || a.datetime || new Date().toISOString().split('T')[0];
        const dateB = b.visitDate || b.datetime || new Date().toISOString().split('T')[0];
        return dateA.localeCompare(dateB);
    });
    
    const firstDate = timelineLocations[0]?.visitDate || timelineLocations[0]?.datetime?.split('T')[0] || '未知';
    const lastDate = timelineLocations[timelineLocations.length - 1]?.visitDate || timelineLocations[timelineLocations.length - 1]?.datetime?.split('T')[0] || '未知';
    if (startDateSpan) startDateSpan.textContent = firstDate;
    if (endDateSpan) endDateSpan.textContent = lastDate;
    
    if (container) {
        container.innerHTML = timelineLocations.map((loc, idx) => `
            <div class="timeline-location-item" data-index="${idx}" data-id="${loc.id}">
                <div class="timeline-location-dot"></div>
                <div class="timeline-location-info">
                    <div class="timeline-location-name">${escapeHtml(loc.name)}</div>
                    <div class="timeline-location-date">${loc.visitDate || '日期未设置'}</div>
                </div>
                <div class="timeline-location-time">${idx + 1}/${timelineLocations.length}</div>
            </div>
        `).join('');
    }
    
    document.querySelectorAll('.timeline-location-item').forEach(item => {
        item.onclick = () => {
            const idx = parseInt(item.dataset.index);
            jumpToLocation(idx);
        };
    });
    
    stopPlayTimeline();
    currentPlayIndex = -1;
    if (timelineLocations.length > 0) {
        placeManAtLocation(timelineLocations[0]);
        const fill = document.getElementById('timelineProgressFill');
        if (fill) fill.style.width = '0%';
        document.querySelectorAll('.timeline-location-item').forEach((item, i) => {
            if (i === 0) item.classList.add('active');
            else item.classList.remove('active');
        });
    }
    const playBtn = document.getElementById('timelinePlayBtn');
    if (playBtn) playBtn.innerHTML = '▶ 播放';
}

function jumpToLocation(index) {
    if (!timelineLocations[index]) return;
    const targetLoc = timelineLocations[index];
    
    document.querySelectorAll('.timeline-location-item').forEach((item, i) => {
        if (i === index) item.classList.add('active');
        else item.classList.remove('active');
    });
    
    const progress = ((index + 1) / timelineLocations.length) * 100;
    const fill = document.getElementById('timelineProgressFill');
    if (fill) fill.style.width = progress + '%';
    
    if (currentPlayIndex !== -1 && currentPlayIndex < timelineLocations.length && currentPlayIndex !== index) {
        const fromLoc = timelineLocations[currentPlayIndex];
        const toLoc = targetLoc;
        if (fromLoc && toLoc && fromLoc.lat && toLoc.lat) {
            const distance = Math.sqrt(
                Math.pow(toLoc.lat - fromLoc.lat, 2) + 
                Math.pow(toLoc.lng - fromLoc.lng, 2)
            );
            const duration = Math.min(2500, Math.max(800, distance * 1800));
            animateManBetweenPoints(fromLoc, toLoc, duration, null);
        } else {
            placeManAtLocation(targetLoc);
        }
    } else {
        placeManAtLocation(targetLoc);
    }
    
    currentPlayIndex = index;
}

function startPlayTimeline() {
    if (isPlaying) {
        stopPlayTimeline();
        return;
    }
    if (timelineLocations.length === 0) return;
    
    isPlaying = true;
    const playBtn = document.getElementById('timelinePlayBtn');
    if (playBtn) playBtn.innerHTML = '⏸ 暂停';
    
    let currentIdx = currentPlayIndex === -1 ? 0 : currentPlayIndex;
    
    function playNext() {
        if (!isPlaying) return;
        if (currentIdx >= timelineLocations.length) {
            stopPlayTimeline();
            return;
        }
        
        const targetLoc = timelineLocations[currentIdx];
        
        document.querySelectorAll('.timeline-location-item').forEach((item, i) => {
            if (i === currentIdx) item.classList.add('active');
            else item.classList.remove('active');
        });
        
        const progress = ((currentIdx + 1) / timelineLocations.length) * 100;
        const fill = document.getElementById('timelineProgressFill');
        if (fill) fill.style.width = progress + '%';
        
        if (currentIdx === 0) {
            placeManAtLocation(targetLoc);
            currentPlayIndex = currentIdx;
            currentIdx++;
            setTimeout(playNext, 1500);
        } else {
            const fromLoc = timelineLocations[currentIdx - 1];
            const toLoc = targetLoc;
            if (fromLoc && toLoc && fromLoc.lat && toLoc.lat) {
                const distance = Math.sqrt(
                    Math.pow(toLoc.lat - fromLoc.lat, 2) + 
                    Math.pow(toLoc.lng - fromLoc.lng, 2)
                );
                const duration = Math.min(2500, Math.max(800, distance * 1800));
                animateManBetweenPoints(fromLoc, toLoc, duration, () => {
                    if (isPlaying) {
                        currentPlayIndex = currentIdx;
                        currentIdx++;
                        setTimeout(playNext, 500);
                    }
                });
            } else {
                currentPlayIndex = currentIdx;
                currentIdx++;
                setTimeout(playNext, 500);
            }
        }
    }
    
    playNext();
}

function stopPlayTimeline() {
    isPlaying = false;
    stopManAnimation();
    const playBtn = document.getElementById('timelinePlayBtn');
    if (playBtn) playBtn.innerHTML = '▶ 播放';
}

function resetPlayProgress() {
    stopPlayTimeline();
    if (timelineLocations.length > 0) {
        currentPlayIndex = -1;
        placeManAtLocation(timelineLocations[0]);
        document.querySelectorAll('.timeline-location-item').forEach((item, i) => {
            if (i === 0) item.classList.add('active');
            else item.classList.remove('active');
        });
        const fill = document.getElementById('timelineProgressFill');
        if (fill) fill.style.width = '0%';
    } else {
        if (movingManMarker) {
            map.removeLayer(movingManMarker);
            movingManMarker = null;
        }
        const fill = document.getElementById('timelineProgressFill');
        if (fill) fill.style.width = '0%';
    }
}

function toggleTimelineSidebar() {
    const sidebar = document.getElementById('timelineSidebar');
    sidebar.classList.toggle('collapsed');
}

// ========== 底部抽屉 ==========
function closeAllDrawers() {
    document.querySelectorAll('.bottom-drawer').forEach(d => d.classList.remove('open'));
    const overlay = document.getElementById('drawerOverlay');
    if (overlay) overlay.style.display = 'none';
}

function openAddLocationDrawer() {
    const drawer = document.getElementById('addLocationDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const input = document.getElementById('drawerLocationInput');
    if (input) input.value = '';
    document.getElementById('drawerSearchResults').style.display = 'none';
    drawer.classList.add('open');
    overlay.style.display = 'block';
    setTimeout(() => input?.focus(), 300);
}

function searchAndShowResults() {
    const keyword = document.getElementById('drawerLocationInput').value;
    const resultsDiv = document.getElementById('drawerSearchResults');
    if (!keyword.trim()) { resultsDiv.style.display = 'none'; return; }
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;">🔍 搜索中...</div>';
    searchLocation(keyword, (result) => {
        if (result) {
            resultsDiv.innerHTML = `<div class="drawer-search-result-item" onclick="selectAndAddLocation('${result.lng}', '${result.lat}', '${escapeHtml(result.name)}', '${escapeHtml(result.address)}')">
                <div style="font-weight:bold;">📍 ${escapeHtml(result.name)}</div>
                <div style="font-size:12px;">${escapeHtml(result.address)}</div>
            </div>`;
        } else {
            resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#dc3545;">❌ 未找到，请尝试更具体的地点</div>';
        }
    });
}

window.selectAndAddLocation = function(lng, lat, name, address) {
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    if (trip) {
        const newLoc = {
            id: generateId(), name, address, lat: parseFloat(lat), lng: parseFloat(lng),
            coverImage: null, story: '', images: [], tags: [], visitDate: new Date().toISOString().split('T')[0], rating: 0
        };
        if (!trip.locations) trip.locations = [];
        trip.locations.push(newLoc);
        saveData();
        updateMapMarkers();
        renderTimeline();
        closeAllDrawers();
        openLocationDetailDrawer(newLoc.id);
    }
};

function openLocationDetailDrawer(locationId) {
    appData.currentLocationId = locationId;
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    const loc = trip?.locations.find(l => l.id === locationId);
    if (!loc) return;
    document.getElementById('drawerLocationName').textContent = loc.name;
    document.getElementById('drawerAddress').textContent = loc.address;
    document.getElementById('drawerVisitDate').value = loc.visitDate || '';
    document.getElementById('drawerStory').value = loc.story || '';
    const stars = document.querySelectorAll('#drawerRatingStars span');
    stars.forEach((s, i) => { s.textContent = i < (loc.rating || 0) ? '★' : '☆'; if (i < (loc.rating || 0)) s.classList.add('active'); else s.classList.remove('active'); });
    renderDrawerImages(loc.images || []);
    renderDrawerTags(loc.tags || []);
    document.getElementById('locationDetailDrawer').classList.add('open');
    document.getElementById('drawerOverlay').style.display = 'block';
}

function renderDrawerImages(images) {
    const container = document.getElementById('drawerImageGrid');
    if (!images.length) { container.innerHTML = '<div style="grid-column:1/-1;text-align:center;">暂无图片</div>'; return; }
    container.innerHTML = images.map((img, idx) => `<div class="drawer-image-item"><img src="${img}"><button class="drawer-image-delete" data-index="${idx}">✕</button></div>`).join('');
    document.querySelectorAll('.drawer-image-delete').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            const trip = appData.trips.find(t => t.id === appData.currentTripId);
            const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
            if (loc && loc.images) { loc.images.splice(idx, 1); saveData(); renderDrawerImages(loc.images); }
        };
    });
}

function renderDrawerTags(tags) {
    const container = document.getElementById('drawerTagsContainer');
    if (!tags.length) { container.innerHTML = '<span>暂无标签</span>'; return; }
    container.innerHTML = tags.map(tag => `<span class="drawer-tag">#${escapeHtml(tag)}<span class="drawer-tag-remove" data-tag="${tag}">×</span></span>`).join('');
    document.querySelectorAll('.drawer-tag-remove').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const tag = btn.dataset.tag;
            const trip = appData.trips.find(t => t.id === appData.currentTripId);
            const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
            if (loc && loc.tags) { loc.tags = loc.tags.filter(t => t !== tag); saveData(); renderDrawerTags(loc.tags); }
        };
    });
}

function saveCurrentLocationFromDrawer() {
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
    if (loc) {
        loc.visitDate = document.getElementById('drawerVisitDate').value;
        loc.story = document.getElementById('drawerStory').value;
        saveData();
        updateMapMarkers();
        renderTimeline();
        closeAllDrawers();
    }
}

function deleteCurrentLocationFromDrawer() {
    if (!confirm('确定删除这个地点吗？')) return;
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    if (trip && trip.locations) {
        trip.locations = trip.locations.filter(l => l.id !== appData.currentLocationId);
        saveData();
        updateMapMarkers();
        renderTimeline();
        closeAllDrawers();
    }
}

function addImageToCurrentLocation() {
    const input = document.getElementById('imageUploadInput');
    input.onchange = (e) => {
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                const trip = appData.trips.find(t => t.id === appData.currentTripId);
                const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
                if (loc) { if (!loc.images) loc.images = []; loc.images.push(ev.target.result); saveData(); renderDrawerImages(loc.images); }
            };
            reader.readAsDataURL(file);
        });
        input.value = '';
    };
    input.click();
}

function addTagToCurrentLocation() {
    const input = document.getElementById('drawerNewTag');
    const tag = input.value.trim();
    if (!tag) return;
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
    if (loc) {
        if (!loc.tags) loc.tags = [];
        if (!loc.tags.includes(tag)) { loc.tags.push(tag); saveData(); renderDrawerTags(loc.tags); input.value = ''; }
    }
}

function setupDrawerRating() {
    document.querySelectorAll('#drawerRatingStars span').forEach((star, idx) => {
        star.onclick = () => {
            const rating = idx + 1;
            const trip = appData.trips.find(t => t.id === appData.currentTripId);
            const loc = trip?.locations.find(l => l.id === appData.currentLocationId);
            if (loc) { loc.rating = rating; saveData(); }
            const stars = document.querySelectorAll('#drawerRatingStars span');
            stars.forEach((s, i) => { s.textContent = i < rating ? '★' : '☆'; if (i < rating) s.classList.add('active'); else s.classList.remove('active'); });
        };
    });
}

// ========== 生成海报 ==========
async function generatePoster() {
    const trip = appData.trips.find(t => t.id === appData.currentTripId);
    if (!trip || !trip.locations || trip.locations.length === 0) {
        alert('暂无地点，请先添加地点');
        return;
    }
    
    // 创建海报容器
    const posterDiv = document.createElement('div');
    posterDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 375px;
        background: #FFF8E7;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        font-family: system-ui, -apple-system, sans-serif;
        z-index: -1;
    `;
    
    // 获取封面图片
    let coverImage = null;
    const firstLocation = trip.locations[0];
    if (firstLocation && firstLocation.images && firstLocation.images.length > 0) {
        coverImage = firstLocation.images[0];
    } else if (firstLocation && firstLocation.coverImage) {
        coverImage = firstLocation.coverImage;
    }
    
    // 风格图片映射
    const styleImageMap = {
        city: '1.jpg',
        nature: '2.jpg',
        beach: '3.jpg',
        mountain: '4.jpg',
        ancient: '5.jpg',
        family: '6.jpg',
        food: '7.jpg',
        road: '8.jpg',
        camp: '9.jpg',
        history: '10.jpg'
    };
    const defaultCoverImage = styleImageMap[trip.coverStyle] || '1.jpg';
    
    // 统计数据
    const totalLocations = trip.locations.length;
    const uniqueDates = new Set(trip.locations.map(l => l.visitDate || l.datetime?.split('T')[0])).size;
    const totalDistance = calculateTotalDistance(trip.locations);
    const topLocations = trip.locations.slice(0, 5);
    
    posterDiv.innerHTML = `
        <div style="position: relative;">
            ${coverImage ? 
                `<img src="${coverImage}" style="width: 100%; height: 200px; object-fit: cover;">` : 
                `<img src="resources/${defaultCoverImage}" style="width: 100%; height: 200px; object-fit: cover;">`
            }
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px;">
                <h2 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">${escapeHtml(trip.name)}</h2>
            </div>
        </div>
        <div style="padding: 20px;">
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <div style="flex: 1; text-align: center; background: #FFF3E0; padding: 12px; border-radius: 16px;">
                    <div style="font-size: 28px; font-weight: bold; color: #FF8C42;">${totalLocations}</div>
                    <div style="font-size: 12px; color: #B8860B;">个地点</div>
                </div>
                <div style="flex: 1; text-align: center; background: #FFF3E0; padding: 12px; border-radius: 16px;">
                    <div style="font-size: 28px; font-weight: bold; color: #FF8C42;">${uniqueDates}</div>
                    <div style="font-size: 12px; color: #B8860B;">天行程</div>
                </div>
                <div style="flex: 1; text-align: center; background: #FFF3E0; padding: 12px; border-radius: 16px;">
                    <div style="font-size: 28px; font-weight: bold; color: #FF8C42;">${totalDistance > 0 ? totalDistance.toFixed(0) : '-'}</div>
                    <div style="font-size: 12px; color: #B8860B;">公里</div>
                </div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: bold; color: #FF8C42; margin-bottom: 12px;">📌 途经地点</div>
                ${topLocations.map((loc, idx) => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #F0E0C0;">
                        <span style="width: 24px; height: 24px; background: #FFB347; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">${idx + 1}</span>
                        <span style="flex: 1; font-size: 14px; color: #5a3e1b;">${escapeHtml(loc.name)}</span>
                        ${loc.visitDate ? `<span style="font-size: 11px; color: #B8860B;">${loc.visitDate}</span>` : ''}
                    </div>
                `).join('')}
                ${totalLocations > 5 ? `<div style="text-align: center; margin-top: 8px; font-size: 12px; color: #B8860B;">+${totalLocations - 5} 个地点</div>` : ''}
            </div>
            <div style="background: linear-gradient(135deg, #FFB347, #FF8C42); border-radius: 20px; padding: 15px; text-align: center; color: white;">
                <div style="font-size: 14px;">✨ 小旅行 · 记录每一次出发 ✨</div>
                <div style="font-size: 11px; margin-top: 5px; opacity: 0.8;">${new Date().toLocaleDateString()}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(posterDiv);
    
    try {
        const canvas = await html2canvas(posterDiv, {
            scale: 2,
            backgroundColor: '#FFF8E7',
            useCORS: true,
            logging: false
        });
        
        const link = document.createElement('a');
        link.download = `${trip.name}_旅行海报.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error('生成失败:', err);
        alert('生成失败，请重试');
    } finally {
        document.body.removeChild(posterDiv);
    }
}

function calculateTotalDistance(locations) {
    let total = 0;
    for (let i = 0; i < locations.length - 1; i++) {
        if (locations[i].lat && locations[i].lng && locations[i+1].lat && locations[i+1].lng) {
            const R = 6371;
            const dLat = (locations[i+1].lat - locations[i].lat) * Math.PI / 180;
            const dLon = (locations[i+1].lng - locations[i].lng) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(locations[i].lat * Math.PI / 180) * Math.cos(locations[i+1].lat * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            total += R * c;
        }
    }
    return total;
}

// ========== 行程列表 ==========
function renderTripList() {
    const container = document.getElementById('tripList');
    const empty = document.getElementById('emptyTrip');
    if (!appData.trips.length) { 
        if (container) container.innerHTML = ''; 
        if (empty) empty.style.display = 'block'; 
        return; 
    }
    if (empty) empty.style.display = 'none';
    
    const styleMap = { 
        city: '🌆', nature: '🌲', beach: '🏖️', mountain: '⛰️',
        ancient: '🏯', family: '👨‍👩‍👧', food: '🍜', road: '🛣️',
        camp: '🏕️', history: '🏛️'
    };
    
    container.innerHTML = appData.trips.map(trip => `
        <div class="trip-card" data-id="${trip.id}">
            <div class="trip-cover">${styleMap[trip.coverStyle] || '✈️'}</div>
            <div class="trip-info">
                <div class="trip-name-card">${escapeHtml(trip.name)}</div>
                <div class="trip-meta">${trip.locations?.length || 0} 个地点</div>
            </div>
            <button class="trip-delete-btn" data-id="${trip.id}" title="删除行程">🗑️</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.trip-card').forEach(card => {
        const id = card.dataset.id;
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('trip-delete-btn')) return;
            const trip = appData.trips.find(t => t.id === id);
            if (trip) { 
                appData.currentTripId = id; 
                document.getElementById('currentTripName').textContent = trip.name; 
                saveData(); 
                updateMapMarkers(); 
                renderTimeline(); 
                showPage('mapPage'); 
            }
        });
    });
    
    document.querySelectorAll('.trip-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            deleteTripById(id);
        });
    });
}

function deleteTripById(tripId) {
    if (!confirm('确定要删除这个行程吗？所有地点和照片都会被删除，不可恢复！')) return;
    
    const tripIndex = appData.trips.findIndex(t => t.id === tripId);
    if (tripIndex === -1) return;
    
    appData.trips.splice(tripIndex, 1);
    
    if (appData.trips.length > 0) {
        appData.currentTripId = appData.trips[0].id;
        document.getElementById('currentTripName').textContent = appData.trips[0].name;
        updateMapMarkers();
        renderTimeline();
    } else {
        appData.currentTripId = null;
        if (map) {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            if (window.routeLayer) map.removeLayer(window.routeLayer);
        }
    }
    
    saveData();
    renderTripList();
    showPage('tripListPage');
}

function createNewTrip() {
    const name = document.getElementById('tripNameInput').value.trim();
    if (!name) { alert('请输入行程名称'); return; }
    const activeStyle = document.querySelector('.style-option.active');
    const newTrip = { id: generateId(), name, coverStyle: activeStyle?.dataset.style || 'city', createdAt: new Date().toISOString(), locations: [] };
    appData.trips.push(newTrip);
    appData.currentTripId = newTrip.id;
    saveData();
    document.getElementById('currentTripName').textContent = name;
    updateMapMarkers();
    renderTimeline();
    showPage('mapPage');
}

function showStatus(msg) {
    console.log(msg);
}

// ========== 事件绑定 ==========
function bindEvents() {
    document.getElementById('newTripBtn').onclick = () => showPage('newTripPage');
    document.getElementById('existingTripBtn').onclick = () => { renderTripList(); showPage('tripListPage'); };
    document.getElementById('goNewTripBtn').onclick = () => showPage('newTripPage');
    document.querySelectorAll('.back-btn').forEach(btn => { btn.onclick = (e) => { const target = btn.dataset.page; if (target) showPage(target); else showPage('mapPage'); }; });
    document.getElementById('createTripBtn').onclick = createNewTrip;
    document.querySelectorAll('.style-option').forEach(opt => { opt.onclick = () => { document.querySelectorAll('.style-option').forEach(o => o.classList.remove('active')); opt.classList.add('active'); }; });
    document.querySelector('.style-option')?.classList.add('active');
    document.getElementById('mapBackBtn').onclick = () => showPage('tripListPage');
    document.getElementById('posterBtn').onclick = generatePoster;
    document.getElementById('addLocationBtn').onclick = openAddLocationDrawer;
    document.getElementById('drawerSearchBtn').onclick = searchAndShowResults;
    document.getElementById('closeDrawerBtn').onclick = closeAllDrawers;
    document.getElementById('drawerLocationInput').onkeypress = (e) => { if (e.key === 'Enter') searchAndShowResults(); };
    document.getElementById('drawerSaveBtn').onclick = saveCurrentLocationFromDrawer;
    document.getElementById('drawerDeleteBtn').onclick = deleteCurrentLocationFromDrawer;
    document.getElementById('drawerAddImageBtn').onclick = addImageToCurrentLocation;
    document.getElementById('drawerAddTagBtn').onclick = addTagToCurrentLocation;
    document.getElementById('drawerNewTag').onkeypress = (e) => { if (e.key === 'Enter') addTagToCurrentLocation(); };
    document.getElementById('drawerOverlay').onclick = closeAllDrawers;
    document.querySelectorAll('.drawer-handle').forEach(h => { h.onclick = closeAllDrawers; });
    setupDrawerRating();
    
    const playBtn = document.getElementById('timelinePlayBtn');
    if (playBtn) playBtn.onclick = startPlayTimeline;
    const resetBtn = document.getElementById('timelineResetBtn');
    if (resetBtn) resetBtn.onclick = resetPlayProgress;
    const timelineClose = document.getElementById('timelineClose');
    if (timelineClose) timelineClose.onclick = toggleTimelineSidebar;
    const timelineExpandBtn = document.getElementById('timelineExpandBtn');
    if (timelineExpandBtn) timelineExpandBtn.onclick = toggleTimelineSidebar;
    const playBar = document.getElementById('timelinePlayBar');
    if (playBar) {
        playBar.onclick = (e) => {
            if (timelineLocations.length === 0) return;
            const rect = playBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const index = Math.floor(percent * timelineLocations.length);
            jumpToLocation(Math.min(index, timelineLocations.length - 1));
        };
    }
}

// ========== 初始化 ==========
function init() {
    loadData();
    initMap();
    bindEvents();
    startLoading(() => {
        // 始终先显示欢迎页
        showPage('welcomePage');
    });
}

init();