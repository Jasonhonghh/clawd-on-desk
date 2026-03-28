# CC Provider Switch — Design Spec

**Date**: 2026-03-29
**Status**: Draft

## Overview

Integrate cc-switch-like provider switching into the Clawd on Desk desktop pet. Users can switch Claude Code's API provider (token, base URL, models) directly from the pet's right-click context menu, and manage provider configurations through a modern GUI window.

**Scope**: Claude Code only. Provider switching via `~/.claude/settings.json` `env` field.

## Requirements

1. **Right-click menu switching** — submenu under "CC Config" lists saved providers; clicking one switches instantly
2. **GUI provider management** — a BrowserWindow with left-right split layout for adding, editing, and deleting providers
3. **Modern UI** — rounded cards, soft shadows, placeholder examples in form fields, smooth hover transitions
4. **i18n** — all new UI text supports English and Chinese, matching existing style
5. **Safe file writes** — only modify `env` keys related to provider switching; preserve all other `settings.json` fields

## Data Model

**Storage**: `userData/clawd-providers.json`

```json
{
  "providers": [
    {
      "name": "z.ai",
      "authToken": "sk-xxx...",
      "baseUrl": "https://api.z.ai/api/anthropic",
      "models": {
        "haiku": "GLM-4.5-air",
        "sonnet": "GLM-5.1",
        "opus": "GLM-5.1"
      }
    }
  ],
  "activeProvider": "z.ai"
}
```

- `name`: unique identifier, displayed in menu
- `models`: optional — if omitted, switch does not overwrite existing model config
- `activeProvider`: tracks currently active provider for menu checkmark
- `authToken`: stored in plaintext (same as `settings.json` — encryption is out of scope)

## Menu Integration

### Context Menu Structure

```
├─ Size / 大小
├─ ──────
├─ Mini Mode / 极简模式
├─ ──────
├─ CC Config / CC 配置              ← NEW
│  ├─ ● z.ai                       ← radio, active has checkmark
│  ├─ ○ anthropic-official
│  ├─ ──────
│  ├─ Add... / 添加...
│  └─ Manage... / 管理...
├─ ──────
├─ Sleep (Do Not Disturb) / 休眠（免打扰）
├─ ...
```

### Menu Behavior

- Clicking a provider name: immediately switches provider, updates `settings.json`, refreshes checkmark
- Clicking "Add...": opens management window with a new blank provider form
- Clicking "Manage...": opens management window showing existing providers
- Menu rebuilds on every right-click to reflect current provider list

### i18n Keys

| Key | English | Chinese |
|-----|---------|---------|
| `ccConfig` | CC Config | CC 配置 |
| `addConfig` | Add... | 添加... |
| `manageConfig` | Manage... | 管理... |
| `activeConfig` | (active) | (当前) |
| `configSwitched` | Config switched to {name} | 已切换到 {name} |
| `configSwitchNote` | Restart Claude Code to apply | 重启 Claude Code 后生效 |

## Provider Management Window

### Layout

Left-right split BrowserWindow (~700x500):

```
┌──────────────────────────────────────────────┐
│  CC Config / CC 配置                    [×]   │
├──────────────┬───────────────────────────────┤
│ ● z.ai (当前) │  Name:   [z.ai           ]   │
│   official   │  Token:  [sk-xxx...       ]   │
│              │  URL:    [https://api...   ]   │
│              │  Haiku:  [GLM-4.5-air     ]   │
│              │  Sonnet: [GLM-5.1         ]   │
│              │  Opus:   [GLM-5.1         ]   │
│              │                                │
│  [+ 添加]    │  [保存]  [删除]                 │
├──────────────┴───────────────────────────────┤
│  Restart Claude Code to apply changes         │
└──────────────────────────────────────────────┘
```

### Visual Style

- Rounded card design with soft shadows
- Left panel: provider items as rounded list entries, active item highlighted
- Right panel: modern input fields with subtle borders (bottom-border or soft-outline style)
- Buttons: filled color with hover transition animations
- Placeholder text examples in every input field (disappears on user input):

| Field | Placeholder |
|-------|-------------|
| Name | `e.g. my-provider` / `例如：my-provider` |
| Token | `e.g. sk-ant-api03-xxxx...` |
| Base URL | `e.g. https://api.anthropic.com` |
| Haiku Model | `e.g. claude-haiku-4-5-20251001` |
| Sonnet Model | `e.g. claude-sonnet-4-6` |
| Opus Model | `e.g. claude-opus-4-6` |

### Window Behavior

- Always on top, centered on screen
- Selecting a provider in left list populates right form
- "Add" button creates a new blank entry in left list, selects it
- "Save" writes changes to `clawd-providers.json`
- "Delete" removes provider with confirmation
- Closing window discards unsaved changes (or prompts to save)

## Switching Mechanism

When user selects a provider from the right-click menu:

1. Read target provider from `clawd-providers.json`
2. Read current `~/.claude/settings.json`
3. Update `env` field keys:
   - `ANTHROPIC_AUTH_TOKEN` ← provider.authToken
   - `ANTHROPIC_BASE_URL` ← provider.baseUrl
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL` ← provider.models.haiku (if present)
   - `ANTHROPIC_DEFAULT_SONNET_MODEL` ← provider.models.sonnet (if present)
   - `ANTHROPIC_DEFAULT_OPUS_MODEL` ← provider.models.opus (if present)
4. Write back `settings.json` (preserve all other fields: `permissions`, `hooks`, `enabledPlugins`, etc.)
5. Update `activeProvider` in `clawd-providers.json`
6. Rebuild context menu to update checkmark
7. Show system notification: "Config switched to {name}. Restart Claude Code to apply."

**Safety**:
- Only touch `env` keys listed above — never modify `permissions`, `hooks`, or other fields
- If `settings.json` write fails (e.g., file locked), retry once after 500ms, then show error notification
- Read-modify-write is atomic at the JSON level (parse full file, modify in memory, write full file)

## File Structure

### New Files

```
src/
├── provider.js              # Provider data CRUD + settings.json read/write
├── provider-window.js       # Management BrowserWindow lifecycle + IPC
├── provider-window.html     # Management window UI (HTML + inline CSS + JS)
└── preload-provider.js      # Preload script for provider-window IPC bridge
```

The management window uses a preload script (`preload-provider.js`) to expose a safe IPC bridge (`window.providerAPI`) to the renderer, following the same pattern as the existing `preload.js` files.

### Modified Files

| File | Changes |
|------|---------|
| `src/menu.js` | Add "CC Config" submenu to context menu and tray menu; add i18n keys |
| `src/main.js` | Load providers on startup; expose provider switching to menu context |

### Module Responsibilities

**`provider.js`**:
- `loadProviders()` — read `clawd-providers.json`
- `saveProviders(data)` — write `clawd-providers.json`
- `switchProvider(name)` — update `settings.json` env + `activeProvider`
- `getActiveProvider()` — return current active provider name
- `readCurrentEnv()` — read current `settings.json` env for initial import

**`provider-window.js`**:
- `openProviderWindow(addNew)` — create/show management BrowserWindow
- IPC handlers for CRUD operations between renderer and main process

## Out of Scope

- Encryption of stored tokens
- Automatic Claude Code restart after switching
- Support for other AI CLIs (Codex, Gemini, etc.)
- Cloud sync of provider configurations
