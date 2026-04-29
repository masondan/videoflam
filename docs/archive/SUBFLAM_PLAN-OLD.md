# SubFlam Extraction Plan
## Standalone Video Subtitle Application

**Status:** Planning Phase
**Last Updated:** April 2026
**Owner:** AudioFlam Team

---

## Executive Summary

**SubFlam** is a standalone extraction of the video subtitle feature from AudioFlam. It enables users to upload video files, automatically transcribe audio using Whisper, add stylized subtitles and title overlays, and export as MP4.

**Scope:** Extract `VideoSubtitlePage` component and supporting infrastructure into independent SvelteKit application.

**Timeline:** 4-6 weeks
**Resource Requirements:** 1 full-time developer + QA

---

## 1. Feature Overview

### Current State (AudioFlam)
- **Component:** `src/lib/components/VideoSubtitlePage.svelte` (1412 lines)
- **Status:** Fully implemented (April 2026) with all 4 stages complete
- **Key Capabilities:**
  - Video upload (MP4, MOV, WebM)
  - Audio extraction
  - Automatic transcription (Whisper)
  - Subtitle generation with word-level timing
  - Title overlay with custom styling
  - Non-destructive trim control (in-point/out-point)
  - Real-time canvas preview
  - MP4 export (WebCodecs + MediaRecorder + cloud transcoding)

### SubFlam Scope
Same feature set as VideoSubtitlePage, but as:
- Standalone web app (separate domain, separate deployment)
- Simplified onboarding (dedicated landing page)
- Focused UX (video subtitles only, no audiograms/transcription)
- Independent infrastructure (API keys, storage)
- Optional: Community subtitles database (future phase)

---

## 2. Architecture & Component Extraction

### Components to Extract

#### Primary Component
```
src/lib/components/
├── VideoSubtitlePage.svelte          (1412 lines - core logic)
├── SubtitlePanel.svelte              (subtitle transcription + styling)
├── TitlePanel.svelte                 (title text + styling)
└── CompositionCanvas.svelte          (canvas preview/rendering)
```

#### UI Support Components
```
src/lib/components/
├── Dropdown.svelte                   (reusable dropdown)
├── TogglePanel.svelte                (collapsible panel)
├── ColorPicker.svelte                (HSB color picker)
├── SpeedSlider.svelte                (audio speed control)
├── PlayButton.svelte                 (play/pause button)
└── ImageCropDrawer.svelte            (image crop overlay)
```

#### Utilities
```
src/lib/utils/
├── video-export.ts                   (export orchestration: WebCodecs→MediaRecorder→cloud)
├── webcodecs-export.ts               (H.264 WebCodecs encoding via Mediabunny)
├── subtitles.ts                      (subtitle rendering + word-level composition)
├── transcription.ts                  (Whisper API wrapper)
├── transcription-worker.ts           (Web Worker for transcription)
├── compositor.ts                     (canvas layer composition - PARTIAL)
├── timestretch.ts                    (audio speed adjustment)
└── waveform.ts                       (OPTIONAL: waveform visualization)
```

#### Server-Side Utilities
```
src/lib/server/
├── audioNormalize.ts                 (audio level normalization)
├── silenceRemoval.ts                 (silence detection/removal)
└── lamejs.d.ts                       (MP3 encoding type definitions)
```

#### API Endpoints
```
src/routes/api/
├── transcode/+server.ts              (cloud video transcoding via api.video)
├── normalize/+server.ts              (audio normalization)
├── audio/silence-removal/+server.ts  (silence removal)
└── NEW: transcribe/+server.ts        (Whisper transcription proxy - optional)
```

#### Configuration & Stores
```
src/lib/
├── stores.ts                         (PARTIAL: extract subtitle-specific state)
├── audioProcessing.ts                (audio utilities)
└── config/
    └── subtitlePlaceholders.json     (placeholder text for UI)
```

