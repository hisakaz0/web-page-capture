================
web-page-capture
================

pixiv insideの記事、Headless Chromeでデザイン変更履歴を追える魚拓を作ってみた
を参考に、ページ全体を保存できる魚拓アプリ。

  https://inside.pixiv.blog/abcang/2064


Install
=======

::
  
    npm install


How to use
==========

::

  CHROME_PATH=<Path to chrome>
  node index.js --url <url> --path <imagePath> [--device iphone6|desktop]


- ``<url>`` : 保存したいページのURL
- ``<imagePath>`` : ページのスクリーンショットの保存先
- ``<device>`` : chromeでエミュレートするデバイス(デフォルトは ``iphone6``)

