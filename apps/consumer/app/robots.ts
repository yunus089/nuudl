import type { MetadataRoute } from "next";
import { getAbsoluteUrl } from "./_lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/landing", "/stadt/", "/llms.txt"],
      disallow: ["/api/", "/chat/", "/me", "/notifications", "/post/", "/channel/"]
    },
    sitemap: getAbsoluteUrl("/sitemap.xml").toString()
  };
}
