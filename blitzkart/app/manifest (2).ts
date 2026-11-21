import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BlitzKart",
    short_name: "BlitzKart",
    description: "Shop with BlitzKart",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf7",
    theme_color: "#ffd600",
    icons: [{ src: "/icon.png", sizes: "any", type: "image/png", purpose: "any" }],
  };
}
