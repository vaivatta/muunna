import type { ConversionBitrate } from "$lib/converters/ffmpeg.svelte";

export { default as Appearance } from "./Appearance.svelte";
export { default as Conversion } from "./Conversion.svelte";
export { default as Privacy } from "./Privacy.svelte";

export interface DefaultFormats {
	image: string;
	audio: string;
	document: string;
}
export interface ISettings {
	filenameFormat: string;
	defaultFormat: DefaultFormats;
	useDefaultFormat: boolean;
	metadata: boolean;
	fathom: boolean;
	magickQuality: number;
	ffmpegQuality: ConversionBitrate;
	ffmpegSampleRate: string;
	ffmpegCustomSampleRate: number;
}

export class Settings {
	public static instance = new Settings();

	public settings: ISettings = $state({
		filenameFormat: "MUUNNA_%name%",
		defaultFormat: {
			image: ".png",
			audio: ".mp3",
			document: ".docx",
		},
		useDefaultFormat: false,
		metadata: true,
		fathom: true,
		magickQuality: 80,
		ffmpegQuality: "auto",
		ffmpegSampleRate: "auto",
		ffmpegCustomSampleRate: 44100,
	});

	public save() {
		localStorage.setItem("settings", JSON.stringify(this.settings));
	}

	public load() {
		try {
			const ls = localStorage.getItem("settings");
			if (!ls) return;
			const settings: ISettings = JSON.parse(ls);
			this.settings = {
				...this.settings,
				...settings,
			};
		} catch {
			// ignore errors, use default settings
		}
	}
}
