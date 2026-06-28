/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["@aivillage/shared"],
  webpack: (config) => {
    // Let webpack resolve the shared package's ".js" import specifiers to ".ts" sources.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"]
    };
    return config;
  }
};

export default nextConfig;
