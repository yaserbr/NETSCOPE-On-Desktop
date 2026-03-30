const os = require("os");
const path = require("path");
const { exec } = require("child_process");

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
    console.error("Nmap error:", err);
  }

  return null;
}

function scanNetwork() {
  return new Promise((resolve) => {
    const subnet = getLocalSubnet();
    const isDev = process.env.NODE_ENV !== "production";
    const nmapPath = isDev
      ? path.join(__dirname, "nmap", "nmap.exe")
      : path.join(process.resourcesPath, "nmap", "nmap.exe");

    console.log("Subnet:", subnet);
    console.log("Nmap path:", nmapPath);

    if (!subnet) {
      return resolve({ count: 0, devices: [] });
    }

    const command = `"${nmapPath}" -sn ${subnet}.0/24`;
    console.log("Running command:", command);

    exec(command, { timeout: 8000 }, (err, stdout = "") => {
      if (err) {
        console.error("Nmap error:", err);
        return resolve({ count: 0, devices: [] });
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

module.exports = scanNetwork;