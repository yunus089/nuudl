import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NUUDL",
    short_name: "NUUDL",
    description: "Mobile 18+ PWA für anonyme lokale Gespräche, Stadtfeeds und private Chats mit Freigabe.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
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
