document.addEventListener("DOMContentLoaded", () => {
  const notice = document.getElementById("locationNotice");
  const enableBtn = document.getElementById("enableLocationBtn");

  const setLocationNoticeVisible = (visible) => {
    if (!notice) return;
    notice.style.display = visible ? "flex" : "none";
  };

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
  const startButton = document.querySelector('button[onclick="startSpeedTest()"]');
  const originalStartText = startButton ? startButton.textContent.trim() : "Start Now";
  let detectedConnectionType = "wifi";

  function getNormalizedConnectionType(type) {
    const normalizedType = String(type || "").toLowerCase();

    if (normalizedType.includes("wifi")) return "wifi";
    if (normalizedType.includes("ethernet")) return "ethernet";
    if (normalizedType.includes("cellular")) return "cellular";

    return "wifi";
  }

  function getConnectionTypeLabel(type) {
    if (type === "ethernet") return "Ethernet";
    if (type === "cellular") return "Cellular";
    return "WiFi";
  }

  function updateDetectedConnectionType() {
    const browserConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const browserConnectionType = browserConnection?.type || "";

    detectedConnectionType = getNormalizedConnectionType(browserConnectionType);

    if (detectedConnectionTypeElement) {
      detectedConnectionTypeElement.textContent = `نوع الاتصال: ${getConnectionTypeLabel(detectedConnectionType)}`;
    }
  }

  updateDetectedConnectionType();

  const browserConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (browserConnection) {
    if (typeof browserConnection.addEventListener === "function") {
      browserConnection.addEventListener("change", updateDetectedConnectionType);
    } else if ("onchange" in browserConnection) {
      browserConnection.onchange = updateDetectedConnectionType;
    }
  }

  function setStartButtonLoading(loading) {
    if (!startButton) return;
    startButton.disabled = loading;
    startButton.textContent = loading ? "Testing..." : originalStartText;
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
  window.towerDistance = null;

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
      const res = await fetch("/api/isp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip })
      });
      return await res.json();
    } catch (err) {
      console.error("ISP fetch error:", err);
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
      return null;
    }

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    try {
      const ispText = document.getElementById("ispInfo")?.textContent || "";
      const ispName = ispText.split("|")[0]?.trim();

      console.log("Sending tower lookup request with coords:", { lat, lon, ispName });

      const res = await fetch("/api/nearest-tower", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lat,
          lon,
          isp: ispName
        })
      });

      const data = await res.json();

      console.log("Nearest tower response:", data);

      window.towerDistance = typeof data.distance === "number" ? data.distance : null;
      console.log("towerDistance set:", window.towerDistance);
      return window.towerDistance;

    } catch (err) {
      console.error("Tower API error:", err);
      window.towerDistance = null;
      return null;
    }
}

  // تشغيلها عند تحميل الصفحة

  async function requestAIAnalysis(ping, down, up, jitter, latencyUnderLoad) {
    updateDetectedConnectionType();

    const connectionType = detectedConnectionType;

    const ispText = document.getElementById("ispInfo")?.textContent || "";
    const ispName = ispText.split("|")[0]?.trim() || null;


    await ensureTowerDistance();

    const payload = {
      ping,
      jitter,
      download: down,
      upload: up,
      latencyUnderLoad,
      connection: connectionType,
      towerDistance: window.towerDistance || null
    };

    showStatus("Analyzing results...");

    const res = await fetch("/api/analyze-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    showAIResult(data.analysis, data.contactISP, data.metrics);
    showStatus("AI Analysis Complete ✅");
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

    document.getElementById("metricTowerDistance").textContent =
      metrics.towerDistance
        ? metrics.towerDistance.toFixed(2) + " km"
        : "Unavailable";
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

  async function startSpeedTest() {

    activateGaugeLoading();
    setGaugePhase("phase-ping");
    showStatus("Measuring latency...");
    disableIdleAnimation();
    await playPreSpin();


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

    setStartButtonLoading(true);
    try {

      const pingData = await measurePingAndJitter();
      lastPing = pingData.ping;
      const jitter = pingData.jitter;

      showStatus("Testing download speed...");
      setGaugePhase("phase-download");
      const downStart = performance.now();
      const res = await fetch(
        "https://speed.cloudflare.com/__down?bytes=500000000&nocache=" +
        Date.now()
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.length;

        const elapsed = (performance.now() - downStart) / 1000;
        const liveMbps = (total * 8) / elapsed / 1e6;
        updateGauge(liveMbps);
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
      setStartButtonLoading(false);
    }
  }

  window.startSpeedTest = startSpeedTest;
});