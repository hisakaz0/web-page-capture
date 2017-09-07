const { Launcher } = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const util = require('util');
const fs = require('fs');
const config = require('config');
const yaml = require('js-yaml');
const argv = require('minimist')(process.argv.slice(2));

const writeFile = util.promisify(fs.writeFile);

// CLI args
const deviceName = argv.device || 'iphone6';
const url        = argv.url != undefined ? argv.url : (() => {
  throw new Error("Please set a url arg with '--url <url>'.");
})();
const imagePath  = argv.path != undefined ? argv.path : (() => {
  throw new Error("Please set a path arg with '--path <imagePath>'.");
})();


function onError(err) {
  console.log(err);
}

async function setDeviceSize(Emulation, deviceMetrics) {
  const { width, height } = deviceMetrics;
  await Emulation.setDeviceMetricsOverride(deviceMetrics);
  await Emulation.setVisibleSize({ width, height });
}
// ブラウザ内でページの最下部まで少しずつスクロールするためのメソッド
const scrollToBottom = () => new Promise((resolve) => {
  const interval = setInterval(() => {
    if (window.document.body.scrollTop + window.innerHeight < window.document.body.scrollHeight) {
      window.document.body.scrollTop += window.innerHeight;
    } else {
      clearInterval(interval);
      window.document.body.scrollTop = 0;
      resolve();
    }
  }, 200);
});
// ブラウザ内で実行するために文字列化
const scrollToBottomScript = `(${scrollToBottom.toString()})()`;

// ブラウザからscrollWidthとscrollHeightを取得するためのメソッド
const getFullPageSize = () => JSON.stringify({
  width: window.document.body.scrollWidth,
  height: window.document.body.scrollHeight,
});
// ブラウザ内で実行するために文字列化
const getFullPageSizeScript = `(${getFullPageSize.toString()})()`;

async function pageCapture(url, imagePath, device) {
  // Chromeを起動
  const launcher = new Launcher(config.get('chrome.launcher'));
  await launcher.launch();

  // Chrome DevTools Protocolを使う準備
  const client = await CDP();
  const { Page, Runtime, Emulation, Network } = client;

  // userAgentの設定
  await Network.enable();
  await Network.setUserAgentOverride({ userAgent: device.userAgent });

  // デバイスのサイズを設定
  const deviceMetrics = config.get('chrome.device');
  await setDeviceSize(Emulation, Object.assign({}, deviceMetrics, {
    width: device.width, height: device.height
  }));

  // ページにアクセスして読み込みが完了するまで待機
  await Page.enable();
  Page.navigate({ url: url });
  await Page.loadEventFired();

  // ページの最下部までスクロール
  await Runtime.enable();
  await Runtime.evaluate({ expression: scrollToBottomScript, awaitPromise: true });

  // ブラウザからscrollWidthとscrollHeightを取得
  const { result: { value } } = await Runtime.evaluate({
    expression: getFullPageSizeScript,
    returnByValue: true
  });
  const { width, height } = JSON.parse(value);

  // デバイスのサイズをページのサイズに合わせる
  await setDeviceSize(Emulation, Object.assign({}, deviceMetrics, {
    width: Math.max(width, device.width),
    height: Math.max(height, device.height)
  }));

  // スクリーンショットを取得、保存
  const { data } = await Page.captureScreenshot({ fromSurface: true });
  await writeFile(imagePath, Buffer.from(data, 'base64'));

  // 終了処理
  client.close();
  launcher.kill();
}

async function main() {
  // device情報を取得
  const device = config.get(`device.${deviceName}`);

  // ページをキャプチャする
  await pageCapture(url, imagePath, device);
}
main();
