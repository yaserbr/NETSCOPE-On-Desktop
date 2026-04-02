const { app, BrowserWindow, session } = require("electron");
const path = require("path");

// نشغل السيرفر
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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});