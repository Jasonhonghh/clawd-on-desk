"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const PROVIDERS_PATH = path.join(os.homedir(), "userData", "clawd-providers.json");
const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

let providersData = { providers: [], activeProvider: null };

function getProvidersPath() {
  const { app } = require("electron");
  return path.join(app.getPath("userData"), "clawd-providers.json");
}

function loadProviders() {
  try {
    const data = JSON.parse(fs.readFileSync(getProvidersPath(), "utf8"));
    if (data && typeof data === "object") {
      providersData = {
        providers: Array.isArray(data.providers) ? data.providers : [],
        activeProvider: data.activeProvider || null,
      };
    }
  } catch {
    providersData = { providers: [], activeProvider: null };
  }

  // If no providers saved yet, try to import from current CC config
  if (providersData.providers.length === 0) {
    const imported = importFromCurrentEnv();
    if (imported) {
      // Auto-detect provider name from baseUrl
      let providerName = "default";
      if (imported.baseUrl?.includes("qianfan")) {
        providerName = "qianfan";
      } else if (imported.baseUrl?.includes("bigmodel")) {
        providerName = "glm";
      }

      const defaultProvider = {
        name: providerName,
        authToken: imported.authToken,
      };

      if (imported.baseUrl) defaultProvider.baseUrl = imported.baseUrl;
      if (imported.timeout) defaultProvider.timeout = imported.timeout;
      if (imported.model) defaultProvider.model = imported.model;

      if (imported.models && (imported.models.haiku || imported.models.sonnet || imported.models.opus)) {
        defaultProvider.models = {};
        if (imported.models.haiku) defaultProvider.models.haiku = imported.models.haiku;
        if (imported.models.sonnet) defaultProvider.models.sonnet = imported.models.sonnet;
        if (imported.models.opus) defaultProvider.models.opus = imported.models.opus;
      }

      providersData.providers.push(defaultProvider);
      providersData.activeProvider = providerName;
      saveProviders(providersData);
      console.log(`Clawd: Imported default CC config as '${providerName}' provider`);
    }
  }

  return providersData;
}

function saveProviders(data) {
  try {
    fs.writeFileSync(getProvidersPath(), JSON.stringify(data, null, 2));
    providersData = data;
    return true;
  } catch (err) {
    console.error("Failed to save providers:", err.message);
    return false;
  }
}

function getActiveProvider() {
  return providersData.activeProvider;
}

function getProviderByName(name) {
  return providersData.providers.find((p) => p.name === name);
}

function readCurrentEnv() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    return settings.env || {};
  } catch {
    return {};
  }
}

function switchProvider(name) {
  const provider = getProviderByName(name);
  if (!provider) {
    return { success: false, error: "Provider not found" };
  }

  try {
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    } catch {
      settings = {};
    }

    if (!settings.env || typeof settings.env !== "object") {
      settings.env = {};
    }

    // Required fields
    settings.env.ANTHROPIC_AUTH_TOKEN = provider.authToken;

    // Optional fields - only set if provided
    if (provider.baseUrl) {
      settings.env.ANTHROPIC_BASE_URL = provider.baseUrl;
    }

    if (provider.timeout) {
      settings.env.API_TIMEOUT_MS = provider.timeout;
    }

    if (provider.model) {
      settings.env.ANTHROPIC_MODEL = provider.model;
    }

    // Model mappings
    if (provider.models) {
      if (provider.models.haiku) {
        settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.models.haiku;
      }
      if (provider.models.sonnet) {
        settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.models.sonnet;
      }
      if (provider.models.opus) {
        settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.models.opus;
      }
    }

    // Preserve existing CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC if not set in provider
    if (!settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
      settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = 1;
    }

    try {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    } catch (writeErr) {
      setTimeout(() => {
        try {
          fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        } catch (retryErr) {
          console.error("Failed to write settings.json after retry:", retryErr.message);
        }
      }, 500);
      throw writeErr;
    }

    providersData.activeProvider = name;
    saveProviders(providersData);

    return { success: true };
  } catch (err) {
    console.error("Failed to switch provider:", err.message);
    return { success: false, error: err.message };
  }
}

function addProvider(provider) {
  if (!provider.name) {
    return { success: false, error: "Provider name is required" };
  }
  if (providersData.providers.some((p) => p.name === provider.name)) {
    return { success: false, error: "Provider name already exists" };
  }
  providersData.providers.push(provider);
  if (!providersData.activeProvider) {
    providersData.activeProvider = provider.name;
  }
  return saveProviders(providersData)
    ? { success: true }
    : { success: false, error: "Failed to save" };
}

function updateProvider(name, updates) {
  const index = providersData.providers.findIndex((p) => p.name === name);
  if (index === -1) {
    return { success: false, error: "Provider not found" };
  }
  if (updates.name && updates.name !== name) {
    if (providersData.providers.some((p) => p.name === updates.name)) {
      return { success: false, error: "Provider name already exists" };
    }
  }
  providersData.providers[index] = { ...providersData.providers[index], ...updates };
  return saveProviders(providersData)
    ? { success: true }
    : { success: false, error: "Failed to save" };
}

function deleteProvider(name) {
  const index = providersData.providers.findIndex((p) => p.name === name);
  if (index === -1) {
    return { success: false, error: "Provider not found" };
  }
  providersData.providers.splice(index, 1);
  if (providersData.activeProvider === name) {
    providersData.activeProvider = providersData.providers.length > 0
      ? providersData.providers[0].name
      : null;
  }
  return saveProviders(providersData)
    ? { success: true, newActive: providersData.activeProvider }
    : { success: false, error: "Failed to save" };
}

function importFromCurrentEnv() {
  const env = readCurrentEnv();
  if (env.ANTHROPIC_AUTH_TOKEN) {
    const result = {
      authToken: env.ANTHROPIC_AUTH_TOKEN,
      baseUrl: env.ANTHROPIC_BASE_URL || "",
      timeout: env.API_TIMEOUT_MS || "",
      model: env.ANTHROPIC_MODEL || "",
      models: {
        haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "",
        sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL || "",
        opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL || "",
      },
    };
    // Also import small/fast model if exists
    if (env.ANTHROPIC_SMALL_FAST_MODEL) {
      result.models.smallFast = env.ANTHROPIC_SMALL_FAST_MODEL;
    }
    return result;
  }
  return null;
}

module.exports = {
  loadProviders,
  saveProviders,
  getActiveProvider,
  getProviderByName,
  switchProvider,
  addProvider,
  updateProvider,
  deleteProvider,
  readCurrentEnv,
  importFromCurrentEnv,
  get providersData() { return providersData; },
};
