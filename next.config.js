/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const isElectron = process.env.ELECTRON === 'true';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Important for Electron
  ...(isDev ? {} : { output: 'export' }),
  distDir: 'out',
  assetPrefix: isDev ? '' : './',
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
    }

    // Always provide process polyfill for client-side code
    if (!isServer) {
      // For browser, polyfill global and process
      config.resolve.fallback = {
        ...config.resolve.fallback,
        process: require.resolve('process/browser'),
      };
      config.plugins.push(
        new (require('webpack').ProvidePlugin)({
          global: ['globalThis', 'global'],
          process: 'process/browser',
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