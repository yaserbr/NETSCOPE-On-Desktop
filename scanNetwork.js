const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function getLocalSubnet() {
  try {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          const parts = iface.address.split(".");
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}`;
          }
        }
      }
    }
  } catch (err) {
    console.error("Subnet detection error:", err);
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNmapScan(nmapPath, subnet) {
  return new Promise((resolve) => {
    const args = ["-sn", `${subnet}.0/24`];

    console.log("Running nmap:", nmapPath, args.join(" "));

    const proc = spawn(nmapPath, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      console.error("Nmap spawn error:", err.message);
      resolve({ count: 0, devices: [], error: err.message });
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`Nmap exited with code ${code}`);
        if (stderr) console.error("Nmap stderr:", stderr);
      }

      console.log("RAW NMAP OUTPUT:\n", stdout);

      const regex = /Nmap scan report for (?:.+\()?(\d+\.\d+\.\d+\.\d+)\)?/g;
      const devices = [];
      let match;

      while ((match = regex.exec(stdout)) !== null) {
        devices.push({ ip: match[1] });
      }

      console.log("Parsed devices:", devices);

      resolve({
        count: devices.length,
        devices,
      });
    });
  });
}

async function scanNetwork() {
  const subnet = getLocalSubnet();
  const isDev = process.env.NODE_ENV !== "production";
  const nmapPath = isDev
    ? path.join(__dirname, "nmap", "nmap.exe")
    : path.join(process.resourcesPath, "nmap", "nmap.exe");

  console.log("Subnet:", subnet);
  console.log("Nmap path:", nmapPath);

  if (!subnet) {
    return { count: 0, devices: [] };
  }

  // Small delay before first scan to avoid cold-start / Npcap driver issues
  await delay(1200);

  let result = await runNmapScan(nmapPath, subnet);

  // Automatic retry once if no devices found
  if (result.count === 0) {
    console.log("No devices found, retrying once...");
    await delay(1500);
    result = await runNmapScan(nmapPath, subnet);
  }

  return result;
}

module.exports = scanNetwork;