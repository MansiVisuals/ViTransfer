// Script to generate PWA icons
// Run with: node scripts/generate-pwa-icons.js

const fs = require('fs')
const path = require('path')

// SVG icon from icon.svg - video camera icon with filled background
function createSvgIcon(size, padding = 0.15) {
  const iconSize = size * (1 - padding * 2)
  const offset = size * padding

  // Scale the 24x24 viewBox to fit
  const scale = iconSize / 24

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#0a0a0a"/>
  <g transform="translate(${offset}, ${offset}) scale(${scale})">
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="2" y="6" width="14" height="12" rx="2" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>`
}

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '..', 'public', 'icons')
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true })
}

// Generate SVG icons (can be converted to PNG with a tool like sharp or inkscape)
const sizes = [192, 512]

sizes.forEach((size) => {
  const svg = createSvgIcon(size)
  const filename = `icon-${size}.svg`
  fs.writeFileSync(path.join(iconsDir, filename), svg)
  console.log(`Generated ${filename}`)
})

// Also create a simple favicon.ico placeholder (actual favicon.ico should be created with proper tooling)
console.log('\\nSVG icons generated in public/icons/')
console.log('To convert to PNG, use a tool like:')
console.log('  - Inkscape: inkscape -w 192 -h 192 icon-192.svg -o icon-192.png')
console.log('  - ImageMagick: convert icon-192.svg icon-192.png')
console.log('  - Online tool: https://cloudconvert.com/svg-to-png')
