<script lang="ts">
	import { onMount } from "svelte";
	import { goto, beforeNavigate, afterNavigate } from "$app/navigation";

	import { PUB_FATHOM_SITE_ID } from "$env/static/public";
	import { DISABLE_ALL_EXTERNAL_REQUESTS, APP_NAME } from "$lib/util/consts.js";
	import * as Layout from "$lib/components/layout";
	import * as Navbar from "$lib/components/layout/Navbar";
	import { Settings } from "$lib/sections/settings/index.svelte";
	import {
		files,
		isMobile,
		effects,
		theme,
		dropping,
		locale,
		updateLocale,
	} from "$lib/store/index.svelte";
	import "$lib/css/app.scss";
	import { initStores as initAnimStores } from "$lib/util/animation.js";
	import { ToastManager } from "$lib/util/toast.svelte.js";
	import { m } from "$lib/paraglide/messages.js";
	import { log } from "$lib/util/logger.js";

	let { children } = $props();
	let enableFathom = $state(false);

	let scrollPositions = new Map<string, number>();

	beforeNavigate((nav) => {
		if (!nav.from || !$isMobile) return;
		scrollPositions.set(nav.from.url.pathname, window.scrollY);
	});

	afterNavigate((nav) => {
		if (!$isMobile) return;
		const scrollY = nav.to
			? scrollPositions.get(nav.to.url.pathname) || 0
			: 0;
		window.scrollTo(0, scrollY);
	});

	const dropFiles = (e: DragEvent) => {
		e.preventDefault();
		dropping.set(false);
		const oldLength = files.files.length;
		files.add(e.dataTransfer?.files);
		if (oldLength !== files.files.length) goto("/convert");
	};

	const handleDrag = (e: DragEvent, drag: boolean) => {
		e.preventDefault();
		dropping.set(drag);
	};

	const handlePaste = (e: ClipboardEvent) => {
		const clipboardData = e.clipboardData;
		if (!clipboardData || !clipboardData.files.length) return;
		e.preventDefault();
		const oldLength = files.files.length;
		files.add(clipboardData.files);
		if (oldLength !== files.files.length) goto("/convert");
	};

	onMount(() => {
		initAnimStores();

		const handleResize = () => {
			isMobile.set(window.innerWidth <= 768);
		};

		isMobile.set(window.innerWidth <= 768); // initial page load
		window.addEventListener("resize", handleResize); // handle window resize
		window.addEventListener("paste", handlePaste);

		effects.set(localStorage.getItem("effects") !== "false"); // defaults to true if not set
		theme.set(
			(localStorage.getItem("theme") as "light" | "dark") || "light",
		);
		const storedLocale = localStorage.getItem("locale");
		if (storedLocale) updateLocale(storedLocale);

		Settings.instance.load();

		// detect if insecure context
		if (!window.isSecureContext) {
			log(["layout"], "Insecure context (HTTP) detected, some features may not work as expected.");
			ToastManager.add({
				type: "warning",
				message: m["toast.insecure_context"](),
				disappearing: false,
			});
		}

		return () => {
			window.removeEventListener("paste", handlePaste);
			window.removeEventListener("resize", handleResize);
		};
	});

	$effect(() => {
		enableFathom =
			!!PUB_FATHOM_SITE_ID &&
			Settings.instance.settings.fathom &&
			!DISABLE_ALL_EXTERNAL_REQUESTS;
	});
</script>

<svelte:head>
	<title>{APP_NAME}</title>
	<meta name="theme-color" content="#2563eb" />
	<meta
		name="title"
		content="{APP_NAME} — Muunna tiedostot vaivatta"
	/>
	<meta
		name="description"
		content="Muunna kuva-, ääni- ja asiakirjatiedostot nopeasti ja helposti. Ei mainoksia, ei seurantaa — käsittely tapahtuu laitteellasi."
	/>
	<meta property="og:url" content="https://muunna.vaivatta.fi" />
	<meta property="og:type" content="website" />
	<meta
		property="og:title"
		content="{APP_NAME} — Muunna tiedostot vaivatta"
	/>
	<meta
		property="og:description"
		content="Muunna kuva-, ääni- ja asiakirjatiedostot nopeasti ja helposti. Ei mainoksia, ei seurantaa — käsittely tapahtuu laitteellasi."
	/>
	<meta property="og:image" content="/favicon.svg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="twitter:domain" content="muunna.vaivatta.fi" />
	<meta property="twitter:url" content="https://muunna.vaivatta.fi" />
	<meta
		property="twitter:title"
		content="{APP_NAME} — Muunna tiedostot vaivatta"
	/>
	<meta
		property="twitter:description"
		content="Muunna kuva-, ääni- ja asiakirjatiedostot nopeasti ja helposti. Ei mainoksia, ei seurantaa — käsittely tapahtuu laitteellasi."
	/>
	<meta property="twitter:image" content="/favicon.svg" />
	<link rel="manifest" href="/manifest.json" />
	<link rel="canonical" href="https://muunna.vaivatta.fi/" />
	{#if enableFathom}
		<script
			defer
			src="https://cdn.usefathom.com/script.js"
			data-site={PUB_FATHOM_SITE_ID}
		></script>
	{/if}
</svelte:head>

<!-- FIXME: if user resizes between desktop/mobile, highlight of page disappears (only shows on original size) -->
{#key $locale}
	<div
		class="flex flex-col min-h-screen h-full w-full overflow-x-hidden"
		ondrop={dropFiles}
		ondragenter={(e) => handleDrag(e, true)}
		ondragover={(e) => handleDrag(e, true)}
		ondragleave={(e) => handleDrag(e, false)}
		role="region"
	>
		<Layout.UploadRegion />

		<div>
			<Layout.MobileLogo />
			<Navbar.Desktop />
		</div>

		<!-- 
		SvelteKit throws the following warning when developing - safe to ignore as we render the children in this component:
		`<slot />` or `{@render ...}` tag missing — inner content will not be rendered
		-->
		<Layout.PageContent {children} />

		<Layout.Toasts />
		<Layout.Dialogs />

		<div>
			<Layout.Footer />
			<Navbar.Mobile />
		</div>
	</div>
{/key}

<!-- Gradients placed here to prevent it overlapping in transitions -->
<Layout.Gradients />
