# AudioFlam Audiogram Implementation Roadmap

**Status:** Ready for Implementation  
**Objective:** Add audiogram creation to AudioFlam - combine image, audio, waveform, title, and effects into downloadable MP4.

---

## Design Assets & References

**CRITICAL:** Before starting implementation, review all visuals in the `info/` folder:

- **Header/Navigation:** `promptflam.png` (button styling reference)
- **Audiogram Page Layout:** `audiogram-home.png`
- **Image Operations:** `image.png`, `resize.png`
- **Audio Import:** `import-audio.png`, `audio-record1.png`, `audio-record2.png`
- **Waveform Panel:** `waveform1.png`, `waveform2.png`, `colordrawer.png`
- **Title Panel:** `title.png`
- **Light Effect:** `light.png`

**Also review the design.md document for design vision and approach**

**Icons Required:** 22 total (listed in `icon-*.svg` references throughout design guide)

AI agent coders MUST review these visuals at the start of each step.

## Technical Architecture

| Component | Technology |
|-----------|------------|
| Composition | Single `<canvas>` element (image + waveform + title + effects) |
| Audio Visualization | Web Audio API `AnalyserNode` for real-time frequency data |
| Recording | `MediaRecorder` API for microphone capture |
| Video Export | FFmpeg.wasm (~300KB) for MP4 encoding |
| Color Picker | Custom Svelte HSB picker (hue slider + saturation/brightness field) |
| Image Cropping | Canvas API with touch/mouse gesture handling |

---

## Implementation Steps

### Step 1: Header Navigation & Page Structure

**Objective:** Add TTS/Audiogram toggle to header; restructure page for conditional rendering.

**Design Reference:** `promptflam.png` - circular icon buttons with active/inactive states

**Implementation:**

1. **Update `+page.svelte` header:**
   - Reduce AudioFlam logo size slightly, align LEFT
   - Add two circular nav buttons aligned RIGHT:
     - TTS button (`icon-tts.svg`) - active by default
     - Audiogram button (`icon-audiogram.svg`)
   
2. **Button states:**
   - Inactive: transparent background, `#777777` icon, 1px grey border
   - Active: `#5422b0` solid fill, white icon, no border

3. **Page state:**
   - Add `activeTab: 'tts' | 'audiogram'` state
   - Wrap existing TTS content in `{#if activeTab === 'tts'}`
   - Add placeholder `{#if activeTab === 'audiogram'}` block

**Files to modify:**
- `src/routes/+page.svelte` (header + conditional structure)
- `src/app.css` (nav button styles)

**Test criteria:**
- [ ] Logo smaller and left-aligned
- [ ] Both nav buttons visible, TTS active by default
- [ ] Clicking Audiogram shows placeholder, clicking TTS returns to TTS
- [ ] Active/inactive button states correct

---

### Step 2: Audiogram Page Shell

**Objective:** Build the audiogram page layout with all placeholder components.

**Design Reference:** `audiogram-home.png`

**Implementation:**

1. **Create audiogram container** with vertical layout:
   - Image upload box (dotted border + `icon-upload.svg`)
   - Audio upload box (dotted border + `icon-upload.svg`)
   - Playback controls row
   - Three toggle panels (Waveform, Title, Light effect)
   - Download button (disabled state)

2. **Playback controls row:**
   - Start again button (`icon-start-again.svg`) - disabled initially
   - Skip back 5s (`icon-back-five.svg`)
   - Play/Stop button (`icon-play-fill.svg`)
   - Skip forward 5s (`icon-forward-five.svg`)
   - Microphone button (`icon-mic.svg`)

3. **Toggle panels:**
   - Reuse pattern from `SpeedSilenceControls.svelte`
   - Each has: chevron (expand/collapse), label, toggle switch
   - Only one panel open at a time (auto-close others)

**Files to create:**
- `src/lib/components/AudiogramPage.svelte`
- `src/lib/components/TogglePanel.svelte` (reusable)

**Files to modify:**
- `src/routes/+page.svelte` (import and render AudiogramPage)

