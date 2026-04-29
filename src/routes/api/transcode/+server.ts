import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Transcode endpoint - uploads WebM video to api.video for MP4 conversion
 * Used as fallback for browsers that don't support WebCodecs H.264 encoding (iOS Safari, Firefox)
 * 
 * Flow:
 * 1. Browser exports WebM locally (works everywhere)
 * 2. Browser POSTs WebM blob to this endpoint
 * 3. We upload to api.video for transcoding
 * 4. We poll until ready, then return the MP4 download URL
 */

const APIVIDEO_BASE = 'https://ws.api.video';

// api.video uses Basic auth: base64(apiKey:) - note the colon after the key
function getAuthHeader(apiKey: string): string {
	// In Cloudflare Workers, use btoa; in Node, use Buffer
	const credentials = `${apiKey}:`;
	try {
		return `Basic ${btoa(credentials)}`;
	} catch {
		return `Basic ${Buffer.from(credentials).toString('base64')}`;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const API_KEY = env.APIVIDEO_API_KEY?.trim();
	
	if (!API_KEY) {
		console.error('[Transcode] api.video API key not configured');
		return json({ error: 'Transcoding service not configured' }, { status: 500 });
	}
	
	const authHeader = getAuthHeader(API_KEY);

	try {
		// Get the WebM blob from the request
		const formData = await request.formData();
		const videoFile = formData.get('video') as File | null;
		
		if (!videoFile) {
			return json({ error: 'No video file provided' }, { status: 400 });
		}

		console.log('[Transcode] Received video:', videoFile.size, 'bytes, type:', videoFile.type);

		// Step 1: Create a video object on api.video
		const createResponse = await fetch(`${APIVIDEO_BASE}/videos`, {
			method: 'POST',
			headers: {
				'Authorization': authHeader,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				title: `audioflam-${Date.now()}`,
				mp4Support: true // Ensure MP4 transcoding is enabled
			})
		});

		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			console.error('[Transcode] Failed to create video object:', createResponse.status, errorText);
			return json({ error: 'Failed to initialize transcoding', details: errorText }, { status: 500 });
		}

		const videoObject = await createResponse.json();
		const videoId = videoObject.videoId;
		console.log('[Transcode] Created video object:', videoId);

		// Step 2: Upload the video file
		const uploadFormData = new FormData();
		uploadFormData.append('file', videoFile);

		const uploadResponse = await fetch(`${APIVIDEO_BASE}/videos/${videoId}/source`, {
			method: 'POST',
			headers: {
				'Authorization': authHeader
			},
			body: uploadFormData
		});

		if (!uploadResponse.ok) {
			const errorText = await uploadResponse.text();
			console.error('[Transcode] Failed to upload video:', uploadResponse.status, errorText);
			// Clean up: delete the video object
			await deleteVideo(authHeader, videoId);
			return json({ error: 'Failed to upload video', details: errorText }, { status: 500 });
		}

		console.log('[Transcode] Video uploaded, waiting for transcoding...');

		// Step 3: Poll for transcoding completion (MP4 asset ready)
		const mp4Url = await waitForMp4(authHeader, videoId);
		
		if (!mp4Url) {
			console.error('[Transcode] Transcoding timed out or failed');
			await deleteVideo(authHeader, videoId);
			return json({ error: 'Transcoding timed out' }, { status: 500 });
		}

		console.log('[Transcode] MP4 ready:', mp4Url);

		// Return the MP4 URL - the browser will fetch this directly
		// Also return videoId so we can clean up after download
		return json({ 
			mp4Url, 
			videoId,
			message: 'Transcoding complete'
		});

	} catch (error) {
		console.error('[Transcode] Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Transcoding failed', details: message }, { status: 500 });
	}
};

/**
 * DELETE endpoint to clean up video after download
 * This keeps api.video storage costs at zero
 */
export const DELETE: RequestHandler = async ({ request }) => {
	const API_KEY = env.APIVIDEO_API_KEY?.trim();
	
	if (!API_KEY) {
		return json({ error: 'Service not configured' }, { status: 500 });
	}

	const authHeader = getAuthHeader(API_KEY);

	try {
		const { videoId } = await request.json();
		
		if (!videoId) {
			return json({ error: 'No videoId provided' }, { status: 400 });
		}

		await deleteVideo(authHeader, videoId);
		console.log('[Transcode] Deleted video:', videoId);
		
		return json({ success: true });
	} catch (error) {
		console.error('[Transcode] Delete error:', error);
		return json({ error: 'Failed to delete video' }, { status: 500 });
	}
};

async function deleteVideo(authHeader: string, videoId: string): Promise<void> {
	try {
		await fetch(`${APIVIDEO_BASE}/videos/${videoId}`, {
			method: 'DELETE',
			headers: {
				'Authorization': authHeader
			}
		});
	} catch (e) {
		console.warn('[Transcode] Failed to delete video:', videoId, e);
	}
}

async function waitForMp4(authHeader: string, videoId: string, maxWaitMs = 120000): Promise<string | null> {
	const startTime = Date.now();
	const pollInterval = 2000; // Poll every 2 seconds
	
	while (Date.now() - startTime < maxWaitMs) {
		const statusResponse = await fetch(`${APIVIDEO_BASE}/videos/${videoId}`, {
			headers: {
				'Authorization': authHeader
			}
		});

		if (!statusResponse.ok) {
			console.warn('[Transcode] Status check failed:', statusResponse.status);
			await sleep(pollInterval);
			continue;
		}

		const video = await statusResponse.json();
		
		// Check if MP4 asset URL is available
		if (video.assets?.mp4) {
			// api.video sometimes returns the URL before it's actually downloadable
			// Verify the MP4 is actually accessible with a HEAD request
			const mp4Url = video.assets.mp4;
			console.log('[Transcode] MP4 URL reported:', mp4Url, '- verifying accessibility...');
			
			const headResponse = await fetch(mp4Url, { method: 'HEAD' });
			if (headResponse.ok) {
				console.log('[Transcode] MP4 verified accessible');
				return mp4Url;
			} else {
				console.log('[Transcode] MP4 not yet accessible (status:', headResponse.status, '), continuing to poll...');
				// Don't return yet, keep polling
			}
		}

		// Check encoding status
		const status = video.encoding?.playable;
		console.log('[Transcode] Encoding status:', status, 'elapsed:', Math.round((Date.now() - startTime) / 1000), 's');
		
		if (status === false && video.encoding?.metadata?.error) {
			console.error('[Transcode] Encoding error:', video.encoding.metadata.error);
			return null;
		}

		await sleep(pollInterval);
	}

	return null; // Timed out
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
