/**
 * オープニングアニメーション
 * 白背景 → ロゴ出現 → 紺からオレンジへ → ズームで抜ける
 * 1セッション1回のみ再生（現行サイトの挙動を踏襲）
 */
(function () {
  'use strict';

  var KEY = 'nds_splash_shown';

  var TIMING = {
    visible:  80,    // ロゴ フェードイン開始
    colorize: 900,   // 紺 → オレンジ
    zoom:     1900,  // ロゴのズーム開始

    /*
     * オレンジが広がりはじめるまでの待ち。
     * ズームと同時に広げるとロゴが即座に隠れてしまうので、
     * 拡大が体感できるところまで遅らせる。
     */
    coverDelay: 340,
    cover:      640,  // 広がりはじめてから覆いきるまで
    hold:       420,  // 全面オレンジのまま見せる間
    open:       1600, // 覆ってから、円形に開ききるまで
    openLead:   260   // 開きはじめてから TOP の演出を走らせるまで
  };

  // 全体の完了時刻
  TIMING.done =
    TIMING.zoom + TIMING.coverDelay + TIMING.cover +
    TIMING.hold + TIMING.open + 100;

  var ZOOM_MS = 1400;

  function seen() {
    try {
      return !!sessionStorage.getItem(KEY);
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch (e) {
      /* プライベートモード等では記録できないが再生自体は可能 */
    }
  }

  function shouldPlay() {
    var nav = performance.getEntriesByType('navigation')[0];

    // 戻る/進むでは再生しない
    if (nav && nav.type === 'back_forward') return false;

    return !seen();
  }

  /** ロゴが確実に画面外へ抜ける倍率を算出 */
  function zoomScale(el) {
    var r = el.getBoundingClientRect();
    var w = r.width || el.offsetWidth;
    var h = r.height || el.offsetHeight;

    if (!w || !h) return 26;

    var s = Math.max(window.innerWidth / w, window.innerHeight / h) * 2;
    return Math.ceil(Math.max(s, 20));
  }

  /**
   * 完了を通知する。main.js の読み込み順に依存しないよう、
   * フラグを立ててからイベントを投げる（後から来ても検知できる）。
   */
  function notifyDone() {
    // head で伏せた TOP を必ず戻す
    document.documentElement.classList.remove('splash-pending');

    window.NDSSplashDone = true;
    document.dispatchEvent(new CustomEvent('splash:done'));
  }

  function remove(splash) {
    markSeen();

    if (splash && splash.parentNode) {
      splash.parentNode.removeChild(splash);
    }

    document.body.classList.remove('splash-active', 'splash-reveal');
    notifyDone();
  }

  function skip(splash) {
    if (splash && splash.parentNode) {
      splash.parentNode.removeChild(splash);
    }

    document.body.classList.remove('splash-active', 'splash-reveal');
    notifyDone();
  }

  function run() {
    var splash = document.querySelector('.splash');
    if (!splash) {
      notifyDone();
      return;
    }

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!shouldPlay() || reduced) {
      markSeen();
      skip(splash);
      return;
    }

    /*
     * ここから先は splash-active が TOP を伏せる役目を引き継ぐ。
     * head で付けた暫定の伏せは外してよい。
     */
    document.body.classList.add('splash-active');
    document.documentElement.classList.remove('splash-pending');

    var logo = splash.querySelector('.splash__logo');

    setTimeout(function () {
      splash.classList.add('is-visible');
    }, TIMING.visible);

    setTimeout(function () {
      splash.classList.add('is-colorize');
    }, TIMING.colorize);

    setTimeout(function () {
      var scale = logo ? zoomScale(logo) : 26;

      splash.classList.add('is-zooming', 'is-exit');

      // ロゴの拡大が見えるよう、少し遅らせてオレンジを広げる
      setTimeout(function () {
        splash.classList.add('is-covering');

        /*
         * オレンジが画面を覆いきってから TOP を解禁する。
         * この時点では全面オレンジなので、TOP は見えない。
         */
        setTimeout(function () {
          document.body.classList.add('splash-reveal');
          document.dispatchEvent(new CustomEvent('splash:reveal'));

          // 全面オレンジの状態を少し見せてから、中央を開く
          setTimeout(function () {
            splash.classList.add('is-opening');

            /*
             * 穴が少し広がって中央が見えるようになった頃に、
             * TOP 側の演出（ロゴの描画など）を走らせる。
             */
            setTimeout(function () {
              document.dispatchEvent(new CustomEvent('splash:opened'));
            }, TIMING.openLead);
          }, TIMING.hold);
        }, TIMING.cover);
      }, TIMING.coverDelay);

      if (logo) {
        logo.style.transition =
          'transform ' + (ZOOM_MS / 1000) + 's cubic-bezier(0.33, 0, 0.2, 1), ' +
          'opacity ' + (ZOOM_MS / 1000) + 's cubic-bezier(0.33, 0, 0.2, 1)';

        // 現在値を確定させてから拡大させる
        void logo.offsetWidth;

        requestAnimationFrame(function () {
          logo.style.transform = 'scale(' + scale + ')';
          logo.style.opacity = '0';
        });
      }
    }, TIMING.zoom);

    setTimeout(function () {
      remove(splash);
    }, TIMING.done);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
