declare module 'lamejs' {
	export class Mp3Encoder {
		constructor(channels: number, sampleRate: number, bitRate: number);
		encode(samples: number[]): Uint8Array;
		encodeBuffer(samples: Int16Array): Int8Array;
		finish(): Uint8Array;
		flush(): Int8Array;
	}

	export class WavHeader {
		// Not used but exists in the module
	}
}
