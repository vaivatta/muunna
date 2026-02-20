import { browser } from "$app/environment";
import { byNative, converters } from "$lib/converters";
import { error, log } from "$lib/util/logger";
import { VertFile } from "$lib/types";
import { parseBlob, selectCover } from "music-metadata";
import { writable } from "svelte/store";
import PQueue from "p-queue";
import { getLocale, setLocale } from "$lib/paraglide/runtime";
import { m } from "$lib/paraglide/messages";
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_URI_SCHEMES = /^(https?|mailto|blob):/i;
if (typeof DOMPurify.addHook === "function") {
	DOMPurify.addHook("afterSanitizeAttributes", (node) => {
		if (node.hasAttribute("href")) {
			const href = node.getAttribute("href") ?? "";
			if (!ALLOWED_URI_SCHEMES.test(href)) {
				node.removeAttribute("href");
			}
		}
	});
}
import { ToastManager } from "$lib/util/toast.svelte";
import { GB } from "$lib/util/consts";

class Files {
	public files = $state<VertFile[]>([]);

	public requiredConverters = $derived(
		Array.from(new Set(files.files.map((f) => f.converters).flat())),
	);

	public ready = $derived(
		this.files.length === 0
			? false
			: this.requiredConverters.every((f) => f?.status === "ready") &&
					this.files.every((f) => !f.processing),
	);
	public results = $derived(
		this.files.length === 0 ? false : this.files.every((f) => f.result),
	);

	private thumbnailQueue = new PQueue({
		concurrency: browser ? navigator.hardwareConcurrency || 4 : 4,
	});

	private _addThumbnail = async (file: VertFile) => {
		this.thumbnailQueue.add(async () => {
			const isAudio = converters
				.find((c) => c.name === "ffmpeg")
				?.supportedFormats.filter((f) => f.isNative)
				.map((f) => f.name)
				?.includes(file.from.toLowerCase());

			try {
				if (isAudio) {
					const { common } = await parseBlob(file.file, {
						skipPostHeaders: true,
					});
					const cover = selectCover(common.picture);
					if (cover) {
						const arrayBuffer =
							cover.data.buffer instanceof ArrayBuffer
								? cover.data.buffer
								: new Uint8Array(cover.data).buffer;
						const blob = new Blob([new Uint8Array(arrayBuffer)], {
							type: cover.format,
						});
						file.blobUrl = URL.createObjectURL(blob);
					}
				} else {
					file.blobUrl = await this._generateImageThumbnail(
						file.file,
					);
				}
			} catch (e) {
				error(["files"], e);
			}
		});
	};

	private async _generateImageThumbnail(
		file: File,
	): Promise<string | undefined> {
		const maxSize = 180;
		const img = new Image();
		img.src = URL.createObjectURL(file);

		await new Promise((resolve, reject) => {
			img.onload = resolve;
			img.onerror = reject;
		});

		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return undefined;

		const scale = Math.max(maxSize / img.width, maxSize / img.height);
		canvas.width = img.width * scale;
		canvas.height = img.height * scale;
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const isTransparent = Array.from(imageData.data).every((value, index) => {
			return (index + 1) % 4 !== 0 || value === 0;
		});
		if (isTransparent) {
			canvas.remove();
			return undefined;
		}

		const url = canvas.toDataURL();
		canvas.remove();
		return url;
	}

	private async _handleZipFile(file: File): Promise<void> {
		try {
			log(["files"], `extracting zip file: ${file.name}`);
			ToastManager.add({
				type: "info",
				message: m["convert.archive_file.extracting"]({
					filename: file.name,
				}),
			});

			const { extractZip } = await import("$lib/util/zip");
			const entries = await extractZip(file);

			const totalEntries = entries.length;
			log(["files"], `extracted ${totalEntries} files from zip`);

			// check if all files in zip use the same converter and are compatible
			const convertersUsed = new Set<string>();
			let incompatibleFiles = false;

			for (const { filename } of entries) {
				const format = "." + filename.split(".").pop()?.toLowerCase();
				if (!format || format === ".zip") {
					incompatibleFiles = true;
					continue;
				}

				const converter = converters
					.sort(byNative(format))
					.find((c) => c.formatStrings().includes(format));

				if (converter) convertersUsed.add(converter.name);
				else incompatibleFiles = true;
			}

			const converterCount = convertersUsed.size;
			const canConvertAsOne = converterCount === 1 && !incompatibleFiles;

			log(
				["files"],
				`extracted ${entries.length} files from zip (converters: ${converterCount}, compatible: ${canConvertAsOne})`,
			);

			if (canConvertAsOne) {
				// all files use same converter - add zip as a single VertFile file
				const vf = new VertFile(file, ".zip");
				vf.converters = converters.filter(
					(c) => c.name === Array.from(convertersUsed)[0],
				);

				const converterName = vf.converters[0].name;
				const type =
					converterName === "imagemagick"
						? "image"
						: converterName === "ffmpeg"
							? "audio"
							: "doc";

				this.files.push(vf);
				this._addThumbnail(vf);

				ToastManager.add({
					type: "success",
					message: m["convert.archive_file.detected"]({
						type: m[`convert.archive_file.${type}`](),
						filename: file.name,
					}),
				});
			} else {
				// mixed converters/incompatible files - extract all individually
				for (const { filename, data } of entries) {
					this._add(
						new File([new Uint8Array(data)], filename, {
							type: "application/octet-stream",
						}),
					);
				}

				ToastManager.add({
					type: "success",
					message: m["convert.archive_file.extracted"]({
						filename: file.name,
						extract_count: entries.length,
						ignore_count: 0,
					}),
				});
			}
		} catch (e) {
			error(["files"], `error processing zip file: ${e}`);
			throw e;
		}
	}

