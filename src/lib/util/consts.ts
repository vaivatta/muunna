import { PUB_DISABLE_ALL_EXTERNAL_REQUESTS, PUB_ENV } from "$env/static/public";

export const APP_NAME =
	PUB_ENV === "development"
		? "muunna. (dev)"
		: PUB_ENV === "nightly"
			? "muunna. (nightly)"
			: "muunna.";
export const CONTACT_EMAIL = "hello@vaivatta.fi";

export const DISABLE_ALL_EXTERNAL_REQUESTS =
	PUB_DISABLE_ALL_EXTERNAL_REQUESTS === "true";

export const GB = 1024 * 1024 * 1024;
