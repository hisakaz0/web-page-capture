const { Launcher } = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const util = require('util');
const fs = require('fs');
const config = require('config');
const yaml = require('js-yaml');

const writeFile = util.promisify(fs.writeFile);

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

async function main() {
  // Chromeを起動
  const launcher = new Launcher(config.get('chrome.launcher'));
  await launcher.launch();

  // Chrome DevTools Protocolを使う準備
  const client = await CDP();
  const { Page, Runtime, Emulation } = client;
  await Promise.all([Page.enable(), Runtime.enable()]);

  // デバイスのサイズを設定
  const deviceMetrics = config.get('chrome.device');
  await setDeviceSize(Emulation, deviceMetrics);

  // To capture web pages of the yaml list
  const pagesList = yaml.safeLoad(fs.readFileSync('pages-list.yml', 'utf8'));

  pagesList.forEach(async function(currentValue, index, array) {
    // ページにアクセスして読み込みが完了するまで待機
    Page.navigate({ url: currentValue.url });
    await Page.loadEventFired();

    // ページの最下部までスクロール
    await Runtime.evaluate({ expression: scrollToBottomScript, awaitPromise: true });

    // ブラウザからscrollWidthとscrollHeightを取得
    const { result: { value } } = await Runtime.evaluate({
      expression: getFullPageSizeScript,
      returnByValue: true
    });
    const { width, height } = JSON.parse(value);

    // デバイスのサイズをページのサイズに合わせる
    await setDeviceSize(Emulation, Object.assign({}, deviceMetrics, {
      width: Math.max(width, deviceMetrics.width),
      height: Math.max(height, deviceMetrics.height)
    }));

    // スクリーンショットを取得、保存
    const { data } = await Page.captureScreenshot({ fromSurface: true });
    await writeFile(currentValue.imagePath, Buffer.from(data, 'base64'));
  });

  // 終了処理
  client.close();
  launcher.kill();
}
main();
