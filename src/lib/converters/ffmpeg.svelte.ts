import { VertFile } from "$lib/types";
import { Converter, FormatInfo } from "./converter.svelte";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { browser } from "$app/environment";
import { error, log } from "$lib/util/logger";
import { m } from "$lib/paraglide/messages";
import { Settings } from "$lib/sections/settings/index.svelte";
import { ToastManager } from "$lib/util/toast.svelte";

export class FFmpegConverter extends Converter {
	private ffmpeg: FFmpeg = null!;
	public name = "ffmpeg";
	public ready = $state(false);

	private activeConversions = new Map<string, FFmpeg>();

	public supportedFormats = [
		new FormatInfo("mp3", true, true),
		new FormatInfo("wav", true, true),
		new FormatInfo("flac", true, true),
		new FormatInfo("ogg", true, true),
		new FormatInfo("mogg", true, false),
		new FormatInfo("oga", true, true),
		new FormatInfo("opus", true, true),
		new FormatInfo("aac", true, true),
		new FormatInfo("alac", true, true), // outputted as m4a
		new FormatInfo("m4a", true, true), // can be alac
		new FormatInfo("caf", true, false), // can be alac
		new FormatInfo("wma", true, true),
		new FormatInfo("amr", true, true),
		new FormatInfo("ac3", true, true),
		new FormatInfo("aiff", true, true),
		new FormatInfo("aifc", true, true),
		new FormatInfo("aif", true, true),
		new FormatInfo("mp1", true, false),
		new FormatInfo("mp2", true, true),
		new FormatInfo("mpc", true, false), // unknown if it works, can't find sample file but ffmpeg should support i think?
		//new FormatInfo("raw", true, false), // usually pcm
		new FormatInfo("dsd", true, false), // dsd
		new FormatInfo("dsf", true, false), // dsd
		new FormatInfo("dff", true, false), // dsd
		new FormatInfo("mqa", true, false),
		new FormatInfo("au", true, true),
		new FormatInfo("m4b", true, true),
		new FormatInfo("voc", true, true),
		new FormatInfo("weba", true, true),
	];

	public readonly reportsProgress = true;

	constructor() {
		super();
		log(["converters", this.name], `created converter`);
		if (!browser) return;
		try {
			// this is just to cache the wasm and js for when we actually use it. we're not using this ffmpeg instance
			this.ffmpeg = new FFmpeg();
			(async () => {
				const baseURL =
					"https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

				this.status = "downloading";

				await this.ffmpeg.load({
					coreURL: `${baseURL}/ffmpeg-core.js`,
					wasmURL: `${baseURL}/ffmpeg-core.wasm`,
				});

				this.status = "ready";
			})();
		} catch (err) {
			error(["converters", this.name], `Error loading ffmpeg: ${err}`);
			this.status = "error";
			ToastManager.add({
				type: "error",
				message: m["workers.errors.ffmpeg"](),
			});
		}
	}

	public async convert(input: VertFile, to: string): Promise<VertFile> {
		if (!to.startsWith(".")) to = `.${to}`;

		const isAlac = to === ".alac";
		if (isAlac) to = ".m4a";

		let conversionError: string | null = null;
		const ffmpeg = await this.setupFFmpeg(input);

		this.activeConversions.set(input.id, ffmpeg);

		// listen for errors during conversion
		const errorListener = (l: { message: string }) => {
			const msg = l.message;
			if (
				msg.includes("Specified sample rate") &&
				msg.includes("is not supported")
			) {
				const rate = Settings.instance.settings.ffmpegCustomSampleRate;
				conversionError = m["workers.errors.invalid_rate"]({
					rate,
				});
			} else if (msg.includes("Stream map '0:a:0' matches no streams.")) {
				conversionError = m["workers.errors.no_audio"]();
			} else if (
				msg.includes("Error initializing output stream") ||
				msg.includes("Error while opening encoder") ||
				msg.includes("Error while opening decoder") ||
				(msg.includes("Error") && msg.includes("stream")) ||
				msg.includes("Conversion failed!")
			) {
				// other general errors
				if (!conversionError) conversionError = msg;
			}
		};

		ffmpeg.on("log", errorListener);

		const buf = new Uint8Array(await input.file.arrayBuffer());
		await ffmpeg.writeFile("input", buf);
		log(
			["converters", this.name],
			`wrote ${input.name} to ffmpeg virtual fs`,
		);

		const command = await this.buildConversionCommand(
			ffmpeg,
			input,
			to,
			isAlac,
		);
		log(["converters", this.name], `FFmpeg command: ${command.join(" ")}`);
		await ffmpeg.exec(command);
		log(["converters", this.name], "executed ffmpeg command");

		if (conversionError) {
			ffmpeg.off("log", errorListener);
			ffmpeg.terminate();
			throw new Error(conversionError);
		}

		const output = (await ffmpeg.readFile(
			"output" + to,
		)) as unknown as Uint8Array;

		if (!output || output.length === 0) {
			ffmpeg.off("log", errorListener);
			ffmpeg.terminate();
			throw new Error("empty file returned");
		}

		const outputFileName =
			input.name.split(".").slice(0, -1).join(".") + to;
		log(
			["converters", this.name],
			`read ${outputFileName} from ffmpeg virtual fs`,
		);

		ffmpeg.off("log", errorListener);
		ffmpeg.terminate();

		const outBuf = new Uint8Array(output).buffer.slice(0);
		return new VertFile(new File([outBuf], outputFileName), to);
	}

