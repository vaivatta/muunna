<script lang="ts">
	import { m } from "$lib/paraglide/messages";
	import { GithubIcon } from "lucide-svelte";
</script>

<footer
	class="hidden md:block w-full h-14 border-t border-separator fixed bottom-0 mt-12"
>
	<div
		class="w-full h-full flex items-center justify-center text-muted gap-3 relative"
	>
		<a
			class="hover:underline font-normal"
			href="/privacy/"
		>
			{m["footer.privacy_policy"]()}
		</a>
		<p>&bull;</p>
		<a
			class="hover:underline font-normal flex items-center gap-1.5"
			href="https://github.com/vaivatta/muunna"
			target="_blank"
			rel="noopener noreferrer"
		>
			<GithubIcon size="14" />
			GitHub
		</a>
	</div>

	<div
		class="absolute bottom-0 left-0 w-full h-24 -z-10 pointer-events-none"
		style="background: linear-gradient(to bottom, transparent, var(--bg) 100%)"
	></div>
</footer>