#### Design System
```
src/
├── app.css                           (CSS variables - reuse entire design system)
static/
├── fonts/                            (all fonts - keep as-is)
├── icons/                            (relevant icons: subtitles, play, upload, etc.)
└── manifest.json                     (update for SubFlam branding)
```

---

## 3. Dependency Analysis

### Critical Dependencies (Keep)
```json
{
  "@huggingface/transformers": "^2.13.4",
  "lamejs": "^0.1.0",
  "svelte": "^5.0.0",
  "sveltekit": "^2.0.0"
}
```

### Optional Dependencies
```json
{
  "soundtouchjs": "^0.1.29"  // Keep if waveform included
}
```

### External APIs Required
```
1. Hugging Face Transformers (Whisper)
   - Free tier: ~100 requests/month
   - Quantized model: ~100MB download
   - Inference: 30-120s per minute of audio

2. api.video (cloud transcoding)
   - Free encoding
   - $0.003/video storage/delivery
   - WebM → MP4 transcoding
   - Estimate: 200 videos/year = $0.60/year

3. Optional: Deepgram (faster transcription alternative)
   - Paid: $0.0043/min audio
   - Faster than Whisper (~5-10s)
   - Higher accuracy
```

---

## 4. Data Model & State Management

### Core State Structure
```typescript
// src/lib/stores.ts (SubFlam subset)
export interface VideoState {
  // Upload
  videoBlob: Blob | null;
  videoDuration: number;
  canvasWidth: number;
  canvasHeight: number;

  // Trim
  trimStart: number;      // 0-1 ratio
  trimEnd: number;        // 0-1 ratio

  // Transcription
  subtitleSegments: SubtitleSegment[];
  isTranscribing: boolean;
  transcriptionError: string | null;

  // Subtitle Styling
  subtitleStyle: {
    fontSize: number;
    fontFamily: string;
    fontColor: string;
    backgroundColor: string;
    position: 'top' | 'center' | 'bottom';
    padding: number;
  };
  subtitlesEnabled: boolean;

  // Title Overlay
  titleText: string;
  titleFont: string;
  titleColor: string;
  titleSize: number;
  labelColor: string;

  // Playback
  isPlaying: boolean;
  currentTime: number;

  // Export
  isExporting: boolean;
  exportProgress: number;
  exportCancelled: boolean;
}
```

### SubtitleSegment Type
```typescript
interface SubtitleSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: {
    text: string;
    start: number;
    end: number;
  }[];
}
```

---

## 5. API Endpoints

### Existing Endpoints (Port As-Is)
```
POST /api/transcode
  Input: { videoBlob: Blob (WebM), format: 'mp4' }
  Output: { downloadUrl: string, videoId: string }
  Purpose: Convert WebM → MP4 via api.video

POST /api/normalize
  Input: { audioBuffer: Base64, level: number }
  Output: { normalizedBuffer: Base64 }
  Purpose: Normalize audio levels

POST /api/audio/silence-removal
  Input: { audioBuffer: Base64, level: 'default'|'trim'|'tight' }
  Output: { audioBuffer: Base64, duration: number }
  Purpose: Remove silence from audio
```

### New Endpoints (Optional)
```
POST /api/transcribe
  Input: { audioBlob: Blob, language: string }
  Output: { segments: SubtitleSegment[] }
  Purpose: Server-side Whisper transcription (faster than client)
  Note: Requires Hugging Face API key + auth

POST /api/subtitle-templates
  Input: { style: string }
  Output: { presets: SubtitleStyle[] }
  Purpose: Return curated subtitle styling presets
```

---

## 6. Environment Variables

### Required (.env)
```env
# Transcription
HF_TOKEN=<Hugging Face API token>

# Audio Processing
APIVIDEO_API_KEY=<api.video API key>

# Optional: Faster transcription
DEEPGRAM_API_KEY=<Deepgram API key>

# App Metadata
VITE_APP_NAME=SubFlam
VITE_APP_DOMAIN=subflam.flamtools.com
VITE_APP_VERSION=1.0.0
VITE_ROBOTS_META=noindex,nofollow
```

