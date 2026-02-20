# muunna.

A privacy-first file conversion tool built with SvelteKit. All processing happens locally in your browser using WebAssembly — your files never leave your device.

**Live:** [muunna.vaivatta.fi](https://muunna.vaivatta.fi)

## Features

- **100% local processing** — images, audio, and documents are converted entirely on-device via WebAssembly
- **250+ supported formats** — including PNG, JPEG, WebP, AVIF, HEIC, MP3, FLAC, WAV, OPUS, PDF, DOCX, EPUB, and many more
- **No file size limits** — constrained only by your device's memory
- **No ads, no tracking** — optional privacy-focused analytics via [Fathom](https://usefathom.com/)
- **Bilingual interface** — Finnish and English, auto-detected from browser settings
- **PWA support** — installable as a progressive web app
- **Dark mode** — light and dark themes with optional visual effects
- **Zip support** — upload a zip file and convert all contents in one go

## Conversion Engines

| Engine | Type | Technology |
|---|---|---|
| [ImageMagick WASM](https://github.com/nicholasgasior/magick-wasm) | Images | WebAssembly (local) |
| [FFmpeg.wasm](https://github.com/nicholasgasior/ffmpegwasm) | Audio | WebAssembly (local) |
| [Pandoc WASM](https://pandoc.org/) | Documents | WebAssembly (local) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build
```

This compiles Paraglide i18n messages and produces a static site in `build/`.

### Preview

```bash
npm run preview
```

### Linting & Formatting

```bash
npm run lint      # Check formatting and lint
npm run format    # Auto-format with Prettier
npm run check     # Type-check with svelte-check
```

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PUB_FATHOM_SITE_ID` | *(empty)* | Fathom Analytics site ID. Leave empty to disable analytics entirely. |
| `PUB_ENV` | `development` | Environment: `production`, `development`, or `nightly`. Controls branding. |
| `PUB_DISABLE_ALL_EXTERNAL_REQUESTS` | `false` | Set to `true` to disable all external requests (analytics, CDN). Useful for air-gapped deployments. |

## Deployment

The app is a **static site** (uses `@sveltejs/adapter-static`). Deploy to any static hosting.

Set your environment variables in your hosting platform's dashboard. The build command is:

```bash
paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide && vite build
```

## Project Structure

```
src/
├── lib/
│   ├── components/       # UI components (layout, visual, functional)
│   ├── converters/       # Conversion engine wrappers (magick, ffmpeg, pandoc)
│   ├── css/              # Global styles (SCSS + Tailwind)
│   ├── paraglide/        # Generated i18n runtime (do not edit)
│   ├── sections/         # Page sections (settings panels)
│   ├── store/            # Global state management
│   ├── types/            # TypeScript types (VertFile, etc.)
│   ├── util/             # Utilities (toast, logger, animation, service worker)
│   └── workers/          # Web Workers (ImageMagick)
├── routes/
│   ├── +page.svelte      # Home / upload page
│   ├── convert/          # Conversion page
│   ├── settings/         # Settings page
│   └── privacy/          # Privacy policy
├── app.html              # HTML shell
└── app.d.ts              # Global type declarations
messages/
├── en.json               # English translations
└── fi.json               # Finnish translations
project.inlang/
└── settings.json         # Paraglide i18n configuration
static/
├── favicon.svg
├── manifest.json         # PWA manifest
├── pandoc.wasm           # Pandoc WebAssembly binary
└── sitemap.xml
```

## Internationalization

The app uses [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) for i18n. Translation files live in `messages/`. The locale detection strategy is:

1. **localStorage** — user's previous selection
2. **Browser language** — `navigator.languages` (auto-detects Finnish)
3. **Base locale** — falls back to English

To add or edit translations, modify `messages/en.json` and `messages/fi.json`. The Paraglide compiler runs automatically during build.

## Tech Stack

- **Framework:** SvelteKit 2 + Svelte 5 (runes)
- **Styling:** Tailwind CSS 3 + SCSS
- **Language:** TypeScript
- **i18n:** Paraglide JS
- **Image conversion:** ImageMagick WASM
- **Audio conversion:** FFmpeg.wasm
- **Document conversion:** Pandoc WASM
- **Icons:** Lucide Svelte
- **Build:** Vite 6

## License

This project is licensed under the [AGPL-3.0 License](LICENSE).
