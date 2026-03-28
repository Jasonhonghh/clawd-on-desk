"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("providerAPI", {
  getProviders: () => ipcRenderer.invoke("provider:getAll"),
  getActiveProvider: () => ipcRenderer.invoke("provider:getActive"),
  switchProvider: (name) => ipcRenderer.invoke("provider:switch", name),
  saveProvider: (provider) => ipcRenderer.invoke("provider:save", provider),
  deleteProvider: (name) => ipcRenderer.invoke("provider:delete", name),
  importFromEnv: () => ipcRenderer.invoke("provider:importFromEnv"),
  onProvidersUpdated: (callback) => {
    ipcRenderer.on("provider:updated", (_, data) => callback(data));
  },
});
