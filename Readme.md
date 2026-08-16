# Smart Form Autofill

A lightweight Chrome extension that intelligently autofills forms across websites like Google Forms, Microsoft Forms, and custom web forms — fully local, fast, and privacy-friendly.

## Features

- ⚡ **On-demand autofill** (runs only when you click)
- 🧠 **Smart matching** using token + fuzzy logic
- 📝 Supports inputs, selects, checkboxes, radios, and contenteditable
- 🔍 **Preview mode** to see what will be filled
- 🎯 Fill modes:
  - Fill Empty (recommended)
  - Force Fill (overwrite all)
- 🌐 Works on most websites (Google Forms, MS Forms, etc.)
- 🔄 Handles dynamic forms (React, Angular, etc.)
- 🎨 Highlights filled fields
- 🧹 Clear individual or all saved data
- 🔒 Fully local — no API, no tracking
- ⬇️⬆️ Import/Export userData (data remains with YOU only!)

## How It Works

1. Save your data in the popup
2. Open any form
3. Click:
   - **Fill Empty** → fills only blank fields  
   - **Force Fill** → overwrites all  
   - **Preview** → shows where data will go  

## Tech

- Manifest V3
- Vanilla JavaScript (no libraries)
- Token-based + fuzzy matching (Levenshtein)

## Installation

1. Clone/download the repo  
2. Open Chrome → `chrome://extensions/`  
3. Enable **Developer mode**  
4. Click **Load unpacked**  
5. Select project folder  

## Notes

- Works best when form labels are clear
- No data leaves your browser