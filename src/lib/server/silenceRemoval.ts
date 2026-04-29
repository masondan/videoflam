/**
 * Server-side silence removal for TTS-generated audio
 * Works at the MP3 frame level to preserve audio quality
 */

export type SilenceLevel = 'default' | 'trim' | 'tight';

export interface SilenceRemovalInput {
	base64Audio: string;
	level: SilenceLevel;
}

export interface SilenceRemovalResult {
	base64Audio: string;
	originalDuration: number;
	processedDuration: number;
	silenceRemoved: number;
}

// Configuration per silence level
const SILENCE_CONFIG: Record<SilenceLevel, {
	energyThreshold: number;  // Energy threshold (0-1, lower = more sensitive)
	minSilenceFrames: number; // Minimum consecutive silent frames to process
	keepFrames: number;       // Frames to keep at boundaries
	compressRatio: number;    // Compression ratio for remaining silence
}> = {
	default: {
		energyThreshold: 0,       // Effectively disabled
		minSilenceFrames: 1000,
		keepFrames: 100,
		compressRatio: 1.0
	},
	trim: {
		energyThreshold: 0.08,    // Moderate threshold
		minSilenceFrames: 15,     // ~400ms at 44.1kHz (1152 samples/frame)
		keepFrames: 6,            // ~150ms
		compressRatio: 0.5
	},
	tight: {
		energyThreshold: 0.12,    // More aggressive
		minSilenceFrames: 10,     // ~250ms
		keepFrames: 3,            // ~80ms
		compressRatio: 0.3
	}
};

interface FrameInfo {
	start: number;
	size: number;
	isSilent: boolean;
}

/**
 * Parse MP3 frames and detect silent ones based on energy levels
 */
function parseMp3Frames(bytes: Uint8Array, energyThreshold: number): FrameInfo[] {
	const frames: FrameInfo[] = [];

	for (let i = 0; i < bytes.length - 4; i++) {
		// Look for MP3 frame sync (0xFF followed by 0xE* or 0xF*)
		if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
			const header = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];

			// MPEG version (bits 19-20)
			const mpegVersion = (header >> 19) & 0x3;
			// Bit rate index (bits 12-15)
			const bitrateIdx = (header >> 12) & 0xf;
			// Sample rate index (bits 10-11)
			const srIdx = (header >> 10) & 0x3;
			// Padding (bit 9)
			const padding = (header >> 9) & 0x1;

			// Sample rate table
			const srTable: Record<number, number[]> = {
				3: [44100, 48000, 32000, 0], // MPEG1
				2: [22050, 24000, 16000, 0], // MPEG2
				0: [11025, 12000, 8000, 0]   // MPEG2.5
			};

			// Bitrate table for MPEG1 Layer 3
			const bitrateTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

			const sr = srTable[mpegVersion]?.[srIdx] || 44100;
			const bitrate = bitrateTable[bitrateIdx] || 128;

			if (bitrate === 0 || sr === 0) continue;

			// Calculate frame size
			const frameSize = Math.floor((144 * bitrate * 1000) / sr + padding);
			if (frameSize <= 0 || frameSize > 2000) continue;

			// Calculate energy level from frame data (skip header)
			const frameStart = i + 4;
			const frameEnd = Math.min(i + frameSize, bytes.length);
			let energy = 0;
			let count = 0;

			for (let j = frameStart; j < frameEnd; j++) {
				const deviation = Math.abs(bytes[j] - 128);
				energy += deviation * deviation;
				count++;
			}

			const rmsEnergy = count > 0 ? Math.sqrt(energy / count) / 128 : 0;
			const isSilent = rmsEnergy < energyThreshold;

			frames.push({
				start: i,
				size: frameSize,
				isSilent
			});

			i += frameSize - 1;
		}
	}

	return frames;
}

interface SilenceSegment {
	startFrame: number;
	endFrame: number;
	frameCount: number;
}

/**
 * Detect consecutive silent frame segments
 */
function detectSilentSegments(frames: FrameInfo[], minSilenceFrames: number): SilenceSegment[] {
	const segments: SilenceSegment[] = [];
	let silenceStart: number | null = null;

	for (let i = 0; i < frames.length; i++) {
		if (frames[i].isSilent) {
			if (silenceStart === null) {
				silenceStart = i;
			}
		} else {
			if (silenceStart !== null) {
				const frameCount = i - silenceStart;
				if (frameCount >= minSilenceFrames) {
					segments.push({
						startFrame: silenceStart,
						endFrame: i,
						frameCount
					});
				}
				silenceStart = null;
			}
		}
	}

	// Handle trailing silence
	if (silenceStart !== null) {
		const frameCount = frames.length - silenceStart;
		if (frameCount >= minSilenceFrames) {
			segments.push({
				startFrame: silenceStart,
				endFrame: frames.length,
				frameCount
			});
		}
	}

	return segments;
}

