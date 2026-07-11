#!/usr/bin/env node
// Regenerates assets/logoBase64.js from assets/logo.png.
//
// The Company Logo is embedded as a base64 string directly in the JS bundle
// (not resolved at runtime via the Expo asset system) so it is guaranteed to
// render identically in dev, Expo Go, debug APK, and release APK — there is
// no native asset-resolution step that can behave differently per build.
//
// Run this again whenever assets/logo.png is replaced:
//   npm run generate:logo

const fs = require('fs');
const path = require('path');

const SOURCE_PNG = path.join(__dirname, '..', 'assets', 'logo.png');
const OUTPUT_JS = path.join(__dirname, '..', 'assets', 'logoBase64.js');

const buffer = fs.readFileSync(SOURCE_PNG);
const base64 = buffer.toString('base64');

const output = `// AUTO-GENERATED — do not edit by hand.
// Regenerate with: npm run generate:logo
// Source: assets/logo.png (${buffer.length} bytes)
export const LOGO_BASE64_DATA_URI = 'data:image/png;base64,${base64}';
`;

fs.writeFileSync(OUTPUT_JS, output);
console.log(`Wrote ${OUTPUT_JS} (${buffer.length} bytes -> ${base64.length} base64 chars)`);
