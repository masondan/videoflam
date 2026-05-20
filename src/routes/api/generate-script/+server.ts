import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import promptConfig from '$lib/config/scriptGeneratorPrompt.json';

/**
 * POST /api/generate-script
 *
 * Generates a short explainer video script using Gemini Flash.
 *
 * Request body (JSON):
 *   { audience: string, topic: string, duration: '30s' | '1min' | '2min', url?: string }
 *
 * Response:
 *   { script: string, imageSuggestions: string[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	const GEMINI_KEY = env.GEMINI_API_KEY?.trim();

	if (!GEMINI_KEY) {
		return json({ error: 'Gemini API key not configured' }, { status: 500 });
	}

	let body: { audience?: string; topic?: string; duration?: string; url?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { audience = '', topic = '', duration = '1min', url = '' } = body;

	if (!topic.trim()) {
		return json({ error: 'Topic is required' }, { status: 400 });
	}

	// Map duration to approximate word count (speaking pace ~130 wpm)
	const wordTargets: Record<string, number> = {
		'30s': 65,
		'1min': 130,
		'2min': 260,
	};
	const wordTarget = wordTargets[duration] ?? 130;

	// Build system prompt from JSON config
	const systemPrompt = [
		promptConfig.role,
		promptConfig.style.join(' '),
		`Target approximately ${wordTarget} words (spoken at a natural pace).`,
		url.trim() ? promptConfig.sourceGuidance : '',
		promptConfig.format.join('\n'),
	]
		.filter(Boolean)
		.join('\n');

	const userPromptParts = [
		audience.trim() ? `Audience: ${audience.trim()}` : null,
		`Topic / Question: ${topic.trim()}`,
		url.trim() ? `Reference URL: ${url.trim()}` : null,
		`Target duration: ${duration}`,
	];

	const userPrompt = userPromptParts.filter(Boolean).join('\n');

	try {
		const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

		const geminiRes = await fetch(geminiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{
						role: 'user',
						parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
					},
				],
				tools: [{ google_search: {} }],
				generationConfig: {
					temperature: 1.0,
					maxOutputTokens: 1024,
				},
			}),
		});

		if (!geminiRes.ok) {
			const errText = await geminiRes.text();
			console.error('[GenerateScript] Gemini error:', geminiRes.status, errText);
			return json({ error: 'Script generation failed', details: errText }, { status: geminiRes.status });
		}

		const geminiData = await geminiRes.json();
		const rawText: string =
			geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

		if (!rawText) {
			return json({ error: 'No content returned from Gemini' }, { status: 422 });
		}

		// Strip markdown code fences if Gemini wraps the JSON
		const cleaned = rawText
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/\s*```\s*$/, '')
			.trim();

		let parsed: { script: string; imageSuggestions: string[] };
		try {
			parsed = JSON.parse(cleaned);
		} catch {
			// Gemini occasionally returns plain text despite instructions — wrap it
			console.warn('[GenerateScript] Could not parse JSON, returning raw text as script');
			parsed = { script: rawText.trim(), imageSuggestions: [] };
		}

		return json(
			{
				script: parsed.script ?? '',
				imageSuggestions: Array.isArray(parsed.imageSuggestions) ? parsed.imageSuggestions : [],
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[GenerateScript] Server error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Internal server error', details: message }, { status: 500 });
	}
};
