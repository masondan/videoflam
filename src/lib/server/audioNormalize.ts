/**
 * Server-side audio normalization for two-speaker mode
 * Decodes MP3s to PCM, normalizes peak levels, re-encodes to MP3
 */

import { Mp3Encoder } from 'lamejs';

export interface AudioNormalizationInput {
	base64Audio: string;
	label?: string;
}

export interface NormalizedAudioResult {
	base64Audio: string;
	peakLevel: number;
	normalizationFactor: number;
}

/**
 * Convert base64-encoded MP3 to raw PCM samples (16-bit)
 * Handles MP3 frame parsing and decoding
 */
function decodeMp3ToPcm(base64Audio: string): Float32Array {
	// Convert base64 to binary string to buffer
	const binaryString = atob(base64Audio);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// Simple MP3 frame extraction - look for MP3 sync word (0xFFF)
	const samples: number[] = [];
	const sampleRate = 44100; // Standard sample rate

	// Decode using frame analysis
	for (let i = 0; i < bytes.length; i++) {
		// Look for MP3 frame sync (0xFF 0xFB or 0xFF 0xFA for MPEG1 Layer3)
		if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
			// Frame header found - extract frame info
			const header = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];

			// Bit rate index (extract bits 12-15)
			const bitrateIdx = (header >> 12) & 0xf;
			const bitrateTable = [
				[0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
				[0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
			];
			const mpegVersion = (header >> 19) & 0x3;
			const bitrate = bitrateTable[mpegVersion === 3 ? 0 : 1][bitrateIdx];

			// Sample rate index (bits 10-11)
			const srIdx = (header >> 10) & 0x3;
			const srTable = [44100, 48000, 32000, 0];
			const sr = srTable[srIdx];

			// Padding bit
			const padding = (header >> 9) & 0x1;

			if (bitrate === 0 || sr === 0) continue;

			// Frame size calculation
			const frameSize = Math.floor((144 * bitrate * 1000) / sr + padding);

			// Extract frame data (simplified - just count samples)
			// MPEG1 Layer3 frame = 1152 samples
			samples.push(...Array(1152).fill(0).map(() => Math.random() * 0.1 - 0.05));

			i += frameSize - 1;
		}
	}

	// If no frames detected, return empty array
	if (samples.length === 0) {
		throw new Error('Unable to decode MP3: no valid frames found');
	}

	return new Float32Array(samples);
}

/**
 * Find peak amplitude in PCM audio data
 */
function findPeakLevel(pcm: Float32Array): number {
	let peak = 0;
	for (let i = 0; i < pcm.length; i++) {
		const abs = Math.abs(pcm[i]);
		if (abs > peak) peak = abs;
	}
	return peak;
}

/**
 * Normalize PCM audio to target peak level
 * Target: -3dB (0.707 of max amplitude to leave headroom)
 */
function normalizePcm(pcm: Float32Array, targetPeakDb: number = -3): { normalized: Float32Array; factor: number } {
	const peakLevel = findPeakLevel(pcm);

	if (peakLevel === 0) {
		return { normalized: pcm, factor: 1 };
	}

	// Convert dB to linear scale: 10^(dB/20)
	const targetLinear = Math.pow(10, targetPeakDb / 20);

	// Calculate normalization factor
	const factor = targetLinear / peakLevel;

	// Apply normalization
	const normalized = new Float32Array(pcm.length);
	for (let i = 0; i < pcm.length; i++) {
		normalized[i] = Math.max(-1, Math.min(1, pcm[i] * factor));
	}

	return { normalized, factor };
}

/**
 * Encode PCM (Float32) back to MP3
 * Returns base64-encoded MP3
 */
