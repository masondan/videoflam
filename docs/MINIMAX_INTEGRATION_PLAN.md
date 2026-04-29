# MiniMax Voice Clone Integration Plan
**AudioFlam - Malawi & Zimbabwe TTS Support**

---

## Overview

Add MiniMax voice clone support for Malawi (2 voices) + Zimbabwe (2 voices) English accents.
- **Provider:** MiniMax.ai (direct API)
- **Cloning cost:** $1.50/voice (one-time)
- **Token cost:** $0.06 per 1,000 tokens (same as Azure/YarnGPT)
- **Voice names:** Chisomo (Malawi M), Mercy (Malawi F), Tawanda (Zimbabwe M), Precious (Zimbabwe F)
- **Voice emotion:** Neutral (default, no UI exposure at v1)
- **Clone refresh:** Cloudflare Worker cron (weekly ping)

---

## Pre-Phase 0: Voice Cloning (One-Time Setup)

### Step 0A: Prepare Voice Samples

Create folder: `voice-samples/` in project root

Place your 4 WAV files there:
- `chisomo.wav` (Malawi male)
- `mercy.wav` (Malawi female)
- `tawanda.wav` (Zimbabwe male)
- `precious.wav` (Zimbabwe female)

**Stop Point:** Confirm 4 WAV files exist in `voice-samples/`.

---

### Step 0B: Upload to MiniMax via Script

Run the voice cloning upload script (provided below):

```bash
npm install node-fetch   # One-time install if not present
node scripts/minimax-clone-voices.js
```

This script:
1. Reads 4 WAVs from `voice-samples/`
2. Uploads each to MiniMax's `/v1/voice/upload` endpoint
3. Returns 4 voice clone IDs (e.g., `clone_xyz123`)
4. **Copy these IDs** and provide them to be added to `stores.ts`

**Expected output:**
```
Cloned: chisomo.wav → voice_id: clone_chisomo_abc123
Cloned: mercy.wav → voice_id: clone_mercy_abc123
Cloned: tawanda.wav → voice_id: clone_tawanda_abc123
Cloned: precious.wav → voice_id: clone_precious_abc123
```

**Stop Point:** Confirm all 4 voices cloned successfully. Copy the voice IDs.

---

### Upload Script: `scripts/minimax-clone-voices.js`

Create this file (requires Node.js 16+):

```javascript
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const VOICE_SAMPLES_DIR = './voice-samples';

if (!MINIMAX_API_KEY) {
	console.error('Error: MINIMAX_API_KEY not found in .env');
	process.exit(1);
}

const voiceFiles = [
	{ file: 'chisomo.wav', name: 'Chisomo', gender: 'MALE' },
	{ file: 'mercy.wav', name: 'Mercy', gender: 'FEMALE' },
	{ file: 'tawanda.wav', name: 'Tawanda', gender: 'MALE' },
	{ file: 'precious.wav', name: 'Precious', gender: 'FEMALE' }
];

async function cloneVoices() {
	const results = [];

	for (const { file, name, gender } of voiceFiles) {
		const filePath = path.join(VOICE_SAMPLES_DIR, file);

		if (!fs.existsSync(filePath)) {
			console.error(`✗ File not found: ${filePath}`);
			continue;
		}

		const audioBuffer = fs.readFileSync(filePath);
		const formData = new FormData();
		formData.append('audio_file', new Blob([audioBuffer], { type: 'audio/wav' }), file);
		formData.append('name', name);

		try {
			const response = await fetch('https://api.minimax.chat/v1/voice/upload', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${MINIMAX_API_KEY}`
				},
				body: formData
			});

			if (!response.ok) {
				const error = await response.text();
				console.error(`✗ ${name}: ${response.status} - ${error}`);
				continue;
			}

			const data = await response.json();
			const voiceId = data.voice_id || data.id;
			results.push({ name, gender, voiceId });
			console.log(`✓ Cloned: ${name} (${gender}) → voice_id: ${voiceId}`);
		} catch (error) {
			console.error(`✗ ${name}: ${error.message}`);
		}
	}

	console.log('\n=== Summary ===');
	results.forEach(({ name, voiceId }) => {
		console.log(`${name}: ${voiceId}`);
	});

	return results;
}