	public async cancel(input: VertFile): Promise<void> {
		const ffmpeg = this.activeConversions.get(input.id);
		if (!ffmpeg) {
			error(
				["converters", this.name],
				`no active conversion found for file ${input.name}`,
			);
			return;
		}

		log(
			["converters", this.name],
			`cancelling conversion for file ${input.name}`,
		);

		ffmpeg.terminate();
		this.activeConversions.delete(input.id);
	}

	private async setupFFmpeg(input: VertFile): Promise<FFmpeg> {
		const ffmpeg = new FFmpeg();

		ffmpeg.on("progress", (progress) => {
			input.progress = progress.progress * 100;
		});

		ffmpeg.on("log", (l) => {
			log(["converters", this.name], l.message);
		});

		const baseURL =
			"https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
		await ffmpeg.load({
			coreURL: `${baseURL}/ffmpeg-core.js`,
			wasmURL: `${baseURL}/ffmpeg-core.wasm`,
		});

		return ffmpeg;
	}

	private async detectAudioBitrate(ffmpeg: FFmpeg): Promise<number | null> {
		const args = [
			"-v",
			"quiet",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=bit_rate",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			"input",
		];

		try {
			let bitrate: number | null = null;

			const bitrateListener = (event: { message: string }) => {
				if (bitrate !== null) return;
				const n = parseInt(event.message.trim(), 10);
				if (!n) return;
				bitrate = Math.round(n / 1000);
				log(
					["converters", this.name],
					`Detected stream audio bitrate: ${bitrate} kbps`,
				);
			};

			ffmpeg.on("log", bitrateListener);

			try {
				await ffmpeg.ffprobe.call(ffmpeg, args);
				return bitrate;
			} finally {
				ffmpeg.off("log", bitrateListener);
			}
		} catch {
			return null;
		}
	}

	private async detectAudioSampleRate(
		ffmpeg: FFmpeg,
	): Promise<number | null> {
		const args = [
			"-v",
			"quiet",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=sample_rate",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			"input",
		];

		try {
			let sampleRate: number | null = null;

			const sampleRateListener = (event: { message: string }) => {
				if (sampleRate !== null) return;
				const n = parseInt(event.message.trim(), 10);
				if (!n) return;
				sampleRate = n;
				log(
					["converters", this.name],
					`Detected stream audio sample rate: ${sampleRate} Hz`,
				);
			};

			ffmpeg.on("log", sampleRateListener);

			try {
				await ffmpeg.ffprobe.call(ffmpeg, args);
				return sampleRate;
			} finally {
				ffmpeg.off("log", sampleRateListener);
			}
		} catch {
			return null;
		}
	}

