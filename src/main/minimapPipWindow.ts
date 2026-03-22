import path from 'node:path';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { createOverlayWindow, isAlive, resizeToPanel } from './overlayWindow';

let minimapWin: BrowserWindow | null = null;
let mainWinRef: BrowserWindow | null = null;

const MINIMAP_WIDTH = 320;
const MINIMAP_HEIGHT = 340;
const MINIMAP_MARGIN = 16;

// Inline data needed by the PIP (from iconTypes.ts, artilleryPlatforms.ts)
const ICON_TYPE_MAP_JSON = JSON.stringify({
  8:'MapIconForwardBase1.png',11:'MapIconHospital.png',12:'MapIconFacilityVehicleFactory1.png',
  17:'MapIconManufacturing.png',18:'Shipyard.png',19:'MapIconTechCenter.png',
  20:'SalvageMapIcon.png',21:'MapIconComponents.png',23:'MapIconSulfur.png',
  26:'MapIconsTrainingGround.png',27:'MapIconsKeep.png',28:'MapIconObservationTower.png',
  29:'MapIconFort.png',32:'MapIconSulfurMine.png',33:'MapIconStorageFacility.png',
  34:'MapIconFactory.png',35:'MapIconSafehouse.png',37:'MapIconRocketSite.png',
  38:'MapIconScrapMine.png',39:'MapIconConstructionYard.png',40:'MapIconComponentMine.png',
  45:'MapIconRelicBase.png',46:'MapIconRelicBase.png',47:'MapIconRelicBase.png',
  51:'MapIconMassProductionFactory.png',52:'MapIconSeaport.png',53:'MapIconCoastalGun.png',
  54:'MapIconSoulFactory.png',56:'MapIconTownBaseTier1.png',57:'MapIconTownBaseTier2.png',
  58:'MapIconTownBaseTier3.png',59:'MapIconStormcannon.png',60:'MapIconIntelcenter.png',
  61:'MapIconCoal.png',62:'MapIconFacilityMineOilRig.png',70:'MapIconRocketTarget.png',
  71:'MapIconRocketGroundZero.png',72:'MapIconRocketSiteWithRocket.png',
  75:'MapIconFacilityMineOilRig.png',83:'MapIconWeatherStation.png',84:'MapIconMortarHouse.png',
  88:'MapIconAircraftDepot.png',89:'MapIconAircraftFactory.png',90:'MapIconFortLargeRadar.png',
  91:'MapIconAircraftRunwayT1.png',92:'MapIconAircraftRunwayT2.png',
});

// Full platform data for ring + inaccuracy rendering [minRange, maxRange, minInaccuracy, maxInaccuracy]
const ARTILLERY_PLATFORMS_JSON = JSON.stringify([
  [75,100,2.5,14.5],[75,100,2.5,14.5],[45,80,2.5,9.45],[45,80,2.5,9.45],
  [275,350,37.5,60],[350,400,41.5,57.5],[375,450,37.5,60],[300,575,35,52],
  [375,500,37.5,51],[375,500,39,51],[100,225,2.5,8.5],[100,250,22.5,30],
  [100,300,25,35],[100,200,2.5,8.5],[100,200,2.5,8.5],[100,200,2.5,8.5],
  [100,200,2.5,8.5],[100,300,25,35],[120,250,25,35],[120,250,25,35],
  [200,350,32.5,40],[100,225,2.5,8.5],[100,225,2.5,8.5],[350,500,50,50],[400,1000,50,50]
]);

