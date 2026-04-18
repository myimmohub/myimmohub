import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  // remark/rehype plugins can be added here
  options: {},
});

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "md", "mdx"],
};

export default withMDX(nextConfig);
