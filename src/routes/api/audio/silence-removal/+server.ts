import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeSilence, type SilenceLevel } from '$lib/server/silenceRemoval';

const VALID_LEVELS: SilenceLevel[] = ['default', 'trim', 'tight'];

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { base64Audio, level } = body;

		if (!base64Audio || typeof base64Audio !== 'string') {
			return json(
				{ error: 'base64Audio is required and must be a string' },
				{ status: 400 }
			);
		}

		if (!level || !VALID_LEVELS.includes(level)) {
			return json(
				{ error: `level must be one of: ${VALID_LEVELS.join(', ')}` },
				{ status: 400 }
			);
		}

		// Check audio size (limit to ~5MB base64 = ~3.75MB raw)
		if (base64Audio.length > 5 * 1024 * 1024) {
			return json(
				{ error: 'Audio file too large. Maximum size is 5MB.' },
				{ status: 400 }
			);
		}

		const result = removeSilence({ base64Audio, level });

		return json({
			audioContent: result.base64Audio,
			originalDuration: result.originalDuration,
			processedDuration: result.processedDuration,
			silenceRemoved: result.silenceRemoved,
			format: 'mp3'
		});
	} catch (error) {
		console.error('Silence removal API error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{ error: 'Silence removal failed', details: message },
			{ status: 500 }
		);
	}
};
