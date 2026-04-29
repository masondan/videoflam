

---

# AudioFlam Bulletin Engine — Agent Build Plan v2

---

## CHECKPOINT 1 — Route, Store & Data Foundation
*Goal: `/bulletin` loads a blank page with correct routing and persistent state. Nothing visual yet beyond a page shell.*

### Tasks
- Create `src/routes/bulletin/+page.svelte` — page shell only, correct SvelteKit routing
- Create `src/lib/stores/bulletin.ts` with full `BulletinStory` and `BulletinState` types and localStorage persistence
- Implement `getStorySource(story)` utility function
- Verify `/bulletin` loads in browser with no errors

### Data Model
```typescript
type ScriptType = 'summary' | 'explainer';
type ScriptLength = 20 | 30 | 60 | 90;

interface BulletinStory {
  id: string;
  originalText: string;
  script: string;
  scriptActive: boolean;
  scriptLength: ScriptLength;
  scriptType: ScriptType;
  ttsAudio: string | null;
}

interface BulletinState {
  stories: BulletinStory[];
  selectedVoice: string;
  introScript: string;
  outroScript: string;
  introOutroVoice: string;
  introOutroEnabled: boolean;
  soundsEnabled: boolean;
  selectedIntroOutroSound: string | null;  // filename or null
  selectedTransitionSound: string | null;  // filename or null
  introTtsAudio: string | null;
  outroTtsAudio: string | null;
  bulletinAudio: string | null;
}
```

### Sound file constants (hardcoded in store)
```typescript
const INTRO_OUTRO_SOUNDS = ['intro1.mp3', 'intro2.mp3', 'intro3.mp3'];
const TRANSITION_SOUNDS  = ['transition1.mp3', 'transition2.mp3', 'transition3.mp3'];
// All served from /sounds/
```

**✅ Test: `/bulletin` loads. Store initialises. localStorage key `audioflam_bulletin` appears on first visit.**

---

## CHECKPOINT 2 — Main Page UI (Static, No Logic)
*Goal: Full visual layout rendered with correct AudioFlam styling. Buttons and toggles visible but not yet wired.*

### Tasks
- Voice dropdown — reuse `VoiceDropdown.svelte` exactly
- `[Add Story]` full-width button — disabled state until voice selected
- Story preview list area — empty state placeholder ("No stories yet")
- `BulletinStoryCard` component — renders chevrons + 3-line snippet + edit icon (static, no reorder logic yet)
- Card 1: Intro & Outro — toggle + collapsed/expanded states, all fields visible when open (textareas, voice select, speed/silence controls, Preview button)
- Card 2: Sounds — toggle + expanded state with two sections:

```
[Intro & Outro Sound]  ─────────────
◉ None
○ intro1.mp3   [▶]
○ intro2.mp3   [▶]
○ intro3.mp3   [▶]

[Transition Sound]  ─────────────
◉ None
○ transition1.mp3  [▶]
○ transition2.mp3  [▶]
○ transition3.mp3  [▶]
```

- Generate / Play / Pause / Download / Add to Audiogram cluster — static, matching TTS tab style exactly

### Notes for agent
- Checkmarks are radio-button groups styled with CSS — one selection per group, `None` selected by default
- Preview `[▶]` beside each sound plays the MP3 from `/sounds/[filename]` directly in browser — no API call, just `new Audio()`
- All toggle cards use same open/close pattern as existing AudioFlam cards (copy pattern from `WaveformPanel.svelte` or `TogglePanel.svelte`)

**✅ Test: Page renders correctly on mobile and desktop. All cards open/close. Sound previews play. Styling matches rest of AudioFlam.**

---

## CHECKPOINT 3 — Story Drawer (UI + localStorage)
*Goal: Drawer opens, editor can paste text, save stores story, story appears as preview card on main page.*

### Tasks
- Create `BulletinStoryDrawer.svelte` — full-page drawer triggered by Add Story / Edit icon
- Header: `×` left (with close-confirmation toast), `[Save]` right
- Original text area:
  - Half-page card, pale grey bg, `placeholder="Paste text"`
  - Auto-expands when content overflows
  - Word count + estimated duration bottom right (`Math.round(wordCount / 2.5)` seconds)
  - Below card: `[CLEAR TEXT]` left, `[COPY]` centre-left, expand/collapse chevron right
- Create Script card — toggle + collapsed/expanded (UI only at this checkpoint, no API call yet):
  - Script length toggle boxes: `[20][30][60][90]` — single select
  - Script type toggle boxes: `[Summary][Explainer]` — single select
  - Script textarea — editable, `placeholder="Script will appear here"`
  - Word count + estimated duration for script field also
- Delete Story button (edit mode only) with toast confirmation
- Save logic:
  - Saves `originalText`, `script`, `scriptActive` (whether Create Script toggle is on) to store + localStorage
  - Closes drawer
- Edit mode: pre-populates all fields from saved story data

**✅ Test: Add story → paste text → Save → story appears as 3-line preview on main page. Edit icon re-opens drawer with correct content. Delete removes story. localStorage updates correctly on every action.**

---

