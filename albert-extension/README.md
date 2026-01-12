# Albert Voice Assistant - Chrome Extension

A Chrome extension for quick access to Albert AI assistant from any webpage.

## Features

- **Floating Voice Button**: Click the orb on any page to talk to Albert
- **Keyboard Shortcuts**:
  - `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac): Open popup
  - `Ctrl+Shift+V`: Start voice conversation
- **Page Context**: Send current page content to Albert
- **Selection**: Send selected text to Albert
- **Right-click Menu**: Ask Albert about selected text

## Installation (Development)

1. **Generate Icons** (required):
   ```bash
   # Convert the SVG to PNG icons
   # You can use any image editor or online converter
   # Need: icon-16.png, icon-48.png, icon-128.png
   ```

2. **Load Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `albert-extension` folder

3. **Configure Server URL**:
   - Click the extension icon
   - Click the server URL to change it
   - Default is `http://localhost:3001`

## Building for Production

1. Update the `serverUrl` in popup.js and content.js to your production URL
2. Update `host_permissions` in manifest.json
3. Generate proper icons
4. Zip the extension folder
5. Submit to Chrome Web Store

## Files

- `manifest.json` - Extension configuration
- `popup/` - Extension popup UI
- `content/` - Content script (floating button)
- `background/` - Service worker
- `assets/` - Icons and images

## Permissions

- `activeTab` - Access current tab content
- `storage` - Save settings
- `scripting` - Inject content scripts
- Host permissions for Albert server