### Shared with AudioFlam
- Keep HF_TOKEN synchronized between apps
- Keep APIVIDEO_API_KEY shared (single cloud account)
- Consider shared Deepgram account (if adopted)

---

## 7. New Project Structure

### Directory Layout
```
subflam/
├── src/
│   ├── routes/
│   │   ├── +page.svelte          (landing page + main editor)
│   │   ├── +layout.svelte        (root layout)
│   │   ├── +page.server.ts       (server loads, env vars)
│   │   └── api/
│   │       ├── transcode/+server.ts
│   │       ├── normalize/+server.ts
│   │       ├── audio/silence-removal/+server.ts
│   │       └── transcribe/+server.ts (optional)
│   │
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Editor.svelte                (main container)
│   │   │   ├── VideoSubtitlePage.svelte     (imported from AudioFlam)
│   │   │   ├── SubtitlePanel.svelte         (imported)
│   │   │   ├── TitlePanel.svelte            (imported)
│   │   │   ├── CompositionCanvas.svelte     (imported)
│   │   │   ├── [UI support components]
│   │   │   ├── Header.svelte                (NEW: app header + nav)
│   │   │   ├── Footer.svelte                (NEW: help + links)
│   │   │   └── FeedbackModal.svelte         (NEW: feature requests)
│   │   │
│   │   ├── utils/
│   │   │   ├── video-export.ts              (imported from AudioFlam)
│   │   │   ├── webcodecs-export.ts          (imported)
│   │   │   ├── subtitles.ts                 (imported)
│   │   │   ├── transcription.ts             (imported)
│   │   │   ├── transcription-worker.ts      (imported)
│   │   │   ├── compositor.ts                (imported)
│   │   │   ├── timestretch.ts               (imported)
│   │   │   ├── waveform.ts                  (imported, optional)
│   │   │   ├── analytics.ts                 (NEW: usage tracking)
│   │   │   └── errorReporting.ts            (NEW: error logging)
│   │   │
│   │   ├── server/
│   │   │   ├── audioNormalize.ts            (imported)
│   │   │   ├── silenceRemoval.ts            (imported)
│   │   │   └── lamejs.d.ts                  (imported)
│   │   │
│   │   ├── stores.ts                        (subset: video state only)
│   │   ├── audioProcessing.ts               (imported)
│   │   └── config/
│   │       └── subtitlePlaceholders.json    (imported)
│   │
│   ├── app.css                              (imported from AudioFlam)
│   ├── app.d.ts                             (types)
│   └── app.html                             (HTML template)
│
├── static/
│   ├── fonts/                               (imported from AudioFlam)
│   ├── icons/                               (curated subset)
│   ├── robots.txt                           (Disallow: /)
│   └── manifest.json                        (SubFlam branding)
│
├── .env                                     (git-ignored)
├── .env.example                             (template)
├── package.json                             (SubFlam dependencies)
├── svelte.config.js                         (SvelteKit config)
├── tsconfig.json                            (TypeScript config)
├── vite.config.ts                           (Vite config)
└── README.md                                (project overview)
```

---

## 8. File-by-File Extraction Plan

### Phase 1: Core Components (Week 1)
- [ ] Copy VideoSubtitlePage.svelte
- [ ] Copy SubtitlePanel.svelte
- [ ] Copy TitlePanel.svelte
- [ ] Copy CompositionCanvas.svelte
- [ ] Create Editor.svelte wrapper (integrates components)

### Phase 2: UI Support Components (Week 1)
- [ ] Copy Dropdown.svelte
- [ ] Copy TogglePanel.svelte
- [ ] Copy ColorPicker.svelte
- [ ] Copy SpeedSlider.svelte
- [ ] Copy PlayButton.svelte
- [ ] Copy ImageCropDrawer.svelte (optional if title includes image overlays)

