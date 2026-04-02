const app = require("./app");
const scanNetwork = require("./scanNetwork");
const { isNpcapInstalled, installNpcap } = require("./checkNpcap");
const { spawn } = require("child_process");

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

app.post("/api/install-npcap", async (req, res) => {
  try {
    console.log("Installing Npcap...");
    const success = await installNpcap();
    res.json({ success });
  } catch (err) {
    console.error("Npcap install error:", err);
    res.json({ success: false });
  }
});

app.get("/api/wifi-signal", (req, res) => {
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
  const proc = spawn("netsh", ["wlan", "show", "networks", "mode=Bssid"], { windowsHide: true });
  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  proc.on("error", (err) => {
    console.error("WiFi networks scan error:", err.message);
    res.status(500).json({ error: "Failed to scan WiFi networks" });
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.error("netsh wifi-networks exited with code", code, stderr);
      return res.status(500).json({ error: "Failed to scan WiFi networks" });
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