	private async _add(file: VertFile | File) {
		if (file instanceof VertFile) {
			this.files.push(file);
			this._addThumbnail(file);
		} else {
			// if zip, extract and add contents
			const isZip =
				file.name.toLowerCase().endsWith(".zip") ||
				file.type === "application/zip" ||
				file.type === "application/x-zip-compressed";

			if (isZip) {
				try {
					await this._handleZipFile(file);
					return;
				} catch (err) {
					error(["files"], `error extracting zip file: ${err}`);
					ToastManager.add({
						type: "error",
						message: m["convert.archive_file.extract_error"]({
							filename: file.name,
							error: String(err),
						}),
					});
					return;
				}
			}

			// regular files
			const format = "." + file.name.split(".").pop()?.toLowerCase();
			if (!format) {
				log(["files"], `no extension found for ${file.name}`);
				return;
			}
			const converter = converters
				.sort(byNative(format))
				.find((converter) => converter.formatStrings().includes(format));
			if (!converter) {
				log(["files"], `no converter found for ${file.name}`);
				this.files.push(new VertFile(file, format));
				return;
			}
			const to = converter.formatStrings().find((f) => f !== format);
			if (!to) {
				log(["files"], `no output format found for ${file.name}`);
				return;
			}
			const vf = new VertFile(file, to);
			this.files.push(vf);
			this._addThumbnail(vf);
		}
	}

	public add(file: VertFile | null | undefined): void;
	public add(file: File | null | undefined): void;
	public add(file: File[] | null | undefined): void;
	public add(file: VertFile[] | null | undefined): void;
	public add(file: FileList | null | undefined): void;
	public add(
		file: VertFile | File | VertFile[] | File[] | FileList | null | undefined,
	) {
		if (!file) return;
		if (Array.isArray(file) || file instanceof FileList) {
			for (const f of file) {
				this._add(f);
			}
		} else {
			this._add(file);
		}
	}

	public async convertAll() {
		const promiseFns = this.files.map((f) => () => f.convert());
		const coreCount = navigator.hardwareConcurrency || 4;
		const queue = new PQueue({ concurrency: coreCount });
		await Promise.all(promiseFns.map((fn) => queue.add(fn)));
	}

	public async downloadAll() {
		if (files.files.length === 0) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dlFiles: any[] = [];
		for (let i = 0; i < files.files.length; i++) {
			const file = files.files[i];
			const result = file.result;

			if (!result) {
				error(["files"], "No result found");
				continue;
			}

			let to = result.to;
			if (!to.startsWith(".")) to = `.${to}`;

			dlFiles.push({
				name: file.file.name.replace(/\.[^/.]+$/, "") + to,
				lastModified: Date.now(),
				input: await result.file.arrayBuffer(),
			});
		}
		const { downloadZip } = await import("client-zip");
		const blob = await downloadZip(dlFiles, "converted.zip").blob();
		const url = URL.createObjectURL(blob);

		const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
		const filenameFormat = settings.filenameFormat || "vaivatta_%name%";

		const format = (name: string) => {
			const date = new Date().toISOString();
			return name
				.replace(/%date%/g, date)
				.replace(/%name%/g, "Multi")
				.replace(/%extension%/g, "");
		};

		const a = document.createElement("a");
		a.href = url;
		a.download = `${format(filenameFormat)}.zip`;
		a.click();
		URL.revokeObjectURL(url);
		a.remove();
	}
}

