<script lang="ts">
	import { page } from "$app/state";
	import { duration, transition } from "$lib/util/animation";
	import { files } from "$lib/store/index.svelte";
	import { quintOut } from "svelte/easing";
	import { fade } from "$lib/util/animation";
	import { Tween } from "svelte/motion";

	const colors: {
		matcher: (path: string) => boolean;
		color: string;
		at: number;
	}[] = $derived([
		{
			matcher: (path) => path === "/",
			color: "var(--bg-gradient-from)",
			at: 100,
		},
		{
			matcher: (path) => path === "/convert/",
			color: "var(--bg-gradient-blue-from)",
			at: 25,
		},
		{
			matcher: (path) => path === "/settings/",
			color: "var(--bg-gradient-blue-from)",
			at: 25,
		},
		{
			matcher: (path) => path === "/privacy/",
			color: "var(--bg-gradient-from)",
			at: 100,
		},
	]);

	const color = $derived(
		Object.values(colors).find((p) => p.matcher(page.url.pathname)) || {
			matcher: () => false,
			color: "transparent",
			at: 0,
		},
	);

	// svelte-ignore state_referenced_locally This is handled in the effect below
	let at = new Tween(color.at, {
		duration,
		easing: quintOut,
	});

	$effect(() => {
		at.set(color.at);
	});

	const maskImage = $derived(
		`linear-gradient(to top, transparent ${100 - at.current}%, black 100%)`,
	);
</script>

<div
	class="fixed top-0 left-0 w-screen h-screen -z-40 pointer-events-none"
	style="background-color: {color.color}; 
	mask-image: {maskImage}; 
	-webkit-mask-image: {maskImage};
	transition: background-color {duration}ms {transition};"
></div>

{#if page.url.pathname === "/convert/" && files.files.length === 1}
	{@const bgMask =
		"linear-gradient(to top, transparent 5%, rgba(0, 0, 0, 0.5) 100%)"}
	<div
		class="fixed top-0 left-0 w-screen h-screen -z-50"
		style="background-image: url({files.files[0].blobUrl});
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		filter: blur(10px);
		mask-image: {bgMask};
		-webkit-mask-image: {bgMask};"
		transition:fade={{ duration, easing: quintOut }}
	></div>
{/if}