const MINIMAP_HTML = `<!DOCTYPE html>
<html><head>
<link href="tile:///lib/maplibre-gl.css" rel="stylesheet" />
<script src="tile:///lib/maplibre-gl.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  html, body { background: transparent; overflow: hidden; }
  body { font-family: 'Cascadia Code', 'Consolas', 'SF Mono', monospace; color: #e0e0e0; }
  .panel {
    display: inline-block;
    background: rgba(12, 12, 16, 0.95);
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.2);
    box-shadow: 0 0 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,213,79,0.06);
  }
  .title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.12em; color: #ffd54f; margin-bottom: 8px;
    opacity: 0.8; cursor: grab; -webkit-app-region: drag; user-select: none;
  }
  .title:active { cursor: grabbing; }
  .title-row { display: flex; align-items: center; gap: 6px; }
  .back-btn {
    background: rgba(255, 213, 79, 0.1);
    border: 1px solid rgba(255, 213, 79, 0.25);
    border-radius: 6px;
    color: rgba(255, 213, 79, 0.7);
    cursor: pointer;
    font-size: 14px;
    padding: 2px 4px;
    transition: background 0.15s, color 0.15s;
    -webkit-app-region: no-drag;
    display: none;
  }
  .back-btn:hover { background: rgba(255, 213, 79, 0.2); color: rgba(255, 213, 79, 0.5); }
  .back-btn.visible { display: inline-block; }
  #hex-selector { max-height: 260px; overflow-y: auto; display: none; }
  #hex-selector::-webkit-scrollbar { width: 4px; }
  #hex-selector::-webkit-scrollbar-thumb { background: rgba(255,213,79,0.3); border-radius: 2px; }
  .hex-btn {
    display: block; width: 100%; padding: 5px 8px; margin-bottom: 2px;
    border-radius: 4px; border: 1px solid rgba(255,213,79,0.12);
    background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.7);
    cursor: pointer; font-size: 11px; text-align: left;
    font-family: inherit; transition: background 0.12s;
  }
  .hex-btn:hover { background: rgba(255,213,79,0.15); border-color: rgba(255,213,79,0.4); }
  #map-container { width: 290px; height: 280px; border-radius: 4px; display: none; overflow: hidden; position: relative; }
  #map-container .maplibregl-ctrl-bottom-left, #map-container .maplibregl-ctrl-bottom-right { display: none; }
  #draw-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; }

  /* ── Artillery dots (same as globals.css) ── */
  .arty-dot-wrap { display: flex; align-items: center; justify-content: center; background: none; border: none; }
  .arty-dot { border-radius: 50%; position: relative; flex-shrink: 0; }
  .arty-dot::after {
    content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 40%; height: 40%; border-radius: 50%; background: rgba(255,255,255,0.3); pointer-events: none;
  }
  .arty-dot-main-gun { background: #1565c0; box-shadow: 0 0 0 2px #0d47a1, 0 0 6px 3px rgba(21,101,192,0.35), 0 0 14px 6px rgba(21,101,192,0.15); }
  .arty-dot-gun { background: #4fc3f7; box-shadow: 0 0 0 1.5px #81d4fa, 0 0 5px 2px rgba(79,195,247,0.3), 0 0 12px 5px rgba(79,195,247,0.12); }
  .arty-dot-target { background: #ef5350; box-shadow: 0 0 0 2px #f44336, 0 0 6px 3px rgba(239,83,80,0.35), 0 0 14px 6px rgba(239,83,80,0.15); }
  .arty-dot-impact { background: #ff8c00; box-shadow: 0 0 0 1.5px #e67e00, 0 0 5px 2px rgba(255,140,0,0.3), 0 0 12px 5px rgba(255,140,0,0.12); }
  .arty-dot-oor { background: #ef5350; box-shadow: 0 0 0 1.5px #f44336, 0 0 5px 2px rgba(239,83,80,0.3), 0 0 12px 5px rgba(239,83,80,0.12); }
  .arty-dot-corrected { background: #66bb6a; box-shadow: 0 0 0 2px #4caf50, 0 0 6px 3px rgba(102,187,106,0.35), 0 0 14px 6px rgba(102,187,106,0.15); }
  .arty-gun-label { color: #e0e0e0; font: 700 11px 'Cascadia Code','Consolas',monospace; text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6); pointer-events: none; white-space: nowrap; }

  /* ── Static labels (same as globals.css) ── */
  .map-text-major {
    color: #e0e0e0; font: 600 15px 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.04em;
    -webkit-text-stroke: 0.6px #000; paint-order: stroke fill;
    text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5);
    pointer-events: none; white-space: nowrap; text-align: center;
  }
  .map-text-minor {
    color: #e0e0e0; font: 400 11px 'Segoe UI', system-ui, sans-serif;
    -webkit-text-stroke: 0.4px #000; paint-order: stroke fill;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    pointer-events: none; white-space: nowrap; text-align: center;
  }
</style></head><body>
  <div class="panel">
    <div class="title title-row"><button class="back-btn" id="back-btn">\u2190</button><span id="title-bar">Minimap</span></div>
    <div id="hex-selector"></div>
    <div id="map-container"><canvas id="draw-canvas"></canvas></div>
  </div>
  <script>
    var ICON_TYPE_MAP = ${ICON_TYPE_MAP_JSON};
    var ARTY_PLATFORMS = ${ARTILLERY_PLATFORMS_JSON};
    var MAJOR = new Set([27,29,45,46,47,56,57,58]);
    var RESOURCE = new Set([20,21,23,61,62,75]);
    var TEAM_COLOR = { COLONIALS: '#6D7B34', WARDENS: '#516C96' };
    var TEAM_NONE_COLOR = '#fff';
    var ARTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
    var METERS_PER_CRS = 8;
    var CIRCLE_SEGMENTS = 64;

    var IMG_W = 218400 / 100 / 8, IMG_H = 189000 / 100 / 8;
    var map = null, mapLoaded = false, pendingWork = [];
    var structureMarkers = [], artyMarkers = [], enemyDomMarkers = [], labelMarkers = [];
    var iconsLoaded = false, pendingStructures = null;
    var drawCanvas, drawCtx;

    // Tint an image with a color using multiply blend (same as CSS mix-blend-mode:multiply)
    function tintImage(img, color) {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      // Restore original alpha (multiply fills the whole rect)
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    }

    function crsToLngLat(x, y) {
      var sx = x * 0.5 + 64, sy = y * 0.5 - 64;
      return [sx * 360/256 - 180, Math.atan(Math.sinh(Math.PI * (1 + sy/128))) * 180/Math.PI];
    }
    var TL = crsToLngLat(0,0), TR = crsToLngLat(IMG_W,0), BR = crsToLngLat(IMG_W,-IMG_H), BL = crsToLngLat(0,-IMG_H);

    function whenReady(fn) { if (mapLoaded && map) fn(); else pendingWork.push(fn); }

    function initMap() {
      if (map) return;
      var TPNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg=='), function(c){return c.charCodeAt(0);});
      maplibregl.addProtocol('tile', function(params, ac) {
        var m = params.url.match(/\\/(\\d+)\\/\\d+_(\\d+)_(\\d+)\\.png/);
        if (m) {
          var z=+m[1],x=+m[2],y=+m[3],oz=z-1,off=1<<(z-2),ox=x-off,oy=y-off;
          if (z<2||ox<0||oy<0||ox>=(1<<oz)||oy>=(1<<oz)) return Promise.resolve({data:TPNG.buffer.slice(0)});
          return fetchTile('tile:///'+oz+'/'+oz+'_'+ox+'_'+oy+'.png', ac.signal);
        }
        return fetchTile(params.url, ac.signal);
      });
      function fetchTile(url, signal) {
        return new Promise(function(res, rej) {
          var x = new XMLHttpRequest(); x.open('GET',url,true); x.responseType='arraybuffer';
          signal.addEventListener('abort',function(){x.abort();});
          x.onload=function(){x.status===200?res({data:x.response}):rej(new Error(x.status));};
          x.onerror=function(){rej(new Error('err'));}; x.onabort=function(){rej(new Error('abort'));}; x.send();
        });
      }
      var center = crsToLngLat(128,-128);
      map = new maplibregl.Map({
        container:'map-container',
        style:{version:8,sources:{'world-tiles':{type:'raster',tiles:['tile:///{z}/{z}_{x}_{y}.png'],tileSize:256,minzoom:2,maxzoom:4,scheme:'xyz'}},layers:[{id:'world-tiles',type:'raster',source:'world-tiles'}]},
        center:[center[0],center[1]], zoom:4, minZoom:0, maxZoom:9,
        renderWorldCopies:false, dragRotate:false, pitchWithRotate:false, attributionControl:false, fadeDuration:0,
      });

      // Set up draw canvas
      drawCanvas = document.getElementById('draw-canvas');
      var cont = document.getElementById('map-container');

      map.on('load', function() {
        // Enemy ring layers (same as main map)
        map.addSource('enemy-rings', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
        map.addLayer({ id:'enemy-rings-fill', type:'fill', source:'enemy-rings', paint:{ 'fill-color':'#000000', 'fill-opacity':0.06 }});
        map.addLayer({ id:'enemy-rings-line', type:'line', source:'enemy-rings', paint:{ 'line-color':'#000000', 'line-width':1.5, 'line-dasharray':[4,3], 'line-opacity':0.6 }});

        // Artillery ring layers (same as main map)
        map.addSource('arty-rings', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
        map.addSource('arty-lines', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
        map.addSource('arty-inaccuracy', { type:'geojson', data:{type:'FeatureCollection',features:[]} });
        map.addLayer({ id:'arty-ring-fill', type:'fill', source:'arty-rings', paint:{ 'fill-color':['get','color'], 'fill-opacity':['get','fillOpacity'] }});
        map.addLayer({ id:'arty-ring-line', type:'line', source:'arty-rings', paint:{ 'line-color':['get','color'], 'line-width':2 }});
        map.addLayer({ id:'arty-connection-lines', type:'line', source:'arty-lines', paint:{ 'line-color':['get','color'], 'line-width':['get','weight'], 'line-opacity':['get','opacity'], 'line-dasharray':[4,4] }});
        map.addLayer({ id:'arty-inaccuracy-lines', type:'line', source:'arty-inaccuracy', paint:{ 'line-color':['get','color'], 'line-width':['get','weight'], 'line-opacity':['get','opacity'], 'line-dasharray':[4,3] }});
        map.addLayer({ id:'arty-inaccuracy-fill', type:'fill', source:'arty-inaccuracy', paint:{ 'fill-color':['get','fillColor'], 'fill-opacity':['get','fillOpacity'] }});

        // Structure layers (WebGL symbol layer instead of DOM markers)
        var emptyFC = { type:'FeatureCollection', features:[] };
        map.addSource('structures', { type:'geojson', data:emptyFC });
        map.addLayer({
          id:'structures-bg', type:'circle', source:'structures',
          paint:{
            'circle-radius': ['get','radius'],
            'circle-color': ['match',['get','teamId'], 'COLONIALS','#6D7B34', 'WARDENS','#516C96', '#888'],
            'circle-opacity': 0.5,
            'circle-stroke-width': 1,
            'circle-stroke-color': ['match',['get','teamId'], 'COLONIALS','#6D7B34', 'WARDENS','#516C96', '#666'],
          }
        });
        map.addLayer({
          id:'structures-icons', type:'symbol', source:'structures',
          layout:{
            'icon-image': ['get','icon'],
            'icon-size': ['/',['get','size'], 64],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }
        });

        // Pre-load all structure icon images and create faction-tinted variants
        var iconFiles = Object.values(ICON_TYPE_MAP);
        var uniqueIcons = iconFiles.filter(function(v, i, a) { return a.indexOf(v) === i; });
        var loadedCount = 0;
        var teamKeys = ['COLONIALS', 'WARDENS', 'NONE'];
        var teamTints = { COLONIALS: '#6D7B34', WARDENS: '#516C96' };
        if (uniqueIcons.length === 0) { iconsLoaded = true; }
        uniqueIcons.forEach(function(file) {
          var img = new Image();
          img.onload = function() {
            try {
              // Register tinted variant for each faction
              for (var t = 0; t < teamKeys.length; t++) {
                var key = file + '-' + teamKeys[t];
                var tint = teamTints[teamKeys[t]];
                if (tint) {
                  var tinted = tintImage(img, tint);
                  map.addImage(key, tinted);
                } else {
                  // NONE: use original untinted icon
                  map.addImage(key, img);
                }
              }
            } catch(e) {}
            loadedCount++;
            if (loadedCount === uniqueIcons.length) {
              iconsLoaded = true;
              if (pendingStructures) {
                updateStructures(pendingStructures);
                pendingStructures = null;
              }
            }
          };
          img.onerror = function() {
            loadedCount++;
            if (loadedCount === uniqueIcons.length) {
              iconsLoaded = true;
              if (pendingStructures) {
                updateStructures(pendingStructures);
                pendingStructures = null;
              }
            }
          };
          img.src = 'tile:///icons/' + file;
        });

        mapLoaded = true;
        for (var i=0;i<pendingWork.length;i++) pendingWork[i]();
        pendingWork = [];
      });

      function resizeCanvas() {
        var r = window.devicePixelRatio || 1;
        drawCanvas.width = cont.clientWidth * r;
        drawCanvas.height = cont.clientHeight * r;
        drawCanvas.style.width = cont.clientWidth + 'px';
        drawCanvas.style.height = cont.clientHeight + 'px';
        drawCtx = drawCanvas.getContext('2d');
        drawCtx.scale(r, r);
      }
      resizeCanvas();
      map.on('move', redrawStrokes);
      map.on('zoom', function() { resizeCanvas(); redrawStrokes(); });
    }

    // ── Structures (WebGL symbol layer, no DOM markers) ──
    var cachedStructures = [];
    function updateStructures(items) {
      // If icons haven't loaded yet, queue for later
      if (!iconsLoaded) { pendingStructures = items; return; }
      // Clean up any legacy DOM markers
      structureMarkers.forEach(function(m){m.remove();});
      structureMarkers = [];
      var features = items.map(function(it) {
        var iconFile = ICON_TYPE_MAP[it.iconType];
        var size = 36;
        if (MAJOR.has(it.iconType)) size = 46;
        else if (RESOURCE.has(it.iconType)) size = 30;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: crsToLngLat(it.x * IMG_W, -it.y * IMG_H) },
          properties: {
            icon: iconFile ? (iconFile + '-' + (it.teamId || 'NONE')) : '',
            teamId: it.teamId || 'NONE',
            size: size,
            radius: size / 4,
          }
        };
      });
      var src = map.getSource('structures');
      if (src) src.setData({ type: 'FeatureCollection', features: features });
    }

    // ── Static labels (DOM markers, same as main map) ──
    function updateLabels(labels) {
      labelMarkers.forEach(function(m){m.remove();});
      labelMarkers = [];
      if (!labels) return;
      labels.forEach(function(lbl) {
        var lngLat = crsToLngLat(lbl.x * IMG_W, -lbl.y * IMG_H);
        var isMajor = lbl.mapMarkerType === 'Major';
        var el = document.createElement('div');
        el.className = isMajor ? 'map-text-major' : 'map-text-minor';
        el.textContent = lbl.text;
        var marker = new maplibregl.Marker({element:el}).setLngLat(lngLat).addTo(map);
        labelMarkers.push(marker);
      });
    }

    // ── Artillery helpers ──
    function metersToRadius(m) { return m / METERS_PER_CRS; }
    function crsDistance(a, b) { var dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }
    function interpolateInaccuracy(plat, distM) {
      var span = plat[1] - plat[0]; // maxRange - minRange
      if (span <= 0) return plat[3]; // maxInaccuracy
      var t = Math.max(0, Math.min(1, (distM - plat[0]) / span));
      return plat[2] + t * (plat[3] - plat[2]); // minInacc + t * (maxInacc - minInacc)
    }
    function circleCoordsCRS(cx, cy, radiusCRS) {
      var pts = [];
      for (var i=0; i<=CIRCLE_SEGMENTS; i++) {
        var a = (2*Math.PI*i)/CIRCLE_SEGMENTS;
        pts.push(crsToLngLat(cx + radiusCRS*Math.sin(a), cy + radiusCRS*Math.cos(a)));
      }
      return pts;
    }
    function makeDot(dotSize, cssClass) {
      var wrap = document.createElement('div'); wrap.className = 'arty-dot-wrap';
      wrap.style.cssText = 'width:'+(dotSize+20)+'px;height:'+(dotSize+20)+'px;display:flex;align-items:center;justify-content:center;';
      var dot = document.createElement('div'); dot.className = 'arty-dot '+cssClass;
      dot.style.width = dotSize+'px'; dot.style.height = dotSize+'px';
      wrap.appendChild(dot);
      return wrap;
    }

    // ── Artillery (full rendering: rings, lines, inaccuracy, dots — same as main map) ──
    function updateArtillery(arty) {
      artyMarkers.forEach(function(m){m.remove();});
      artyMarkers = [];
      var emptyFC = {type:'FeatureCollection',features:[]};
      if (!arty) {
        if (map.getSource('arty-rings')) map.getSource('arty-rings').setData(emptyFC);
        if (map.getSource('arty-lines')) map.getSource('arty-lines').setData(emptyFC);
        if (map.getSource('arty-inaccuracy')) map.getSource('arty-inaccuracy').setData(emptyFC);
        return;
      }

      var positions = arty.positions || [];
      var target = arty.target; // [x, y] or null
      var impact = arty.impact; // [x, y] or null
      var mainGunIndex = arty.mainGunIndex || 0;
      var defaultPlatIdx = arty.defaultPlatformIndex || 0;

      // Compute corrected position (target shifted by impact offset, same as main map)
      var corrected = null;
      if (target && impact) {
        var dx = target[0] - impact[0], dy = target[1] - impact[1];
        corrected = [target[0] + dx, target[1] + dy];
      }
      var effectiveTarget = corrected || target;

      // Compute out-of-range set
      var oorSet = {};
      if (effectiveTarget) {
        for (var oi=0; oi<positions.length; oi++) {
          var g = positions[oi]; if (!g.latlng) continue;
          var plat = ARTY_PLATFORMS[g.platformIndex != null ? g.platformIndex : defaultPlatIdx];
          if (!plat) continue;
          var dist = crsDistance(g.latlng, effectiveTarget) * METERS_PER_CRS;
          if (dist < plat[0] || dist > plat[1]) oorSet[oi] = true;
        }
      }

      // ── Build ring GeoJSON (donut: outer max - inner min) ──
      var ringFeatures = [];
      var lineFeatures = [];
      var inaccFeatures = [];

      for (var i=0; i<positions.length; i++) {
        var pos = positions[i]; if (!pos.latlng) continue;
        var isMain = (i === mainGunIndex);
        var isOOR = !!oorSet[i];
        var pIdx = pos.platformIndex != null ? pos.platformIndex : defaultPlatIdx;
        var plat = ARTY_PLATFORMS[pIdx];
        if (plat) {
          var maxR = metersToRadius(plat[1]);
          var minR = metersToRadius(plat[0]);
          var outerRing = circleCoordsCRS(pos.latlng[0], pos.latlng[1], maxR);
          var innerRing = circleCoordsCRS(pos.latlng[0], pos.latlng[1], minR).slice().reverse();
          var ringColor = isOOR ? '#b33030' : isMain ? '#003380' : '#4488cc';
          ringFeatures.push({
            type:'Feature',
            properties:{ color:ringColor, fillOpacity: isOOR ? 0.12 : 0.2 },
            geometry:{ type:'Polygon', coordinates:[outerRing, innerRing] }
          });
        }
        // Connection line to target
        if (target) {
          lineFeatures.push({
            type:'Feature',
            properties:{ color:'#333333', weight:1.5, opacity:0.55 },
            geometry:{ type:'LineString', coordinates:[crsToLngLat(pos.latlng[0],pos.latlng[1]), crsToLngLat(target[0],target[1])] }
          });
        }
      }

      // ── Inaccuracy circles around target ──
      if (positions.length > 0 && target) {
        var overallMin = Infinity, overallMax = -Infinity, currentMax = -Infinity;
        for (var ii=0; ii<positions.length; ii++) {
          var pp = positions[ii]; if (!pp.latlng) continue;
          var pi = pp.platformIndex != null ? pp.platformIndex : defaultPlatIdx;
          var pl = ARTY_PLATFORMS[pi]; if (!pl) continue;
          if (pl[2] < overallMin) overallMin = pl[2];
          if (pl[3] > overallMax) overallMax = pl[3];
          var d = crsDistance(pp.latlng, target) * METERS_PER_CRS;
          var inacc = interpolateInaccuracy(pl, d);
          if (inacc > currentMax) currentMax = inacc;
        }
        // Min/max bounds (gray dashed)
        [metersToRadius(overallMin), metersToRadius(overallMax)].forEach(function(r) {
          inaccFeatures.push({
            type:'Feature',
            properties:{ color:'#444444', weight:1, opacity:0.5, fillColor:'transparent', fillOpacity:0 },
            geometry:{ type:'Polygon', coordinates:[circleCoordsCRS(target[0],target[1],r)] }
          });
        });
        // Current worst-case (red)
        inaccFeatures.push({
          type:'Feature',
          properties:{ color:'#ef5350', weight:1.5, opacity:1, fillColor:'#ef5350', fillOpacity:0.05 },
          geometry:{ type:'Polygon', coordinates:[circleCoordsCRS(target[0],target[1],metersToRadius(currentMax))] }
        });
      }

      // ── Correction line (target -> corrected) ──
      if (target && corrected) {
        lineFeatures.push({
          type:'Feature',
          properties:{ color:'#66bb6a', weight:1.5, opacity:0.7 },
          geometry:{ type:'LineString', coordinates:[crsToLngLat(target[0],target[1]), crsToLngLat(corrected[0],corrected[1])] }
        });
      }

      // ── Impact line (target -> impact) ──
      if (target && impact) {
        lineFeatures.push({
          type:'Feature',
          properties:{ color:'#ff8c00', weight:1, opacity:0.5 },
          geometry:{ type:'LineString', coordinates:[crsToLngLat(target[0],target[1]), crsToLngLat(impact[0],impact[1])] }
        });
      }

      // Update GeoJSON sources
      if (map.getSource('arty-rings')) map.getSource('arty-rings').setData({type:'FeatureCollection',features:ringFeatures});
      if (map.getSource('arty-lines')) map.getSource('arty-lines').setData({type:'FeatureCollection',features:lineFeatures});
      if (map.getSource('arty-inaccuracy')) map.getSource('arty-inaccuracy').setData({type:'FeatureCollection',features:inaccFeatures});

      // ── Corrected dot ──
      if (corrected) {
        var cll = crsToLngLat(corrected[0], corrected[1]);
        artyMarkers.push(new maplibregl.Marker({element:makeDot(16,'arty-dot-corrected'),anchor:'center'}).setLngLat(cll).addTo(map));
      }

      // ── Gun dots + labels ──
      for (var gi=0; gi<positions.length; gi++) {
        var gp = positions[gi]; if (!gp.latlng) continue;
        var gIsMain = (gi === mainGunIndex);
        var gIsOOR = !!oorSet[gi];
        var gClass = gIsOOR ? 'arty-dot-oor' : gIsMain ? 'arty-dot-main-gun' : 'arty-dot-gun';
        var gll = crsToLngLat(gp.latlng[0], gp.latlng[1]);
        artyMarkers.push(new maplibregl.Marker({element:makeDot(gIsMain?20:16, gClass),anchor:'center'}).setLngLat(gll).addTo(map));
        var glbl = document.createElement('div'); glbl.className = 'arty-gun-label'; glbl.textContent = gp.label;
        artyMarkers.push(new maplibregl.Marker({element:glbl,anchor:'bottom',offset:[0,-12]}).setLngLat(gll).addTo(map));
      }

      // ── Target dot ──
      if (target) {
        var tll = crsToLngLat(target[0], target[1]);
        artyMarkers.push(new maplibregl.Marker({element:makeDot(18,'arty-dot-target'),anchor:'center'}).setLngLat(tll).addTo(map));
      }

      // ── Impact dot ──
      if (impact) {
        var ill = crsToLngLat(impact[0], impact[1]);
        artyMarkers.push(new maplibregl.Marker({element:makeDot(16,'arty-dot-impact'),anchor:'center'}).setLngLat(ill).addTo(map));
      }
    }

    // ── Enemy markers (DOM markers + GeoJSON ring layers, same as main map) ──
    function updateEnemies(state) {
      enemyDomMarkers.forEach(function(m){m.remove();});
      enemyDomMarkers = [];
      var ringFeatures = [];
      if (state && state.markers) {
        state.markers.forEach(function(m) {
          if (!m.position) return;
          var ll = crsToLngLat(m.position[0], m.position[1]);
          // Crosshair SVG marker (same as main map)
          var el = document.createElement('div');
          el.style.cssText = 'width:20px;height:20px;color:#000;pointer-events:none;';
          el.innerHTML = ARTY_SVG;
          enemyDomMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat(ll).addTo(map));
          // Label
          var lbl = document.createElement('div');
          lbl.style.cssText = 'font-size:11px;color:#000;font-weight:600;white-space:nowrap;text-shadow:0 0 3px rgba(255,255,255,0.8);pointer-events:none;';
          lbl.textContent = m.label;
          enemyDomMarkers.push(new maplibregl.Marker({element:lbl,anchor:'bottom',offset:[0,-12]}).setLngLat(ll).addTo(map));
          // Range ring (polygon)
          var plat = ARTY_PLATFORMS[m.platformIndex];
          var maxRange = plat ? plat[1] : 200;
          var radiusCRS = maxRange / METERS_PER_CRS;
          var pts = [];
          for (var i=0; i<=CIRCLE_SEGMENTS; i++) {
            var a = (2*Math.PI*i)/CIRCLE_SEGMENTS;
            pts.push(crsToLngLat(m.position[0]+radiusCRS*Math.sin(a), m.position[1]+radiusCRS*Math.cos(a)));
          }
          ringFeatures.push({ type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[pts] } });
        });
      }
      if (map.getSource('enemy-rings')) {
        map.getSource('enemy-rings').setData({ type:'FeatureCollection', features:ringFeatures });
      }
    }

    // ── Stamp drawing helpers (same shapes as stampIcons.ts) ──
    function outlinedStroke(ctx, color, innerWidth, drawPath) {
      ctx.strokeStyle = '#000000'; ctx.lineWidth = innerWidth + 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      drawPath(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = innerWidth;
      drawPath(); ctx.stroke();
    }
    function outlinedFill(ctx, color, borderWidth, drawPath) {
      ctx.strokeStyle = '#000000'; ctx.lineWidth = borderWidth; ctx.lineJoin = 'round';
      drawPath(); ctx.stroke();
      ctx.fillStyle = color; drawPath(); ctx.fill();
    }
    var STAMP_DRAW_FNS = {
      target: function(ctx, size, color) {
        var cx = size/2, cy = size/2;
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.arc(cx,cy,size*0.4,0,Math.PI*2); });
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.arc(cx,cy,size*0.2,0,Math.PI*2); });
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.moveTo(cx,cy-size*0.45); ctx.lineTo(cx,cy+size*0.45); ctx.moveTo(cx-size*0.45,cy); ctx.lineTo(cx+size*0.45,cy); });
      },
      shield: function(ctx, size, color) {
        var cx = size/2;
        outlinedStroke(ctx, color, 3, function(){ ctx.beginPath(); ctx.moveTo(cx,size*0.08); ctx.lineTo(size*0.85,size*0.25); ctx.lineTo(size*0.85,size*0.55); ctx.quadraticCurveTo(cx,size*0.95,cx,size*0.95); ctx.quadraticCurveTo(cx,size*0.95,size*0.15,size*0.55); ctx.lineTo(size*0.15,size*0.25); ctx.closePath(); });
      },
      skull: function(ctx, size, color) {
        var cx = size/2, cy = size*0.4;
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.arc(cx,cy,size*0.3,Math.PI,0); ctx.lineTo(cx+size*0.3,cy+size*0.15); ctx.quadraticCurveTo(cx+size*0.25,cy+size*0.3,cx+size*0.1,cy+size*0.3); ctx.lineTo(cx-size*0.1,cy+size*0.3); ctx.quadraticCurveTo(cx-size*0.25,cy+size*0.3,cx-size*0.3,cy+size*0.15); ctx.closePath(); });
        outlinedFill(ctx, color, 2, function(){ ctx.beginPath(); ctx.arc(cx-size*0.12,cy,size*0.07,0,Math.PI*2); });
        outlinedFill(ctx, color, 2, function(){ ctx.beginPath(); ctx.arc(cx+size*0.12,cy,size*0.07,0,Math.PI*2); });
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.moveTo(cx-size*0.08,cy+size*0.3); ctx.lineTo(cx-size*0.08,cy+size*0.42); ctx.moveTo(cx,cy+size*0.3); ctx.lineTo(cx,cy+size*0.42); ctx.moveTo(cx+size*0.08,cy+size*0.3); ctx.lineTo(cx+size*0.08,cy+size*0.42); });
      },
      flag: function(ctx, size, color) {
        var px = size*0.3;
        outlinedStroke(ctx, color, 3, function(){ ctx.beginPath(); ctx.moveTo(px,size*0.1); ctx.lineTo(px,size*0.9); });
        outlinedStroke(ctx, color, 3, function(){ ctx.beginPath(); ctx.moveTo(px,size*0.1); ctx.lineTo(size*0.8,size*0.25); ctx.lineTo(px,size*0.45); ctx.closePath(); });
      },
      eye: function(ctx, size, color) {
        var cx = size/2, cy = size/2;
        outlinedStroke(ctx, color, 2.5, function(){ ctx.beginPath(); ctx.moveTo(size*0.08,cy); ctx.quadraticCurveTo(cx,cy-size*0.35,size*0.92,cy); ctx.quadraticCurveTo(cx,cy+size*0.35,size*0.08,cy); });
        outlinedFill(ctx, color, 2, function(){ ctx.beginPath(); ctx.arc(cx,cy,size*0.12,0,Math.PI*2); });
      },
      star: function(ctx, size, color) {
        var cx = size/2, cy = size/2, outerR = size*0.42, innerR = size*0.18;
        outlinedStroke(ctx, color, 3, function(){
          ctx.beginPath();
          for (var i=0;i<5;i++) {
            var oa = -Math.PI/2+(i*2*Math.PI)/5, ia = oa+Math.PI/5;
            if (i===0) ctx.moveTo(cx+outerR*Math.cos(oa),cy+outerR*Math.sin(oa));
            else ctx.lineTo(cx+outerR*Math.cos(oa),cy+outerR*Math.sin(oa));
            ctx.lineTo(cx+innerR*Math.cos(ia),cy+innerR*Math.sin(ia));
          }
          ctx.closePath();
        });
      },
      warning: function(ctx, size, color) {
        var cx = size/2;
        outlinedStroke(ctx, color, 3, function(){ ctx.beginPath(); ctx.moveTo(cx,size*0.08); ctx.lineTo(size*0.9,size*0.88); ctx.lineTo(size*0.1,size*0.88); ctx.closePath(); });
        outlinedStroke(ctx, color, 3, function(){ ctx.beginPath(); ctx.moveTo(cx,size*0.35); ctx.lineTo(cx,size*0.63); });
        outlinedFill(ctx, color, 2, function(){ ctx.beginPath(); ctx.arc(cx,size*0.73,3,0,Math.PI*2); });
      },
      'x-mark': function(ctx, size, color) {
        var m = size*0.2; ctx.lineCap = 'round';
        outlinedStroke(ctx, color, 4, function(){ ctx.beginPath(); ctx.moveTo(m,m); ctx.lineTo(size-m,size-m); ctx.moveTo(size-m,m); ctx.lineTo(m,size-m); });
      }
    };

    var STAMP_SIZE = 40; // slightly smaller than main map's 56 for minimap scale

    // ── Strokes, arrows, stamps, text (canvas + DOM overlay) ──
    var cachedStrokes = [];
    var stampDomMarkers = []; // for text label DOM markers

    function drawMeasureLabel(cx, cy, line1, line2) {
      drawCtx.save();
      drawCtx.font = 'bold 11px monospace';
      drawCtx.textAlign = 'center';
      drawCtx.textBaseline = 'middle';
      var w1 = drawCtx.measureText(line1).width;
      var w2 = line2 ? drawCtx.measureText(line2).width : 0;
      var pw = Math.max(w1, w2) + 12;
      var ph = line2 ? 30 : 20;
      var r = 5;
      var x0 = cx - pw/2, y0 = cy - ph/2;
      drawCtx.fillStyle = 'rgba(0,0,0,0.75)';
      drawCtx.beginPath();
      drawCtx.moveTo(x0+r, y0);
      drawCtx.lineTo(x0+pw-r, y0);
      drawCtx.quadraticCurveTo(x0+pw, y0, x0+pw, y0+r);
      drawCtx.lineTo(x0+pw, y0+ph-r);
      drawCtx.quadraticCurveTo(x0+pw, y0+ph, x0+pw-r, y0+ph);
      drawCtx.lineTo(x0+r, y0+ph);
      drawCtx.quadraticCurveTo(x0, y0+ph, x0, y0+ph-r);
      drawCtx.lineTo(x0, y0+r);
      drawCtx.quadraticCurveTo(x0, y0, x0+r, y0);
      drawCtx.closePath();
      drawCtx.fill();
      drawCtx.fillStyle = '#ffffff';
      if (line2) {
        drawCtx.fillText(line1, cx, cy - 6);
        drawCtx.fillStyle = 'rgba(255,255,255,0.7)';
        drawCtx.font = '9px monospace';
        drawCtx.fillText(line2, cx, cy + 7);
      } else {
        drawCtx.fillText(line1, cx, cy);
      }
      drawCtx.restore();
    }

    function redrawStrokes() {
      if (!drawCtx || !map) return;
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      // Remove old text DOM markers (recreated each frame)
      stampDomMarkers.forEach(function(m){ m.remove(); });
      stampDomMarkers = [];

      for (var i=0; i<cachedStrokes.length; i++) {
        var s = cachedStrokes[i];
        if (!s.points || s.points.length < 1) continue;
        var color = s.color || '#fff';
        var weight = s.weight || 3;

        // ── Text labels (DOM markers) ──
        if (s.stampType === 'text' && s.stampText) {
          var tll = crsToLngLat(s.points[0][0], s.points[0][1]);
          var tel = document.createElement('div');
          tel.style.cssText = 'background:rgba(0,0,0,0.75);color:'+color+';font:bold 11px monospace;padding:2px 5px;border-radius:4px;white-space:nowrap;pointer-events:none;';
          tel.textContent = s.stampText;
          stampDomMarkers.push(new maplibregl.Marker({element:tel,anchor:'center'}).setLngLat(tll).addTo(map));
          continue;
        }

        // ── Icon stamps (canvas-drawn) ──
        if (s.stampType && STAMP_DRAW_FNS[s.stampType]) {
          var sll = crsToLngLat(s.points[0][0], s.points[0][1]);
          var spx = map.project(sll);
          drawCtx.save();
          drawCtx.globalAlpha = s.opacity != null ? s.opacity : 1;
          drawCtx.translate(spx.x - STAMP_SIZE/2, spx.y - STAMP_SIZE/2);
          STAMP_DRAW_FNS[s.stampType](drawCtx, STAMP_SIZE, color);
          drawCtx.restore();
          continue;
        }

        // ── Ruler measurement ──
        if (s.measureType === 'ruler' && s.points.length >= 2) {
          var rp0 = crsToLngLat(s.points[0][0], s.points[0][1]);
          var rp1 = crsToLngLat(s.points[1][0], s.points[1][1]);
          var rpx0 = map.project(rp0);
          var rpx1 = map.project(rp1);
          drawCtx.save();
          drawCtx.globalAlpha = 1;
          drawCtx.beginPath();
          drawCtx.setLineDash([8, 5]);
          drawCtx.strokeStyle = '#ffffff';
          drawCtx.lineWidth = 2;
          drawCtx.moveTo(rpx0.x, rpx0.y);
          drawCtx.lineTo(rpx1.x, rpx1.y);
          drawCtx.stroke();
          drawCtx.setLineDash([]);
          [rpx0, rpx1].forEach(function(p) {
            drawCtx.beginPath();
            drawCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            drawCtx.fillStyle = '#ffffff';
            drawCtx.fill();
            drawCtx.strokeStyle = '#000000';
            drawCtx.lineWidth = 1.5;
            drawCtx.stroke();
          });
          var rmx = (rpx0.x + rpx1.x) / 2, rmy = (rpx0.y + rpx1.y) / 2;
          var rdx = s.points[1][0] - s.points[0][0], rdy = s.points[1][1] - s.points[0][1];
          var rdistM = Math.round(Math.sqrt(rdx*rdx + rdy*rdy) * METERS_PER_CRS);
          var razRad = Math.atan2(rdx, rdy);
          var razDeg = ((razRad * 180 / Math.PI) + 360) % 360;
          drawMeasureLabel(rmx, rmy, rdistM + 'm', razDeg.toFixed(1) + '\u00B0');
          drawCtx.restore();
          continue;
        }

        // ── Circle measurement ──
        if (s.measureType === 'circle' && s.radius) {
          var cll = crsToLngLat(s.points[0][0], s.points[0][1]);
          var cpx = map.project(cll);
          var ell = crsToLngLat(s.points[0][0] + s.radius, s.points[0][1]);
          var epx = map.project(ell);
          var csr = Math.sqrt((epx.x-cpx.x)*(epx.x-cpx.x)+(epx.y-cpx.y)*(epx.y-cpx.y));
          drawCtx.save();
          drawCtx.globalAlpha = 1;
          drawCtx.beginPath();
          drawCtx.setLineDash([8, 5]);
          drawCtx.strokeStyle = '#ffffff';
          drawCtx.lineWidth = 2;
          drawCtx.arc(cpx.x, cpx.y, csr, 0, Math.PI * 2);
          drawCtx.stroke();
          drawCtx.setLineDash([]);
          drawCtx.beginPath();
          drawCtx.arc(cpx.x, cpx.y, 3, 0, Math.PI * 2);
          drawCtx.fillStyle = '#ffffff';
          drawCtx.fill();
          drawCtx.strokeStyle = '#000000';
          drawCtx.lineWidth = 1.5;
          drawCtx.stroke();
          var cradiusM = Math.round(s.radius * METERS_PER_CRS);
          drawMeasureLabel(cpx.x, cpx.y - csr - 14, cradiusM + 'm');
          drawCtx.restore();
          continue;
        }

        if (s.points.length < 2) continue;

        // ── Normal strokes ──
        drawCtx.save();
        drawCtx.globalAlpha = s.opacity != null ? s.opacity : 1;
        drawCtx.strokeStyle = color;
        drawCtx.lineWidth = weight;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.beginPath();
        for (var j=0; j<s.points.length; j++) {
          var ll = crsToLngLat(s.points[j][0], s.points[j][1]);
          var px = map.project(ll);
          if (j===0) drawCtx.moveTo(px.x, px.y);
          else drawCtx.lineTo(px.x, px.y);
        }
        drawCtx.stroke();

        // ── Arrowhead ──
        if (s.isArrow && s.points.length >= 2) {
          var tipLL = crsToLngLat(s.points[s.points.length-1][0], s.points[s.points.length-1][1]);
          var tipPx = map.project(tipLL);
          var prevLL = crsToLngLat(s.points[s.points.length-2][0], s.points[s.points.length-2][1]);
          var prevPx = map.project(prevLL);
          for (var k=s.points.length-3; k>=0; k--) {
            var candLL = crsToLngLat(s.points[k][0], s.points[k][1]);
            var candPx = map.project(candLL);
            var dist = Math.sqrt((tipPx.x-candPx.x)*(tipPx.x-candPx.x)+(tipPx.y-candPx.y)*(tipPx.y-candPx.y));
            if (dist >= 10) { prevPx = candPx; break; }
          }
          var angle = Math.atan2(tipPx.y-prevPx.y, tipPx.x-prevPx.x);
          var headSize = Math.max(weight*8, 28);
          drawCtx.beginPath();
          drawCtx.moveTo(tipPx.x, tipPx.y);
          drawCtx.lineTo(tipPx.x - headSize*Math.cos(angle-Math.PI/6), tipPx.y - headSize*Math.sin(angle-Math.PI/6));
          drawCtx.lineTo(tipPx.x - headSize*0.55*Math.cos(angle), tipPx.y - headSize*0.55*Math.sin(angle));
          drawCtx.lineTo(tipPx.x - headSize*Math.cos(angle+Math.PI/6), tipPx.y - headSize*Math.sin(angle+Math.PI/6));
          drawCtx.closePath();
          drawCtx.strokeStyle = '#000000';
          drawCtx.lineWidth = 2;
          drawCtx.lineJoin = 'round';
          drawCtx.stroke();
          drawCtx.fillStyle = color;
          drawCtx.fill();
        }

        drawCtx.restore();
      }
    }
    function updateStrokes(strokes) {
      cachedStrokes = strokes || [];
      redrawStrokes();
    }

    // ── Hex selection ──
    function setHexData(data) {
      document.getElementById('title-bar').textContent = 'Minimap: ' + (data.hexName || '');
      document.getElementById('back-btn').classList.add('visible');
      document.getElementById('hex-selector').style.display = 'none';
      document.getElementById('map-container').style.display = 'block';
      if (!map) initMap();
      whenReady(function() {
        if (map.getLayer('detail-image')) map.removeLayer('detail-image');
        if (map.getSource('detail-image')) map.removeSource('detail-image');
        map.setLayoutProperty('world-tiles', 'visibility', 'none');
        map.addSource('detail-image', { type:'image', url: data.imageUrl||'',
          coordinates: [[TL[0],TL[1]], [TR[0],TR[1]], [BR[0],BR[1]], [BL[0],BL[1]]] });
        map.addLayer({ id:'detail-image', type:'raster', source:'detail-image' }, 'enemy-rings-fill');
        map.fitBounds([[BL[0],BL[1]],[TR[0],TR[1]]], { animate:false });
        // Apply initial data if provided
        if (data.structures) updateStructures(data.structures);
        if (data.labels) updateLabels(data.labels);
        if (data.strokes) updateStrokes(data.strokes);
        if (data.artillery !== undefined) updateArtillery(data.artillery);
        if (data.enemies !== undefined) updateEnemies(data.enemies);
      });
    }
    function updateLayer(layer, data) {
      whenReady(function() {
        if (!map) return;
        if (layer === 'structures') updateStructures(data || []);
        else if (layer === 'labels') updateLabels(data || []);
        else if (layer === 'strokes') updateStrokes(data || []);
        else if (layer === 'artillery') updateArtillery(data);
        else if (layer === 'enemies') updateEnemies(data);
      });
    }
    function showHexSelector(hexes) {
      document.getElementById('title-bar').textContent = 'Minimap';
      document.getElementById('back-btn').classList.remove('visible');
      document.getElementById('hex-selector').style.display = 'block';
      document.getElementById('map-container').style.display = 'none';
      var sel = document.getElementById('hex-selector');
      sel.innerHTML = hexes.map(function(h) {
        return '<button class="hex-btn" data-hex="' + h.id + '">' + h.name + '</button>';
      }).join('');
      sel.querySelectorAll('.hex-btn').forEach(function(btn) {
        btn.onclick = function() { window.minimapBridge.selectHex(btn.dataset.hex); };
      });
    }
    document.getElementById('back-btn').onclick = function() {
      window.minimapBridge.requestHexList();
    };
    window.minimapBridge.onHexData(function(data) { setHexData(data); });
    window.minimapBridge.onLayerUpdate(function(layer, data) { updateLayer(layer, data); });
    window.minimapBridge.onHexList(function(hexes) { showHexSelector(hexes); });
  <\/script>
</body></html>`;

