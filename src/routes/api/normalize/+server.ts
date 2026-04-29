import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeMultipleAudios } from '$lib/server/audioNormalize';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { audios } = await request.json();

		if (!audios || !Array.isArray(audios) || audios.length === 0) {
			return json({ error: 'audios array is required and must not be empty' }, { status: 400 });
		}

		if (audios.length > 10) {
			return json(
				{ error: 'Maximum 10 audio segments allowed' },
				{ status: 400 }
			);
		}

		// Validate each audio has required fields
		for (const audio of audios) {
			if (!audio.base64Audio || typeof audio.base64Audio !== 'string') {
				return json(
					{ error: 'Each audio must have base64Audio field' },
					{ status: 400 }
				);
			}
		}

		// Normalize all audios to match peak levels
		const normalizedAudios = normalizeMultipleAudios(
			audios.map((a: any) => ({
				base64Audio: a.base64Audio,
				label: a.label
			}))
		);

		return json({ normalizedAudios });
	} catch (error) {
		console.error('Normalization error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json(
			{ error: 'Normalization failed', details: message },
			{ status: 500 }
		);
	}
};
