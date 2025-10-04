# PaletteSpy

A Chrome extension that lets you inspect and save color palettes and typography from any website with a simple hover and keypress.

## 🎨 Features

- **Live Element Inspection**: Hover over any element to see its colors and fonts
- **Smart Filtering**: Only shows elements with interesting styles (no empty divs)
- **Instant Save**: Press 'S' to save the palette
- **Cursor Following**: Tooltip smoothly follows your mouse for precise inspection
- **Organized Collection**: View all saved palettes in the popup
- **One-Click Copy**: Copy CSS styles with a single click
- **Per-Tab State**: Spy mode state persists when you reopen the popup (only in the same URL or path) 
- **Auto Cleanup**: State automatically cleaned up when tabs close

## 🚀 Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Bun](https://bun.sh/) (recommended) or npm

### Setup

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for prod
bun run build

# Create zip for Chrome Web Store
bun zip
```

### 📝 License
MIT