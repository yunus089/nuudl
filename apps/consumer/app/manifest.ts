import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NUUDL",
    short_name: "NUUDL",
    description: "Mobile-only anonymous geo-community PWA",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1117",
    theme_color: "#0f1117",
    orientation: "portrait",
    icons: [
      {
        src: "/brand/nuudl/png/app-icon-square.png",
        sizes: "1024x1024",
        type: "image/png"
      }
    ]
  };
}