cloneVoices();
```

**Note:** Requires `node-fetch` (add to `package.json` if missing: `npm install node-fetch`)

**Stop Point:** Script runs without errors and returns 4 voice IDs.

---

## Implementation Roadmap

### Phase 1: Provider Integration (SvelteKit)

#### Step 1A: Update Voice Type Definition
**File:** `src/lib/stores.ts`

Add `minimax` to `TTSProvider` type:
```typescript
export type TTSProvider = 'yarngpt' | 'azure' | 'minimax';
```

**Stop Point:** Confirm type added.

---

#### Step 1B: Add Voice Definitions to stores.ts

After running the cloning script (Step 0B), you'll have 4 voice IDs. Insert them below in `src/lib/stores.ts` after `AZURE_VOICES`:

```typescript
// MiniMax Voice Clones (Malawi + Zimbabwe English)
// Replace CLONE_ID_* with values returned from scripts/minimax-clone-voices.js
export const MINIMAX_VOICES: VoiceOption[] = [
	// Malawi English
	{ name: 'CLONE_ID_CHISOMO', ssmlGender: 'MALE', displayName: 'Chisomo', description: 'Malawi English male', provider: 'minimax' },
	{ name: 'CLONE_ID_MERCY', ssmlGender: 'FEMALE', displayName: 'Mercy', description: 'Malawi English female', provider: 'minimax' },
	// Zimbabwe English
	{ name: 'CLONE_ID_TAWANDA', ssmlGender: 'MALE', displayName: 'Tawanda', description: 'Zimbabwe English male', provider: 'minimax' },
	{ name: 'CLONE_ID_PRECIOUS', ssmlGender: 'FEMALE', displayName: 'Precious', description: 'Zimbabwe English female', provider: 'minimax' }
];
```

**Example after cloning script returns IDs:**
```typescript
export const MINIMAX_VOICES: VoiceOption[] = [
	{ name: 'clone_chisomo_abc123', ssmlGender: 'MALE', displayName: 'Chisomo', description: 'Malawi English male', provider: 'minimax' },
	{ name: 'clone_mercy_def456', ssmlGender: 'FEMALE', displayName: 'Mercy', description: 'Malawi English female', provider: 'minimax' },
	{ name: 'clone_tawanda_ghi789', ssmlGender: 'MALE', displayName: 'Tawanda', description: 'Zimbabwe English male', provider: 'minimax' },
	{ name: 'clone_precious_jkl012', ssmlGender: 'FEMALE', displayName: 'Precious', description: 'Zimbabwe English female', provider: 'minimax' }
];
```

Update `ALL_VOICES` array to include MiniMax voices:
```typescript
export const ALL_VOICES: VoiceOption[] = [
	...AZURE_VOICES.filter(v => v.name.startsWith('en-NG')),
	...YARNGPT_VOICES,
	...MINIMAX_VOICES,  // ← ADD THIS LINE
	...AZURE_VOICES.filter(v => v.name.startsWith('en-GB')),
];
```

**Stop Point:** Confirm stores.ts updated and type checking passes (`npm run check`).

---

#### Step 1C: Implement handleMiniMax() Handler
**File:** `src/routes/api/tts/+server.ts`

In `POST` handler, add branch for MiniMax:
```typescript
if (provider === 'azure') {
	return await handleAzure(text, voiceName);
} else if (provider === 'minimax') {
	return await handleMiniMax(text, voiceName);
} else {
	return await handleYarnGPT(text, voiceName);
}
```

Add handler function at end of file (before final `}`):

```typescript
async function handleMiniMax(text: string, voiceName: string) {
	const MINIMAX_API_KEY = env.MINIMAX_API_KEY;
	if (!MINIMAX_API_KEY) {
		console.error('MINIMAX_API_KEY missing');
		return json({ error: 'MiniMax API key not configured' }, { status: 500 });
	}

	const trimmedText = text.slice(0, 4000);

	const response = await fetch('https://api.minimax.chat/v1/text_to_speech', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${MINIMAX_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: 'speech-02-turbo', // or 2.6/2.8 (all same cost)
			text: trimmedText,
			voice_id: voiceName,
			emotion: 'neutral', // Fixed to neutral
			response_format: 'mp3'
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error('MiniMax API error:', response.status, errorText);
		return json(
			{ error: 'MiniMax generation failed', status: response.status, details: errorText },
			{ status: response.status }
		);
	}

	const audioBuffer = await response.arrayBuffer();
	const uint8Array = new Uint8Array(audioBuffer);
	let binaryString = '';
	const chunkSize = 8192;
	for (let i = 0; i < uint8Array.length; i += chunkSize) {
		binaryString += String.fromCharCode(...uint8Array.slice(i, i + chunkSize));
	}
	const base64Audio = btoa(binaryString);

	return json({ audioContent: base64Audio, format: 'mp3' }, { status: 200 });
}
```

**Dependencies:**
- Verify `MINIMAX_API_KEY` is in `.env.local` (local) and Cloudflare environment variables (production)
- No additional npm packages needed

**Stop Point:** Confirm handler compiles without errors (`npm run check`).

---

### Phase 2: Testing (Local)

#### Step 2A: Test Single Voice
**Method:** Browser console or cURL

Using browser DevTools:
```javascript
const response = await fetch('/api/tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Hello from Malawi',
    voiceName: 'malawi-male-clone',
    provider: 'minimax'
  })
});
const data = await response.json();
console.log(data); // Should have { audioContent: "base64...", format: "mp3" }
```

**Expected:** Audio plays without errors. Check console for MiniMax API response times (~3-5s).

**Stop Point:** Confirm one voice generates audio successfully.

---

### Phase 3: Cloudflare Worker Cron (Clone Refresh)

#### Step 3A: Create Worker File
**File:** `src/routes/api/minimax-refresh/+server.ts` (new file)

**Important:** Replace `VOICE_ID_*` placeholders with the actual voice IDs returned from the cloning script (Step 0B).

```typescript
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// List of voice IDs to refresh weekly (from cloning script output in Step 0B)
const VOICE_IDS = [
	'VOICE_ID_CHISOMO',  // Replace with clone_chisomo_abc123
	'VOICE_ID_MERCY',    // Replace with clone_mercy_def456
	'VOICE_ID_TAWANDA',  // Replace with clone_tawanda_ghi789
	'VOICE_ID_PRECIOUS'  // Replace with clone_precious_jkl012
];

