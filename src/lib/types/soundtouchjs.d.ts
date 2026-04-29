declare module 'soundtouchjs' {
	export class SoundTouch {
		tempo: number;
		pitch: number;
		rate: number;
		pitchSemitones: number;
		inputBuffer: FifoSampleBuffer;
		outputBuffer: FifoSampleBuffer;
		clear(): void;
		process(): void;
	}

	export class FifoSampleBuffer {
		frameCount: number;
		vector: Float32Array;
		position: number;
		startIndex: number;
		endIndex: number;
		clear(): void;
		put(numFrames: number): void;
		putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
		receive(numFrames: number): void;
		receiveSamples(output: Float32Array, numFrames?: number): void;
		extract(output: Float32Array, position?: number, numFrames?: number): void;
	}

	export class SimpleFilter {
		constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch, callback?: () => void);
		position: number;
		sourcePosition: number;
		extract(target: Float32Array, numFrames?: number): number;
		onEnd(): void;
		clear(): void;
	}

	export class WebAudioBufferSource {
		constructor(buffer: AudioBuffer);
		buffer: AudioBuffer;
		position: number;
		dualChannel: boolean;
		extract(target: Float32Array, numFrames?: number, position?: number): number;
	}

	export class PitchShifter {
		constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);
		tempo: number;
		pitch: number;
		rate: number;
		pitchSemitones: number;
		percentagePlayed: number;
		timePlayed: number;
		formattedTimePlayed: string;
		connect(node: AudioNode): void;
		disconnect(): void;
		on(eventName: string, callback: (detail: unknown) => void): void;
		off(eventName?: string): void;
	}

	export function getWebAudioNode(
		context: AudioContext,
		filter: SimpleFilter,
		sourcePositionCallback?: (position: number) => void,
		bufferSize?: number
	): ScriptProcessorNode;

	export class Stretch {
		tempo: number;
		inputBuffer: FifoSampleBuffer;
		outputBuffer: FifoSampleBuffer;
		clear(): void;
	}

	export class RateTransposer {
		rate: number;
		inputBuffer: FifoSampleBuffer;
		outputBuffer: FifoSampleBuffer;
		clear(): void;
	}

	export class AbstractFifoSamplePipe {
		inputBuffer: FifoSampleBuffer;
		outputBuffer: FifoSampleBuffer;
		clear(): void;
	}
}
