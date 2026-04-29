/**
 * Transcription utility — thin wrapper around a Web Worker that runs Whisper.
 * All heavy ML inference runs off the main thread, keeping the UI responsive.
 */

export interface TranscriptionOptions {
	multilingualEnabled: boolean;
	quantized: boolean;
	language: string; // 'auto' or ISO 639-1 code
}

export interface WordTimestamp {
	word: string;
	start: number;
	end: number;
}

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
	words: WordTimestamp[];
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
}

// --- Worker management ---

let worker: Worker | null = null;

function getWorker(): Worker {
	if (!worker) {
		worker = new Worker(
			new URL('./transcription-worker.ts', import.meta.url),
			{ type: 'module' }
		);
	}
	return worker;
}

/**
 * Send a message to the worker and wait for a specific response type.
 */
function workerRequest<T>(
	message: any,
	successTypes: string[],
	onProgress?: (msg: any) => void
): Promise<T> {
	return new Promise((resolve, reject) => {
		const w = getWorker();

		const handler = (e: MessageEvent) => {
			const msg = e.data;

			if (msg.type === 'error') {
				w.removeEventListener('message', handler);
				reject(new Error(msg.error));
				return;
			}

			if (msg.type === 'progress') {
				onProgress?.(msg);
				return;
			}

			if (successTypes.includes(msg.type)) {
				w.removeEventListener('message', handler);
				resolve(msg as T);
			}
		};

		w.addEventListener('message', handler);
		w.postMessage(message);
	});
}

// --- Model name resolution ---

function getModelName(multilingualEnabled: boolean): string {
	return multilingualEnabled
		? 'Xenova/whisper-base'
		: 'Xenova/whisper-base.en';
}

/**
 * Load Whisper model in the worker. Caches across calls.
 */
export async function loadWhisperModel(
	options: TranscriptionOptions,
	onProgress?: (stage: 'downloading' | 'loaded') => void
): Promise<void> {
	const modelName = getModelName(options.multilingualEnabled);

	await workerRequest(
		{ type: 'load', modelName, quantized: options.quantized },
		['loaded'],
		(msg) => {
			if (msg.stage === 'downloading') onProgress?.('downloading');
		}
	);

	onProgress?.('loaded');
}

/**
 * Transcribe audio via the worker.
 * Audio decoding happens on the main thread (Web Audio API not available in workers),
 * then the raw Float32Array is sent to the worker for inference.
 */
export async function transcribeAudio(
	audioBlob: Blob,
	_pipeline: any, // ignored — kept for API compat, worker holds the pipeline
	language: string,
	onProgress?: (partialText: string) => void
): Promise<TranscriptionResult> {
	// Decode and resample to 16kHz mono on the main thread
	const audioData = await decodeToFloat32(audioBlob);

	// Send to worker for inference
	const response = await workerRequest<{ type: string; segments: TranscriptionSegment[] }>(
		{ type: 'transcribe', audioData, language },
		['result']
	);

	const segments = response.segments;
	const fullText = segmentsToParagraphs(segments);
	onProgress?.(fullText);

	return { text: fullText, segments };
}

/**
 * Decode an audio blob to 16kHz mono Float32Array for Whisper.
 */
async function decodeToFloat32(audioBlob: Blob): Promise<Float32Array> {
	const arrayBuffer = await audioBlob.arrayBuffer();

	const tempContext = new AudioContext();
	const decoded = await tempContext.decodeAudioData(arrayBuffer);
	await tempContext.close();

	const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
	const source = offlineCtx.createBufferSource();
	source.buffer = decoded;
	source.connect(offlineCtx.destination);
	source.start(0);
	const resampled = await offlineCtx.startRendering();
	return resampled.getChannelData(0);
}

// --- Paragraph formatting ---

/**
 * Group segments into paragraphs for readability (~30 seconds per paragraph).
 * TTS audio now includes SSML breaks after sentences, creating natural pause points.
 */
function segmentsToParagraphs(segments: TranscriptionSegment[]): string {
	if (segments.length === 0) return '';

	const paragraphs: string[] = [];
	let currentParagraph: string[] = [];
	let paragraphStartTime = segments[0]?.start ?? 0;
	const PARAGRAPH_INTERVAL = 30;

	for (const seg of segments) {
		currentParagraph.push(seg.text);
		const elapsed = seg.end - paragraphStartTime;

		if (elapsed >= PARAGRAPH_INTERVAL && currentParagraph.length >= 2) {
			paragraphs.push(currentParagraph.join(' '));
			currentParagraph = [];
			paragraphStartTime = seg.end;
		}
	}

	if (currentParagraph.length > 0) {
		paragraphs.push(currentParagraph.join(' '));
	}

	return paragraphs.join('\n\n');
}

/**
 * Format transcript with timestamps from segment data.
 * Preserves manual paragraph breaks if they already exist in the transcript text.
 */
