const app = require("./app");
const os = require("os");
const scanNetwork = require("./scanNetwork");
const { isNpcapInstalled, installNpcap, resolveResourcePath } = require("./checkNpcap");
const { spawn } = require("child_process");
const fs = require("fs");

// ================= CONNECTION TYPE DETECTION =================

function detectConnectionType() {
  const interfaces = os.networkInterfaces();
  // Common WiFi adapter name patterns on Windows
  const wifiPatterns = /wi-?fi|wireless|wlan|802\.11/i;
  // Common Ethernet adapter name patterns
  const ethernetPatterns = /ethernet|eth\d|local area connection|realtek|intel.*gigabit/i;

  let hasWifi = false;
  let hasEthernet = false;

  for (const [name, addrs] of Object.entries(interfaces)) {
    const hasIPv4 = addrs.some(a => a.family === "IPv4" && !a.internal);
    if (!hasIPv4) continue;

    if (wifiPatterns.test(name)) hasWifi = true;
    if (ethernetPatterns.test(name)) hasEthernet = true;
  }

  // Prefer Ethernet if both are connected (more reliable)
  if (hasEthernet) return "ethernet";
  if (hasWifi) return "wifi";
  return "unknown";
}

app.get("/api/connection-type", (req, res) => {
  try {
    const type = detectConnectionType();
    console.log("Detected connection type:", type);
    res.json({ type });
  } catch (err) {
    console.error("Connection type detection error:", err);
    res.json({ type: "unknown" });
  }
});

app.post("/api/devices", async (req, res) => {
  try {
    const result = await scanNetwork();
    console.log("Device scan result:", result);
    res.json(result);
  } catch (err) {
    console.error("Device scan error:", err);
    res.json({
      count: 0,
      devices: []
    });
  }
});

app.get("/api/check-npcap", async (req, res) => {
  try {
    const installed = await isNpcapInstalled();
    console.log("Npcap installed:", installed);
    res.json({ installed });
  } catch (err) {
    console.error("Npcap check error:", err);
    res.json({ installed: false });
  }
});

app.get("/api/check-nmap-ready", async (req, res) => {
  try {
    const nmapPath = resolveResourcePath("nmap", "nmap.exe");
    const nmapAvailable = !!nmapPath
      || fs.existsSync("C:\\Program Files (x86)\\Nmap\\nmap.exe")
      || fs.existsSync("C:\\Program Files\\Nmap\\nmap.exe");
    const npcapInstalled = await isNpcapInstalled();
    console.log("Nmap available:", nmapAvailable, "Npcap installed:", npcapInstalled);
    res.json({ nmapAvailable, npcapInstalled, ready: nmapAvailable && npcapInstalled });
  } catch (err) {
    console.error("Nmap readiness check error:", err);
    res.json({ nmapAvailable: false, npcapInstalled: false, ready: false });
  }
});

app.post("/api/install-npcap", async (req, res) => {
  try {
    console.log("Installing Npcap...");
    const result = await installNpcap();
    res.json(result);
  } catch (err) {
    console.error("Npcap install error:", err);
    res.json({ success: false, error: err.message || "Unknown installation error" });
  }
});

app.get("/api/wifi-signal", (req, res) => {
  const connType = detectConnectionType();
  if (connType !== "wifi") {
    return res.json({ signal: null, connectionType: connType });
  }

  const proc = spawn("netsh", ["wlan", "show", "interfaces"], { windowsHide: true });
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  proc.on("error", (err) => {
    console.error("WiFi signal detection error:", err.message);
    res.json({ signal: null });
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error("netsh exited with code", code, stderr);
      return res.json({ signal: null });
    }
    const match = stdout.match(/Signal\s*:\s*(\d+)%/i);
    const signal = match ? parseInt(match[1], 10) : null;
    console.log("WiFi signal strength:", signal);
    res.json({ signal });
  });
});

app.get("/api/wifi-networks", (req, res) => {
  const connType = detectConnectionType();
  if (connType !== "wifi") {
    return res.json({ success: true, wifiNetworks: 0, connectionType: connType });
  }

  const proc = spawn("netsh", ["wlan", "show", "networks", "mode=Bssid"], { windowsHide: true });
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  proc.on("error", (err) => {
    console.error("WiFi networks scan error:", err.message);
    res.json({ success: false, wifiNetworks: 0, error: "Failed to scan WiFi networks" });
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error("netsh wifi-networks exited with code", code, stderr);
      return res.json({ success: false, wifiNetworks: 0, error: "Failed to scan WiFi networks" });
    }
    const bssidMatches = stdout.match(/BSSID\s*\d*\s*:/gi);
    const wifiNetworks = bssidMatches ? bssidMatches.length : 0;
    console.log("WiFi networks detected:", wifiNetworks);
    res.json({ success: true, wifiNetworks });
  });
});

// AI analysis is now handled by the deployed backend (Render server)
// Local endpoints below remain for device scanning and local network tools

// ================= KEEP ALIVE =================

app.use((req, res, next) => {
  res.set("Connection", "keep-alive");
  next();
});

// Nearest tower, ISP lookup, and AI analysis are handled by the remote server

const PORT = 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});