	private async buildConversionCommand(
		ffmpeg: FFmpeg,
		input: VertFile,
		to: string,
		isAlac: boolean = false,
	): Promise<string[]> {
		const inputFormat = input.from.slice(1);
		const outputFormat = to.slice(1);
		const m4a = isAlac || to === ".m4a";

		const lossless = [
			"flac",
			"m4a",
			"caf",
			"alac",
			"wav",
			"dsd",
			"dsf",
			"dff",
		];
		const userSetting = Settings.instance.settings.ffmpegQuality;
		const userSampleRate = Settings.instance.settings.ffmpegSampleRate;
		const customSampleRate =
			Settings.instance.settings.ffmpegCustomSampleRate ?? 44100;
		const keepMetadata = Settings.instance.settings.metadata;

		let audioBitrateArgs: string[] = [];
		let sampleRateArgs: string[] = [];
		let metadataArgs: string[] = [];
		let m4aArgs: string[] = [];

		log(["converters", this.name], `keep metadata: ${keepMetadata}`);
		if (!keepMetadata) {
			metadataArgs = [
				"-map_metadata", // remove metadata
				"-1",
				"-map_chapters", // remove chapters
				"-1",
				"-map", // remove cover art
				"a",
			];
		}

		const isLosslessToLossy =
			lossless.includes(inputFormat) && !lossless.includes(outputFormat);
		if (userSetting !== "auto") {
			// user's setting
			audioBitrateArgs = ["-b:a", `${userSetting}k`];
			log(
				["converters", this.name],
				`using user setting for audio bitrate: ${userSetting}`,
			);
		} else {
			// detect bitrate of original file and use
			if (isLosslessToLossy) {
				// use safe default
				audioBitrateArgs = ["-b:a", "128k"];
				log(
					["converters", this.name],
					`converting from lossless to lossy, using default audio bitrate: 128k`,
				);
			} else {
				const inputBitrate = await this.detectAudioBitrate(ffmpeg);
				audioBitrateArgs = inputBitrate
					? ["-b:a", `${inputBitrate}k`]
					: [];
				log(
					["converters", this.name],
					`using detected audio bitrate: ${inputBitrate}k`,
				);
			}
		}

		// sample rate setting
		if (userSampleRate !== "auto") {
			const rate =
				userSampleRate === "custom"
					? customSampleRate.toString()
					: userSampleRate;
			sampleRateArgs = ["-ar", rate];
			log(
				["converters", this.name],
				`using user setting for sample rate: ${rate}`,
			);
		} else {
			// detect sample rate of original file and use
			if (isLosslessToLossy) {
				// use safe default
				const defaultRate = to === ".opus" ? "48000" : "44100";
				log(
					["converters", this.name],
					`converting from lossless to lossy, using default sample rate: ${defaultRate}Hz`,
				);
				sampleRateArgs = ["-ar", defaultRate];
			} else {
				let inputSampleRate = await this.detectAudioSampleRate(ffmpeg);
				if (to === ".opus" && inputSampleRate === 44100) {
					// special case: opus does not support 44100Hz which is more common - adjust to 48000Hz
					log(
						["converters", this.name],
						"conversion to opus with 44100Hz sample rate detected, adjusting to 48000Hz",
					);
					inputSampleRate = 48000;
				}

				sampleRateArgs = inputSampleRate
					? ["-ar", inputSampleRate.toString()]
					: [];
				log(
					["converters", this.name],
					`using detected audio sample rate: ${inputSampleRate}Hz`,
				);
			}
		}

		log(
			["converters", this.name],
			`Converting audio ${input.from} to audio ${to}`,
		);
		const audioCodec = getAudioCodec(to, isAlac);
		if (m4a && keepMetadata) m4aArgs = ["-c:v", "copy"]; // for album art

		return [
			"-i",
			"input",
			...m4aArgs,
			"-c:a",
			audioCodec,
			...metadataArgs,
			...audioBitrateArgs,
			...sampleRateArgs,
			"output" + to,
		];
	}

}

const getAudioCodec = (ext: string, isAlac: boolean = false): string => {
	switch (ext) {
		case ".mp3":
			return "libmp3lame";
		case ".flac":
			return "flac";
		case ".wav":
			return "pcm_s16le";
		case ".ogg":
		case ".oga":
			return "libvorbis";
		case ".opus":
			return "libopus";
		case ".aac":
			return "aac";
		case ".m4a":
			return isAlac ? "alac" : "aac";
		case ".alac":
			return "alac";
		case ".wma":
			return "wmav2";
		default:
			return "aac";
	}
};

export const CONVERSION_BITRATES = [
	"auto",
	320,
	256,
	192,
	128,
	96,
	64,
	32,
] as const;
export type ConversionBitrate = (typeof CONVERSION_BITRATES)[number];

export const SAMPLE_RATES = [
	"auto",
	"custom",
	"48000",
	"44100",
	"32000",
	"22050",
	"16000",
	"11025",
	"8000",
] as const;
export type SampleRate = (typeof SAMPLE_RATES)[number];