export const POST: RequestHandler = async () => {
	try {
		const MINIMAX_API_KEY = env.MINIMAX_API_KEY;
		if (!MINIMAX_API_KEY) {
			return json({ error: 'MiniMax API key not configured' }, { status: 500 });
		}

		const results = [];
		for (const voiceId of VOICE_IDS) {
			const response = await fetch('https://api.minimax.chat/v1/text_to_speech', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${MINIMAX_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'speech-02-turbo',
					text: 'a', // Single character to keep cost minimal
					voice_id: voiceId,
					emotion: 'neutral',
					response_format: 'mp3'
				})
			});

			results.push({
				voiceId,
				status: response.ok ? 'refreshed' : `failed (${response.status})`
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`MiniMax refresh failed for ${voiceId}:`, errorText);
			}
		}

		return json({ message: 'Voice clones refreshed', results }, { status: 200 });
	} catch (error) {
		console.error('Voice refresh error:', error);
		return json({ error: 'Refresh failed' }, { status: 500 });
	}
};
```

**Stop Point:** Confirm handler created and endpoint accessible at POST `/api/minimax-refresh`.

---

#### Step 3B: Configure Cloudflare Worker Cron
**Location:** `wrangler.toml` (SvelteKit adapter config in `svelte.config.js`)

Add to `svelte.config.js` in Cloudflare adapter options:

```javascript
export default {
	kit: {
		adapter: cloudflare({
			routes: {
				// Cron trigger: every Monday at 2 AM UTC (168 hours)
				include: ['<(routes)/api/minimax-refresh/**'],
				exclude: []
			}
		})
	}
};
```

**Alternative (if using wrangler.toml directly):**

```toml
[env.production]
routes = [
  { pattern = "api/minimax-refresh", zone_id = "", custom_domain = false }
]

[[triggers.crons]]
crons = ["0 2 * * 1"] # Monday 2 AM UTC
```

**Note:** Cloudflare Pages doesn't natively support cron triggers via `wrangler.toml`. Alternative: use a third-party cron service (EasyCron, OnlineTaskScheduler) to POST to `/api/minimax-refresh` weekly.

**Stop Point:** Confirm cron configuration matches your Cloudflare setup (Pages vs Workers).

---

### Phase 4: Voice Samples

#### Step 4A: Generate & Download Voice Samples
**Location:** Your MiniMax dashboard (or use API)

For each of the 4 cloned voices, generate a sample MP3 using MiniMax's TTS API (~5-10 seconds of natural speech):

```bash
# Example: Generate sample for Chisomo voice
curl -X POST https://api.minimax.chat/v1/text_to_speech \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "speech-02-turbo",
    "text": "Welcome to AudioFlam. I am Chisomo.",
    "voice_id": "VOICE_ID_CHISOMO",
    "emotion": "neutral",
    "response_format": "mp3"
  }' \
  > static/voices/chisomo.mp3
