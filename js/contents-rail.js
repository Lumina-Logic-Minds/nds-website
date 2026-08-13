/**
 * CONTENTS セクションの横流し
 *
 * 参考の日テレアート Works と同じ考え方。
 * セクションに高さを持たせ、中身を sticky で画面に貼り付ける。
 * その高さを消費するあいだのスクロール量を横移動へ変換し、
 * 2 段のカード列を逆方向に流す。
 */
(function () {
  'use strict';

  var section = document.querySelector('.contents');
  if (!section) return;

  var rowA = section.querySelector('.ct-row--a');
  var rowB = section.querySelector('.ct-row--b');
  var veil = section.querySelector('.contents__veil');
  var circle = section.querySelector('.contents__veil-circle');
  var head = section.querySelector('.contents__head');
  var rail = section.querySelector('.contents__rail');
  var sticky = section.querySelector('.contents__sticky');
  if (!rowA || !rowB) return;

  // 触れないデバイスは CSS 側で通常の横スクロールにしている
  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * 横流しをしない環境では円も動かせないので、
   * セクションを最初から黒くしておく。
   */
  if (coarse || reduced) {
    section.style.background = '#0b0b0d';
    if (circle) circle.style.display = 'none';
    return;
  }

  var travelA = 0;   // A 列が動く距離
  var travelB = 0;
  var ticking = false;

  /*
   * 動き出す前後に「間」を作る割合。
   * 0 のままだと、貼り付いた瞬間から端のカードが画面外へ出てしまう。
   * 前後にこの分の余白を取り、中央付近だけで流す。
   */
  var EASE_IN = 0.3;
  var EASE_OUT = 0.1;

  /*
   * 黒い円が広がりきるまでの割合（EASE_IN の中での比率）。
   * 1 に近いほど、間いっぱいを使ってゆっくり広がる。
   */
  var VEIL_SPAN = 0.95;

  /** はみ出している分だけ動かせばよい */
  function measure() {
    var vw = section.clientWidth;

    travelA = Math.max(rowA.scrollWidth - vw, 0);
    travelB = Math.max(rowB.scrollWidth - vw, 0);

    /*
     * セクションの高さは、流す距離に応じて決める。
     * 係数を大きくするほど、同じ距離をゆっくり流す。
     */
    var need = Math.max(travelA, travelB);
    var vh = window.innerHeight;

    /*
     * カードの横移動ぶんに加えて、前後の「間」の高さも確保する。
     * EASE_IN / EASE_OUT は全体に対する割合なので、
     * 横移動が占める割合から逆算して総量を決める。
     */
    var moveSpan = 1 - EASE_IN - EASE_OUT;

    section.style.height = (vh + (need * 2.4) / moveSpan) + 'px';

    update();
  }

  function update() {
    var rect = section.getBoundingClientRect();
    var vh = window.innerHeight;

    // 0（貼り付き開始）→ 1（終了）
    var total = section.offsetHeight - vh;
    var raw = total > 0 ? (-rect.top) / total : 0;

    raw = Math.min(Math.max(raw, 0), 1);

    // 前後の「間」を除いた区間へ写像する
    /*
     * カードが流れ出す前の「間」を使って、
     * 黒い円を下から広げ、画面を覆う。
     */
    /*
     * セクションを通り過ぎたら円を消す。
     * sticky は親の末尾で止まるが、margin-bottom: -100vh のぶん
     * 下のセクションにも重なり続け、フッターまで黒くなってしまう。
     */
    if (veil) {
      var passed = rect.bottom <= vh;
      veil.style.visibility = passed ? 'hidden' : '';
    }

    if (circle) {
      /*
       * 円だけはセクションに入る手前から数えはじめる。
       * NEWS が半分ほど残っている段階で出現させたいので、
       * 貼り付き開始の半画面ぶん手前を起点にする。
       */
      var lead = vh * 0.95;
      var span0 = total * EASE_IN * VEIL_SPAN + lead;
      var g = (-rect.top + lead) / span0;

      g = Math.min(Math.max(g, 0), 1);

      /*
       * 序盤で一定の大きさまで素早く立ち上げ、
       * そこから先はゆっくり広げる。
       * 等速だと、見えるほどの大きさになるまでが長く感じられる。
       */
      var POP = 0.16;   // 立ち上がりで確保する大きさ
      var KNEE = 0.12;  // そこまでに使う区間

      if (g < KNEE) {
        g = (g / KNEE) * POP;
      } else {
        g = POP + ((g - KNEE) / (1 - KNEE)) * (1 - POP);
      }

      circle.style.setProperty('--grow', g);

      // 覆いきったら地色を黒に切り替える（円を消しても黒が残る）
      section.classList.toggle('is-black', g >= 0.999);

      /*
       * 黒が広がりきってから、中身を下から出す。
       * 明るい背景の上にカードが乗っていると
       * 「黒く覆ってから登場する」流れが崩れる。
       */
      /*
       * sticky 自体に transform を掛けると貼り付きが壊れるため、
       * 中身（見出しとカード列）にだけ適用する。
       */
      var appear = Math.min(Math.max((g - 0.72) / 0.28, 0), 1);
      var shift = 'translateY(' + ((1 - appear) * 46) + 'px)';

      /*
       * 見出しは最初から見せる。
       * 円が広がるあいだ、下から上へせり上がるだけにする。
       */
      if (head) {
        head.style.opacity = '';
        head.style.transform = 'translateY(' + ((1 - g) * 70) + 'px)';

        /*
         * 背景が黒く覆われるまでは明るい地の上にいるので、
         * 文字色も濃灰から白へ切り替える。
         */
        head.classList.toggle('is-on-dark', g > 0.55);
      }

      if (rail) {
        rail.style.opacity = appear;
        rail.style.transform = shift;
      }

      /*
       * NEWS に食い込ませているので、まだ見えていない間は
       * クリックを透過させて NEWS 側を操作できるようにする。
       */
      if (sticky) {
        sticky.style.pointerEvents = appear > 0.5 ? '' : 'none';
      }
    }

    var span = 1 - EASE_IN - EASE_OUT;
    var p = (raw - EASE_IN) / span;

    p = Math.min(Math.max(p, 0), 1);

    // 2 段とも右から左へ、同じだけ流す
    rowA.style.setProperty('--x', (-travelA * p) + 'px');
    rowB.style.setProperty('--x', (-travelB * p) + 'px');
  }

  function onScroll() {
    if (ticking) return;

    ticking = true;

    requestAnimationFrame(function () {
      update();
      ticking = false;
    });
  }

  var rt = null;

  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(measure, 180);
  });

  window.addEventListener('scroll', onScroll, { passive: true });

  // 画像の読み込みで幅が変わるため、確定後に測り直す
  window.addEventListener('load', measure);

  measure();
})();