Perfect. Here is the complete Checkpoint 4, ready to copy and paste to your agent:

---

# CHECKPOINT 4 — Gemini Script API + Per-Story TTS

## Context
You are working on AudioFlam, a SvelteKit 2 / Svelte 5 app. Read `AGENTS.md` before starting. This checkpoint wires up the "Create Script" toggle in `BulletinStoryDrawer.svelte` to a new Gemini API endpoint, then connects the Generate/Play/Pause audio cluster to the existing `/api/tts` endpoint.

Checkpoints 1–3 are complete. The following already exist and work:
- `src/lib/stores/bulletin.ts` — full store with `BulletinStory` type and `getStorySource()` utility
- `src/lib/components/bulletin/BulletinStoryDrawer.svelte` — drawer UI including Create Script card (toggle, length buttons, type buttons, script textarea, Generate/Play/Pause cluster)
- `src/lib/server/bulletinPrompts.ts` — exports `BULLETIN_PROMPT` and `EXPLAINER_PROMPT` constants
- `/api/tts` — existing TTS endpoint, unchanged

---

## Step 1 — Create the API endpoint

Create file: `src/routes/api/bulletin-script/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { BULLETIN_PROMPT, EXPLAINER_PROMPT } from '$lib/server/bulletinPrompts';
import { GEMINI_API_KEY } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  const { text, scriptLength, scriptType } = await request.json();

  if (!text || !scriptLength || !scriptType) {
    throw error(400, 'Missing required fields: text, scriptLength, scriptType');
  }

  const targetWords = Math.round(scriptLength * 2.5);
  const basePrompt = scriptType === 'summary' ? BULLETIN_PROMPT : EXPLAINER_PROMPT;
  const systemPrompt = basePrompt
    .replace('{TARGET_WORDS}', String(targetWords))
    .replace('{TARGET_SECONDS}', String(scriptLength));

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ],
        tools: [{ googleSearch: {} }]
      })
    }
  );

  if (!geminiResponse.ok) {
    const errBody = await geminiResponse.text();
    console.error('[BulletinScript] Gemini error:', errBody);
    throw error(502, 'Gemini API request failed');
  }

  const geminiData = await geminiResponse.json();

  // Extract text from Gemini response
  const script =
    geminiData?.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => typeof p.text === 'string')
      ?.map((p: { text: string }) => p.text)
      ?.join('') ?? '';

  if (!script) {
    console.error('[BulletinScript] Empty script returned:', JSON.stringify(geminiData));
    throw error(502, 'Gemini returned an empty script');
  }

  return json({ script });
};
```

---

## Step 2 — Wire up the Create Script card in BulletinStoryDrawer

In `src/lib/components/bulletin/BulletinStoryDrawer.svelte`, add or update the following logic. Do not change the existing UI structure from Checkpoint 3.

### State variables to add (in the `<script>` block)
```typescript
let isGeneratingScript = false;
let scriptError = '';

// Per-story TTS state
let isGeneratingAudio = false;
let audioElement: HTMLAudioElement | null = null;
let isPlaying = false;
```

### Generate Script function
```typescript
async function generateScript() {
  const source = draft.originalText.trim();
  if (!source) return;

  isGeneratingScript = true;
  scriptError = '';

  try {
    const response = await fetch('/api/bulletin-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: source,
        scriptLength: draft.scriptLength,   // eg 30
        scriptType: draft.scriptType        // 'summary' | 'explainer'
      })
    });

    if (!response.ok) throw new Error('Script generation failed');

    const { script } = await response.json();
    draft.script = script;
    draft.scriptActive = true;             // script toggle source of truth rule
  } catch (e) {
    scriptError = 'Could not generate script. Please try again.';
    console.error('[BulletinScript]', e);
  } finally {
    isGeneratingScript = false;
  }
}
```

### Generate Audio function
```typescript
async function generateAudio() {
  const scriptText = getStorySource(draft);
  if (!scriptText.trim()) return;

  isGeneratingAudio = true;

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: scriptText,
        voiceName: $bulletinStore.selectedVoice,
        provider: 'azure'                  // matches existing TTS tab default
      })
    });

    if (!response.ok) throw new Error('TTS failed');

    const { audioContent } = await response.json();
    draft.ttsAudio = audioContent;         // base64 MP3 stored on story draft

    // Prepare audio element for playback
    const blob = base64ToBlob(audioContent, 'audio/mp3');
    const url = URL.createObjectURL(blob);
    audioElement = new Audio(url);
    audioElement.onended = () => { isPlaying = false; };
  } catch (e) {
    console.error('[BulletinScript] TTS error:', e);
  } finally {
    isGeneratingAudio = false;
  }
}

function togglePlayPause() {
  if (!audioElement) return;
  if (isPlaying) {
    audioElement.pause();
    isPlaying = false;
  } else {
    audioElement.play();
    isPlaying = true;
  }
}

// Helper — reuse pattern from existing AudioFlam components
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = Array.from(byteChars, c => c.charCodeAt(0));
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
```

### Button states in template

Replace static Generate/Play/Pause buttons in the Create Script card with:

