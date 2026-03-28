"use strict";

const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

const provider = require("./provider");

let providerWindow = null;

function getProviderWindow() {
  return providerWindow;
}

function openProviderWindow(addNew = false) {
  if (providerWindow && !providerWindow.isDestroyed()) {
    providerWindow.focus();
    if (addNew) {
      providerWindow.webContents.send("provider:action", { action: "addNew" });
    }
    return providerWindow;
  }

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 700;
  const winHeight = 500;
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = Math.round((screenHeight - winHeight) / 2);

  providerWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    title: "CC Config",
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-provider.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  providerWindow.loadFile(path.join(__dirname, "provider-window.html"));

  providerWindow.on("closed", () => {
    providerWindow = null;
  });

  return providerWindow;
}

function closeProviderWindow() {
  if (providerWindow && !providerWindow.isDestroyed()) {
    providerWindow.close();
    providerWindow = null;
  }
}

function setupIpcHandlers() {
  ipcMain.handle("provider:getAll", () => {
    return provider.providersData;
  });

  ipcMain.handle("provider:getActive", () => {
    return provider.getActiveProvider();
  });

  ipcMain.handle("provider:switch", async (_, name) => {
    return provider.switchProvider(name);
  });

  ipcMain.handle("provider:save", async (_, providerData) => {
    const existing = provider.getProviderByName(providerData.name);
    let result;
    if (existing) {
      result = provider.updateProvider(providerData.name, providerData);
    } else {
      result = provider.addProvider(providerData);
    }
    return {
      ...result,
      providers: provider.providersData.providers,
    };
  });

  ipcMain.handle("provider:delete", async (_, name) => {
    const result = provider.deleteProvider(name);
    return {
      ...result,
      providers: provider.providersData.providers,
      activeProvider: provider.getActiveProvider(),
    };
  });

  ipcMain.handle("provider:importFromEnv", () => {
    return provider.importFromCurrentEnv();
  });
}

function init() {
  provider.loadProviders();
  setupIpcHandlers();
}

module.exports = {
  init,
  openProviderWindow,
  closeProviderWindow,
  getProviderWindow,
};