export function setTheme(themeTo: "light" | "dark") {
	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(themeTo);
	localStorage.setItem("theme", themeTo);
	log(["theme"], `set to ${themeTo}`);
	theme.set(themeTo);

	// Lock dark reader if it's set to dark mode
	if (themeTo === "dark") {
		const lock = document.createElement("meta");
		lock.name = "darkreader-lock";
		document.head.appendChild(lock);
	} else {
		const lock = document.querySelector('meta[name="darkreader-lock"]');
		if (lock) lock.remove();
	}
}

export function setEffects(effectsEnabled: boolean) {
	localStorage.setItem("effects", effectsEnabled.toString());
	log(["effects"], `set to ${effectsEnabled}`);
	effects.set(effectsEnabled);
}

export const files = new Files();
export const showGradient = writable(true);
export const gradientColor = writable("");
export const goingLeft = writable(false);
export const dropping = writable(false);
export const dropdownStates = writable<Record<string, string>>({});

export const isMobile = writable(false);
export const effects = writable(true);
export const theme = writable<"light" | "dark">("light");
export const locale = writable(getLocale());
export const availableLocales = {
	en: "English",
	fi: "Suomi",
};

export function updateLocale(newLocale: string) {
	if (!Object.keys(availableLocales).includes(newLocale)) newLocale = "en";

	log(["locale"], `set to ${newLocale}`);
	localStorage.setItem("locale", newLocale);
	// @ts-expect-error shush
	setLocale(newLocale, { reload: false });
	// @ts-expect-error shush
	locale.set(newLocale);
}

export function link(
	tag: string | string[],
	text: string,
	links: string | string[],
	newTab?: boolean | boolean[],
	className?: string | string[],
) {
	if (!text) return "";

	const tags = Array.isArray(tag) ? tag : [tag];
	const linksArr = Array.isArray(links) ? links : [links];
	const newTabArr = Array.isArray(newTab) ? newTab : [newTab];
	const classArr = Array.isArray(className) ? className : [className];

	let result = text;

	tags.forEach((t, i) => {
		const link = linksArr[i] ?? "#";
		const target = newTabArr[i]
			? 'target="_blank" rel="noopener noreferrer"'
			: "";
		const cls = classArr[i] ? `class="${classArr[i]}"` : "";

		const regex = new RegExp(`\\[${t}\\](.*?)\\[\\/${t}\\]`, "g");
		result = result.replace(
			regex,
			(_, inner) => `<a href="${link}" ${target} ${cls} >${inner}</a>`,
		);
	});

	return result;
}

export function sanitize(
	html: string,
	allowedTags: string[] = ["a", "b", "code", "br"],
): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: ["href", "target", "rel", "class"],
	});
}

/**
 * Binary search for a max value without knowing the exact value, only that it
 * can be under or over It dose not test every number but instead looks for
 * 1,2,4,8,16,32,64,128,96,95 to figure out that you thought about #96 from
 * 0-infinity
 *
 * @example findFirstPositive(x => matchMedia(`(max-resolution: ${x}dpi)`).matches)
 * @author Jimmy Wärting
 * @see {@link https://stackoverflow.com/a/72124984/1008999}
 * @param {function} f The function to run the test on (should return truthy or falsy values)
 * @param {bigint} [b=1] Where to start looking from
 * @param {function} d privately used to calculate the next value to test
 * @returns {bigint} Integer
 */
function findFirstPositive(
	f: (x: bigint) => number,
	b = 1n,
	d = (e: bigint, g: bigint, c?: bigint): bigint =>
		g < e
			? -1n
			: 0 < f((c = (e + g) >> 1n))
				? c == e || 0 >= f(c - 1n)
					? c
					: d(e, c - 1n)
				: d(c + 1n, g),
): bigint {
	for (; 0 >= f(b); b <<= 1n);
	return d(b >> 1n, b) - 1n;
}

export const getMaxArrayBufferSize = (): number => {
	if (typeof window === "undefined") return 2 * GB; // default for SSR

	// check cache first
	const cached = localStorage.getItem("maxArrayBufferSize");
	if (cached) {
		const parsed = Number(cached);
		log(["converters"], `using cached max ArrayBuffer size: ${parsed} bytes`);
		if (!isNaN(parsed) && parsed > 0) return parsed;
	}

	// detect max size using binary search
	const maxSize = findFirstPositive((x) => {
		try {
			new ArrayBuffer(Number(x));
			return 0; // false = can allocate
		} catch {
			return 1; // true = cannot allocate
		}
	});

	const result = Number(maxSize);
	localStorage.setItem("maxArrayBufferSize", result.toString());
	log(["converters"], `detected max ArrayBuffer size: ${result} bytes`);

	return result;
};

export const MAX_ARRAY_BUFFER_SIZE = getMaxArrayBufferSize();
