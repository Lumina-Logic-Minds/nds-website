/**
 * FV 背景シーン — フロウ・ライン
 *
 * 画面をゆるやかな曲線の流れ場が左から右へ横切り、
 * 粒はその流線に乗って運ばれる。
 *
 * 下地には整列したドット格子を敷く。普段はほとんど無地だが、
 * カーソルが近づくと押しのけられ、色づいて散る。
 * 流れる粒が「動」、格子が「静」の役目を持つ。
 *
 * 中央から放射する波紋と粒（旧実装）をやめ、
 * 「一定方向へ流れる」規律のある動きに置き換えている。
 * カーソルの周囲では流れが押しのけられ、局所的に歪む。
 *
 * 3D カードは WebGL が必要なため fv-cards.js（Three.js）が担当する。
 */
(function () {
  'use strict';

  var canvas = document.getElementById('fv-scene');
  if (!canvas) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ============ 設定 ============ */

  /*
   * 色と出現比率。ブランドカラー（オレンジ・紺）を主役にする。
   * 重みの合計に対する割合で決まるので、数値は相対値でよい。
   */
  var PALETTE = [
    { c: '#f39800', weight: 3.2, lead: true },  // ブランドオレンジ（ロゴの N）
    { c: '#010038', weight: 3.2, lead: true },  // ブランド紺（ロゴの D・S）
    { c: '#3e9ee8', weight: 1.0 },              // 青
    { c: '#196fd3', weight: 0.8 },              // 濃青
    { c: '#54b28b', weight: 1.0 },              // 緑
    { c: '#9957b8', weight: 0.8 },              // 紫
    { c: '#bba2ef', weight: 0.8 },              // 薄紫
    { c: '#ed7a48', weight: 0.9 },              // 橙
    { c: '#efc245', weight: 0.9 }               // 黄
  ];

  var COLOR_TOTAL = PALETTE.reduce(function (s, p) { return s + p.weight; }, 0);

  /** 重み付きで 1 色を選ぶ。ブランド色かどうかも返す */
  function pickColor() {
    var r = Math.random() * COLOR_TOTAL;

    for (var i = 0; i < PALETTE.length; i++) {
      r -= PALETTE[i].weight;
      if (r <= 0) return PALETTE[i];
    }

    return PALETTE[0];
  }

  var DOT_COUNT = 170;    // 流れる粒の数。小さく多くして「流れ」に見せる

  /*
   * 流線。画面を横切る帯を数本置き、粒はそのいずれかに属する。
   * amp = 縦の振れ幅（画面高さ比）、freq = うねりの細かさ、
   * speed = 流れる速さ（px/秒）の基準値。
   */
  var LANES = [
    { y: 0.16, amp: 0.050, freq: 1.05, phase: 0.0, speed: 1.00 },
    { y: 0.31, amp: 0.062, freq: 0.82, phase: 1.7, speed: 0.86 },
    { y: 0.45, amp: 0.055, freq: 1.24, phase: 3.1, speed: 1.12 },
    { y: 0.58, amp: 0.068, freq: 0.94, phase: 0.8, speed: 0.78 },
    { y: 0.72, amp: 0.058, freq: 1.15, phase: 2.4, speed: 1.05 },
    { y: 0.87, amp: 0.048, freq: 0.88, phase: 4.2, speed: 0.92 }
  ];

  var BASE_SPEED = 46;      // 流れの基準速度（px/秒）
  var MOUSE_R = 190;        // カーソルが流れを押しのける半径
  var MOUSE_PUSH = 54;      // 押しのける強さ（px）

  /*
   * 下地のドット格子。
   *
   * 普段は整列していて、ほとんど無地に見える。
   * カーソルが近づいた分だけ押しのけられ、色づいて散る。
   * 流れる粒（動）に対して、こちらは静の役目を持つ。
   */
  var GRID_GAP = 34;        // 格子の間隔（px）
  var GRID_R = 1.25;        // 静止時の半径
  var GRID_ALPHA = 0.16;    // 静止時の濃さ
  var GRID_R2 = 240;        // 反応する半径
  var GRID_PUSH = 46;       // 押しのけられる最大量（px）
  var GRID_EASE = 5.2;      // 元の位置へ戻る速さ

  /* ============ 状態 ============ */

  var w = 0, h = 0, dpr = 1;
  var dots = [];
  var grid = [];
  var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, has: false };
  var last = performance.now();
  var visible = true;
  var started = false;   // コピー出現に合わせて流れはじめる
  var intro = 0;         // 立ち上がりの進み具合 0→1

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ============ 流線 ============ */

  /**
   * ある帯の、ある x 座標での y を返す。
   *
   * 2 つの正弦波を重ねることで、単純な波ではない
   * 「ゆらいだ川筋」に見せる。t を渡すと流れ全体がゆっくり上下する。
   */
  function laneY(lane, x, t) {
    var u = x / Math.max(w, 1);

    var a =
      Math.sin(u * Math.PI * 2 * lane.freq + lane.phase + t * 0.08) * lane.amp +
      Math.sin(u * Math.PI * 2 * lane.freq * 2.3 + lane.phase * 1.6) * lane.amp * 0.34;

    return lane.y * h + a * h;
  }

  /* ============ 粒 ============ */

  /**
   * 粒を作る。init のときは画面全体に散らばった状態から始め、
   * そうでなければ左端の外から入ってくる。
   */
  function makeDot(init) {
    var li = Math.floor(Math.random() * LANES.length);
    var p = pickColor();

    /*
     * 帯の中での上下のずれ。中心に寄るほど密になるよう、
     * 乱数を 3 乗して 0 付近を厚くする。
     */
    var off = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? -1 : 1);

    return {
      lane: li,
      x: init ? rand(-40, w + 40) : rand(-120, -20),
      off: off * h * 0.085,

      // ブランド色は少し大きく、明るく見せて主役にする
      r: p.lead ? rand(3.4, 8.2) : rand(1.8, 5.4),
      color: p.c,
      alpha: p.lead ? rand(0.72, 1) : rand(0.38, 0.78),

      // 帯ごとの速度に、粒ごとのばらつきを掛ける
      sp: rand(0.72, 1.45),

      // 上下にごく僅かに漂う
      bob: rand(0, Math.PI * 2),
      bobA: rand(1.5, 5),

      /*
       * 大きさの脈動。位相と速さを粒ごとに変えて、
       * 全体が揃って呼吸しないようにする。
       *
       * 振れ幅は半径に対する割合。
       * 気づく程度にはっきり振らないと、脈動していることが伝わらない。
       */
      pulse: rand(0, Math.PI * 2),
      pulseSp: rand(0.55, 1.25),
      pulseA: rand(0.34, 0.62),

      // カーソルに押しのけられた量（戻りながら効く）
      px: 0,
      py: 0,

      delay: 0
    };
  }

  function build() {
    dots = [];

    for (var i = 0; i < DOT_COUNT; i++) {
      var d = makeDot(started);

      /*
       * 一斉に流れはじめると帯に見えるので、出はじめを散らす。
       * 全体で約 1.4 秒かけて流れ切る。
       */
      if (!started) d.delay = Math.pow(i / DOT_COUNT, 0.75) * 1.4 + rand(0, 0.25);

      dots.push(d);
    }
  }

  /* ============ 下地の格子 ============ */

  /**
   * 画面いっぱいに等間隔で並べる。
   *
   * 端に半端な余りが出ると目立つので、画面幅から個数を割り出し、
   * 余白を左右へ均等に振り分けて中央に揃える。
   */
  function buildGrid() {
    grid = [];

    var cols = Math.floor(w / GRID_GAP);
    var rows = Math.floor(h / GRID_GAP);

    if (cols < 2 || rows < 2) return;

    var ox = (w - (cols - 1) * GRID_GAP) / 2;
    var oy = (h - (rows - 1) * GRID_GAP) / 2;

    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        grid.push({
          // 本来の位置。押しのけられてもここへ戻る
          hx: ox + i * GRID_GAP,
          hy: oy + j * GRID_GAP,

          // 実際に描かれる位置のずれ
          dx: 0,
          dy: 0,

          // 反応の強さ 0〜1。色と大きさに効く
          on: 0
        });
      }
    }
  }

  /**
   * 格子を描く。
   *
   * カーソルから遠い点は、ごく薄いグレーの小さな点のまま。
   * 近い点ほど外へ押しのけられ、大きく、ブランド色へ寄る。
   * 離れると ばね のように元の位置と色へ戻る。
   */
  function drawGrid(dt) {
    if (!grid.length) return;

    /*
     * 静止している点は、色も大きさも全く同じになる。
     * 1 つずつ塗ると数千回の描画になるため、
     * 動いていない点はまとめて 1 パスで塗る。
     */
    ctx.fillStyle = '#1d1d1d';
    ctx.globalAlpha = GRID_ALPHA * intro;
    ctx.beginPath();

    var active = [];

    for (var i = 0; i < grid.length; i++) {
      var g = grid[i];

      var tx = 0, ty = 0, target = 0;

      if (mouse.has) {
        var vx = g.hx - mouse.x;
        var vy = g.hy - mouse.y;
        var d = Math.sqrt(vx * vx + vy * vy);

        if (d < GRID_R2) {
          // 中心で 1、縁で 0。二乗で落として中心付近を強くする
          var f = 1 - d / GRID_R2;
          f = f * f;

          target = f;

          // 押しのける向き。真上に重なった時は動かさない
          if (d > 0.001) {
            tx = (vx / d) * f * GRID_PUSH;
            ty = (vy / d) * f * GRID_PUSH;
          }
        }
      }

      // 目標値へ寄せる。離れれば自然に戻る
      var k = Math.min(1, dt * GRID_EASE);

      g.dx += (tx - g.dx) * k;
      g.dy += (ty - g.dy) * k;
      g.on += (target - g.on) * k;

      if (g.on < 0.004 && Math.abs(g.dx) < 0.4 && Math.abs(g.dy) < 0.4) {
        g.dx = g.dy = g.on = 0;
      }

      // 反応している点は後でまとめて描く
      if (g.on > 0.02) {
        active.push(g, i);
        continue;
      }

      // 静止している点。同じ色・同じ大きさなので 1 つの経路に足す
      ctx.moveTo(g.hx + GRID_R, g.hy);
      ctx.arc(g.hx, g.hy, GRID_R, 0, Math.PI * 2);
    }

    ctx.fill();

    /*
     * 反応した点。ブランド色へ寄せ、大きく濃くする。
     * 常時グレーだと下地に徹しすぎて、動かした時の発見が弱い。
     */
    for (var k = 0; k < active.length; k += 2) {
      var a = active[k];

      ctx.fillStyle = active[k + 1] % 2 ? '#f39800' : '#010038';
      ctx.globalAlpha = Math.min(1, (GRID_ALPHA + a.on * 0.5) * intro);

      ctx.beginPath();
      ctx.arc(a.hx + a.dx, a.hy + a.dy, GRID_R * (1 + a.on * 2.1), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /* ============ サイズ ============ */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    var rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    build();
    buildGrid();
  }

  /* ============ 描画 ============ */

  /**
   * 流線そのもの。
   *
   * ほとんど見えるか見えないかの細さで引く。
   * 粒がなぜその軌跡を通るのかが無意識に伝わればよく、
   * 線として主張させたいわけではない。
   */
  function drawLanes(t) {
    ctx.lineWidth = 1;

    for (var i = 0; i < LANES.length; i++) {
      var lane = LANES[i];

      ctx.beginPath();

      for (var x = -10; x <= w + 10; x += 14) {
        var y = laneY(lane, x, t) + pushY(x, laneY(lane, x, t));

        if (x <= -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // 立ち上がりに合わせて薄く現れる
      ctx.strokeStyle = 'rgba(29, 29, 29, ' + (0.05 * intro).toFixed(3) + ')';
      ctx.stroke();
    }
  }

  /**
   * カーソル周辺で流れを押しのける量（縦方向）。
   *
   * カーソルに近いほど大きく、離れると 0 に戻る。
   * 上下どちら側にいるかで押しのける向きを変える。
   */
  function pushY(x, y) {
    if (!mouse.has) return 0;

    var dx = x - mouse.x;
    var dy = y - mouse.y;
    var d = Math.sqrt(dx * dx + dy * dy);

    if (d > MOUSE_R) return 0;

    // 中心で 1、縁で 0 になめらかに落とす
    var f = 1 - d / MOUSE_R;
    f = f * f;

    return (dy >= 0 ? 1 : -1) * f * MOUSE_PUSH;
  }

  function drawDot(dot, t, dt) {
    // 開始前は流れない（描かない）
    if (!started) return;

    if (dot.delay > 0) {
      dot.delay -= dt;
      return;
    }

    var lane = LANES[dot.lane];

    // 帯ごとの速さ × 粒ごとのばらつきで、左から右へ運ばれる
    dot.x += BASE_SPEED * lane.speed * dot.sp * dt;

    // 右端を抜けたら左から入れ直す
    if (dot.x > w + 60) {
      var fresh = makeDot(false);
      for (var k in fresh) dot[k] = fresh[k];
      return;
    }

    dot.bob += dt * 0.6;

    var baseY =
      laneY(lane, dot.x, t) +
      dot.off +
      Math.sin(dot.bob) * dot.bobA;

    // カーソルの影響。急に飛ばないよう、目標値へ寄せる
    var target = pushY(dot.x, baseY);
    dot.py += (target - dot.py) * Math.min(1, dt * 3.4);

    var y = baseY + dot.py;

    /*
     * 大きさを脈打たせる。形は丸のままなので生き物には見えない。
     *
     * 小さい粒では数 px の増減が読み取りにくいため、
     * 濃さも一緒に動かす。膨らむときに濃く、縮むときに淡くなり、
     * 同じ位相の変化が二重に効いて呼吸がはっきり伝わる。
     */
    dot.pulse += dt * dot.pulseSp;

    var beat = Math.sin(dot.pulse);          // -1 〜 1
    var r = dot.r * (1 + beat * dot.pulseA);

    if (r < 0.4) return;

    /*
     * 左右の端では淡くして、湧いたり消えたりが見えないようにする。
     */
    var edge = Math.min(
      1,
      Math.min(dot.x + 60, w + 60 - dot.x) / 110
    );

    if (edge <= 0) return;

    // 濃さの振れ幅は控えめにして、粒が消えてしまわないようにする
    var fade = 1 + beat * 0.32;

    ctx.globalAlpha =
      Math.min(1, dot.alpha * fade) * Math.max(0, edge) * intro;
    ctx.beginPath();
    ctx.arc(dot.x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);

    if (!visible) { last = now; return; }

    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var t = now / 1000;

    // 立ち上がり。始まってから約 1.1 秒かけて濃くなる
    if (started && intro < 1) intro = Math.min(1, intro + dt / 1.1);

    mouse.x += (mouse.tx - mouse.x) * 0.09;
    mouse.y += (mouse.ty - mouse.y) * 0.09;

    ctx.clearRect(0, 0, w, h);

    // 下地 → 流線 → 流れる粒 の順に重ねる
    drawGrid(dt);
    drawLanes(t);

    for (var i = 0; i < dots.length; i++) {
      drawDot(dots[i], t, dt);
    }
  }

  /* ============ イベント ============ */

  var rt = null;

  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 180);
  });

  window.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();

    mouse.tx = e.clientX - rect.left;
    mouse.ty = e.clientY - rect.top;

    if (!mouse.has) {
      // 初回は補間せず、その場から始める
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
      mouse.has = true;
    }
  }, { passive: true });

  window.addEventListener('mouseout', function (e) {
    if (e.relatedTarget) return;
    mouse.has = false;
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
  });

  // コピーの出現に合わせて、粒が流れはじめる
  document.addEventListener('fv:copy', function () {
    started = true;
  }, { once: true });

  // 保険：イベントが来なくても始める
  setTimeout(function () { started = true; }, 9000);

  resize();

  requestAnimationFrame(frame);
})();