function createMinimapPipWindow(): BrowserWindow {
  const { width: screenW } = screen.getPrimaryDisplay().bounds;

  minimapWin = createOverlayWindow(MINIMAP_HTML, {
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
    position: { x: screenW - MINIMAP_WIDTH - 200, y: MINIMAP_MARGIN + 480 },
    webPreferences: {
      preload: path.join(__dirname, 'minimapPipPreload.js'),
    },
  });

  minimapWin.on('closed', () => {
    minimapWin = null;
  });

  return minimapWin;
}

export function showMinimapPip(mainWindow: BrowserWindow, hexData?: any): void {
  mainWinRef = mainWindow;
  const freshlyCreated = !isAlive(minimapWin);
  if (freshlyCreated) {
    createMinimapPipWindow();
  }

  const win = minimapWin!;

  const sendInitialData = () => {
    if (!isAlive(minimapWin)) return;
    if (hexData) {
      minimapWin!.webContents.send('minimap-hex-data', hexData);
      setTimeout(() => resizeToPanel(minimapWin), 50);
    } else if (mainWinRef && !mainWinRef.isDestroyed()) {
      // Ask renderer — it will send hex data (if viewing a hex) or hex list (if not)
      mainWinRef.webContents.send('minimap-request-hex-list');
    }
  };

  if (freshlyCreated || win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      sendInitialData();
    });
  } else {
    sendInitialData();
  }

  win.showInactive();

  if (freshlyCreated) {
    const onSelectHex = (_event: Electron.IpcMainEvent, hexId: string) => {
      if (mainWinRef && !mainWinRef.isDestroyed()) {
        mainWinRef.webContents.send('minimap-select-hex', hexId);
      }
    };
    ipcMain.on('minimap-select-hex', onSelectHex);

    const onHexListReply = (_event: Electron.IpcMainEvent, hexes: any[]) => {
      if (isAlive(minimapWin)) {
        minimapWin!.webContents.send('minimap-hex-list', hexes);
        setTimeout(() => resizeToPanel(minimapWin), 50);
      }
    };
    ipcMain.on('minimap-hex-list-reply', onHexListReply);

    const onRequestHexListFromPip = () => {
      if (mainWinRef && !mainWinRef.isDestroyed()) {
        mainWinRef.webContents.send('minimap-request-hex-list-forced');
      }
    };
    ipcMain.on('minimap-request-hex-list-from-pip', onRequestHexListFromPip);

    win.on('closed', () => {
      ipcMain.removeListener('minimap-select-hex', onSelectHex);
      ipcMain.removeListener('minimap-hex-list-reply', onHexListReply);
      ipcMain.removeListener('minimap-request-hex-list-from-pip', onRequestHexListFromPip);
    });
  }
}

export function updateMinimapPipData(layer: string, data: unknown): void {
  if (!isAlive(minimapWin)) return;
  minimapWin.webContents.send('minimap-layer-update', layer, data);
}

export function sendMinimapHexData(data: any): void {
  if (!isAlive(minimapWin)) return;
  minimapWin.webContents.send('minimap-hex-data', data);
  setTimeout(() => resizeToPanel(minimapWin), 50);
}

export function destroyMinimapPip(): void {
  if (isAlive(minimapWin)) {
    minimapWin.destroy();
    minimapWin = null;
  }
}

export function getMinimapPipWin(): BrowserWindow | null {
  return isAlive(minimapWin) ? minimapWin : null;
}
