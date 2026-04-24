import type { MetadataRoute } from "next";
import { DISCOVERY_CITIES, getCityLandingPath } from "./_lib/discovery";
import { getAbsoluteUrl } from "./_lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: getAbsoluteUrl("/landing").toString(),
      lastModified,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: getAbsoluteUrl("/").toString(),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7
    },
    ...DISCOVERY_CITIES.map((city) => ({
      url: getAbsoluteUrl(getCityLandingPath(city.slug)).toString(),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.72,
    })),
  ];
}
