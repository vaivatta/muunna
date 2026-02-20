import "@poppanator/sveltekit-svg/dist/svg";

declare global {
	const __COMMIT_HASH__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module "svelte/elements" {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface HTMLAttributes<T> {
		[key: `event-${string}`]: string | undefined | null;
	}
}

export {};