**Test criteria:**
- [ ] All UI elements visible and positioned correctly
- [ ] Toggle panels open/close with chevron animation
- [ ] Only one panel open at a time
- [ ] Buttons show correct disabled/enabled states

---

### Step 3: Image Upload & Display

**Objective:** Implement image upload with file picker and drag-drop.

**Design Reference:** `image.png`

**Implementation:**

1. **Upload zone:**
   - Click triggers file picker (accept: `image/*`)
   - Drag-drop support for desktop
   - Resize uploaded image: max 1080px (vertical/square) or 1920px (horizontal)

2. **After upload:**
   - Replace dotted box with full-width image display
   - Add "Replace image" (left) and "Resize" (right) text buttons below

3. **Image state:**
   - Store as `imageData: { original: Blob, cropped: Blob | null, aspectRatio: 'none' | '9:16' | '1:1' | '16:9' }`

**Files to create:**
- `src/lib/components/ImageUpload.svelte`

**Test criteria:**
- [ ] Can upload image via click
- [ ] Can upload image via drag-drop (desktop)
- [ ] Image displays full-width after upload
- [ ] Replace/Resize buttons appear
- [ ] Replace button triggers new upload

---

### Step 4: Image Crop Drawer

**Objective:** Full-screen crop drawer with aspect ratio selection and pinch/pan.

**Design Reference:** `resize.png`

**Implementation:**

1. **Drawer UI:**
   - Full-screen overlay from bottom
   - "Done" text button (top-right) to close
   - Image preview at top
   - Four aspect ratio buttons below: None, 9:16, 1:1, 16:9
   - Icons: `icon-none.svg`, `icon-vertical.svg`, `icon-square.svg`, `icon-horizontal.svg`

2. **Crop behavior:**
   - Semi-transparent overlay on cropped areas
   - Two-finger pinch to zoom
   - Single finger to pan
   - "None" = no crop (original ratio)

3. **Button states:**
   - Active: grey background, white icon/text
   - Inactive: white background, grey border, grey icon/text

4. **On Done:**
   - Apply crop via Canvas API
   - Update `imageData.cropped`

**Files to create:**
- `src/lib/components/ImageCropDrawer.svelte`

**Test criteria:**
- [ ] Drawer slides up from bottom
- [ ] Aspect ratio buttons toggle correctly
- [ ] Crop overlay shows correctly for each ratio
- [ ] Pinch-zoom works on mobile
- [ ] Pan works on mobile and desktop
- [ ] Done applies crop and closes drawer

---

### Step 5: Audio Import & Waveform Display

**Objective:** Import audio file, decode, display static waveform with trim handles.

**Design Reference:** `import-audio.png`

**Implementation:**

1. **Upload zone:**
   - Click triggers file picker (accept: `audio/*`)
   - Drag-drop support for desktop

2. **After upload:**
   - Decode audio using `AudioContext.decodeAudioData()`
   - Replace dotted box with:
     - Solid border container
     - Static waveform visualization (grey bars)
     - Left/right trim handles
   - Duration timestamp below (e.g., "28.9s")

