# Albert Desktop App Icons

Place the following icon files in this directory for the Electron build:

## Required Icons

- `icon.png` - 512x512 PNG for Linux and general use
- `icon.icns` - macOS icon bundle (can be generated from PNG)
- `icon.ico` - Windows icon file (can be generated from PNG)

## Generating Icons

You can use online tools or command-line utilities to generate these:

### Using ImageMagick (CLI)
```bash
# Generate ICO from PNG
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Generate ICNS from PNG (macOS)
mkdir icon.iconset
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

### Online Tools
- https://cloudconvert.com/png-to-ico
- https://cloudconvert.com/png-to-icns
