// Config plugin: l'APK generato si chiama `circus-launchpad-release.apk` invece di `app-release.apk`.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// withApkName';

module.exports = function withApkName(config, { name = 'circus-launchpad' } = {}) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `\n${MARKER}\nbase {\n    archivesName = "${name}"\n}\n`;
    }
    return cfg;
  });
};
