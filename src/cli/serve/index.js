// External
const importLazy = require('import-lazy')(require);
const webpack = importLazy('webpack');
const WebpackDevServer = importLazy('webpack-dev-server');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

// Ours
const { getServeConfig } = require('../../config/serve');
const { getWebpackConfig } = require('../../config/webpack');
const { getWebpackDevServerConfig } = require('../../config/webpackDevServer');
const { throws } = require('../../utils/async');
const { cmd } = require('../../utils/color');
const { dry, info, spin } = require('../../utils/logging');
const { combine } = require('../../utils/structures');
const { command } = require('../');
const cleanCommand = require('../clean');
const { BUNDLE_ANALYSER_CONFIG, MESSAGES } = require('./constants');

module.exports = command(
  {
    name: 'serve',
    nodeEnv: 'development',
    usage: MESSAGES.usage
  },
  async argv => {
    const webpackConfig = getWebpackConfig();
    const webpackDevServerConfig = getWebpackDevServerConfig();
    const { hot, publicPath } = webpackDevServerConfig;
    const bundleAnalysis = 'http://127.0.0.1:8888';

    webpackConfig.forEach((config, index) => {
      config.output.publicPath = publicPath;

      if (hot) {
        config.entry = upgradeEntryToHot(config.entry, config.output.publicPath);
        config.plugins.push(new webpack.HotModuleReplacementPlugin());
      }

      config.plugins.push(
        new BundleAnalyzerPlugin(
          combine(BUNDLE_ANALYSER_CONFIG, {
            analyzerPort: BUNDLE_ANALYSER_CONFIG.analyzerPort + index
          })
        )
      );
    });

    if (argv.dry) {
      return dry({
        'Webpack config': webpackConfig,
        'WebpackDevServer config': webpackDevServerConfig
      });
    }

    throws(await cleanCommand(['--quiet']));

    info(MESSAGES.serve({ hot, publicPath }));

    const spinner = spin('Server running');
    const compiler = webpack(webpackConfig);
    const server = new WebpackDevServer(compiler, webpackDevServerConfig);

    return new Promise((resolve, reject) => {
      const { port } = getServeConfig();

      server.listen(port, '0.0.0.0', err => {
        if (err) {
          spinner.fail('Server error');
          reject(err);
        }
      });

      process.on('SIGINT', function() {
        server.close(function() {
          spinner.succeed('Server closed');
          resolve();
        });
      });
    });
  }
);

function upgradeEntryToHot(entry, publicPath) {
  const heat = [`webpack-dev-server/client?${publicPath}`, 'webpack/hot/dev-server'];

  if (Array.isArray(entry) || typeof entry === 'string') {
    return heat.concat(Array.isArray(entry) ? entry : [entry]);
  }

  return Object.keys(entry).reduce((memo, key) => {
    const value = entry[key];

    memo[key] = heat.concat(Array.isArray(value) ? value : [value]);

    return memo;
  }, {});
}
