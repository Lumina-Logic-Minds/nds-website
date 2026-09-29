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

  var coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /*
   * 動きを減らす設定では、円も横流しもしない。
   * セクションを最初から黒くし、CSS 側で通常の横スクロールにする。
   */
  if (reduced) {
    section.style.background = '#0b0b0d';
    if (circle) circle.style.display = 'none';
    return;
  }

  // スマホ・タブレットは、スクロールを横移動に変えず、自動で流す（下の initTouchFlow）
  if (coarse) {
    initTouchFlow();
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

  /**
   * スマホ・タブレット版
   *
   * PC のように画面を止めて横へ流すと、スマホでは重く感じられるため、
   * セクションは普通にスクロールさせ、カードの列を自動で流し続ける。
   *
   * 1. セクションが画面に入ってくると、中央から黒い円が広がって画面が黒になる（スクロール連動）
   * 2. 黒くなったら「CONTENTS」が 1 文字ずつ立ち上がる
   * 3. 上段は右から、下段は左から滑り込み、そのまま上段は左へ・下段は右へ流れ続ける
   * 4. 画面の中央を通るカードを明るくする（.is-current）
   * 5. 指で触れている間は止まり、左右に動かすとカードも付いてくる
   *
   * 見た目は home.css の .contents.is-flow 以下。
   */
  function initTouchFlow() {
    section.classList.add('is-flow');

    var SPEED = 26;          // 流れる速さ（px / 秒）
    var INTRO = 1400;        // 滑り込みにかける時間（ms）
    var RESUME = 1200;       // 指を離してから流れを再開するまで（ms）

    // ---- 見出しを 1 文字ずつに分ける ----
    var en = section.querySelector('.contents__en');
    if (en && en.dataset.split !== 'done') {
      var label = en.textContent;
      en.setAttribute('aria-label', label);
      en.innerHTML = '';
      Array.prototype.forEach.call(label, function (ch, i) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');
        mask.className = 'cc';
        inner.className = 'cc__i';
        inner.textContent = ch;
        inner.style.setProperty('--c', i);
        mask.appendChild(inner);
        en.appendChild(mask);
      });
      en.dataset.split = 'done';
    }

    // ---- 途切れずに流すため、各段のカードを複製して後ろにつなぐ ----
    var rows = [
      { el: rowA, dir: -1, pos: 0, half: 0, from: 1 },   // 上段：左へ流れる。右から入る
      { el: rowB, dir: 1, pos: 0, half: 0, from: -1 }    // 下段：右へ流れる。左から入る
    ];

    rows.forEach(function (row) {
      var originals = Array.prototype.slice.call(row.el.children);
      originals.forEach(function (card) {
        var clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        row.el.appendChild(clone);
      });
      row.first = originals[0];
      row.firstClone = row.el.children[originals.length];
    });

    var cards = Array.prototype.slice.call(section.querySelectorAll('.ct-card'));

    function measureRows() {
      rows.forEach(function (row) {
        // 1 周ぶんの長さ＝複製の先頭までの距離
        row.half = row.firstClone.offsetLeft - row.first.offsetLeft;
      });

      /*
       * 円の大きさを、セクションの対角線ちょうどにする。
       * PC と同じ大きさだと、広がりはじめてすぐに覆いきってしまい、
       * 残りのスクロールでは広がる様子が見えない。
       */
      if (circle) {
        var d = Math.ceil(Math.hypot(section.clientWidth, section.offsetHeight)) + 4;
        circle.style.width = d + 'px';
        circle.style.height = d + 'px';
        circle.style.margin = (-d / 2) + 'px 0 0 ' + (-d / 2) + 'px';
      }
    }

    // ---- 黒い円（スクロール連動・一度広がったら戻さない）----
    var grow = 0;
    var started = false;
    var startAt = 0;

    function updateVeil() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight;

      /*
       * セクションの上端が画面の下端（100%）→ 上端（0%）まで来るあいだに広げる。
       * スマホは画面が小さく、短い区間だと一気に黒くなって見えるため、長めに取る
       */
      var g = (vh * 1.0 - rect.top) / (vh * 1.0);
      g = Math.min(Math.max(g, 0), 1);

      if (g > grow) {
        grow = g;
        // 円は大きくなるほど覆う面積が急に増えるので、加速は控えめにする
        circle.style.setProperty('--grow', Math.pow(grow, 1.3).toFixed(4));
      }

      section.classList.toggle('is-black', grow >= 1);
      if (head) head.classList.toggle('is-on-dark', grow > 0.65);

      // 黒がほぼ行き渡ったら、見出しとカードを出す
      if (!started && grow > 0.85) {
        started = true;
        startAt = performance.now();
        section.classList.add('is-in');
      }
    }

    // ---- 流れ ----
    var visible = false;
    var paused = false;
    var resumeTimer = null;
    var last = 0;
    var raf = 0;

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function frame(now) {
      raf = 0;
      if (!visible) return;

      var dt = last ? Math.min(now - last, 64) / 1000 : 0;
      last = now;

      if (started && !paused) {
        rows.forEach(function (row) { row.pos += row.dir * SPEED * dt; });
      }

      // 滑り込み：画面幅ぶん外側から、減速しながら所定の位置へ
      var intro = started ? easeOut(Math.min((now - startAt) / INTRO, 1)) : 0;
      var vw = section.clientWidth;

      rows.forEach(function (row) {
        if (!row.half) return;
        // pos を -half〜0 に収める。pos が減れば左へ、増えれば右へ動く
        var x = ((row.pos % row.half) + row.half) % row.half - row.half;
        var shift = (1 - intro) * vw * row.from;
        row.el.style.setProperty('--x', (x + shift).toFixed(2) + 'px');
      });

      if (started) markCurrent();

      raf = requestAnimationFrame(frame);
    }

    // 画面の中央を通っているカードを明るくする
    function markCurrent() {
      var center = window.innerWidth / 2;
      cards.forEach(function (card) {
        var r = card.getBoundingClientRect();
        card.classList.toggle('is-current', r.left < center && r.right > center);
      });
    }

    function start() {
      if (raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    // 画面外にある間は止めて、電池を減らさない
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
      }).observe(section);
    } else {
      visible = true;
      start();
    }

    // ---- 指で触れている間は止め、左右に動かすとカードも付いてくる ----
    var touch = null;
    var dragged = false;

    rail.addEventListener('pointerdown', function (e) {
      paused = true;
      clearTimeout(resumeTimer);
      touch = { x: e.clientX, y: e.clientY, horizontal: null };
      dragged = false;
    });

    rail.addEventListener('pointermove', function (e) {
      if (!touch) return;

      var dx = e.clientX - touch.x;
      var dy = e.clientY - touch.y;

      if (touch.horizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        touch.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!touch.horizontal) return;

      dragged = true;
      rows.forEach(function (row) { row.pos += dx; });   // 指と同じ向きに動かす
      touch.x = e.clientX;
      touch.y = e.clientY;
    });

    function release() {
      touch = null;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () { paused = false; }, RESUME);
    }

    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);

    // 指で動かしたあとは、離した位置のカードへ移動しない
    rail.addEventListener('click', function (e) {
      if (dragged) {
        e.preventDefault();
        dragged = false;
      }
    }, true);

    // ---- 起動 ----
    var onScrollTouch = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        updateVeil();
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScrollTouch, { passive: true });
    window.addEventListener('resize', function () { measureRows(); updateVeil(); });
    window.addEventListener('load', measureRows);

    measureRows();
    updateVeil();
  }
})();