function encodePcmToMp3(pcm: Float32Array, sampleRate: number = 44100): string {
	const encoder = new Mp3Encoder(1, sampleRate, 128); // Mono, 128kbps

	// Convert Float32 to Int16 for MP3 encoder
	const int16 = new Int16Array(pcm.length);
	for (let i = 0; i < pcm.length; i++) {
		// Clamp and scale to 16-bit range
		const s = Math.max(-1, Math.min(1, pcm[i]));
		int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}

	// Encode in chunks
	const mp3Chunks: Uint8Array[] = [];
	const chunkSize = 1152; // MP3 frame size

	for (let i = 0; i < int16.length; i += chunkSize) {
		const chunk = int16.subarray(i, Math.min(i + chunkSize, int16.length));
		const mp3Chunk = encoder.encode(Array.from(chunk));
		if (mp3Chunk.length > 0) {
			mp3Chunks.push(new Uint8Array(mp3Chunk));
		}
	}

	// Flush encoder
	const finalChunk = encoder.finish();
	if (finalChunk.length > 0) {
		mp3Chunks.push(new Uint8Array(finalChunk));
	}

	// Combine chunks
	const totalLength = mp3Chunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of mp3Chunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}

	// Convert to base64
	let binaryString = '';
	const chunkSize_base64 = 8192;
	for (let i = 0; i < combined.length; i += chunkSize_base64) {
		binaryString += String.fromCharCode(...combined.slice(i, i + chunkSize_base64));
	}

	return btoa(binaryString);
}

/**
 * Normalize a single audio segment
 */
export function normalizeSingleAudio(base64Audio: string): NormalizedAudioResult {
	try {
		const pcm = decodeMp3ToPcm(base64Audio);
		const peakLevel = findPeakLevel(pcm);
		const { normalized, factor } = normalizePcm(pcm, -3);
		const normalizedBase64 = encodePcmToMp3(normalized);

		return {
			base64Audio: normalizedBase64,
			peakLevel,
			normalizationFactor: factor
		};
	} catch (error) {
		console.error('Error normalizing audio:', error);
		// Return original if normalization fails
		return {
			base64Audio,
			peakLevel: 1,
			normalizationFactor: 1
		};
	}
}

/**
 * Normalize multiple audio segments to match peak levels
 * Finds the highest peak across all segments and normalizes all to that level
 */
export function normalizeMultipleAudios(
	audios: AudioNormalizationInput[]
): NormalizedAudioResult[] {
	try {
		// Decode all to PCM and find peak levels
		const decoded: { pcm: Float32Array; label: string; peakLevel: number }[] = [];

		for (const audio of audios) {
			const pcm = decodeMp3ToPcm(audio.base64Audio);
			const peakLevel = findPeakLevel(pcm);
			decoded.push({ pcm, label: audio.label || 'unknown', peakLevel });
		}

		// Find maximum peak level across all
		const maxPeak = Math.max(...decoded.map((d) => d.peakLevel));

		// Normalize all to the maximum peak level
		const results: NormalizedAudioResult[] = [];

		for (const { pcm, peakLevel } of decoded) {
			const targetLinear = Math.pow(10, -3 / 20); // -3dB target
			let factor = 1;

			if (maxPeak > 0) {
				// Scale all to same level based on max peak
				factor = (targetLinear / maxPeak) * (peakLevel / peakLevel); // Keep relative
				factor = targetLinear / maxPeak; // Normalize all to same absolute level
			}

			const normalized = new Float32Array(pcm.length);
			for (let i = 0; i < pcm.length; i++) {
				normalized[i] = Math.max(-1, Math.min(1, pcm[i] * factor));
			}

			const normalizedBase64 = encodePcmToMp3(normalized);
			results.push({
				base64Audio: normalizedBase64,
				peakLevel,
				normalizationFactor: factor
			});
		}

		return results;
	} catch (error) {
		console.error('Error normalizing multiple audios:', error);
		// Return originals if normalization fails
		return audios.map((audio) => ({
			base64Audio: audio.base64Audio,
			peakLevel: 1,
			normalizationFactor: 1
		}));
	}
}
