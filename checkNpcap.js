const path = require("path");
const { exec } = require("child_process");

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
  return new Promise((resolve) => {
    const installerPath = path.join(__dirname, "npcap", "npcap-setup.exe");

    console.log("Installing Npcap from:", installerPath);

    exec(`"${installerPath}"`, (err) => {
      if (err) {
        console.error("Npcap installation error:", err);
        return resolve(false);
      }

      return resolve(true);
    });
  });
}

module.exports = { isNpcapInstalled, installNpcap };
