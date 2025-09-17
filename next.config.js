/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const isElectron = process.env.ELECTRON === 'true';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Important for Electron
  output: 'export',
  distDir: 'out',
  assetPrefix: isDev ? undefined : './',
  images: {
    unoptimized: true,
  },
  // Optimization settings
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
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

    // Optimize production builds
    if (!isDev && !isServer) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20
            },
            common: {
              name: 'common',
              chunks: 'all',
              minChunks: 2,
              priority: 10,
              reuseExistingChunk: true,
              enforce: true
            }
          }
        }
      };
    }

    // External electron in production
    if (!isDev) {
      if (!config.externals) {
        config.externals = [];
      }
      if (Array.isArray(config.externals)) {
        config.externals.push('electron');
      } else {
        config.externals = [config.externals, 'electron'];
      }
    }

    return config;
  },
}

module.exports = nextConfig