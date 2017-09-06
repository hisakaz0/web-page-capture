const { Launcher } = require('chrome-launcher');
const CDP = require('chrome-remote-interface');
const util = require('util');
const fs = require('fs');
const config = require('config');
const yaml = require('js-yaml');

const writeFile = util.promisify(fs.writeFile);

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

async function pageCapture(url, imagePath, device,
	Page, Runtime, Emulation, Network) {
	// userAgentの設定
	await Network.setUserAgentOverride({ userAgent: device.userAgent })
		.catch(onError);

  // デバイスのサイズを設定
  const deviceMetrics = config.get('chrome.device');
  await setDeviceSize(Emulation, Object.assign({}, deviceMetrics, {
		width: device.width, height: device.height
	}))
		.catch(onError);

  // ページにアクセスして読み込みが完了するまで待機
  Page.navigate({ url: url });
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
  width: Math.max(width, device.width),
  height: Math.max(height, device.height)
  }));

  // スクリーンショットを取得、保存
  const { data } = await Page.captureScreenshot({ fromSurface: true });
  await writeFile(imagePath, Buffer.from(data, 'base64'));
}

async function main() {
  // Chromeを起動
  const launcher = new Launcher(config.get('chrome.launcher'));
  await launcher.launch();

  // Chrome DevTools Protocolを使う準備
  const client = await CDP();
  const { Page, Runtime, Emulation, Network } = client;
	await Promise.all([ Page.enable(), Runtime.enable(), Network.enable() ]);

	// device情報を取得
	const device = config.get('device.iphone6');

  // ページリストを取得
  const pagesList = yaml.safeLoad(fs.readFileSync('pages-list.yml', 'utf8'));

	// 全ページをキャプチャする
	await Promise.all(pagesList.map(async (page) => {
		await pageCapture(page.url, page.imagePath, device,
			Page, Runtime, Emulation, Network);
	}));

  // 終了処理
  client.close();
  launcher.kill();
}
main();
