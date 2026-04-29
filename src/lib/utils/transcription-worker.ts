/**
 * Web Worker for Whisper transcription.
 * Runs model loading and inference off the main thread to prevent UI freezes.
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

let cachedPipeline: any = null;
let cachedModelKey = '';

interface LoadMessage {
	type: 'load';
	modelName: string;
	quantized: boolean;
}

interface TranscribeMessage {
	type: 'transcribe';
	audioData: Float32Array;
	language: string;
}

interface ReleaseMessage {
	type: 'release';
}

type WorkerMessage = LoadMessage | TranscribeMessage | ReleaseMessage;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const msg = e.data;

	switch (msg.type) {
		case 'load':
			await handleLoad(msg);
			break;
		case 'transcribe':
			await handleTranscribe(msg);
			break;
		case 'release':
			await handleRelease();
			break;
	}
};

async function handleLoad(msg: LoadMessage) {
	const modelKey = `${msg.modelName}:${msg.quantized}`;

	if (cachedPipeline && cachedModelKey === modelKey) {
		self.postMessage({ type: 'loaded' });
		return;
	}

	// Release previous
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}

	self.postMessage({ type: 'progress', stage: 'downloading' });

	try {
		const pipe = await pipeline('automatic-speech-recognition', msg.modelName, {
			dtype: msg.quantized ? 'q8' : 'fp32',
		});

		cachedPipeline = pipe;
		cachedModelKey = modelKey;
		self.postMessage({ type: 'loaded' });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Failed to load model',
		});
	}
}

async function handleTranscribe(msg: TranscribeMessage) {
	if (!cachedPipeline) {
		self.postMessage({ type: 'error', error: 'Model not loaded' });
		return;
	}

	try {
		const transcriptionOptions: any = {
			// Use segment-level timestamps — ONNX whisper-base was not exported
			// with output_attentions=True, so 'word' timestamps are unavailable.
			// Word-level timing is estimated below from segment duration.
			return_timestamps: true,
			chunk_length_s: 5,
			stride_length_s: 1,
		};

		if (msg.language !== 'auto' && msg.language !== 'en') {
			transcriptionOptions.language = msg.language;
		}

		const result = await cachedPipeline(msg.audioData, transcriptionOptions);

		// Extract segments and estimate word-level timestamps from segment duration
	interface Chunk {
		text?: string;
		timestamp?: [number, number];
		words?: Array<{ word: string; start: number; end: number }>;
	}

	const segments: Array<{ text: string; start: number; end: number; words: Array<{ word: string; start: number; end: number }> }> = [];

	if (result.chunks && Array.isArray(result.chunks)) {
		for (const chunk of result.chunks as Chunk[]) {
			const segText = (chunk.text || '').trim();
			if (!segText) continue;

			const segStart = chunk.timestamp?.[0] ?? 0;
			const segEnd = chunk.timestamp?.[1] ?? 0;

			// If the model provided word-level data, use it directly
			if (chunk.words && chunk.words.length > 0) {
				segments.push({
					text: segText,
					start: segStart,
					end: segEnd,
					words: chunk.words,
				});
			} else {
				// Estimate word timestamps weighted by character count.
				// Longer words get proportionally more time than short words,
				// which better reflects natural speech pacing than even division.
				const words = segText.split(/\s+/).filter(Boolean);
				
				// Capitalize first letter of segment and after sentence-ending punctuation
				const capitalizedWords = words.map((word, idx) => {
					if (idx === 0) {
						// Capitalize first word of segment
						return word.charAt(0).toUpperCase() + word.slice(1);
					}
					// Check if previous word ends with sentence-ending punctuation
					const prevWord = words[idx - 1];
					if (prevWord && /[.!?]$/.test(prevWord)) {
						return word.charAt(0).toUpperCase() + word.slice(1);
					}
					return word;
				});
				
				const duration = segEnd - segStart;
				const totalChars = capitalizedWords.reduce((sum, w) => sum + w.length, 0);
				let cursor = segStart;
				const estimatedWords = capitalizedWords.map((word) => {
					const wordDuration = totalChars > 0
						? duration * (word.length / totalChars)
						: duration / words.length;
					const wordStart = cursor;
					const wordEnd = cursor + wordDuration;
					cursor = wordEnd;
					return { word, start: wordStart, end: wordEnd };
				});
				
				// Reconstruct text from capitalized words
				const capitalizedText = capitalizedWords.join(' ');
				segments.push({
					text: capitalizedText,
					start: segStart,
					end: segEnd,
					words: estimatedWords,
				});
			}
		}
	} else {
		const text = (result.text || '').trim();
		segments.push({ text, start: 0, end: 0, words: [] });
	}

	self.postMessage({ type: 'result', segments });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Transcription failed',
		});
	}
}

async function handleRelease() {
	if (cachedPipeline) {
		try {
			await cachedPipeline.dispose();
		} catch {
			// ignore
		}
		cachedPipeline = null;
		cachedModelKey = '';
	}
	self.postMessage({ type: 'released' });
}
