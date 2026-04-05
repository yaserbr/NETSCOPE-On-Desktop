const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// Detect whether we're running inside a packaged Electron app.
// In packaged builds, __dirname is inside app.asar and file paths
// there cannot be executed by external processes like PowerShell.
const isPackaged = __dirname.includes("app.asar");

/**
 * Resolve the real filesystem path for a bundled resource folder.
 * - Packaged build: extraResources places folders at process.resourcesPath/<name>/
 * - Dev mode: folders are in the project root (__dirname/<name>/)
 */
function resolveResourcePath(...segments) {
  const candidates = [];

  // Packaged: process.resourcesPath -> <app>/resources/
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, ...segments));
  }

  // Dev: project root
  if (!isPackaged) {
    candidates.push(path.join(__dirname, ...segments));
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function isNpcapInstalled() {
  return new Promise((resolve) => {
    exec("sc query npcap", (err, stdout = "") => {
      if (err) {
        return resolve(false);
      }

      const isRunning = stdout.includes("RUNNING");
      return resolve(isRunning);
    });
  });
}

function installNpcap() {
  return new Promise((resolve, reject) => {
    const installerPath = resolveResourcePath("npcap", "npcap-setup.exe");

    if (!installerPath) {
      const searched = [
        process.resourcesPath ? path.join(process.resourcesPath, "npcap", "npcap-setup.exe") : null,
        !isPackaged ? path.join(__dirname, "npcap", "npcap-setup.exe") : null,
      ].filter(Boolean).join(", ");
      const msg = `Npcap installer not found. Searched: ${searched}`;
      console.error(msg);
      return reject(new Error(msg));
    }

    console.log("Installing Npcap from:", installerPath);

    // Use PowerShell Start-Process with -Verb RunAs to trigger UAC elevation.
    // -Wait ensures we block until the installer finishes so we can report success.
    // -EncodedCommand avoids all quoting/escaping issues with paths containing spaces.
    const psScript = `Start-Process -FilePath '${installerPath.replace(/'/g, "''")}' -Verb RunAs -Wait`;
    const encodedCmd = Buffer.from(psScript, "utf16le").toString("base64");

    exec(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCmd}`,
      { windowsHide: false, timeout: 300000 },
      async (err) => {
        if (err) {
          console.error("Npcap installation error:", err);
          return resolve({ success: false, error: err.message });
        }

        // Verify the service is actually installed now
        const installed = await isNpcapInstalled();
        console.log("Npcap installed after setup:", installed);
        return resolve({
          success: installed,
          error: installed ? null : "Installer ran but Npcap service not detected. A reboot may be required.",
        });
      }
    );
  });
}

module.exports = { isNpcapInstalled, installNpcap, resolveResourcePath };