### Phase 3: Utilities & Processing (Week 2)
- [ ] Copy video-export.ts
- [ ] Copy webcodecs-export.ts
- [ ] Copy subtitles.ts
- [ ] Copy transcription.ts
- [ ] Copy transcription-worker.ts
- [ ] Copy compositor.ts
- [ ] Copy timestretch.ts
- [ ] Copy audioProcessing.ts
- [ ] Copy audioNormalize.ts
- [ ] Copy silenceRemoval.ts

### Phase 4: Server Endpoints (Week 2)
- [ ] Copy /api/transcode/+server.ts
- [ ] Copy /api/normalize/+server.ts
- [ ] Copy /api/audio/silence-removal/+server.ts
- [ ] Verify API key handling (env vars)

### Phase 5: Configuration & Design System (Week 2)
- [ ] Extract subtitle-specific state to stores.ts
- [ ] Copy app.css (entire design system)
- [ ] Copy fonts (all self-hosted fonts)
- [ ] Copy icons (filtered: subtitles, play, upload, download, etc.)
- [ ] Copy static/manifest.json (update branding)
- [ ] Create static/robots.txt (noindex for educational)

### Phase 6: New Components & Features (Week 3)
- [ ] Create Header.svelte (app branding + help link)
- [ ] Create Footer.svelte (links + credits)
- [ ] Create FeedbackModal.svelte (feature request form)
- [ ] Create analytics.ts (usage tracking - optional)
- [ ] Create errorReporting.ts (error logging - optional)

### Phase 7: Testing & QA (Weeks 3-4)
- [ ] Component compatibility testing
- [ ] API integration testing
- [ ] Cross-browser testing (Chrome, Firefox, Safari, mobile)
- [ ] Export testing (WebCodecs, MediaRecorder, cloud fallback)
- [ ] Performance testing (large videos, slow networks)

### Phase 8: Deployment & Monitoring (Week 4)
- [ ] Set up GitHub repo (subflam)
- [ ] Configure Cloudflare Pages deployment
- [ ] Set up environment variables in Cloudflare
- [ ] Configure custom domain (subflam.flamtools.com)
- [ ] Set up monitoring/error logging (optional)

---

## 9. Migration Path & Shared Code Strategy

### Option A: Git Submodule (Recommended)
```bash
# In AudioFlam repo
git submodule add https://github.com/[org]/subflam.git apps/subflam

# Shared libraries as npm packages
# - @audioflam/utilities (video-export, subtitles, etc.)
# - @audioflam/ui-components (buttons, panels, etc.)
# - @audioflam/design-system (CSS variables, fonts, icons)
```

**Pros:**
- Single source of truth for shared code
- Easy to update both apps simultaneously
- Prevents code duplication

**Cons:**
- More complex build process
- Requires package publishing

### Option B: Monorepo (Long-term)
```bash
# AudioFlam monorepo structure
/
├── apps/
│   ├── audioflam/      (main app)
│   └── subflam/        (standalone)
├── packages/
│   ├── ui/             (shared components)
│   ├── utils/          (shared utilities)
│   ├── server/         (shared API logic)
│   └── design-system/  (CSS + fonts + icons)
└── turbo.json          (monorepo config)
```

**Pros:**
- Unified versioning
- Shared CI/CD
- Easy cross-app refactoring

**Cons:**
- Requires monorepo tooling (Turbo, Lerna)
- Steeper learning curve

### Recommended Approach for Phase 1
**Copy components** into subflam app for independence. After launch:
1. Identify stable utilities (video-export, subtitles, transcription)
2. Publish as @audioflam-utils npm package
3. Both apps depend on published package
4. Updates synced via npm version bumps

---

## 10. Key Gotchas & Mitigations

