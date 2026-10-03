import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/launch", "/portfolio", "/vault", "/docs"].map((p) => ({ url: `${site.url}${p}`, lastModified: now }));
}