3. **Waveform rendering:**
   - Extract amplitude data from AudioBuffer
   - Draw bars to canvas (style: rounded thick bars - waveform option 1)
   - Grey color (#777777) for static display

4. **Trim handles:**
   - Draggable left/right boundaries
   - Light grey overlay outside trim region
   - Update playback start/end times

5. **Enable controls:**
   - Play button becomes active
   - Start again button becomes active

**Files to create:**
- `src/lib/components/AudioImport.svelte`
- `src/lib/utils/waveform.ts` (amplitude extraction, drawing functions)

**Test criteria:**
- [ ] Can upload audio via click and drag-drop
- [ ] Waveform renders after decode
- [ ] Duration displays correctly
- [ ] Trim handles are draggable
- [ ] Play button activates after import

---

### Step 6: Audio Playback Controls

**Objective:** Implement play/pause, skip forward/back, and start again functionality.

**Implementation:**

1. **Playback using HTML5 Audio or Web Audio API:**
   - Create `AudioBufferSourceNode` for playback
   - Respect trim start/end times

2. **Control behavior:**
   - Play: Start playback, icon changes to `icon-pause-fill.svg`
   - Pause: Pause playback, icon changes to `icon-play-fill.svg`
   - Skip back 5s: `currentTime -= 5`
   - Skip forward 5s: `currentTime += 5`
   - Start again: Clear audio, reset to upload state

3. **Progress indicator:**
   - Vertical line overlay on waveform showing current position
   - Updates at 60fps during playback

**Files to modify:**
- `src/lib/components/AudioImport.svelte`
- `src/lib/components/AudiogramPage.svelte`

**Test criteria:**
- [ ] Play/pause toggles correctly
- [ ] Skip forward/back moves playhead
- [ ] Progress line animates during playback
- [ ] Start again clears audio and resets UI
- [ ] Respects trim boundaries

---

### Step 7: Audio Recording

**Objective:** Implement microphone recording with countdown and live waveform.

**Design Reference:** `audio-record1.png`, `audio-record2.png`

**Implementation:**

1. **Mic button tap:**
   - Request microphone permission
   - Mic icon changes to `icon-mic-fill.svg` (purple)
   - Audio upload box transforms to solid border with instruction text:
     "Tap Play to record with three-second countdown. Tap Stop to end recording. Tap refresh to start again."

2. **Recording flow (tap Play):**
   - 3-second countdown: Play button shows `icon-three.svg`, `icon-two.svg`, `icon-one.svg`
   - Recording starts: button shows `icon-stop-fill.svg`
   - Live waveform: Real-time bars from `AnalyserNode` frequency data
   - Waveform scrolls left as recording progresses (visible window = 50% width)

3. **Stop recording:**
   - Convert `MediaRecorder` blob to AudioBuffer
   - Display static waveform with trim handles (same as import)
   - Button returns to play state
   - Mic returns to grey state

4. **Start again:**
   - Clears recording, returns to initial mic-ready state

**Files to create:**
- `src/lib/utils/recording.ts` (MediaRecorder wrapper, permission handling)

**Files to modify:**
- `src/lib/components/AudioImport.svelte`

**Test criteria:**
- [ ] Mic permission requested on tap
- [ ] Countdown displays 3, 2, 1 correctly
- [ ] Live waveform animates during recording
- [ ] Stop converts to static waveform
- [ ] Start again resets correctly

---

### Step 8: Canvas Composition Layer

**Objective:** Create the main canvas that composites image + overlays for preview and export.

**Implementation:**

1. **Create composition canvas:**
   - Positioned where image displays
   - Layers (bottom to top): Image → Waveform → Title → Light effect

2. **Canvas sizing:**
   - Match cropped image dimensions
   - Or default 1080x1920 (9:16) if no image

3. **Render pipeline:**
   - `renderFrame()` function called on each animation frame during playback
   - Draws all layers in order
   - Static render when paused

4. **Image layer:**
   - Draw cropped/resized image as background

**Files to create:**
- `src/lib/components/CompositionCanvas.svelte`
- `src/lib/utils/compositor.ts` (layer rendering functions)

**Test criteria:**
- [ ] Canvas displays uploaded image correctly
- [ ] Canvas respects crop settings
- [ ] Canvas updates when image changes

---

### Step 9: Waveform Panel & Styles

**Objective:** Implement waveform toggle panel with style selection and color picker.

**Design Reference:** `waveform1.png`, `waveform2.png`

**Implementation:**

1. **Panel content (when toggle active):**
   - Three waveform style tiles:
     - Rounded thick bars (above/below center)
     - Sharp thin bars (above/below center)
     - Segmented blocks (bottom-aligned)
   - Selected tile has purple border

2. **Color options:**
   - White button (default) - white with grey ring when selected
   - Rainbow button - opens HSB color picker

3. **Waveform on canvas:**
   - Positioned near bottom of image (default)
   - Draggable to reposition
   - Resize handles (corners + sides) for scaling
   - Border with handles visible when paused
   - Border hidden during playback

4. **Live animation:**
   - During playback, waveform animates from `AnalyserNode` frequency data
   - Updates at ~30fps

**Files to create:**
- `src/lib/components/WaveformPanel.svelte`
- `src/lib/components/ColorPicker.svelte` (HSB picker)

**Files to modify:**
- `src/lib/utils/waveform.ts` (add three waveform styles)
- `src/lib/utils/compositor.ts` (waveform layer rendering)

**Test criteria:**
- [ ] Three waveform styles render correctly
- [ ] Style selection updates canvas preview
- [ ] Color picker works (white default + custom colors)
- [ ] Waveform is draggable and resizable
- [ ] Waveform animates during playback
- [ ] Handles hidden during playback, visible when paused

---

### Step 10: Title Panel

**Objective:** Implement title overlay with font and style options.

**Design Reference:** `title.png`

**Implementation:**

1. **Panel content (when toggle active):**
   - Text input with "Add title" placeholder
   - Resizable input box (user can add line breaks)
   
2. **Font selection row:**
   - Three buttons showing "Ag" in each font:
     - Inter Bold (default)
     - Roboto Slab
     - Lora
   - Selected has purple border

3. **Style selection row:**
   - Two buttons:
     - Color text on transparent background (default)
     - White text on color background
   - Selected has purple border

4. **Color options:**
   - White button (default)
   - Rainbow button (opens color picker)

5. **Title on canvas:**
   - Positioned near top, centered (default)
   - Draggable to reposition
   - Resize handles for scaling
   - Border visible when editing, hidden during playback

**Files to create:**
- `src/lib/components/TitlePanel.svelte`

**Files to modify:**
- `src/app.css` (add Roboto Slab, Lora font imports)
- `src/lib/utils/compositor.ts` (title layer rendering)

**Test criteria:**
- [ ] Title input accepts text and line breaks
- [ ] Font buttons switch between three fonts
- [ ] Style buttons toggle text/background modes
- [ ] Color picker works for both modes
- [ ] Title appears on canvas, is draggable/resizable

---

### Step 11: Light Effect Panel

**Objective:** Implement bokeh light effect overlay with opacity and speed controls.

**Design Reference:** `light.png`

**Implementation:**

1. **Panel content (when toggle active):**
   - Opacity slider (centered default = 50%)
   - Speed slider (centered default = 50%)

2. **Effect rendering:**
   - CSS/canvas animated radial gradients
   - Multiple soft, blurred circles at frame edges
   - Gentle movement animation (speed controlled by slider)
   - Semi-transparent (opacity controlled by slider)

3. **Effect characteristics:**
   - Concentrated around frame edges (not center)
   - Does not heavily obscure image, title, or waveform
   - Warm/neutral color tones

**Files to create:**
- `src/lib/components/LightEffectPanel.svelte`

**Files to modify:**
- `src/lib/utils/compositor.ts` (light effect layer rendering)

**Test criteria:**
- [ ] Effect visible when toggle active
- [ ] Opacity slider adjusts transparency
- [ ] Speed slider adjusts animation speed
- [ ] Effect concentrated at edges
- [ ] Effect animates smoothly

---

### Step 12: FFmpeg.wasm Integration

**Objective:** Set up FFmpeg.wasm for MP4 encoding.

**Implementation:**

1. **Install FFmpeg.wasm:**
   - Add `@ffmpeg/ffmpeg` and `@ffmpeg/util` to package.json
   - Configure for client-side loading

2. **Create encoding utility:**
   - Load FFmpeg on demand (lazy load to reduce initial bundle)
   - Function to encode canvas frames + audio to MP4

3. **Frame capture pipeline:**
   - Capture canvas frames at 30fps during playback
   - Store as image sequence
   - Combine with audio track

**Files to create:**
- `src/lib/utils/ffmpeg.ts` (FFmpeg wrapper, encoding functions)

**Test criteria:**
- [ ] FFmpeg.wasm loads successfully
- [ ] Can encode a simple test video
- [ ] No errors in console

---

### Step 13: Video Export & Download

**Objective:** Implement full export pipeline and download button.

**Implementation:**

1. **Export flow:**
   - User taps "Download audiogram" button
   - Show progress indicator (encoding can take 10-30s)
   - Capture all canvas frames during audio duration
   - Encode with FFmpeg.wasm to MP4
   - Trigger download with filename modal (reuse from TTS)

2. **Download button states:**
   - Disabled (grey): No image or audio loaded
   - Enabled (purple): Ready to export
   - Loading: Show spinner during encoding

3. **Filename modal:**
   - Reuse existing download modal pattern from TTS
   - Default filename: `audioflam-audiogram-DDMMYY-HHMM.mp4`

**Files to modify:**
- `src/lib/components/AudiogramPage.svelte`
- `src/lib/utils/ffmpeg.ts`

**Test criteria:**
- [ ] Download button enables when image + audio present
- [ ] Progress indicator shows during export
- [ ] MP4 file downloads successfully
- [ ] Video plays correctly (image + animated waveform + audio sync)
- [ ] Title and light effect included if enabled

---

### Step 14: Polish & Edge Cases

**Objective:** Handle edge cases, add loading states, optimize performance.

**Implementation:**

1. **Loading states:**
   - Image upload: Show spinner while resizing
   - Audio decode: Show spinner while processing
   - Export: Show progress percentage

2. **Error handling:**
   - Invalid file types: Show error message
   - Microphone permission denied: Show guidance
   - Export failure: Show retry option

3. **Performance optimization:**
   - Throttle waveform rendering to 30fps
   - Use `OffscreenCanvas` if available
   - Lazy load FFmpeg.wasm

4. **Mobile optimization:**
   - Touch gesture handling for crop/resize
   - Prevent scroll during drag operations
   - Test on low-end devices

**Test criteria:**
- [ ] All loading states display correctly
- [ ] Error messages are helpful
- [ ] Performance acceptable on mobile
- [ ] No memory leaks during long sessions

---

## File Structure (After Implementation)

```
src/
├── routes/
│   ├── +page.svelte              # Header + tab switching (TTS/Audiogram)
│   ├── +layout.svelte            # Unchanged
│   └── api/
│       └── tts/                  # Existing TTS API
├── lib/
│   ├── components/
│   │   ├── AudiogramPage.svelte      # Main audiogram container
│   │   ├── ImageUpload.svelte        # Image upload + display
│   │   ├── ImageCropDrawer.svelte    # Full-screen crop drawer
│   │   ├── AudioImport.svelte        # Audio upload/record + waveform
│   │   ├── CompositionCanvas.svelte  # Main preview/export canvas
│   │   ├── TogglePanel.svelte        # Reusable toggle panel
│   │   ├── WaveformPanel.svelte      # Waveform style/color options
│   │   ├── TitlePanel.svelte         # Title text/font/style options
│   │   ├── LightEffectPanel.svelte   # Bokeh effect controls
│   │   ├── ColorPicker.svelte        # HSB color picker
│   │   └── [existing components]
│   ├── stores.ts                     # Add audiogram state
│   └── utils/
│       ├── waveform.ts               # Waveform extraction + rendering
│       ├── recording.ts              # MediaRecorder wrapper
│       ├── compositor.ts             # Canvas layer composition
│       └── ffmpeg.ts                 # FFmpeg.wasm wrapper
└── app.css                           # Add Roboto Slab, Lora fonts
```

---

## Dependencies to Add

```json
{
  "@ffmpeg/ffmpeg": "^0.12.x",
  "@ffmpeg/util": "^0.12.x"
}
```

---

## Google Fonts to Add

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@400;700&family=Roboto+Slab:wght@400;700&display=swap');
```

---

## Testing Strategy

Each step includes test criteria. After each step:

1. Run `npm run dev` and test locally
2. Verify all test criteria pass
3. Run `npm run check` for TypeScript errors
4. Commit with descriptive message
5. Proceed to next step

---

**Document Status:** Ready for Implementation  
**Last Updated:** January 2026
