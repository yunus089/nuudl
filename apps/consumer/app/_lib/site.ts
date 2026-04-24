const FALLBACK_SITE_URL = "https://app.german-hustlin.de";

export const getSiteUrl = () => {
  const configuredUrl = process.env.NUUDL_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL;

  try {
    return new URL(configuredUrl);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
};

export const getAbsoluteUrl = (path: string) => new URL(path, getSiteUrl());