export function addTimestampsToTranscript(segments: TranscriptionSegment[], currentText?: string): string {
	if (segments.length === 0) return '';

	const PARAGRAPH_INTERVAL = 30;

	// If the user has manually edited paragraphs, preserve them
	if (currentText && currentText.includes('\n\n')) {
		return preserveManualBreaksWithTimestamps(segments, currentText);
	}

	// Otherwise, auto-generate paragraphs using interval-based logic
	const paragraphs: string[] = [];
	let currentSegments: TranscriptionSegment[] = [];
	let paragraphStartTime = segments[0]?.start ?? 0;

	for (const seg of segments) {
		currentSegments.push(seg);
		const elapsed = seg.end - paragraphStartTime;

		if (elapsed >= PARAGRAPH_INTERVAL && currentSegments.length >= 2) {
			const ts = formatTimestamp(currentSegments[0].start);
			const text = currentSegments.map((s) => s.text).join(' ');
			paragraphs.push(`[${ts}] ${text}`);
			currentSegments = [];
			paragraphStartTime = seg.end;
		}
	}

	if (currentSegments.length > 0) {
		const ts = formatTimestamp(currentSegments[0].start);
		const text = currentSegments.map((s) => s.text).join(' ');
		paragraphs.push(`[${ts}] ${text}`);
	}

	return paragraphs.join('\n\n');
}

/**
 * Add timestamps to manually-edited paragraphs, preserving user's manual breaks.
 */
function preserveManualBreaksWithTimestamps(segments: TranscriptionSegment[], text: string): string {
	// Split text into manually-created paragraphs (already has \n\n breaks)
	const manualParagraphs = text.split('\n\n').map(p => p.trim()).filter(p => p.length > 0);

	// For each manual paragraph, find the first segment and add timestamp
	const timestampedParagraphs: string[] = [];
	let segmentIndex = 0;

	for (const para of manualParagraphs) {
		if (segmentIndex >= segments.length) break;

		// Get timestamp from first segment in this paragraph
		const ts = formatTimestamp(segments[segmentIndex].start);
		const timestampedPara = `[${ts}] ${para}`;
		timestampedParagraphs.push(timestampedPara);

		// Advance segment index past all segments contained in this paragraph
		const paraWords = para.split(/\s+/).length;
		let wordCount = 0;
		while (segmentIndex < segments.length && wordCount < paraWords) {
			wordCount += segments[segmentIndex].text.split(/\s+/).length;
			segmentIndex++;
		}
	}

	return timestampedParagraphs.join('\n\n');
}

function formatTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Calculate word count from transcript text.
 */
export function getWordCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

/**
 * Release cached model in the worker to free memory.
 */
export async function releaseModel(): Promise<void> {
	if (worker) {
		try {
			await workerRequest({ type: 'release' }, ['released']);
		} catch {
			// ignore
		}
	}
}

/**
 * Supported languages for Whisper multilingual model.
 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
	auto: 'Auto-detect language',
	en: 'English',
	yo: 'Yoruba',
	ha: 'Hausa',
	fr: 'French',
	es: 'Spanish',
	pt: 'Portuguese',
	de: 'German',
	it: 'Italian',
	nl: 'Dutch',
	pl: 'Polish',
	ro: 'Romanian',
	sv: 'Swedish',
	da: 'Danish',
	fi: 'Finnish',
	el: 'Greek',
	cs: 'Czech',
	hu: 'Hungarian',
	tr: 'Turkish',
	ar: 'Arabic',
	hi: 'Hindi',
	ja: 'Japanese',
	ko: 'Korean',
	zh: 'Chinese',
	ru: 'Russian',
	uk: 'Ukrainian',
	vi: 'Vietnamese',
	th: 'Thai',
	id: 'Indonesian',
	ms: 'Malay',
	tl: 'Tagalog',
	sw: 'Swahili',
	af: 'Afrikaans',
	ca: 'Catalan',
	cy: 'Welsh',
	bg: 'Bulgarian',
	hr: 'Croatian',
	sk: 'Slovak',
	sl: 'Slovenian',
	lt: 'Lithuanian',
	lv: 'Latvian',
	et: 'Estonian',
	he: 'Hebrew',
	fa: 'Persian',
	ur: 'Urdu',
	bn: 'Bengali',
	ta: 'Tamil',
	te: 'Telugu',
	mr: 'Marathi',
	gu: 'Gujarati',
	kn: 'Kannada',
	ml: 'Malayalam',
	si: 'Sinhala',
	ne: 'Nepali',
	my: 'Myanmar',
	ka: 'Georgian',
	az: 'Azerbaijani',
	uz: 'Uzbek',
	kk: 'Kazakh',
	mn: 'Mongolian',
	bo: 'Tibetan',
	lo: 'Lao',
	km: 'Khmer',
	jw: 'Javanese',
	su: 'Sundanese',
};
