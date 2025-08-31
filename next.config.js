/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const isElectron = process.env.ELECTRON === 'true';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Important for Electron
  output: 'export',
  assetPrefix: isDev ? undefined : './',
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Only set electron-renderer target when running in Electron
    if (!isServer && isElectron) {
      config.target = 'electron-renderer';
    } else if (!isServer) {
      // For browser, polyfill global
      config.resolve.fallback = {
        ...config.resolve.fallback,
      };
      config.plugins.push(
        new (require('webpack').ProvidePlugin)({
          global: ['globalThis', 'global'],
        })
      );
    }
    return config;
  },
}

module.exports = nextConfig