/**
 * Build output by copying frames, compressing silent segments
 */
function buildCompressedOutput(
	bytes: Uint8Array,
	frames: FrameInfo[],
	segments: SilenceSegment[],
	keepFrames: number,
	compressRatio: number
): Uint8Array {
	if (segments.length === 0) {
		return bytes;
	}

	const outputChunks: Uint8Array[] = [];
	let lastFrameEnd = 0;

	for (const segment of segments) {
		// Copy frames before this silent segment
		for (let i = lastFrameEnd; i < segment.startFrame; i++) {
			const frame = frames[i];
			outputChunks.push(bytes.slice(frame.start, frame.start + frame.size));
		}

		// Calculate which frames to keep from the silent segment
		const silenceFrameCount = segment.endFrame - segment.startFrame;
		const keepAtStart = Math.min(keepFrames, Math.floor(silenceFrameCount / 2));
		const keepAtEnd = Math.min(keepFrames, Math.floor(silenceFrameCount / 2));
		const middleFrameCount = silenceFrameCount - keepAtStart - keepAtEnd;
		const compressedMiddleCount = Math.floor(middleFrameCount * compressRatio);

		// Add frames at start of silence
		for (let i = 0; i < keepAtStart; i++) {
			const frameIdx = segment.startFrame + i;
			const frame = frames[frameIdx];
			outputChunks.push(bytes.slice(frame.start, frame.start + frame.size));
		}

		// Add compressed middle frames (evenly spaced)
		if (compressedMiddleCount > 0 && middleFrameCount > 0) {
			const step = middleFrameCount / compressedMiddleCount;
			for (let i = 0; i < compressedMiddleCount; i++) {
				const srcFrameOffset = Math.floor(i * step);
				const frameIdx = segment.startFrame + keepAtStart + srcFrameOffset;
				if (frameIdx < segment.endFrame - keepAtEnd) {
					const frame = frames[frameIdx];
					outputChunks.push(bytes.slice(frame.start, frame.start + frame.size));
				}
			}
		}

		// Add frames at end of silence
		for (let i = 0; i < keepAtEnd; i++) {
			const frameIdx = segment.endFrame - keepAtEnd + i;
			if (frameIdx < frames.length) {
				const frame = frames[frameIdx];
				outputChunks.push(bytes.slice(frame.start, frame.start + frame.size));
			}
		}

		lastFrameEnd = segment.endFrame;
	}

	// Copy remaining frames after last silent segment
	for (let i = lastFrameEnd; i < frames.length; i++) {
		const frame = frames[i];
		outputChunks.push(bytes.slice(frame.start, frame.start + frame.size));
	}

	// Combine all chunks
	const totalLength = outputChunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of outputChunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

/**
 * Convert Uint8Array to base64
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binaryString = '';
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
		binaryString += String.fromCharCode(...chunk);
	}
	return btoa(binaryString);
}

/**
 * Main function to remove silence from audio
 */
export function removeSilence(input: SilenceRemovalInput): SilenceRemovalResult {
	const { base64Audio, level } = input;

	// If default level, return audio unchanged
	if (level === 'default') {
		return {
			base64Audio,
			originalDuration: 0,
			processedDuration: 0,
			silenceRemoved: 0
		};
	}

	try {
		const config = SILENCE_CONFIG[level];
		
		// Decode base64 to bytes
		const binaryString = atob(base64Audio);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		// Parse MP3 frames and detect silent ones
		const frames = parseMp3Frames(bytes, config.energyThreshold);
		
		if (frames.length === 0) {
			throw new Error('No valid MP3 frames found');
		}

		// Estimate duration (1152 samples per frame at 44100Hz)
		const samplesPerFrame = 1152;
		const sampleRate = 44100;
		const originalDuration = (frames.length * samplesPerFrame) / sampleRate;

		// Detect silent segments
		const silentSegments = detectSilentSegments(frames, config.minSilenceFrames);

		// Build compressed output
		const processedBytes = buildCompressedOutput(
			bytes,
			frames,
			silentSegments,
			config.keepFrames,
			config.compressRatio
		);

		// Count output frames for duration estimate
		const outputFrames = parseMp3Frames(processedBytes, config.energyThreshold);
		const processedDuration = (outputFrames.length * samplesPerFrame) / sampleRate;

		// Convert back to base64
		const processedBase64 = uint8ArrayToBase64(processedBytes);

		return {
			base64Audio: processedBase64,
			originalDuration,
			processedDuration,
			silenceRemoved: originalDuration - processedDuration
		};
	} catch (error) {
		console.error('Silence removal error:', error);
		// Return original on error
		return {
			base64Audio,
			originalDuration: 0,
			processedDuration: 0,
			silenceRemoved: 0
		};
	}
}
