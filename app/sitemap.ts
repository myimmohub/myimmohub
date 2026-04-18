import type { MetadataRoute } from "next";

const BASE_URL = "https://myimmohub.de";

const ARTICLE_SLUGS = [
  "mieteinnahmen-versteuern",
  "anlage-v-werbungskosten",
  "afa-immobilien",
  "kaufpreisaufteilung",
  "erhaltungsaufwand-82b",
  "kaufnebenkosten-steuerlich",
  "grundsteuer-werbungskosten",
  "gbr-vermieter-steuern",
  "spekulationssteuer-10-jahre",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/steuer-tipps`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/tools`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/tools/rendite`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tools/kredit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tools/spekulationssteuer`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/tools/kaufnebenkosten`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/auth`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const articlePages: MetadataRoute.Sitemap = ARTICLE_SLUGS.map((slug) => ({
    url: `${BASE_URL}/steuer-tipps/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...articlePages];
}