```

Repeat for: `mercy.mp3`, `tawanda.mp3`, `precious.mp3`

**Naming convention:**
- `chisomo.mp3` (Malawi male)
- `mercy.mp3` (Malawi female)
- `tawanda.mp3` (Zimbabwe male)
- `precious.mp3` (Zimbabwe female)

Place in: `static/voices/`

**Stop Point:** Confirm 4 MP3 files exist in `static/voices/` and are playable.

---

### Phase 5: UI Verification

#### Step 5A: Check Voice Dropdown
**File:** `src/lib/components/VoiceDropdown.svelte`

No changes needed—component already reads from `ALL_VOICES` store. Verify:
- Open app in browser
- Malawi/Zimbabwe voices appear in dropdown
- Correct gender/language labels shown

**Stop Point:** Confirm voices visible in UI dropdown.

---

### Phase 6: Full Integration Test

#### Step 6A: Generate Audio All Voices
Test workflow:
1. Select "Malawi (M)" from dropdown
2. Enter test text: "Welcome to the Malawi training program"
3. Click "Generate"
4. Verify audio plays without errors
5. Repeat for all 4 Malawi/Zim voices

**Expected:** ~3-5 seconds per generation, clear audio output.

**Stop Point:** Confirm all 4 voices generate and play correctly.

---

### Phase 7: Deployment

#### Step 7A: Deploy to Production
```bash
npm run build
# Deploy via Cloudflare Pages (automatic via git push or manual in dashboard)
```

**Stop Point:** Confirm deployment successful in Cloudflare Pages dashboard.

---

#### Step 7B: Verify Cron Scheduling
**Location:** Cloudflare Workers dashboard → Triggers

Verify:
- Cron job listed with schedule (e.g., "0 2 * * 1" for weekly Monday 2 AM)
- Next scheduled run shows correct time
- (Optional) Manually trigger to see logs

**Stop Point:** Confirm cron logs show successful refresh calls.

---

## Architecture Notes

### MiniMax API Response Format
```json
{
  "audio_content": "base64-encoded-mp3",
  "status": "success"
}
```
Handler decodes and wraps in AudioFlam format: `{ audioContent, format: 'mp3' }`

### Voice Clone Persistence
- Clones auto-delete after 7 days of inactivity
- Weekly cron ping (sending single character "a") resets TTL
- Cost negligible: 4 voices × $0.06 per 1K tokens × 1 character = ~$0.0000024/week

### Error Handling
- If cron fails: clones may expire, but can be re-cloned anytime
- If TTS call fails: fallback to other providers or show user-friendly error
- Logs prefixed with `[MiniMax]` for debugging

---

## Files Modified/Created

| File | Type | Change |
|------|------|--------|
| `src/lib/stores.ts` | Modify | Add `minimax` provider type + voice definitions |
| `src/routes/api/tts/+server.ts` | Modify | Add `handleMiniMax()` handler + routing logic |
| `src/routes/api/minimax-refresh/+server.ts` | Create | Cron endpoint for voice refresh |
| `svelte.config.js` | Modify | Configure Cloudflare cron trigger (if using Workers) |
| `static/voices/` | Add | 4 MP3 sample files (malawi-male.mp3, malawi-female.mp3, zimbabwe-male.mp3, zimbabwe-female.mp3) |
| `.env` / Cloudflare env vars | Verify | `MINIMAX_API_KEY` set and accessible |

---

## Checkpoints & Handoffs

✅ **Checkpoint 1:** Type definition + voice definitions added (after Step 1B)
✅ **Checkpoint 2:** MiniMax handler compiles (after Step 1C)
✅ **Checkpoint 3:** Single voice generates audio (after Step 2A)
✅ **Checkpoint 4:** Cron endpoint created & verified callable (after Step 3B)
✅ **Checkpoint 5:** Voice samples downloaded (after Step 4A)
✅ **Checkpoint 6:** Voices appear in UI (after Step 5A)
✅ **Checkpoint 7:** Full integration test passes (after Step 6A)
✅ **Checkpoint 8:** Production deployed & cron logs verified (after Step 7B)

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Voice clone expires (7 days) | Weekly cron refresh keeps active |
| Cron job fails silently | Check Cloudflare Workers dashboard logs weekly |
| API key misconfigured | Test locally with `.env.local` first |
| MiniMax API rate limits | Cost of ~4 pings/week is negligible |
| Clone voice IDs change | Store in `stores.ts` for easy updates |

---

## Rollback Plan

If MiniMax integration fails:
1. Comment out MiniMax routes in routing logic (`src/routes/api/tts/+server.ts`)
2. Remove MiniMax voices from `ALL_VOICES` in `stores.ts`
3. Deploy immediately
4. Revert Cloudflare cron (or let it silently fail—no harm done)

---

**Ready for Code Mode handoff.**
