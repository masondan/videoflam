# SubFlam Build Plan

**Status:** Ready to execute  
**Updated:** April 29, 2026  
**Owner:** Development Team  

---

## Overview

SubFlam is a standalone video subtitle app — a simplified extraction of AudioFlam's `VideoSubtitlePage` component. Upload video → transcribe audio → add subtitles & title → export MP4. One feature, focused UX.

**Execution Model:**
- User duplicates AudioFlam folder and connects to GitHub
- Agent strips unused code (TTS, audiogram, transcribe, bulletin)
- Agent rebrands app (logos, metadata, manifest)
- User pushes to GitHub and deploys to Cloudflare Pages
- Agent runs smoke test checklist

**Total time:** ~1 day (mostly waiting for you between checkpoints)

---

## Step 0 — User: Duplicate & Init (5 minutes)

Run these commands in your terminal **right now, before anything else:**

```bash
cp -r /Users/danmason/Documents/CODE/audioflam /Users/danmason/Documents/CODE/subflam
cd /Users/danmason/Documents/CODE/subflam
rm -rf .git
git init
git remote add origin https://github.com/masondan/subflam.git
```

Then open `/Users/danmason/Documents/CODE/subflam` as a **new VS Code workspace** (File → Open Folder).

**Confirm when done:** Reply with "Step 0 complete, subflam folder open in VS Code."

---

## Checkpoint 1 — Agent: Strip & Simplify

**Agent instructions:** Work inside `/Users/danmason/Documents/CODE/subflam`. Do NOT touch `/Users/danmason/Documents/CODE/audioflam`.

### 1.1 Rewrite `src/routes/+page.svelte`

Delete all TTS, audiogram, transcribe, and bulletin code. Replace with a minimal shell:

```svelte
<script lang="ts">
  import VideoSubtitlePage from '$lib/components/VideoSubtitlePage.svelte';
</script>

<div class="app-container">
  <header class="app-header">
    <div class="header-left">
      <flam-nav current="subflam"></flam-nav>
      <img src="/icons/logo-subflam-logotype.png" alt="SubFlam" class="logotype" />
    </div>
  </header>

  <main class="main-content">
    <VideoSubtitlePage />
  </main>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-main);
  }

  .app-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .logotype {
    height: 26px;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
</style>
```

### 1.2 Delete unused component files

```
src/lib/components/
  AudiogramPage.svelte
  CompositionCanvas.svelte
  LightEffectPanel.svelte
  SilenceSlider.svelte
  SpeedBlockModal.svelte
  SpeedSilenceControls.svelte
  SpeedSlider.svelte
  TranscribePage.svelte
  VoiceDropdown.svelte
  WaveformPanel.svelte
  bulletin/  (entire folder)
```

### 1.3 Delete unused API routes

```
src/routes/api/
  tts/  (entire folder)
  minimax-refresh/  (entire folder)
  bulletin-script/  (entire folder)
  gemini-test/  (entire folder)
  transcribe-deepgram/  (entire file)
```

Also delete: `src/routes/bulletin/` (entire folder)

### 1.4 Delete unused server/lib files

```
src/lib/
  audioProcessing.ts
  server/bulletinPrompts.ts
  stores/bulletin.ts
  utils/recording.ts
  utils/timestretch.ts
  utils/waveform.ts
```

### 1.5 Simplify `src/lib/stores.ts`

Remove all TTS/voice/audiogram state. Keep **only** what `VideoSubtitlePage.svelte` actually imports. (If unsure, check the import statement in `VideoSubtitlePage.svelte` — copy only those exports.)

### 1.6 Delete unused scripts and docs

```
scripts/  (entire folder)
plans/  (entire folder)
docs/  (optional: can keep for reference)
compute_filter.js
```

### 1.7 Delete unused static assets

```
static/
  voices/  (entire folder - TTS samples)
  voice-samples/  (entire folder - MiniMax training)
  sounds/  (entire folder - bulletin sounds)
  icons/
    audioflam-any.png
    audioflam-share.png
    logo-audioflam-maskable.png
    logo-audioflam-purple-trs.png
    logo-audioflam-white-trans.png
    logotype-audioflam-white-trs.png
    logotype-purple.png
    apple-touch-icon.png  (will be replaced)
```

### 1.8 TypeScript check

Run:
```bash
npm run check
```

Fix any TypeScript errors. Report errors back if the fix is unclear.

**Agent handoff to user:** "Checkpoint 1 complete. Confirm when SubFlam logos are in place in `static/icons/`."

---

## Checkpoint 2 — User: Drop Logos (5 minutes)

The agent will confirm Checkpoint 1 is done. Then:

1. Copy these 7 files from your `/info` folder into the subflam project's `static/icons/` folder:

| Source (`info/`) | Destination (`static/icons/`) |
|---|---|
| `favicon.ico` | `static/favicon.ico` *(top level, not icons)* |
| `logo-subflam-favicon.png` | `static/icons/logo-subflam-favicon.png` |
| `logo-subflam-touch.png` | `static/icons/logo-subflam-touch.png` |
| `logo-subflam-maskable.png` | `static/icons/logo-subflam-maskable.png` |
| `logo-subflam-gen.png` | `static/icons/logo-subflam-gen.png` |
| `logo-subflam-og.png` | `static/icons/logo-subflam-og.png` |
| `logo-subflam-logotype.png` | `static/icons/logo-subflam-logotype.png` |

2. Confirm to agent: "SubFlam logos in place."

---

## Checkpoint 3 — Agent: Rebrand

### 3.1 Update `src/app.html`