### 1. WebCodecs H.264 Encoding on Android
**Gotcha:** Android Chrome claims H.264 support but fails in practice.

**Mitigation:** 
- Use Mediabunny (17KB pure JS H.264 muxer) for fallback
- WebCodecs → MediaRecorder → api.video fallback chain
- Test on real Android devices

**File:** `src/lib/utils/webcodecs-export.ts`

### 2. Canvas drawImage() on iOS Safari
**Gotcha:** Some iOS versions fail rendering video element to canvas.

**Mitigation:**
- Automatic fallback to MediaRecorder → cloud transcode
- User sees local export failure → graceful cloud retry
- No UI changes needed

**File:** `src/lib/components/VideoSubtitlePage.svelte:renderFrame()`

### 3. Whisper Model Size & Memory
**Gotcha:** Full model = 350MB download + 2-5 min load time.

**Mitigation:**
- Offer quantized model option (100MB, faster)
- Multi-language or English-only selectable
- Show progress bar during model download
- Cache model locally (IndexedDB)

**File:** `src/lib/utils/transcription.ts:loadWhisperModel()`

### 4. Audio Format Consistency
**Gotcha:** Different providers (WebCodecs, MediaRecorder, api.video) expect different audio formats.

**Mitigation:**
- Normalize to AAC 96kbps stereo before export
- Auto-convert mono → stereo (AAC encoder requirement)
- Test with various input formats

**File:** `src/lib/utils/webcodecs-export.ts:277-294`

### 5. Video Trim Boundary Edge Cases
**Gotcha:** Trim uses 0-1 ratios; playback must stop exactly at trimEnd position.

**Mitigation:**
- Enforce hard stop at `trimEnd * videoDuration`
- Non-destructive trim (applied at export time only)
- Validate trim boundaries before export

**File:** `src/lib/components/VideoSubtitlePage.svelte:renderFrame()`

### 6. XML Injection in Subtitle Text
**Gotcha:** If subtitles rendered as SSML for speech synthesis, user text must be escaped.

**Mitigation:**
- If audio generation from subtitles (future feature): use escapeXml()
- Currently: subtitles are text-only (safe)
- Add validation if TTS integration added

**File:** Relevant if AudioFlam TTS integration added

### 7. API Key Exposure in Client Code
**Gotcha:** Cloudflare Workers proxy prevents direct API calls; but env vars must be present.

**Mitigation:**
- All sensitive API keys in `.env` (server-side only)
- Client calls `/api/*` endpoints
- Worker proxies to external APIs (avoids CORS + key exposure)

**File:** `svelte.config.js`, `src/routes/api/*/+server.ts`

---

## 11. Launch Checklist

### Pre-Launch QA
- [ ] Video upload: All formats (MP4, MOV, WebM)
- [ ] Transcription: Test Whisper model download + caching
- [ ] Subtitle styling: All fonts, colors, positions
- [ ] Title overlay: Custom text, colors, fonts
- [ ] Canvas preview: Real-time sync with trim/playback
- [ ] Export Android: WebCodecs H.264 → MP4
- [ ] Export iOS: MediaRecorder → WebM (acceptable fallback)
- [ ] Export desktop: Both WebCodecs and MediaRecorder paths
- [ ] Cloud fallback: Test api.video transcoding
- [ ] Performance: 60s video export under 2 min
- [ ] Mobile: Works on iOS Safari, Android Chrome
- [ ] Accessibility: Keyboard navigation, screen reader support

### Pre-Deployment Infrastructure
- [ ] GitHub repository created and configured
- [ ] Cloudflare Pages project set up
- [ ] Environment variables configured in Cloudflare
- [ ] Custom domain (subflam.flamtools.com) DNS configured
- [ ] SSL certificate auto-provisioned
- [ ] Monitoring/error logging set up (optional)
- [ ] Analytics configured (optional)
- [ ] robots.txt set to noindex (educational use)