```svelte
<!-- Generate Script button -->
<button
  class="btn-primary"
  onclick={generateScript}
  disabled={isGeneratingScript || !draft.originalText.trim()}
>
  {#if isGeneratingScript}
    GENERATING <span class="spinner" />
  {:else}
    GENERATE SCRIPT
  {/if}
</button>

{#if scriptError}
  <p class="error-text">{scriptError}</p>
{/if}

<!-- Generate Audio / Play / Pause cluster -->
<!-- Only visible when script or original text is present -->
{#if getStorySource(draft).trim()}
  <button
    class="btn-primary"
    onclick={generateAudio}
    disabled={isGeneratingAudio || !!draft.ttsAudio}
  >
    {#if isGeneratingAudio}
      GENERATING <span class="spinner" />
    {:else}
      GENERATE AUDIO
    {/if}
  </button>

  {#if draft.ttsAudio}
    <button class="btn-icon" onclick={togglePlayPause}>
      {#if isPlaying}
        <!-- pause icon -->
      {:else}
        <!-- play icon -->
      {/if}
    </button>
  {/if}
{/if}
```

---

## Step 3 — Update Save logic for ttsAudio

In the existing `saveStory()` function in the drawer, ensure `draft.ttsAudio` is included when saving to the store. The Checkpoint 3 save only covered `originalText`, `script`, and `scriptActive`. Add:

```typescript
// Inside saveStory(), when writing to bulletinStore
story.ttsAudio = draft.ttsAudio;
```

---

## What does NOT change in this checkpoint
- All UI layout and styling from Checkpoint 3
- The story card preview on the main page
- The main page Generate/Play/Pause/Download cluster (Checkpoint 6)
- The Intro & Outro card (Checkpoint 5)
- The Sounds card (Checkpoint 2)
- `/api/tts` endpoint — called as-is, no modifications

---

## ✅ Test checklist

- [ ] Paste article text into drawer. Select `30s` and `Summary`. Tap GENERATE SCRIPT. Script appears in textarea within a few seconds.
- [ ] Script textarea is editable after generation.
- [ ] Select `60s` and `Explainer`. Tap GENERATE SCRIPT. Output opens with a question hook.
- [ ] Tap GENERATE AUDIO. Button shows GENERATING then resolves.
- [ ] Tap play. Audio plays correctly in drawer.
- [ ] Tap Save. Story saved to store. Main page preview shows script text (script toggle was active).
- [ ] Open story again via Edit icon. Script, original text and audio all restored from localStorage.
- [ ] With no text pasted, GENERATE SCRIPT button is disabled.
- [ ] Console shows `[BulletinScript]` prefix on errors — no silent failures.
- [ ] `GEMINI_API_KEY` missing from env → server returns 502, error message shown in drawer (not a blank crash).

---

## CHECKPOINT 5 — Intro & Outro Card Logic
*Goal: Intro/Outro card fully functional — TTS generation and joined preview.*

### Tasks
- Wire intro/outro textareas to store
- Voice select and speed/silence controls connected
- `[PREVIEW]` button:
  - Calls `/api/tts` for intro text → then `/api/tts` for outro text
  - Joins two audio segments client-side using existing `audioProcessing.ts` concatenation
  - Plays joined result
- Button states: PREVIEW → GENERATING + spinner → plays

**✅ Test: Type intro and outro text. Tap Preview. Both play in sequence as single audio.**

---

## CHECKPOINT 6 — Bulletin Assembly & Final Controls
*Goal: Full bulletin assembled and playable. Download and Add to Audiogram wired.*

### Assembly order:
```
[intro sound MP3 if selected]
[intro TTS if enabled]
[transition sound if selected]
[story 1 TTS]
[transition sound if selected]
[story 2 TTS]
[transition sound if selected]
[story N TTS]
[transition sound if selected]  ← after last story
[outro TTS if enabled]
[outro sound MP3 if selected]
```

### Tasks
- Reorder logic for story chevrons (swap array positions in store)
- Generate button on main page:
  - Checks all stories have TTS audio; if not, generates missing ones sequentially
  - Loads selected sound MP3s from `/sounds/` as ArrayBuffers
  - Assembles full sequence using `audioProcessing.ts`
  - Normalises final output via `/api/normalize`
  - Stores result as `bulletinAudio` in store
- Play / Pause wired to `bulletinAudio`
- Download: saves as `bulletin.mp3`
- Add to Audiogram: writes to `preloadedTTSAudio` store, navigates to Audiogram tab

**✅ Test: Three stories added, intro/outro written, transition sound selected. Tap Generate. Full bulletin plays correctly in order. Download saves MP3. Add to Audiogram switches tab with audio pre-loaded.**

---

## File Summary

```
src/routes/bulletin/+page.svelte
src/routes/api/bulletin-script/+server.ts
src/lib/stores/bulletin.ts
src/lib/components/bulletin/
  BulletinStoryDrawer.svelte
  BulletinStoryCard.svelte
  BulletinIntroOutroCard.svelte
  BulletinSoundsCard.svelte
static/sounds/
  intro1.mp3  intro2.mp3  intro3.mp3
  transition1.mp3  transition2.mp3  transition3.mp3
```

---