Replace the entire file with:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		
		<!-- SEO & Basic Meta -->
		<title>SubFlam</title>
		<meta name="description" content="Add subtitles to your videos automatically. Upload, transcribe, style and export as MP4." />
		<meta name="theme-color" content="#5422b0" />
		<meta name="mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
		<meta name="robots" content="noindex, nofollow" />
		
		<!-- Open Graph / Social Sharing -->
		<meta property="og:type" content="website" />
		<meta property="og:title" content="SubFlam" />
		<meta property="og:description" content="Add subtitles to your videos automatically. Upload, transcribe, style and export as MP4." />
		<meta property="og:url" content="https://subflam.flamtools.com/" />
		<meta property="og:image" content="/icons/logo-subflam-og.png" />
		<meta property="og:image:type" content="image/png" />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		
		<!-- Twitter Card -->
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="SubFlam" />
		<meta name="twitter:description" content="Add subtitles to your videos automatically. Upload, transcribe, style and export as MP4." />
		<meta name="twitter:image" content="/icons/logo-subflam-og.png" />
		
		<!-- Icons & Manifest -->
		<link rel="icon" type="image/png" href="/icons/logo-subflam-favicon.png" />
		<link rel="icon" type="image/x-icon" href="/favicon.ico" />
		<link rel="apple-touch-icon" href="/icons/logo-subflam-touch.png" />
		<link rel="manifest" href="/manifest.json" />
		
		<!-- Structured Data for Search Engines -->
		<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "SoftwareApplication",
			"name": "SubFlam",
			"description": "Add subtitles to your videos automatically. Upload, transcribe, style and export as MP4.",
			"applicationCategory": "EducationalApplication",
			"operatingSystem": "Any",
			"offers": {
				"@type": "Offer",
				"price": "0"
			}
		}
		</script>
		
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
		<script src="%sveltekit.assets%/flam-nav.js" defer></script>
	</body>
</html>
```

### 3.2 Update `static/manifest.json`

Replace the entire file with:

```json
{
  "name": "SubFlam",
  "short_name": "SubFlam",
  "description": "Add subtitles to your videos automatically. Upload, transcribe, style and export as MP4.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#5422b0",
  "theme_color": "#5422b0",
  "categories": [
    "education",
    "productivity"
  ],
  "screenshots": [
    {
      "src": "/icons/logo-subflam-og.png",
      "sizes": "1200x630",
      "form_factor": "wide",
      "type": "image/png"
    }
  ],
  "icons": [
    {
      "src": "/icons/logo-subflam-gen.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/logo-subflam-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 3.3 Verify `static/robots.txt`

Confirm it contains:
```
User-agent: *
Disallow: /
```

(It should already be there — no changes needed.)

### 3.4 Update `package.json`

Change the `name` field from `"audioflam"` to `"subflam"`.

### 3.5 Production build check

Run:
```bash
npm run build
```

Confirm a clean build with no errors. Report any errors.

**Agent handoff to user:** "Checkpoint 3 complete. Ready for GitHub push and Cloudflare Pages deployment."

---

## Checkpoint 4 — User: Deploy (15 minutes)

### 4.1 Commit and push to GitHub

```bash
cd /Users/danmason/Documents/CODE/subflam
git add .
git commit -m "Initial SubFlam build - video subtitle app"
git push -u origin main
```

### 4.2 Set up Cloudflare Pages

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Pages → Create project
3. Connect to `masondan/subflam` repository
4. Build command: `npm run build`
5. Build output directory: `.svelte-kit/cloudflare`
6. Add environment variable:
   - Name: `APIVIDEO_API_KEY`
   - Value: (same as AudioFlam — copy from your AudioFlam Cloudflare project)
7. Deploy
8. After initial deploy, set custom domain: `subflam.flamtools.com`

### 4.3 Confirm deployment

Test the live URL. If it works, report back: "SubFlam live at subflam.flamtools.com"

If there are build errors, share the error message with the agent.

---

## Checkpoint 5 — Agent: Smoke Test

Once live, provide you with a test checklist:

- [ ] Video upload (MP4, MOV, WebM) 
- [ ] Transcription completes
- [ ] Subtitle styling controls work
- [ ] Canvas preview syncs
- [ ] Export downloads MP4
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome

You test and report any failures. Agent fixes.

---

## What stays identical (zero changes)

| Component | Status |
|-----------|--------|
| `SubtitlePanel.svelte` | Copied as-is |
| `TitlePanel.svelte` | Copied as-is |
| `VideoSubtitlePage.svelte` | Copied as-is |
| `Dropdown.svelte` | Copied as-is |
| `TogglePanel.svelte` | Copied as-is |
| `ColorPicker.svelte` | Copied as-is |
| `PlayButton.svelte` | Copied as-is |
| `ImageCropDrawer.svelte` | Copied as-is |
| All subtitle utilities | Copied as-is |
| All export utilities | Copied as-is |
| All API routes (transcode, normalize, silence-removal) | Copied as-is |
| `app.css` design system | Copied as-is |
| All fonts | Copied as-is |
| `+layout.svelte` | Copied as-is |
| Config files (svelte.config.js, tsconfig.json, etc.) | Copied as-is |

---

## Success Criteria (Launch)

✅ No TypeScript errors  
✅ Clean production build  
✅ Cloudflare Pages deployment successful  
✅ Video upload and transcription work on live URL  
✅ Export produces MP4  
✅ robots.txt prevents indexing  
✅ Manifest.json uses SubFlam branding  

---

**Document Version:** 2.0 (Simplified, executable plan)  
**Last Updated:** April 29, 2026