### Post-Launch Monitoring
- [ ] Error tracking dashboard active
- [ ] Performance monitoring active
- [ ] API usage tracking
- [ ] User feedback collection mechanism
- [ ] Weekly bug triage meetings

---

## 12. Future Roadmap (Post-Launch)

### Phase 2: Enhancement Features (Months 2-3)
- [ ] Subtitle templates (presets: modern, retro, minimal)
- [ ] Multiple subtitle languages (e.g., EN + FR simultaneously)
- [ ] Advanced audio effects (reverb, EQ, compression)
- [ ] Watermark overlay (optional branding)
- [ ] Batch processing (multiple videos)
- [ ] REST API for external integrations

### Phase 3: Community Features (Months 4-6)
- [ ] Community subtitle database (share/reuse subtitles)
- [ ] Rating system (helpful/not helpful)
- [ ] Translation via multilingual models
- [ ] Crowdsourced subtitle refinement

### Phase 4: Professional Tools (Months 6+)
- [ ] Premium cloud storage (Cloudflare R2)
- [ ] Faster transcription (Deepgram integration)
- [ ] Advanced color grading
- [ ] Multi-track audio (background music + subtitles)

---

## 13. Success Metrics

### Adoption
- Target: 500 unique users in first month
- Target: 10,000 videos processed in first quarter

### Performance
- Target: Export time < 90s for 60s video on mobile
- Target: Page load < 3s on 4G network
- Target: Transcription < 2 min for typical video

### User Satisfaction
- Target: 4.5+ stars (if reviews collected)
- Target: <5% error rate in exports
- Target: <1% cloud transcoding fallback rate

---

## 14. Team & Timeline

### Resource Allocation
- **Developer (1 FTE):** 4-6 weeks
  - Week 1: Component extraction
  - Week 2: Integration & testing
  - Week 3-4: Polish, QA, deployment

- **QA/Testing (0.5 FTE, overlapping):** Weeks 3-4
  - Cross-browser testing
  - Mobile device testing
  - Edge case validation

- **DevOps (0.25 FTE):** Week 4
  - Infrastructure setup
  - Deployment pipeline
  - Monitoring

---

## 15. Risk Assessment & Contingencies

### High Risk
- **Risk:** WebCodecs failures on different Android devices
  - **Probability:** Medium
  - **Impact:** Export black screen, poor UX
  - **Mitigation:** Comprehensive testing on 10+ devices; fallback chain (MediaRecorder → api.video)

- **Risk:** Whisper model too slow for mobile (>5 min load)
  - **Probability:** High
  - **Impact:** Users abandon app during transcription
  - **Mitigation:** Quantized model default; show progress; option for Deepgram (paid)

### Medium Risk
- **Risk:** api.video cost overruns (unexpected usage spike)
  - **Probability:** Low
  - **Impact:** Budget exceeded
  - **Mitigation:** Set spending limit; monitor usage weekly; switch to Cloudflare Stream if needed

- **Risk:** Breaking changes in Hugging Face API
  - **Probability:** Very Low
  - **Impact:** Transcription broken
  - **Mitigation:** Pin model version; maintain fallback (Deepgram API)

### Low Risk
- **Risk:** CSS variables conflict with browser dark mode
  - **Probability:** Very Low
  - **Impact:** Styling looks off in dark mode
  - **Mitigation:** Test CSS variables in dark mode; add prefers-color-scheme support

---

## 16. Documentation to Create

### User Documentation
- [ ] **Getting Started:** Upload video → Generate subtitles → Export
- [ ] **FAQ:** Common issues + fixes (transcription slow?, export failed?, etc.)
- [ ] **Keyboard Shortcuts:** Play (Space), Trim (Arrow keys), Export (Ctrl+E)
- [ ] **Browser Support Matrix:** Which browsers support which export formats

