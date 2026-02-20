<script lang="ts">
	import { m } from "$lib/paraglide/messages";
	import { link, sanitize } from "$lib/store/index.svelte";
	import { ShieldCheckIcon } from "lucide-svelte";
</script>

<div class="flex flex-col h-full items-center">
	<h1 class="hidden md:block text-[40px] tracking-tight leading-[72px] mb-6">
		<ShieldCheckIcon size="40" class="inline-block -mt-2 mr-2" />
		{m["privacy.title"]()}
	</h1>

	<div
		class="w-full max-w-[1280px] flex flex-col md:flex-row gap-4 p-4 md:px-4 md:py-0"
	>
		<div class="bg-panel rounded-2xl p-6 shadow-panel text-lg font-normal">
			<h2 class="text-2xl mb-3">{m["privacy.summary.title"]()}</h2>
			<p class="mb-4">
				{m["privacy.summary.description"]()}
			</p>

			<h2 class="text-2xl mb-3">{m["privacy.conversions.title"]()}</h2>
			<p class="mb-4">
				{@html sanitize(m["privacy.conversions.description"]())}
			</p>

			<h3 class="text-xl mt-4 mb-2">{m["privacy.analytics.title"]()}</h3>
			<p class="mb-4">
				{@html sanitize(
					link(
						["fathom_link"],
						m["privacy.analytics.description"](),
						["https://usefathom.com/"],
						[true],
					),
				)}
			</p>

			<h3 class="text-xl mt-4 mb-2">
				{m["privacy.local_storage.title"]()}
			</h3>
			<p class="mb-4">
				{m["privacy.local_storage.description"]()}
			</p>

			<h3 class="text-xl mt-4 mb-2">{m["privacy.contact.title"]()}</h3>
			<p class="mb-0">
				{@html sanitize(
					link(
						["email_link"],
						m["privacy.contact.description"](),
						["mailto:hello@vaivatta.fi"],
						[false],
					),
				)}
			</p>

			<p class="text-sm text-muted mt-6">{m["privacy.last_updated"]()}</p>
		</div>
	</div>
</div>
