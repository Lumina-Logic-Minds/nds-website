/**
 * FV 背景シーン
 *
 * 参考: https://www.ntvart.co.jp/
 *  - 中央の波紋は静止したまま常にそこにある
 *  - カラフルな円は波紋の中から湧き出し、カーブを描いて画面外へ抜ける
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
   * 色と出現比率。ブランドカラー（オレンジ・紺）を多めに出す。
   * 重みの合計に対する割合で決まるので、数値は相対値でよい。
   */
  var PALETTE = [
    { c: '#f39800', weight: 3.0 }, // ブランドオレンジ（ロゴの N）
    { c: '#010038', weight: 3.0 }, // ブランド紺（ロゴの D・S）
    { c: '#3e9ee8', weight: 1.0 }, // 青
    { c: '#196fd3', weight: 1.0 }, // 濃青
    { c: '#54b28b', weight: 1.0 }, // 緑
    { c: '#9957b8', weight: 1.0 }, // 紫
    { c: '#bba2ef', weight: 1.0 }, // 薄紫
    { c: '#ed7a48', weight: 1.0 }, // 橙
    { c: '#efc245', weight: 1.0 }  // 黄
  ];

  var COLOR_TOTAL = PALETTE.reduce(function (s, p) { return s + p.weight; }, 0);

  /** 重み付きで 1 色を選ぶ */
  function pickColor() {
    var r = Math.random() * COLOR_TOTAL;

    for (var i = 0; i < PALETTE.length; i++) {
      r -= PALETTE[i].weight;
      if (r <= 0) return PALETTE[i].c;
    }

    return PALETTE[0].c;
  }

  var FOCAL = 620;       // 焦点距離（小さいほど遠近が強い）
  var DOT_COUNT = 96;    // 湧き出す円の数

  var CURVE = 0.30;      // 円が描くカーブの強さ（反時計回り）

  /* ============ 状態 ============ */

  var w = 0, h = 0, dpr = 1, cx = 0, cy = 0;
  var dots = [];
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var t0 = performance.now();
  var last = t0;
  var visible = true;
  var started = false;   // コピー出現に合わせて円が湧き出す

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ============ 円（波紋から湧き出す） ============ */

  /**
   * 出現方向を決める。
   *
   * 波紋の中心は画面右寄りにあるため、左へ向かう円は画面外に出るまでの
   * 距離が長く、右へ向かう円はすぐ消えて作り直される。そのまま等確率で
   * 撒くと左側が薄くなるので、縁までの距離が長い向きほど多く出す。
   */
  function pickAngle() {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;

      var dx = Math.cos(a);
      var dy = Math.sin(a);

      // その向きで画面の縁に届くまでの距離
      var tx = dx > 0 ? (w - cx) / dx : (dx < 0 ? -cx / dx : Infinity);
      var ty = dy > 0 ? (h - cy) / dy : (dy < 0 ? -cy / dy : Infinity);
      var reach = Math.min(tx, ty);

      // 最長の向きを 1 として、距離に比例した確率で採用する
      var maxReach = Math.max(cx, w - cx, cy, h - cy) * 1.45;

      if (Math.random() < reach / maxReach) return a;
    }

    return Math.random() * Math.PI * 2;
  }

  /**
   * 波紋の中心から生まれ、外へ向かいながら反時計回りにカーブする。
   * 角度そのものを時間で回すことで、軌跡が弧を描く。
   */
  function makeDot(init) {
    var ang = pickAngle();

    return {
      ang: ang,
      // 中心からの距離。init 時のみ既に散らばった状態から始める
      rad: init ? rand(20, Math.max(w, h) * 0.7) : rand(8, 40),
      vr: rand(70, 175),               // 外へ広がる速さ
      spin: CURVE * rand(0.55, 1.5),   // カーブの強さ（＋で反時計回り）
      z: init ? rand(-FOCAL * 0.5, FOCAL * 1.2) : rand(-FOCAL * 0.45, 0),
      vz: rand(26, 92),                // 手前へ迫る速さ
      r: rand(4, 16),
      color: pickColor(),
      seed: Math.random() * Math.PI * 2,
      delay: 0                         // 初回のみ build() で散らす
    };
  }

  function build() {
    /*
     * 円は波紋から湧き出す演出なので、最初は中心に集めておく。
     * started が true になってから外へ広がり始める。
     */
    dots = [];

    for (var i = 0; i < DOT_COUNT; i++) {
      // 既に始まっている場合（リサイズ時）は散らばった状態で作り直す
      var d = makeDot(started);

      // 一斉に湧くと塊に見えるので、出はじめを散らす
      // 全体で約 1.2 秒かけて湧き切る
      if (!started) d.delay = Math.pow(i / DOT_COUNT, 0.8) * 1.2 + rand(0, 0.2);

      dots.push(d);
    }

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

    // 波紋の中心。左のロゴを避けて右寄りに置く
    cx = w * (w > 900 ? 0.62 : 0.5);
    cy = h * 0.48;

    build();
  }

  /* ============ 投影 ============ */

  function project(x, y, z) {
    var d = FOCAL + z;
    if (d < 1) return null;

    var s = FOCAL / d;

    return {
      x: cx + x * s + (mouse.x - cx) * 0.03 * s,
      y: cy + y * s + (mouse.y - cy) * 0.03 * s,
      s: s
    };
  }

  /* ============ 描画 ============ */

  /**
   * 静止した波紋。広がらず、常に同じ場所にある。
   *
   * 地色（#f7f8fa）を最も外側の層とみなし、内側に向かって
   * 段階的に白へ近づける。中心は純白。地色を含めて 4 層に見える。
   */
  var RIPPLE_LAYERS = [
    { r: 3.10, c: '#fafbfd' },
    { r: 2.10, c: '#fdfdfe' },
    { r: 1.20, c: '#ffffff' }   // 中心は純白
  ];

  /*
   * 地色と純白の差が 8 しかなく、塗り分けだけでは境目が出ない。
   * 各層の縁に極薄の線を引いて輪郭だけを認識できるようにする。
   */
  var RIPPLE_EDGE = 'rgba(29, 29, 29, 0.03)';

  function drawRipple() {
    var base = Math.min(w, h) * 0.105;

    // 外側から順に描いて重ねる
    for (var i = 0; i < RIPPLE_LAYERS.length; i++) {
      var L = RIPPLE_LAYERS[i];

      ctx.beginPath();
      ctx.arc(cx, cy, base * L.r, 0, Math.PI * 2);
      ctx.fillStyle = L.c;
      ctx.fill();

      // 最も外側の縁は地色との境目なので線を引かない
      if (i > 0) {
        ctx.strokeStyle = RIPPLE_EDGE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawDot(dot, t, dt) {
    // 開始前は波紋の中に潜んだまま（描かない）
    if (!started) return;

    // 出番が来るまで待機。中心にいるので描いても見えないが、
    // 念のため描画自体を止めて負荷も抑える
    if (dot.delay > 0) {
      dot.delay -= dt;
      return;
    }

    // 外へ広がりながら、角度が回ることでカーブになる
    dot.rad += dot.vr * dt;
    dot.ang += (dot.spin / Math.max(dot.rad, 60)) * 90 * dt;
    dot.z += dot.vz * dt;

    var x = Math.cos(dot.ang) * dot.rad;
    var y = Math.sin(dot.ang) * dot.rad * 0.9;

    var p = project(x, y, dot.z);

    // 画面外へ出るか、手前を通り過ぎたら中心へ戻す
    var out =
      !p ||
      dot.z > FOCAL * 1.9 ||
      p.x < -120 || p.x > w + 120 ||
      p.y < -120 || p.y > h + 120;

    if (out) {
      var fresh = makeDot(false);
      for (var k in fresh) dot[k] = fresh[k];
      return;
    }

    var r = dot.r * p.s;
    if (r < 0.5) return;

    // 湧き出した直後だけ淡く立ち上げる
    var a = Math.min(1, p.s * 0.9);
    if (dot.rad < 120) a *= dot.rad / 120;

    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);

    if (!visible) { last = now; return; }

    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var t = (now - t0) / 1000;

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;

    ctx.clearRect(0, 0, w, h);

    drawRipple();

    // 奥のものから描いて、手前が上に重なるようにする
    var all = [];

    for (var i = 0; i < dots.length; i++) all.push({ o: dots[i], card: false });

    all.sort(function (a, b) { return a.o.z - b.o.z; });

    for (var k = 0; k < all.length; k++) {
      drawDot(all[k].o, t, dt);
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
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
  });

  // コピーの出現に合わせて、円が波紋から湧き出しはじめる
  document.addEventListener('fv:copy', function () {
    started = true;
  }, { once: true });

  // 保険：イベントが来なくても始める
  setTimeout(function () { started = true; }, 9000);

  resize();

  mouse.x = mouse.tx = cx;
  mouse.y = mouse.ty = cy;

  requestAnimationFrame(frame);
})();
