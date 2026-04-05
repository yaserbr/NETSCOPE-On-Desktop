const { app, BrowserWindow, session, dialog } = require("electron");
const path = require("path");
const http = require("http");

function waitForServer(url, timeout = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    function check() {
      http.get(url, (res) => {
        res.resume();
        resolve(true);
      }).on("error", () => {
        if (Date.now() - start < timeout) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      });
    }
    check();
  });
}

// Request single instance lock to prevent multiple elevated windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Load the Express server
  require("../server.js");

  function createWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(__dirname, "..", "public", "images", "logo.png"),
    });

    // Fix CORS for Cloudflare speed test when loading from file://
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ["https://speed.cloudflare.com/*"] },
      (details, callback) => {
        details.requestHeaders["Origin"] = "https://speed.cloudflare.com";
        details.requestHeaders["Referer"] = "https://speed.cloudflare.com/";
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    win.loadFile(path.join(__dirname, "../public/index.html"));
  }

  app.whenReady().then(async () => {
    await waitForServer("http://localhost:3000/api/check-npcap");
    createWindow();
  });

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}