### Developer Documentation
- [ ] **Architecture Overview:** Component relationships, data flow
- [ ] **API Reference:** All endpoints, request/response formats
- [ ] **Setup Guide:** Clone repo → npm install → npm run dev
- [ ] **Contributing Guide:** How to add features, submit PRs
- [ ] **Troubleshooting:** Common errors + fixes (extracted from AudioFlam TROUBLESHOOTING.md)

### Operational Documentation
- [ ] **Deployment Guide:** Step-by-step Cloudflare Pages deployment
- [ ] **Environment Variables:** What each var does, where to get values
- [ ] **Monitoring:** How to check error logs, API usage, performance metrics
- [ ] **Incident Response:** Escalation path, rollback procedures

---

## 17. Appendix: Code Examples

### Example: Editor.svelte (Main Container)
```svelte
<!-- src/lib/components/Editor.svelte -->
<script lang="ts">
  import VideoSubtitlePage from './VideoSubtitlePage.svelte';
  import Header from './Header.svelte';
  import Footer from './Footer.svelte';
  import FeedbackModal from './FeedbackModal.svelte';
  
  let showFeedback = false;
</script>

<Header on:feedback={() => (showFeedback = true)} />

<main>
  <VideoSubtitlePage />
</main>

<Footer />

{#if showFeedback}
  <FeedbackModal on:close={() => (showFeedback = false)} />
{/if}

<style>
  main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-main);
  }
</style>
```

### Example: Updated stores.ts (SubFlam Subset)
```typescript
// src/lib/stores.ts
import { writable } from 'svelte/store';

export interface VideoState {
  videoBlob: Blob | null;
  videoDuration: number;
  canvasWidth: number;
  canvasHeight: number;
  trimStart: number;
  trimEnd: number;
  subtitleSegments: any[];
  isTranscribing: boolean;
  subtitlesEnabled: boolean;
  titleText: string;
  isExporting: boolean;
}

export const videoState = writable<VideoState>({
  videoBlob: null,
  videoDuration: 0,
  canvasWidth: 1920,
  canvasHeight: 1080,
  trimStart: 0,
  trimEnd: 1,
  subtitleSegments: [],
  isTranscribing: false,
  subtitlesEnabled: true,
  titleText: '',
  isExporting: false,
});
```

---

## 18. Success Criteria

### Launch (Week 4)
- ✅ All components extracted and working
- ✅ All API endpoints functional
- ✅ Cross-browser testing passed (Chrome, Firefox, Safari)
- ✅ Mobile testing passed (iOS, Android)
- ✅ Deployment to subflam.flamtools.com successful
- ✅ robots.txt prevents indexing

### Month 1
- ✅ 500+ unique users
- ✅ <5% error rate
- ✅ Average export time < 90s
- ✅ User feedback collected and triaged

### Month 3
- ✅ 10,000 videos processed
- ✅ 4.5+ star rating (if reviews collected)
- ✅ Phase 2 features planned
- ✅ Community feedback loop established

---

## Notes for AudioFlam Team

### When Extracting Code
1. **Copy, Don't Link:** During Phase 1, copy components into subflam repo. After launch, if moving to shared packages, establish npm package + link both apps.
2. **Version Lock Dependencies:** Pin exact versions in package.json until both apps are stable.
3. **Shared Tests:** Tests that apply to both apps should be copied; no cross-repo test dependencies.
4. **API Compatibility:** If API endpoint changes in AudioFlam, must also update in SubFlam (until shared package).

### Ongoing Maintenance
- **Sync Cycle:** Monthly sync between apps to backport critical fixes
- **Feature Parity:** After launch, if new subtitle feature added to AudioFlam, plan SubFlam update within 1 sprint
- **Breaking Changes:** Coordinate API changes; avoid breaking existing SubFlam deployments

---

**Document Version:** 1.0
**Last Reviewed:** April 2026
**Next Review:** After Phase 1 completion (Week 1-2)
