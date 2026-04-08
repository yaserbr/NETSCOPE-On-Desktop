// ================= API CONFIGURATION =================
const LOCAL_API = "http://localhost:3000";
const REMOTE_API = "https://netscope-production-4c3d.up.railway.app";
const APP_KEY = "3k9fJ@92#NsxP!qaL";

document.addEventListener("DOMContentLoaded", () => {
  const notice = document.getElementById("locationNotice");
  const enableBtn = document.getElementById("enableLocationBtn");
  const viewTowerMapBtn = document.getElementById("viewTowerMapBtn");
  const towerMapHint = document.getElementById("towerMapHint");
  const towerMapModal = document.getElementById("towerMapModal");
  const towerMapContainer = document.getElementById("towerMapContainer");
  const towerMapEmbedFrame = document.getElementById("towerMapEmbedFrame");
  const towerMapFallback = document.getElementById("towerMapFallback");
  const towerMapDistance = document.getElementById("towerMapDistance");
  const towerMapCoords = document.getElementById("towerMapCoords");
  const closeTowerMapBtn = document.getElementById("closeTowerMapBtn");
  const openExternalMapBtn = document.getElementById("openExternalMapBtn");

  // ================= NPCAP CHECK =================

  async function checkNpcap(retries = 5) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${LOCAL_API}/api/check-nmap-ready`);
        const data = await res.json();

        if (!data.npcapInstalled) {
          showNpcapInstallPrompt();
        }
        return;
      } catch (err) {
        console.warn(`Nmap readiness check attempt ${i + 1} failed:`, err);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
    console.error("Nmap readiness check failed after all retries");
  }

  function showNpcapInstallPrompt() {
    const npcapPrompt = document.createElement("div");
    npcapPrompt.id = "npcapPrompt";
    npcapPrompt.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;

    const promptBox = document.createElement("div");
    promptBox.style.cssText = `
      background: rgba(255,255,255,0.95);
      border-radius: 12px;
      padding: 20px;
      max-width: 400px;
      text-align: center;
      direction: rtl;
      font-family: 'Cairo', sans-serif;
    `;

    promptBox.innerHTML = `
      <p style="font-size: 16px; margin-bottom: 15px; color: #333;">
        ⚠️ لتفعيل ميزة كشف الأجهزة، يلزم تثبيت مكون بسيط
      </p>
      <p id="npcapStatus" style="font-size: 13px; color: #666; margin-bottom: 12px; display: none;"></p>
      <button id="installNpcapBtn" style="
        padding: 10px 20px;
        background: #FFB400;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        color: #000;
      ">
        تثبيت الآن
      </button>
      <button id="skipNpcapBtn" style="
        padding: 10px 20px;
        background: transparent;
        border: 1px solid #ccc;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        color: #666;
        margin-top: 8px;
        display: block;
        margin-left: auto;
        margin-right: auto;
      ">
        تخطي
      </button>
    `;

    npcapPrompt.appendChild(promptBox);
    document.body.appendChild(npcapPrompt);

    const installBtn = document.getElementById("installNpcapBtn");
    const statusEl = document.getElementById("npcapStatus");
    const skipBtn = document.getElementById("skipNpcapBtn");

    skipBtn.addEventListener("click", () => npcapPrompt.remove());

    installBtn.addEventListener("click", async () => {
      // Show loading state
      installBtn.disabled = true;
      installBtn.textContent = "جاري التثبيت...";
      installBtn.style.opacity = "0.6";
      installBtn.style.cursor = "not-allowed";
      statusEl.style.display = "block";
      statusEl.textContent = "سيظهر لك نافذة صلاحيات المسؤول، يرجى الموافقة ثم اتباع خطوات التثبيت";
      statusEl.style.color = "#666";

      try {
        const res = await fetch(`${LOCAL_API}/api/install-npcap`, { method: "POST" });
        const data = await res.json();

        if (data.success) {
          statusEl.style.color = "#28a745";
          statusEl.textContent = "✅ تم التثبيت بنجاح!";
          setTimeout(() => npcapPrompt.remove(), 2000);
        } else {
          statusEl.style.color = "#dc3545";
          statusEl.textContent = data.error || "❌ فشل التثبيت. حاول تشغيل التطبيق كمسؤول";
          installBtn.disabled = false;
          installBtn.textContent = "إعادة المحاولة";
          installBtn.style.opacity = "1";
          installBtn.style.cursor = "pointer";
        }
      } catch (err) {
        console.error("Installation error:", err);
        statusEl.style.display = "block";
        statusEl.style.color = "#dc3545";
        statusEl.textContent = "❌ تعذر الاتصال بالخادم المحلي";
        installBtn.disabled = false;
        installBtn.textContent = "إعادة المحاولة";
        installBtn.style.opacity = "1";
        installBtn.style.cursor = "pointer";
      }
    });
  }

  checkNpcap();

  const setLocationNoticeVisible = (visible) => {
    if (!notice) return;
    notice.style.display = visible ? "flex" : "none";
  };

  let lastUserCoordinates = null;
  let lastTowerCoordinates = null;
  let leafletLoadPromise = null;
  let towerMapInstance = null;
  let userLocationLayer = null;
  let towerLocationLayer = null;
  let towerLinkLayer = null;
  let mapProviderConfigPromise = null;

  function normalizeCoordinates(lat, lon) {
    const parsedLat = Number(lat);
    const parsedLon = Number(lon);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      return null;
    }
    if (Math.abs(parsedLat) > 90 || Math.abs(parsedLon) > 180) {
      return null;
    }
    return { lat: parsedLat, lon: parsedLon };
  }

  function coordinatesFromArray(value) {
    if (!Array.isArray(value) || value.length < 2) {
      return null;
    }
    return normalizeCoordinates(value[0], value[1]) || normalizeCoordinates(value[1], value[0]);
  }

  function extractTowerCoordinates(payload) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const fromObject = (source) => {
      if (!source || typeof source !== "object") {
        return null;
      }

      const byKeys = normalizeCoordinates(
        source.lat ?? source.latitude,
        source.lon ?? source.lng ?? source.longitude
      );
      if (byKeys) {
        return byKeys;
      }

      if (source.location && typeof source.location === "object") {
        const nested = normalizeCoordinates(
          source.location.lat ?? source.location.latitude,
          source.location.lon ?? source.location.lng ?? source.location.longitude
        );
        if (nested) {
          return nested;
        }
      }

      return coordinatesFromArray(source.coordinates);
    };

    const objectCandidates = [
      payload.tower,
      payload.nearestTower,
      payload.closestTower,
      payload.cellTower,
      payload.towerLocation,
      payload.tower_location,
      payload.data?.tower,
      payload.result?.tower,
      payload.data?.nearestTower,
      payload.result?.nearestTower
    ];

    for (const candidate of objectCandidates) {
      const coordinates = fromObject(candidate);
      if (coordinates) {
        return coordinates;
      }
    }

    const explicitPairs = [
      normalizeCoordinates(payload.towerLat, payload.towerLon ?? payload.towerLng),
      normalizeCoordinates(payload.towerLatitude, payload.towerLongitude),
      normalizeCoordinates(payload.nearestTowerLat, payload.nearestTowerLon ?? payload.nearestTowerLng),
      normalizeCoordinates(payload.nearestTowerLatitude, payload.nearestTowerLongitude),
      normalizeCoordinates(payload.closestTowerLat, payload.closestTowerLon ?? payload.closestTowerLng),
      coordinatesFromArray(payload.towerCoordinates),
      coordinatesFromArray(payload.nearestTowerCoordinates)
    ];

    for (const coordinates of explicitPairs) {
      if (coordinates) {
        return coordinates;
      }
    }

    return null;
  }

  function formatCoordinate(value) {
    return Number(value).toFixed(5);
  }

  function setExternalMapLinkState(enabled) {
    if (!openExternalMapBtn) {
      return;
    }
    if (enabled) {
      openExternalMapBtn.classList.remove("is-disabled");
    } else {
      openExternalMapBtn.classList.add("is-disabled");
      openExternalMapBtn.href = "#";
    }
  }

  function updateTowerMapMeta() {
    if (towerMapDistance) {
      towerMapDistance.textContent = typeof window.towerDistance === "number"
        ? `Distance: ${window.towerDistance.toFixed(2)} km`
        : "Distance: Unavailable";
    }

    if (towerMapCoords) {
      if (lastUserCoordinates && lastTowerCoordinates) {
        towerMapCoords.textContent =
          `You (${formatCoordinate(lastUserCoordinates.lat)}, ${formatCoordinate(lastUserCoordinates.lon)})  -  ` +
          `Tower (${formatCoordinate(lastTowerCoordinates.lat)}, ${formatCoordinate(lastTowerCoordinates.lon)})`;
      } else if (lastUserCoordinates) {
        towerMapCoords.textContent =
          `You (${formatCoordinate(lastUserCoordinates.lat)}, ${formatCoordinate(lastUserCoordinates.lon)})  -  Tower unavailable`;
      } else {
        towerMapCoords.textContent = "Coordinates will appear here after lookup.";
      }
    }

    if (lastUserCoordinates && lastTowerCoordinates) {
      const origin = `${lastUserCoordinates.lat},${lastUserCoordinates.lon}`;
      const destination = `${lastTowerCoordinates.lat},${lastTowerCoordinates.lon}`;
      if (openExternalMapBtn) {
        openExternalMapBtn.href =
          `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
      }
      setExternalMapLinkState(true);
    } else {
      setExternalMapLinkState(false);
    }
  }

  function updateTowerMapActionState() {
    const ready = Boolean(lastUserCoordinates && lastTowerCoordinates);

    if (viewTowerMapBtn) {
      viewTowerMapBtn.disabled = false;
    }

    if (towerMapHint) {
      if (ready && typeof window.towerDistance === "number") {
        towerMapHint.textContent = `Tower located ${window.towerDistance.toFixed(2)} km away.`;
      } else if (ready) {
        towerMapHint.textContent = "Map is ready. Open to compare your location with the nearest tower.";
      } else if (lastUserCoordinates) {
        towerMapHint.textContent = "User location found, waiting for nearest tower coordinates.";
      } else {
        towerMapHint.textContent = "Enable location access to activate map view.";
      }
    }
  }

  function setTowerMapFallback(message = "") {
    if (!towerMapFallback) {
      return;
    }

    if (message) {
      towerMapFallback.textContent = message;
      towerMapFallback.classList.remove("d-none");
      if (towerMapContainer) {
        towerMapContainer.classList.add("d-none");
      }
      if (towerMapEmbedFrame) {
        towerMapEmbedFrame.classList.add("d-none");
      }
    } else {
      towerMapFallback.textContent = "";
      towerMapFallback.classList.add("d-none");
    }
  }

  function setMapMode(mode) {
    if (mode === "leaflet") {
      if (towerMapContainer) {
        towerMapContainer.classList.remove("d-none");
      }
      if (towerMapEmbedFrame) {
        towerMapEmbedFrame.classList.add("d-none");
        towerMapEmbedFrame.src = "about:blank";
      }
      return;
    }

    if (mode === "google-embed") {
      if (towerMapContainer) {
        towerMapContainer.classList.add("d-none");
      }
      if (towerMapEmbedFrame) {
        towerMapEmbedFrame.classList.remove("d-none");
      }
      return;
    }

    if (towerMapContainer) {
      towerMapContainer.classList.add("d-none");
    }
    if (towerMapEmbedFrame) {
      towerMapEmbedFrame.classList.add("d-none");
    }
  }

  async function loadMapProviderConfig() {
    if (mapProviderConfigPromise) {
      return mapProviderConfigPromise;
    }

    mapProviderConfigPromise = fetch(`${LOCAL_API}/api/map-provider-config`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Map provider config request failed (${response.status})`);
        }
        return await response.json();
      })
      .catch((error) => {
        console.warn("Unable to load map provider config, using default fallback:", error);
        return {
          provider: "osm-proxy",
          googleMapsEmbedApiKey: ""
        };
      });

    return mapProviderConfigPromise;
  }

  function buildGoogleEmbedDirectionsUrl(apiKey) {
    if (!lastUserCoordinates || !lastTowerCoordinates || !apiKey) {
      return null;
    }

    const url = new URL("https://www.google.com/maps/embed/v1/directions");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("origin", `${lastUserCoordinates.lat},${lastUserCoordinates.lon}`);
    url.searchParams.set("destination", `${lastTowerCoordinates.lat},${lastTowerCoordinates.lon}`);
    url.searchParams.set("mode", "driving");
    return url.toString();
  }

  function renderGoogleEmbedMap(apiKey) {
    const embedUrl = buildGoogleEmbedDirectionsUrl(apiKey);
    if (!embedUrl || !towerMapEmbedFrame) {
      return false;
    }

    setMapMode("google-embed");
    towerMapEmbedFrame.src = embedUrl;
    return true;
  }

  function ensureLeafletLoaded() {
    if (window.L) {
      return Promise.resolve(window.L);
    }

    if (leafletLoadPromise) {
      return leafletLoadPromise;
    }

    leafletLoadPromise = new Promise((resolve, reject) => {
      const styleId = "leafletStylesheet";
      const scriptId = "leafletScript";

      if (!document.getElementById(styleId)) {
        const style = document.createElement("link");
        style.id = styleId;
        style.rel = "stylesheet";
        style.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(style);
      }

      const complete = () => {
        if (window.L) {
          resolve(window.L);
        } else {
          leafletLoadPromise = null;
          reject(new Error("Leaflet script loaded but window.L is unavailable."));
        }
      };

      const fail = () => {
        leafletLoadPromise = null;
        reject(new Error("Failed to load Leaflet library."));
      };

      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        if (window.L) {
          complete();
          return;
        }
        existingScript.addEventListener("load", complete, { once: true });
        existingScript.addEventListener("error", fail, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.addEventListener("load", complete, { once: true });
      script.addEventListener("error", fail, { once: true });
      document.body.appendChild(script);
    });

    return leafletLoadPromise;
  }

  function renderTowerMap() {
    if (!window.L || !towerMapContainer || !lastUserCoordinates || !lastTowerCoordinates) {
      return;
    }

    setMapMode("leaflet");

    const userLatLng = [lastUserCoordinates.lat, lastUserCoordinates.lon];
    const towerLatLng = [lastTowerCoordinates.lat, lastTowerCoordinates.lon];

    if (!towerMapInstance) {
      towerMapInstance = window.L.map(towerMapContainer, {
        zoomControl: true,
        preferCanvas: true
      });

      window.L.tileLayer(`${LOCAL_API}/api/map-tiles/{z}/{x}/{y}.png`, {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(towerMapInstance);
    }

    if (userLocationLayer) {
      userLocationLayer.remove();
    }
    if (towerLocationLayer) {
      towerLocationLayer.remove();
    }
    if (towerLinkLayer) {
      towerLinkLayer.remove();
    }

    userLocationLayer = window.L.circleMarker(userLatLng, {
      radius: 9,
      color: "#67c2ff",
      weight: 3,
      fillColor: "#67c2ff",
      fillOpacity: 0.35
    }).addTo(towerMapInstance).bindPopup("Your location");

    towerLocationLayer = window.L.circleMarker(towerLatLng, {
      radius: 9,
      color: "#FFB400",
      weight: 3,
      fillColor: "#FFB400",
      fillOpacity: 0.35
    }).addTo(towerMapInstance).bindPopup("Nearest tower");

    towerLinkLayer = window.L.polyline([userLatLng, towerLatLng], {
      color: "#FFD56A",
      weight: 3,
      opacity: 0.9,
      dashArray: "8 8"
    }).addTo(towerMapInstance);

    const bounds = window.L.latLngBounds([userLatLng, towerLatLng]);
    towerMapInstance.fitBounds(bounds.pad(0.25), {
      animate: false,
      maxZoom: 14
    });

    setTimeout(() => {
      towerMapInstance?.invalidateSize();
    }, 90);
  }

  function openTowerMapModal() {
    if (!towerMapModal) {
      return;
    }
    towerMapModal.classList.remove("d-none", "closing");
    towerMapModal.setAttribute("aria-hidden", "false");
  }

  function closeTowerMapModal() {
    if (!towerMapModal || towerMapModal.classList.contains("d-none")) {
      return;
    }
    towerMapModal.classList.add("closing");
    towerMapModal.addEventListener("animationend", function handler() {
      towerMapModal.classList.add("d-none");
      towerMapModal.classList.remove("closing");
      towerMapModal.setAttribute("aria-hidden", "true");
      towerMapModal.removeEventListener("animationend", handler);
    });
  }

  async function ensureMapCoordinatesReady() {
    if (!lastUserCoordinates) {
      const position = await getBrowserPosition();
      const derived = normalizeCoordinates(position?.coords?.latitude, position?.coords?.longitude);
      if (derived) {
        lastUserCoordinates = derived;
      }
    }

    if (!lastTowerCoordinates && lastUserCoordinates) {
      await detectNearestTowerGPS({
        coords: {
          latitude: lastUserCoordinates.lat,
          longitude: lastUserCoordinates.lon
        }
      });
    }

    updateTowerMapMeta();
    updateTowerMapActionState();
    return Boolean(lastUserCoordinates && lastTowerCoordinates);
  }

  async function openTowerMapExperience() {
    openTowerMapModal();
    setTowerMapFallback("Loading map...");
    updateTowerMapMeta();

    const hasCoordinates = await ensureMapCoordinatesReady();
    if (!hasCoordinates) {
      setTowerMapFallback("Unable to load nearest tower coordinates right now. Please confirm location permission and try again.");
      showStatus("Tower map unavailable right now");
      return;
    }

    try {
      const providerConfig = await loadMapProviderConfig();
      const provider = String(providerConfig?.provider || "osm-proxy").toLowerCase();
      const googleKey = String(providerConfig?.googleMapsEmbedApiKey || "").trim();

      setTowerMapFallback("");

      if (provider === "google-embed" && googleKey) {
        const rendered = renderGoogleEmbedMap(googleKey);
        if (!rendered) {
          throw new Error("Google embed map failed to render.");
        }
        return;
      }

      await ensureLeafletLoaded();
      renderTowerMap();
    } catch (err) {
      console.error("Map load error:", err);
      setTowerMapFallback("Map library could not be loaded. You can still open the route in Google Maps.");
    }
  }

  openExternalMapBtn?.addEventListener("click", (event) => {
    if (openExternalMapBtn.classList.contains("is-disabled")) {
      event.preventDefault();
    }
  });

  if (!navigator.geolocation) {
    setLocationNoticeVisible(true);
  } else {
    setLocationNoticeVisible(false);
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted" || permission.state === "prompt") {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setLocationNoticeVisible(false);
              detectNearestTowerGPS(position);
            },
            () => {
              setLocationNoticeVisible(true);
            }
          );
        } else {
          setLocationNoticeVisible(true);
        }
      })
      .catch(() => {
        setLocationNoticeVisible(true);
      });
  }

  enableBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setLocationNoticeVisible(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationNoticeVisible(false);
        detectNearestTowerGPS(position);
      },
      () => {
        setLocationNoticeVisible(true);
      }
    );
  });

  const gaugeBox = document.getElementById("gaugeBox");
  const gaugeText = document.getElementById("gaugeText");
  const gaugeCircle = document.getElementById("gaugeProgress");
  const detectedConnectionTypeElement = document.getElementById("detectedConnectionType");
  const wifiSignalDisplay = document.getElementById("wifiSignalDisplay");
  const wifiNetworksDisplay = document.getElementById("wifiNetworksDisplay");
  let detectedConnectionType = "unknown";

  function getConnectionTypeLabel(type) {
    if (type === "ethernet") return "Ethernet 🔌";
    if (type === "cellular") return "Cellular 📶";
    if (type === "wifi") return "WiFi 📡";
    return "Unknown";
  }

  function updateWifiSectionsVisibility() {
    const isWifi = detectedConnectionType === "wifi";
    if (wifiSignalDisplay) {
      wifiSignalDisplay.style.display = isWifi ? "" : "none";
    }
    if (wifiNetworksDisplay) {
      wifiNetworksDisplay.style.display = isWifi ? "" : "none";
    }
  }

  async function detectConnectionTypeFromServer() {
    try {
      const res = await fetch(`${LOCAL_API}/api/connection-type`);
      const data = await res.json();
      detectedConnectionType = data.type || "unknown";
    } catch (err) {
      console.warn("Server connection type detection failed, falling back to browser API:", err);
      const browserConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const browserType = String(browserConnection?.type || "").toLowerCase();
      if (browserType.includes("wifi")) detectedConnectionType = "wifi";
      else if (browserType.includes("ethernet")) detectedConnectionType = "ethernet";
      else detectedConnectionType = "unknown";
    }

    console.log("Detected connection type:", detectedConnectionType);

    if (detectedConnectionTypeElement) {
      detectedConnectionTypeElement.textContent = `نوع الاتصال: ${getConnectionTypeLabel(detectedConnectionType)}`;
    }
    updateWifiSectionsVisibility();
  }

  detectConnectionTypeFromServer();

  function setGaugeStartLoading(loading) {
    if (!gaugeBox) return;
    gaugeBox.classList.toggle("gauge-start-disabled", loading);
    gaugeBox.setAttribute("aria-busy", loading ? "true" : "false");
  }

  function getBrowserPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn("Geolocation unsupported in browser");
        return resolve(null);
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Browser location obtained:", position.coords.latitude, position.coords.longitude);
          const coordinates = normalizeCoordinates(position.coords.latitude, position.coords.longitude);
          if (coordinates) {
            lastUserCoordinates = coordinates;
            updateTowerMapMeta();
            updateTowerMapActionState();
          }
          resolve(position);
        },
        (error) => {
          console.warn("Browser location failed:", error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }

  async function ensureTowerDistance() {
    if (window.towerDistance !== null) {
      return window.towerDistance;
    }

    const position = await getBrowserPosition();
    if (!position) {
      console.warn("Cannot determine tower distance without browser location");
      window.towerDistance = null;
      return null;
    }

    return await detectNearestTowerGPS(position);
  }

  function setGaugePhase(phase) {
    if (!gaugeBox) return;
    gaugeBox.classList.remove("phase-ping", "phase-download", "phase-upload");
    if (phase) gaugeBox.classList.add(phase);
  }

  function activateGaugeLoading() {
    if (!gaugeBox) return;
    gaugeBox.classList.add("loading");
  }

  function deactivateGaugeLoading() {
    if (!gaugeBox) return;
    gaugeBox.classList.remove("loading", "phase-ping", "phase-download", "phase-upload");
  }

  function enableIdleAnimation() {
    gaugeCircle.style.strokeDasharray = "120 40";
    gaugeCircle.style.strokeDashoffset = "0";
    gaugeBox.classList.add("idle");
    gaugeText.textContent = "READY";
    gaugeText.classList.add("idle-text");
  }

  function disableIdleAnimation() {
    gaugeBox.classList.remove("idle");
    gaugeText.classList.remove("idle-text");
    gaugeText.textContent = "0";
  }

  async function playPreSpin() {
    return new Promise(resolve => {

      const circumference = 534;
      const duration = 600; // مدة الصعود
      const durationBack = 400; // مدة النزول

      // أوقف أي idle
      gaugeBox.classList.remove("idle");

      // أوقف الانتقال المؤقت
      gaugeCircle.style.transition = "none";

      let start = null;

      // ===== 1️⃣ صعود إلى 100% =====
      function animateForward(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const percent = Math.min(progress / duration, 1);

        gaugeCircle.style.strokeDashoffset =
          circumference * (1 - percent);

        if (percent < 1) {
          requestAnimationFrame(animateForward);
        } else {
          start = null;
          requestAnimationFrame(animateBackward);
        }
      }

      // ===== 2️⃣ رجوع إلى 0 =====
      function animateBackward(timestamp) {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const percent = Math.min(progress / durationBack, 1);

        gaugeCircle.style.strokeDashoffset =
          circumference * percent;

        if (percent < 1) {
          requestAnimationFrame(animateBackward);
        } else {

          // إعادة التهيئة للقياس الحقيقي
          gaugeCircle.style.strokeDashoffset = circumference;
          gaugeCircle.style.transition =
            "stroke-dashoffset 0.15s linear";

          resolve();
        }
      }

      requestAnimationFrame(animateForward);

    });
  }

  enableIdleAnimation();

  const maxSpeed = 1000;

  let lastPing = 0;
  let lastDown = 0;
  let lastUp = 0;
  let latencyUnderLoad = 0;
  let deviceCount = 0;
  let _deviceCountResolve = null;
  let _deviceCountPromise = null;
  let wifiSignal = null;
  let wifiNetworks = null;
  let speedTestRunning = false;
  window.towerDistance = null;
  updateTowerMapMeta();
  updateTowerMapActionState();

  function showStatus(msg) {
    const el = document.getElementById("statusText");
    if (!el) return;
    if (el._statusFadeTimer) clearTimeout(el._statusFadeTimer);
    el.classList.add("status-fade");
    el._statusFadeTimer = setTimeout(() => {
      el.textContent = msg;
      el.classList.remove("status-fade");
      el._statusFadeTimer = null;
    }, 140);
  }

  function evaluateMetric(value, type) {
    const raw = String(value).trim();
    const num = Number(raw);

    if (type === "ping") {
      if (num < 20) return { label: "Good", className: "good" };
      if (num <= 50) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "jitter") {
      if (num <= 10) return { label: "Good", className: "good" };
      if (num <= 20) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "latencyUnderLoad") {
      if (num <= 40) return { label: "Good", className: "good" };
      if (num <= 80) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "latencyRatio") {
      if (num < 2) return { label: "Good", className: "good" };
      if (num <= 3) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "networkStability") {
      if (num > 80) return { label: "Good", className: "good" };
      if (num >= 60) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "congestionScore") {
      if (num <= 20) return { label: "Good", className: "good" };
      if (num <= 50) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    if (type === "bufferbloatGrade") {
      if (/^[AB]$/i.test(raw)) return { label: "Good", className: "good" };
      if (/^C$/i.test(raw)) return { label: "Warning", className: "warning" };
      if (/^[DF]$/i.test(raw)) return { label: "Bad", className: "bad" };
      return { label: "N/A", className: "warning" };
    }

    if (type === "towerDistance") {
      if (!raw || isNaN(num)) return { label: "N/A", className: "warning" };
      if (num < 1) return { label: "Good", className: "good" };
      if (num <= 3) return { label: "Warning", className: "warning" };
      return { label: "Bad", className: "bad" };
    }

    return { label: "N/A", className: "warning" };
  }

  function calculateNetworkStability(ping, jitter, latencyUnderLoad) {
    const p = Number(ping) || 0;
    const j = Number(jitter) || 0;
    const l = Number(latencyUnderLoad) || 0;
    const jitterFactor = Math.max(0, 1 - j / 40);
    const latencyDiff = Math.abs(l - p);
    const latencyFactor = Math.max(0, 1 - latencyDiff / 80);
    const stability = (jitterFactor * 0.55 + latencyFactor * 0.45) * 100;
    return Math.round(Math.min(100, Math.max(0, stability)));
  }

  function updateMetric(id, type, rawValue, formattedValue) {
    const valueEl = document.getElementById(`${id}Value`);
    const statusEl = document.getElementById(`${id}Status`);
    if (!valueEl || !statusEl) return;

    valueEl.textContent = formattedValue;
    const evaluation = evaluateMetric(rawValue, type);
    valueEl.classList.remove("good", "warning", "bad", "value-good", "value-medium", "value-bad");
    const valueClass = evaluation.className === "good"
      ? "value-good"
      : evaluation.className === "warning"
      ? "value-medium"
      : "value-bad";
    valueEl.classList.add(valueClass);
    statusEl.textContent = "";
    statusEl.className = "status";
  }

  function updateGauge(speed) {
    if (!speed || speed < 0) speed = 0;
    if (speed > maxSpeed) speed = maxSpeed;

    const circumference = 534;
    const percent = speed / maxSpeed;
    const dashOffset = circumference * (1 - percent);

    gaugeCircle.style.strokeDashoffset = dashOffset;
    gaugeText.textContent = speed.toFixed(1);

    const hue = Math.min(120, percent * 120);
    gaugeCircle.style.stroke = `hsl(${hue},100%,50%)`;

    if (gaugeBox) {
      gaugeBox.classList.remove("speed-low", "speed-med", "speed-high");
      if (percent >= 0.65) {
        gaugeBox.classList.add("speed-high");
      } else if (percent >= 0.25) {
        gaugeBox.classList.add("speed-med");
      } else {
        gaugeBox.classList.add("speed-low");
      }
    }
  }

  function resetGaugeSmooth() {
    let current = parseFloat(gaugeText.textContent) || 0;

    const interval = setInterval(() => {
      current -= current * 0.08;
      if (current <= 0.5) {
        current = 0;
        clearInterval(interval);
      }
      updateGauge(current);
    }, 30);
  }

  async function getPublicIP() {
    const res = await fetch(
      "https://speed.cloudflare.com/cdn-cgi/trace?nocache=" + Date.now(),
      { cache: "no-store" }
    );
    const text = await res.text();
    const ipLine = text.split("\n").find(line => line.startsWith("ip="));
    return ipLine ? ipLine.split("=")[1] : null;
  }

  async function fetchISPFromServer(ip) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${REMOTE_API}/api/isp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-key": APP_KEY },
        body: JSON.stringify({ ip }),
        signal: controller.signal
      });
      return await res.json();
    } catch (err) {
      console.error("Server unreachable (ISP):", err);
      return null;
    }
  }

  function showISPInfo(data) {
    const el = document.getElementById("ispInfo");
    if (!el) return;

    if (!data || !data.isp) {
      el.textContent = "Unable to detect ISP";
      return;
    }

    el.textContent =
      ` ${data.isp} | ${data.city || "-"}, ${data.country || "-"}`;
  }

  async function loadISPOnPageLoad() {
    try {
      const ip = await getPublicIP();
      if (!ip) throw new Error("No IP");
      const ispData = await fetchISPFromServer(ip);
      showISPInfo(ispData);
    } catch (err) {
      console.error("ISP load error:", err);
      showISPInfo(null);
    }
  }

  loadISPOnPageLoad();

  async function detectNearestTowerGPS(position) {

    if (!position) {
      console.warn("detectNearestTowerGPS called without position");
      window.towerDistance = null;
      lastTowerCoordinates = null;
      updateTowerMapMeta();
      updateTowerMapActionState();
      return null;
    }

    const lat = position.coords?.latitude;
    const lon = position.coords?.longitude;
    const userCoordinates = normalizeCoordinates(lat, lon);

    if (!userCoordinates) {
      console.warn("Invalid user coordinates for tower lookup:", { lat, lon });
      window.towerDistance = null;
      lastTowerCoordinates = null;
      updateTowerMapMeta();
      updateTowerMapActionState();
      return null;
    }

    lastUserCoordinates = userCoordinates;
    updateTowerMapMeta();
    updateTowerMapActionState();

    try {
      const ispText = document.getElementById("ispInfo")?.textContent || "";
      const ispName = ispText.split("|")[0]?.trim();

      console.log("Sending tower lookup request with coords:", { lat, lon, ispName });

      const towerController = new AbortController();
      setTimeout(() => towerController.abort(), 8000);
      const res = await fetch(`${REMOTE_API}/api/nearest-tower`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-key": APP_KEY
        },
        body: JSON.stringify({
          lat,
          lon,
          isp: ispName
        }),
        signal: towerController.signal
      });

      const data = await res.json();

      console.log("Nearest tower response:", data);

      window.towerDistance = typeof data.distance === "number" ? data.distance : null;
      lastTowerCoordinates = extractTowerCoordinates(data);
      updateTowerMapMeta();
      updateTowerMapActionState();
      console.log("towerDistance set:", window.towerDistance);
      return window.towerDistance;

    } catch (err) {
      console.error("Tower API error:", err);
      window.towerDistance = null;
      lastTowerCoordinates = null;
      updateTowerMapMeta();
      updateTowerMapActionState();
      return null;
    }
  }

  // تشغيلها عند تحميل الصفحة

  async function requestAIAnalysis(ping, down, up, jitter, latencyUnderLoad) {
    await detectConnectionTypeFromServer();

    const connectionType = detectedConnectionType;

    const ispText = document.getElementById("ispInfo")?.textContent || "";
    const ispName = ispText.split("|")[0]?.trim() || null;


    await ensureTowerDistance();

    // Wait for Nmap to finish (max 4s), then use whatever value is available
    await waitForDeviceCount(4000);
    _deviceCountPromise = null;

    const payload = {
      ping,
      jitter,
      download: down,
      upload: up,
      latencyUnderLoad,
      connection: connectionType,
      isp: ispName,
      connectedDevices: deviceCount || 0,
      towerDistance: window.towerDistance || null,
      signalStrength: wifiSignal,
      wifiNetworks: wifiNetworks
    };

    console.log("AI Payload:", payload);

    showStatus("Analyzing results...");

    try {
      const aiController = new AbortController();
      setTimeout(() => aiController.abort(), 15000);
      const res = await fetch(`${REMOTE_API}/api/analyze-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-key": APP_KEY },
        body: JSON.stringify(payload),
        signal: aiController.signal
      });

      const data = await res.json();
      showAIResult(data.analysis, data.contactISP, data.metrics);
      showStatus("AI Analysis Complete ✅");
    } catch (err) {
      console.error("Server unreachable (AI):", err);
      showStatus("AI analysis failed — server unreachable ❌");
    }
  }


  function typeAiResultText(element, text) {
    if (!element) return;
    if (element.__typingTimer) clearTimeout(element.__typingTimer);

    element.textContent = "";
    let index = 0;

    function tick() {
      if (index >= text.length) {
        element.__typingTimer = null;
        return;
      }
      element.textContent += text[index++];
      const delay = 12 + (index % 8 === 0 ? 10 : 0);
      element.__typingTimer = setTimeout(tick, delay);
    }

    tick();
  }

  function showAIResult(text, contactISP, metrics) {

    const box = document.getElementById("resultBox");
    const output = document.getElementById("aiResult");

    const contactBox = document.getElementById("ispContactComponent");
    const nameEl = document.getElementById("ispContactName");
    const numberEl = document.getElementById("ispContactNumber");

    const metricsBox = document.getElementById("connectionDetailsComponent");
    if (output) typeAiResultText(output, text);
    if (box) {
      box.classList.remove("d-none");
      requestAnimationFrame(() => box.classList.add("result-visible"));
    }

    // ISP Contact
    if (contactISP && contactBox) {
      nameEl.textContent = contactISP.name;
      numberEl.textContent = contactISP.phone;
      contactBox.classList.remove("d-none");
    }

    // Connection Metrics
    if (metrics && metricsBox) {

      updateMetric("metricPing", "ping", metrics.ping, metrics.ping.toFixed(1) + " ms");
      updateMetric("metricJitter", "jitter", metrics.jitter, metrics.jitter.toFixed(1) + " ms");
      updateMetric("metricLoadLatency", "latencyUnderLoad", metrics.latencyUnderLoad, metrics.latencyUnderLoad.toFixed(1) + " ms");
      updateMetric("metricLatencyRatio", "latencyRatio", metrics.latencyRatio, metrics.latencyRatio.toFixed(2));
      const stabilityPercent = calculateNetworkStability(metrics.ping, metrics.jitter, metrics.latencyUnderLoad);
      updateMetric("metricStability", "networkStability", stabilityPercent, stabilityPercent.toFixed(0) + "%");
      const congestionPercent = Math.round((Number(metrics.congestionScore) / 5) * 100);
      updateMetric("metricCongestion", "congestionScore", congestionPercent, congestionPercent.toFixed(0) + "%");
      updateMetric("metricBufferbloat", "bufferbloatGrade", metrics.bufferbloatGrade, metrics.bufferbloatGrade);
      updateMetric(
        "metricTowerDistance",
        "towerDistance",
        metrics.towerDistance,
        metrics.towerDistance ? metrics.towerDistance.toFixed(2) + " km" : "N/A"
      );

      if (typeof metrics.towerDistance === "number") {
        window.towerDistance = metrics.towerDistance;
      }
      updateTowerMapMeta();
      updateTowerMapActionState();

      metricsBox.classList.remove("d-none");
    } else if (metricsBox) {
      metricsBox.classList.add("d-none");
    }

  }

  function animateValue(id, target, decimals = 0) {
    const el = document.getElementById(id);
    if (!el) return;

    const start = parseFloat(el.textContent) || 0;
    const end = Number(target) || 0;
    const duration = 420;
    const startTime = performance.now();

    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (end - start) * eased;
      el.textContent = decimals === 0 ? Math.round(value) : value.toFixed(decimals);
      if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function showResults(ping, down, up) {
    animateValue("pingValue", ping, 0);
    animateValue("downloadValue", down, 1);
    animateValue("uploadValue", up, 1);
  }

  async function measurePingAndJitter() {
    const samples = [];

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await fetch(
        "https://speed.cloudflare.com/cdn-cgi/trace?nocache=" + Date.now(),
        { cache: "no-store" }
      );
      const end = performance.now();
      samples.push(end - start);
    }

    const avgPing =
      samples.reduce((a, b) => a + b, 0) / samples.length;

    const jitter =
      Math.max(...samples) - Math.min(...samples);

    return { ping: avgPing, jitter };
  }

  async function fetchDeviceCount() {
    try {
      const res = await fetch(`${LOCAL_API}/api/devices`, { method: "POST" });
      const data = await res.json();
      deviceCount = data.count || 0;

      console.log("Device count:", deviceCount);

      const deviceCountElement = document.getElementById("deviceCountDisplay");
      if (deviceCountElement) {
        deviceCountElement.textContent = `عدد الأجهزة المتصلة: ${deviceCount} جهاز`;
      }

      if (_deviceCountResolve) {
        _deviceCountResolve(deviceCount);
        _deviceCountResolve = null;
      }

      return deviceCount;
    } catch (err) {
      console.error("Device count fetch error:", err);
      deviceCount = 0;
      console.log("Device count:", deviceCount);

      if (_deviceCountResolve) {
        _deviceCountResolve(0);
        _deviceCountResolve = null;
      }

      return 0;
    }
  }

  function waitForDeviceCount(timeoutMs = 4000) {
    if (_deviceCountPromise === null) {
      return Promise.resolve(deviceCount);
    }
    return Promise.race([
      _deviceCountPromise,
      new Promise((resolve) => setTimeout(() => resolve(deviceCount), timeoutMs))
    ]);
  }

  async function fetchWifiSignal() {
    try {
      if (detectedConnectionType !== "wifi") {
        wifiSignal = null;
        const el = document.getElementById("wifiSignalDisplay");
        if (el) el.style.display = "none";
        return null;
      }
      const res = await fetch(`${LOCAL_API}/api/wifi-signal`);
      const data = await res.json();
      wifiSignal = typeof data.signal === "number" ? data.signal : null;
      console.log("WiFi signal:", wifiSignal);

      const el = document.getElementById("wifiSignalDisplay");
      if (el) {
        el.style.display = "";
        el.textContent = wifiSignal !== null ? `قوة إشارة WiFi: ${wifiSignal}%` : `قوة إشارة WiFi: غير متوفر`;
      }

      return wifiSignal;
    } catch (err) {
      console.error("WiFi signal fetch error:", err);
      wifiSignal = null;
      return null;
    }
  }

  async function getWifiNetworks() {
    try {
      if (detectedConnectionType !== "wifi") {
        wifiNetworks = null;
        const el = document.getElementById("wifiNetworksDisplay");
        if (el) el.style.display = "none";
        return null;
      }
      const res = await fetch(`${LOCAL_API}/api/wifi-networks`);
      const data = await res.json();
      wifiNetworks = data.wifiNetworks || 0;
      console.log("WiFi networks:", wifiNetworks);

      const el = document.getElementById("wifiNetworksDisplay");
      if (el) {
        el.style.display = "";
        el.textContent = wifiNetworks !== null ? `📡 Nearby WiFi Networks: ${wifiNetworks}` : `📡 Nearby WiFi Networks: غير متوفر`;
      }

      return wifiNetworks;
    } catch (err) {
      console.error("WiFi scan error:", err);
      wifiNetworks = null;
      const el = document.getElementById("wifiNetworksDisplay");
      if (el) {
        el.textContent = `📡 Nearby WiFi Networks: غير متوفر`;
      }
      return null;
    }
  }

  async function startSpeedTest() {
    if (speedTestRunning) {
      showStatus("Test is already running...");
      return;
    }
    speedTestRunning = true;

    activateGaugeLoading();
    setGaugePhase("phase-ping");
    showStatus("Measuring latency...");
    disableIdleAnimation();
    await playPreSpin();

    // Create a promise that resolves when Nmap finishes
    _deviceCountPromise = new Promise((resolve) => {
      _deviceCountResolve = resolve;
    });

    // Re-detect connection type before starting background tasks
    await detectConnectionTypeFromServer();

    // Run Nmap in background — do NOT block the speed test
    fetchDeviceCount().catch((err) => {
      console.error("Background device scan failed:", err);
      if (_deviceCountResolve) {
        _deviceCountResolve(0);
        _deviceCountResolve = null;
      }
    });

    // Run WiFi-specific scans only when on WiFi
    if (detectedConnectionType === "wifi") {
      fetchWifiSignal().catch((err) => {
        console.error("Background WiFi signal fetch failed:", err);
      });

      getWifiNetworks().catch((err) => {
        console.error("Background WiFi networks scan failed:", err);
      });
    } else {
      wifiSignal = null;
      wifiNetworks = null;
    }

    // ===== مسح التحليل ورقم التواصل عند إعادة الاختبار =====
    const output = document.getElementById("aiResult");
    const resultBox = document.getElementById("resultBox");
    const contactBox = document.getElementById("ispContactComponent");

    if (output) output.textContent = "Waiting for analysis...";
    if (resultBox) {
      resultBox.classList.add("d-none");
      resultBox.classList.remove("result-visible");
    }
    if (contactBox) contactBox.classList.add("d-none");

    // إعادة ضبط كاملة قبل القياس
    gaugeCircle.style.strokeDasharray = "534";
    gaugeCircle.style.strokeDashoffset = "534";
    gaugeCircle.style.transition = "stroke-dashoffset 0.15s linear";

    setGaugeStartLoading(true);
    try {

      const pingData = await measurePingAndJitter();
      lastPing = pingData.ping;
      const jitter = pingData.jitter;

      showStatus("Testing download speed...");
      setGaugePhase("phase-download");

      const MAX_DURATION = 12000;
      const MIN_DURATION = 5000;
      const SLOW_THRESHOLD = 0.5; // Mbps — if below this after MIN_DURATION, stop early

      const downStart = performance.now();
      const controller = new AbortController();
      const res = await fetch(
        "https://speed.cloudflare.com/__down?bytes=500000000&nocache=" +
        Date.now(),
        { signal: controller.signal }
      );

      const reader = res.body.getReader();
      let total = 0;

      let loadPingSamples = [];
      let measuring = true;

      const interval = setInterval(async () => {
        if (!measuring) return;

        const start = performance.now();
        try {
          await fetch(
            "https://speed.cloudflare.com/cdn-cgi/trace?nocache=" + Date.now(),
            { cache: "no-store" }
          );
          const end = performance.now();
          loadPingSamples.push(end - start);
        } catch (e) { }
      }, 300);

      let stopped = false;
      while (true) {
        const elapsed = performance.now() - downStart;

        // Hard time limit
        if (elapsed >= MAX_DURATION) {
          stopped = true;
          controller.abort();
          break;
        }

        // Early stop for very slow connections
        if (elapsed >= MIN_DURATION && total > 0) {
          const currentMbps = (total * 8) / (elapsed / 1000) / 1e6;
          if (currentMbps < SLOW_THRESHOLD) {
            stopped = true;
            controller.abort();
            break;
          }
        }

        try {
          const { done, value } = await reader.read();
          if (done) break;

          total += value.length;

          const elapsedSec = (performance.now() - downStart) / 1000;
          const liveMbps = (total * 8) / elapsedSec / 1e6;
          updateGauge(liveMbps);
        } catch (e) {
          if (stopped) break;
          throw e;
        }
      }

      measuring = false;
      clearInterval(interval);

      if (loadPingSamples.length > 0) {
        latencyUnderLoad =
          loadPingSamples.reduce((a, b) => a + b, 0) /
          loadPingSamples.length;
      }

      const downTime = (performance.now() - downStart) / 1000;
      const downMbps = (total * 8) / downTime / 1e6;

      lastDown = downMbps;
      updateGauge(downMbps);

      const size = 25 * 1024 * 1024;
      const buffer = new Uint8Array(size);

      showStatus("Testing upload speed...");
      setGaugePhase("phase-upload");
      const upStart = performance.now();
      await fetch("https://speed.cloudflare.com/__up", {
        method: "POST",
        body: buffer,
      });

      const upTime = (performance.now() - upStart) / 1000;
      const upMbps = (size * 8) / upTime / 1e6;

      lastUp = upMbps;

      showResults(lastPing, lastDown, lastUp);
      showStatus("Analyzing results...");

      await requestAIAnalysis(
        lastPing,
        lastDown,
        lastUp,
        jitter,
        latencyUnderLoad
      );

      showStatus("Test Complete ✅");

      setTimeout(() => {
        resetGaugeSmooth();
      }, 500);

    } catch (err) {
      console.error("Speed Test Error:", err);
      showStatus("Test failed ❌");
    } finally {
      deactivateGaugeLoading();
      setGaugeStartLoading(false);
      speedTestRunning = false;
    }
  }

  window.startSpeedTest = startSpeedTest;
  setGaugeStartLoading(false);

  gaugeBox?.addEventListener("click", () => {
    startSpeedTest();
  });

  gaugeBox?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startSpeedTest();
    }
  });

  viewTowerMapBtn?.addEventListener("click", () => {
    openTowerMapExperience().catch((err) => {
      console.error("Tower map open error:", err);
      setTowerMapFallback("Unable to open tower map right now.");
    });
  });

  closeTowerMapBtn?.addEventListener("click", () => {
    closeTowerMapModal();
  });

  towerMapModal?.addEventListener("click", (event) => {
    if (event.target === towerMapModal) {
      closeTowerMapModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTowerMapModal();
    }
  });

  // Info button modal logic
  const infoBtn = document.getElementById("infoBtn");
  const infoModal = document.getElementById("infoModal");

  if (infoBtn && infoModal) {
    infoBtn.addEventListener("click", () => {
      infoModal.classList.remove("d-none", "closing");
    });

    function closeInfoModal() {
      infoModal.classList.add("closing");
      infoModal.addEventListener("animationend", function handler() {
        infoModal.classList.add("d-none");
        infoModal.classList.remove("closing");
        infoModal.removeEventListener("animationend", handler);
      });
    }

    infoModal.addEventListener("click", (e) => {
      if (e.target === infoModal) {
        closeInfoModal();
      }
    });
  }
});
