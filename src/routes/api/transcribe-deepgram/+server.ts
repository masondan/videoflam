import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/transcribe-deepgram
 *
 * Receives audio as a binary blob, sends to Deepgram Nova-3 for transcription
 * with word-level timestamps, and returns SubtitleSegment-compatible JSON.
 *
 * Request: multipart/form-data with field "audio" (audio file blob)
 * Response: { segments: SubtitleSegment[] }
 *
 * Each segment: { start, end, text, words: [{ word, start, end }] }
 */
export const POST: RequestHandler = async ({ request }) => {
	const DEEPGRAM_KEY = env.DEEPGRAM_VTT_KEY?.trim();

	if (!DEEPGRAM_KEY) {
		return json({ error: 'Deepgram API key not configured' }, { status: 500 });
	}

	try {
		const formData = await request.formData();
		const audioFile = formData.get('audio') as File | null;
		const language = (formData.get('language') as string)?.trim() || 'auto';

		if (!audioFile) {
			return json({ error: 'No audio file provided' }, { status: 400 });
		}

		const audioBuffer = await audioFile.arrayBuffer();
		// Use the actual file MIME type (video or audio), or default to MP3
		// Deepgram accepts: audio/webm, audio/mpeg, video/mp4, video/webm, video/quicktime, etc.
		const mimeType = audioFile.type || 'audio/mpeg';
		console.log(`[Deepgram] File MIME type: ${mimeType}, File name: ${audioFile.name}`);

		// Deepgram model/language resolution.
		//
		// BEFORE the English fix, both 'auto' (no language param sent at all —
		// Deepgram defaults nova-3 to English) and 'en' resolved to plain
		// `model=nova-3` (or `model=nova-3&language=en`, same result). That
		// combination was proven (via direct curl testing, bypassing this app
		// entirely) to drop words from audio containing jingles/transitions —
		// specifically intro/outro TTS segments went missing from the
		// transcript, while `model=nova-3&language=multi` (146 words) and
		// `model=nova-2` (147 words) both transcribed correctly. (Ported from
		// AudioFlam — same underlying Deepgram route/bug, Oct 2026.)
		//
		// Fix: route English requests (both 'auto' and explicit 'en') to
		// `model=nova-3&language=multi` instead. Easy to revert: change
		// ENGLISH_DEEPGRAM_PARAMS back to { language: 'en' } or drop the
		// language key to restore the pre-fix 'auto' behavior.
		const isEnglishRequest = language === 'auto' || language === 'en';
		const ENGLISH_DEEPGRAM_PARAMS = { model: 'nova-3', language: 'multi' };

		// Azerbaijani: Nova-2, Nova-3 and Nova-3 "multi" all mis-transcribe
		// Azerbaijani (multi misreads it as Turkish — tested directly). Deepgram's
		// hosted Whisper (whisper-large) correctly transcribes it
		// (model=whisper-large&language=az, verified with a test clip on the
		// same account/key). Whisper is slower and capped at 5 concurrent
		// requests on pay-as-you-go — see the longer timeout and 429 handling
		// below. Easy to revert: delete this constant and the `isAzerbaijaniRequest`
		// branch below to fall back to plain `model=nova-3&language=az`.
		const isAzerbaijaniRequest = language === 'az';
		const AZERBAIJANI_DEEPGRAM_PARAMS = { model: 'whisper-large', language: 'az' };

		const urlParams: Record<string, string> = {
			model: 'nova-3',
			smart_format: 'true',
			punctuate: 'true',
			utterances: 'false',
			words: 'true',
		};
		if (isEnglishRequest) {
			urlParams.language = ENGLISH_DEEPGRAM_PARAMS.language;
		} else if (isAzerbaijaniRequest) {
			urlParams.model = AZERBAIJANI_DEEPGRAM_PARAMS.model;
			urlParams.language = AZERBAIJANI_DEEPGRAM_PARAMS.language;
		} else {
			urlParams.language = language;
		}

		// Call Deepgram with word-level timestamps.
		//
		// Azerbaijani (whisper-large) is noticeably slower than Nova and is
		// capped at 5 concurrent requests on pay-as-you-go, so it gets a much
		// longer fetch timeout than everything else. The default timeout is
		// still generous (2 min) as a safety net against hung requests, but
		// shouldn't ever be hit by the fast Nova models in normal use.
		//
		// NOTE: SubtitlePanel.svelte in this app also has its own 90s client-side
		// AbortController timeout wrapping this fetch — that was extended for
		// Azerbaijani too so it doesn't cut off the request before the server
		// has a chance to respond. See handleGenerate() there.
		const AZERBAIJANI_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
		const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
		const timeoutMs = isAzerbaijaniRequest ? AZERBAIJANI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

		const deepgramUrl = 'https://api.deepgram.com/v1/listen?' + new URLSearchParams(urlParams).toString();

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		let deepgramResponse: Response;
		try {
			deepgramResponse = await fetch(deepgramUrl, {
				method: 'POST',
				headers: {
					'Authorization': `Token ${DEEPGRAM_KEY}`,
					'Content-Type': mimeType,
				},
				body: audioBuffer,
				signal: controller.signal,
			});
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				console.error(`[Deepgram] Request timed out after ${timeoutMs}ms (language=${language})`);
				return json(
					{
						error: isAzerbaijaniRequest
							? "Azerbaijani transcription is taking longer than expected and timed out. Deepgram's Whisper model can be slow during busy periods — please try again."
							: 'Transcription timed out. Please try again.',
					},
					{ status: 504 }
				);
			}
			throw err;
		} finally {
			clearTimeout(timeoutId);
		}

		if (deepgramResponse.status === 429) {
			console.warn(`[Deepgram] Rate limited (429) for language=${language}`);
			return json(
				{
					error: isAzerbaijaniRequest
						? "Deepgram's Azerbaijani transcription (Whisper) is busy right now — it's limited to a few requests at a time. Please wait a moment and try again."
						: 'Transcription service is busy right now. Please wait a moment and try again.',
				},
				{ status: 429 }
			);
		}

		if (!deepgramResponse.ok) {
			const errorText = await deepgramResponse.text();
			console.error('[Deepgram] API error:', deepgramResponse.status, errorText);
			return json(
				{ error: 'Deepgram transcription failed', details: errorText },
				{ status: deepgramResponse.status }
			);
		}

		const deepgramData = await deepgramResponse.json();

		// Extract word-level data from Deepgram response.
		// Deepgram normalizes all model outputs (Nova and Whisper alike) into the
		// same results.channels[].alternatives[].words[] shape — each word has
		// { word, punctuated_word, start, end }. Confirmed this holds for
		// whisper-large too (same envelope), but defensively filter out any
		// entries missing numeric start/end in case Whisper ever emits a
		// malformed token, so a single bad entry can't break downstream timing.
		const rawWords: Array<{ word?: string; punctuated_word?: string; start?: number; end?: number }> =
			deepgramData?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

		const words: Array<{ word: string; punctuated_word?: string; start: number; end: number }> = rawWords.filter(
			(w): w is { word: string; punctuated_word?: string; start: number; end: number } =>
				typeof w?.start === 'number' && typeof w?.end === 'number' && typeof (w?.word ?? w?.punctuated_word) === 'string'
		).map((w) => ({ word: w.word ?? w.punctuated_word ?? '', punctuated_word: w.punctuated_word, start: w.start, end: w.end }));

		if (words.length !== rawWords.length) {
			console.warn(`[Deepgram] Filtered ${rawWords.length - words.length} malformed word entries (language=${language})`);
		}

		if (words.length === 0) {
			return json({ error: 'No transcription data returned' }, { status: 422 });
		}

		// Group words into subtitle segments.
		// Strategy: split on natural pauses (gap > 0.4s between words) or every ~8 words max.
		const MAX_WORDS_PER_SEGMENT = 8;
		const PAUSE_THRESHOLD = 0.4; // seconds

		const segments: Array<{
			start: number;
			end: number;
			text: string;
			words: Array<{ word: string; start: number; end: number }>;
		}> = [];

		let currentWords: typeof words = [];
		// Track whether the next word should be capitalized
		// (start of audio, or after sentence-ending punctuation)
		let capitalizeNext = true;

		for (let i = 0; i < words.length; i++) {
			const w = words[i];
			const next = words[i + 1];

			// Apply sentence-case: capitalize first word and words after sentence-ending punctuation
			let wordText = w.punctuated_word ?? w.word;
			if (capitalizeNext && wordText.length > 0) {
				wordText = wordText.charAt(0).toUpperCase() + wordText.slice(1);
			}
			// Check if this word ends with sentence-ending punctuation — next word starts a new sentence
			capitalizeNext = /[.!?]$/.test(wordText);

			currentWords.push({ word: wordText, start: w.start, end: w.end });

			const isLongEnough = currentWords.length >= MAX_WORDS_PER_SEGMENT;
			const isPause = next && (next.start - w.end) > PAUSE_THRESHOLD;
			const isLast = !next;

			if (isLongEnough || isPause || isLast) {
				segments.push({
					start: currentWords[0].start,
					end: currentWords[currentWords.length - 1].end,
					text: currentWords.map(cw => cw.word).join(' '),
					words: [...currentWords],
				});
				currentWords = [];
				// After a long pause, treat the next word as a new sentence start
				if (isPause) capitalizeNext = true;
			}
		}

		console.log(`[Deepgram] Language: ${language}, Transcribed ${words.length} words into ${segments.length} segments`);

		return json({ segments }, { status: 200 });

	} catch (error) {
		console.error('[Deepgram] Server error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal server error', details: message }, { status: 500 });
	}
};
