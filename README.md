# NETSCOPE Desktop

NETSCOPE is an Electron + Express desktop app for internet quality diagnostics.
It combines speed measurements, local network signals, nearest-tower distance, and AI-based analysis in one interface.

## What This Project Does

- Measures `ping`, `download`, `upload`, `jitter`, and latency under load.
- Detects connection type (`WiFi`, `Ethernet`, or unknown).
- Scans local network devices (via bundled Nmap/Npcap support).
- Collects WiFi signal strength and nearby WiFi network count (Windows `netsh`).
- Fetches ISP information and nearest tower distance from a remote backend.
- Shows a visual nearest-tower map experience (with provider fallback support).
- Generates AI diagnosis and suggestions based on measured metrics.

## Tech Stack

- **Desktop shell:** Electron
- **Local backend:** Node.js + Express
- **Frontend:** HTML/CSS/Vanilla JS (served from `public/`)
- **Network tools:** Nmap + Npcap (bundled for Windows build)

## Project Structure

- `electron/main.js` - Electron app startup and BrowserWindow bootstrap.
- `server.js` - Local API server (device scan, WiFi info, map proxy, etc.).
- `app.js` - Express app setup and static serving.
- `public/` - Frontend assets (`index.html`, `css/styles.css`, `js/main.js`).
- `scanNetwork.js` - Local network scan logic.
- `checkNpcap.js` - Npcap detection and installer helpers.
- `nmap/`, `npcap/` - Bundled resources for packaged builds.

## Requirements

- **Node.js** 18+ (recommended 20+)
- **Windows** (for WiFi/Npcap/Nmap related local features)
- Internet access for speed tests and remote AI/ISP/tower APIs

## Installation

```bash
npm install
```

## Run Modes

### 1) Run local Express server only

```bash
npm start
```

### 2) Run desktop app (Electron)

```bash
npm run desktop
```

### 3) Development mode for local server

```bash
npm run dev
```

### 4) Build desktop installer

```bash
npm run build
```

## Map Provider Configuration

The map module supports provider selection through environment variables:

- `MAP_PROVIDER`
  - `google-embed` to use Google Maps Embed
  - `osm-proxy` to use OSM tiles through local proxy (default fallback)
- `GOOGLE_MAPS_EMBED_API_KEY`
  - Required when `MAP_PROVIDER=google-embed`

### Example (PowerShell)

```powershell
$env:MAP_PROVIDER="google-embed"
$env:GOOGLE_MAPS_EMBED_API_KEY="YOUR_KEY_HERE"
npm run desktop
```

If no key is set, the app falls back to `osm-proxy` mode.

## Available NPM Scripts

- `npm start` - Starts `server.js`
- `npm run dev` - Starts server with nodemon
- `npm run desktop` - Launches Electron app
- `npm run build` - Builds packaged desktop app with electron-builder
- `npm test` - Placeholder test command

## Notes for Contributors

- The frontend triggers the speed test from the circular gauge interaction.
- Local APIs in `server.js` are intended for desktop/local diagnostics.
- ISP lookup, nearest tower lookup, and AI analysis are currently delegated to a remote backend.
- Be careful with OS-specific behavior (especially networking commands on Windows).

## Troubleshooting

### App starts but some local diagnostics fail

- Ensure app has elevated permissions when needed.
- Verify Npcap/Nmap availability (`/api/check-nmap-ready`).

### Map tiles are blocked in direct OSM usage

- Use `osm-proxy` mode (default) or set up `google-embed` with API key.

### Speed test cannot complete

- Check internet connectivity and firewall rules.
- Verify access to `https://speed.cloudflare.com`.

## License

This repository currently declares `ISC` in `package.json`.
