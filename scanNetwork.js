const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { isNpcapInstalled } = require("./checkNpcap");

function getLocalSubnet() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          const parts = iface.address.split(".");
          if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          }
        }
      }
    }
  } catch (err) {
    console.error("Subnet detection error:", err);
  }
  return null;
}

function findNmapPath() {
  const candidates = [
    "C:\\Program Files (x86)\\Nmap\\nmap.exe",
    "C:\\Program Files\\Nmap\\nmap.exe",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      console.log("Found Nmap at:", p);
      return p;
    }
  }
  return null;
}

function runNmapScan(nmapPath, subnet, flags) {
  return new Promise((resolve) => {
    const cmd = `"${nmapPath}" ${flags} ${subnet}`;
    console.log("Running command:", cmd);

    exec(cmd, { windowsHide: true, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        console.error("Nmap exec error:", error.message);
        if (stderr) console.error("Nmap stderr:", stderr);
        return resolve({ count: 0, devices: [], error: error.message });
      }

      if (stderr) console.error("Nmap stderr:", stderr);
      console.log("RAW NMAP OUTPUT:\n", stdout);

      const lines = stdout.split("\n");
      const devices = [];
      let currentIp = null;

      for (const line of lines) {
        const ipMatch = line.match(
          /Nmap scan report for (?:.+\()?(\d+\.\d+\.\d+\.\d+)\)?/
        );
        if (ipMatch) {
          currentIp = ipMatch[1];
        }
        if (/Host is up/i.test(line) && currentIp) {
          devices.push({ ip: currentIp });
          currentIp = null;
        }
      }

      const count = devices.length;
      console.log("Active devices found:", count, devices);
      resolve({ count, devices });
    });
  });
}

async function scanNetwork() {
  const subnet = getLocalSubnet();
  console.log("Detected subnet:", subnet);

  if (!subnet) {
    console.error("Could not detect local subnet");
    return { count: 0, devices: [], error: "Could not detect local subnet" };
  }

  const nmapPath = findNmapPath();
  console.log("Nmap path:", nmapPath);

  if (!nmapPath) {
    console.error(
      "Nmap is not installed. Please install Nmap from https://nmap.org"
    );
    return { count: 0, devices: [], error: "Nmap is not installed" };
  }

  const npcap = await isNpcapInstalled();
  console.log("Npcap installed:", npcap);

  // With admin + Npcap: privileged ARP scan (fast, accurate)
  // Without Npcap or without admin: unprivileged TCP-based discovery
  const flags = npcap ? "-sn" : "-sn --unprivileged";
  console.log("Scan flags:", flags);

  let result = await runNmapScan(nmapPath, subnet, flags);

  // If privileged scan returned 0, retry with unprivileged as fallback
  if (result.count === 0 && npcap) {
    console.log("Privileged scan returned 0, retrying with --unprivileged...");
    result = await runNmapScan(nmapPath, subnet, "-sn --unprivileged");
  }

  // Final retry with a short delay
  if (result.count === 0) {
    console.log("No devices found, retrying once after delay...");
    await new Promise((r) => setTimeout(r, 2000));
    result = await runNmapScan(nmapPath, subnet, flags);
  }

  return result;
}

module.exports = scanNetwork;