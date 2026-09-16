const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('gamaDesktop', {
  platform: process.platform,
  version: require('../package.json').version,
});
