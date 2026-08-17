/**
 * FV 背景シーン — フロウ・ライン
 *
 * 画面をゆるやかな曲線の流れ場が左から右へ横切り、
 * 粒はその流線に乗って運ばれる。
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

  /*
   * 流線が歪んだときに寄せる色。
   * rgba() に差し込むので、成分だけの文字列で持つ。
   */
  var BRAND_ORANGE = '243, 152, 0';   // #f39800（ロゴの N）
  var BRAND_NAVY = '1, 0, 56';        // #010038（ロゴの D・S）

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
   * 線を走る光。
   *
   * カーソルでなぞったときと同じ見た目が、
   * ひとりでに左から右へ流れていく。
   * 同じ「近さ」の計算を通すので、見た目は完全に一致する。
   */
  var RUN_R = 165;          // 光が届く範囲（px）
  var RUN_SPEED = 520;      // 走る速さ（px/秒）
  var RUN_GAP = 2.6;        // 次が出るまでの平均の間隔（秒）
  var RUN_MAX = 3;          // 同時に走れる本数

  /* ============ 状態 ============ */

  var w = 0, h = 0, dpr = 1;
  var dots = [];
  var runs = [];         // 走っている光
  /*
   * 次の光が出るまでの残り時間（秒）。
   * 粒が流れはじめた直後に走ると、ロゴの描画と重なって
   * 慌ただしいので、最初だけ少し待たせる。
   */
  var nextRun = 2.4;
  var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, has: false };
  var last = performance.now();
  var visible = true;
  var started = false;   // コピー出現に合わせて流れはじめる
  var intro = 0;         // 立ち上がりの進み具合 0→1

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ============ 線を走る光 ============ */

  /**
   * 光を進め、寿命の尽きたものを片づける。
   *
   * 出現は完全な等間隔にせず、間隔を毎回ばらつかせる。
   * 規則正しく出ると仕掛けが読めてしまい、
   * 「たまたま起きた」ように見えなくなる。
   */
  function updateRuns(dt) {
    for (var i = runs.length - 1; i >= 0; i--) {
      var r = runs[i];

      r.x += r.sp * dt;

      // 右端の外へ抜けきったら終わり
      if (r.x - RUN_R > w) runs.splice(i, 1);
    }

    if (!started) return;

    nextRun -= dt;
    if (nextRun > 0) return;

    // 次までの間隔。半分から 1.7 倍までばらつかせる
    nextRun = RUN_GAP * rand(0.5, 1.7);

    if (runs.length >= RUN_MAX) return;

    /*
     * どの帯を走らせるか。
     * 直前と同じ帯が続くと目が慣れてしまうので、
     * 既に走っている帯は選ばない。
     */
    var free = [];

    for (var k = 0; k < LANES.length; k++) {
      var used = false;

      for (var j = 0; j < runs.length; j++) {
        if (runs[j].lane === k) { used = true; break; }
      }

      if (!used) free.push(k);
    }

    if (!free.length) return;

    var lane = free[Math.floor(Math.random() * free.length)];

    runs.push({
      lane: lane,
      x: -RUN_R,
      sp: RUN_SPEED * rand(0.75, 1.3),

      // 走るたびに色が変わる。帯ごとの色には縛られない
      hot: Math.random() < 0.5 ? BRAND_ORANGE : BRAND_NAVY,

      // 強さも毎回変える。いつも同じ濃さだと単調になる
      power: rand(0.72, 1)
    });
  }

  /**
   * その帯の、ある x 地点に掛かっている光の強さ（0〜1）。
   *
   * カーソルの nearAt と同じ形の減衰にしてあるので、
   * なぞったときと同じ見た目になる。
   */
  function runAt(laneIndex, x) {
    var best = 0;

    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (r.lane !== laneIndex) continue;

      var d = Math.abs(x - r.x);
      if (d > RUN_R) continue;

      var f = 1 - d / RUN_R;
      f = f * f * r.power;

      if (f > best) best = f;
    }

    return best;
  }

  /** その地点を照らしている、いちばん強い光の色 */
  function runColorAt(laneIndex, x) {
    var best = 0;
    var col = BRAND_ORANGE;

    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (r.lane !== laneIndex) continue;

      var d = Math.abs(x - r.x);
      if (d > RUN_R) continue;

      var f = 1 - d / RUN_R;
      f = f * f * r.power;

      if (f > best) { best = f; col = r.hot; }
    }

    return col;
  }

  /**
   * その帯で、いちばん近い光までの距離。
   * 刻み幅を細かくする範囲を決めるのに使う。
   */
  function runDist(laneIndex, x) {
    var best = Infinity;

    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (r.lane !== laneIndex) continue;

      var d = Math.abs(x - r.x);
      if (d < best) best = d;
    }

    return best;
  }

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
  }

  /* ============ 描画 ============ */

  /**
   * 流線そのもの。
   *
   * 普段はほとんど見えるか見えないかの細さで引く。
   * 粒がなぜその軌跡を通るのかが無意識に伝わればよく、
   * 線として主張させたいわけではない。
   *
   * ただしカーソルに歪められている区間と、
   * 光が走っている区間だけは、ブランド色（オレンジ・紺）へ
   * 寄せて濃く太くする。
   */
  function drawLanes(t) {
    ctx.lineCap = 'round';

    for (var i = 0; i < LANES.length; i++) {
      var lane = LANES[i];

      /*
       * カーソルで色づくときの色。
       * 隣り合う帯が同じ色にならないよう交互にする。
       * 走る光は自前の色を持つので、こちらには縛られない。
       */
      var hot = i % 2 ? BRAND_ORANGE : BRAND_NAVY;

      /*
       * 歪んでいない区間は色も太さも全く同じなので、
       * 1 本の経路にまとめて一度で描く。
       * 区間ごとに stroke すると、1 フレームに 800 回を超える。
       */
      ctx.strokeStyle = 'rgba(29, 29, 29, ' + (0.05 * intro).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();

      var px = 0, py = 0, pf = 0, pc = hot;
      var hotSegs = null;

      /*
       * 刻み幅。
       *
       * 帯のうねりは緩やかなので粗くてよいが、カーソルの近くだけは
       * 曲がりが急で、粗いままだと折れ線に見えてしまう。
       * その範囲に入っている間は細かく刻む。
       */
      for (var x = -10; x <= w + 10; ) {
        var base = laneY(lane, x, t);

        var f = pushAt(x, base);
        var y = base + f * MOUSE_PUSH;

        // 色と太さは、ずれの量ではなくカーソルへの近さで決める
        var cur = nearAt(x, base);
        var col = hot;

        /*
         * 走っている光。カーソルより強ければ、そちらの色にする。
         * 混ぜると濁るので、強いほうだけを採る。
         */
        var rf = runAt(i, x);

        if (rf > cur) {
          cur = rf;
          col = runColorAt(i, x);
        }

        if (x > -10) {
          /*
           * 区間の見た目は、両端の強いほうで決める。
           * 弱いほうに合わせると、色の境目が
           * 影響の縁より内側に寄って見える。
           */
          var s = Math.max(pf, cur);
          var sc = pf > cur ? pc : col;

          if (s < 0.01) {
            // 素のまま。まとめ描き用の経路に足す
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
          } else {
            // 色づいている区間は後から個別に描く
            (hotSegs || (hotSegs = [])).push(px, py, x, y, s, sc);
          }
        }

        px = x;
        py = y;
        pf = cur;
        pc = col;

        /*
         * カーソルや光の近くでは細かく、外では粗く進める。
         * 境目で刻みが急に変わらないよう、距離に応じて連続的に変える。
         *
         * 光の縁も色が切り替わる境目なので、
         * 粗いままだと色の段差が階段状に見えてしまう。
         */
        var near = mouse.has
          ? Math.max(0, 1 - Math.abs(x - mouse.x) / (MOUSE_R * 1.3))
          : 0;

        if (runs.length) {
          near = Math.max(
            near,
            Math.max(0, 1 - runDist(i, x) / (RUN_R * 1.3))
          );
        }

        x += 14 - near * 10;
      }

      ctx.stroke();

      /*
       * 歪んでいる区間。強いほど濃く太くする。
       * グレーからブランド色へ徐々に移すのではなく
       * 濃さで見せるので、色が濁らない。
       */
      if (hotSegs) {
        for (var k = 0; k < hotSegs.length; k += 6) {
          var st = hotSegs[k + 4];

          ctx.strokeStyle =
            'rgba(' + hotSegs[k + 5] + ', ' +
            ((0.05 + st * 0.75) * intro).toFixed(3) + ')';
          ctx.lineWidth = 1 + st * 3.4;

          ctx.beginPath();
          ctx.moveTo(hotSegs[k], hotSegs[k + 1]);
          ctx.lineTo(hotSegs[k + 2], hotSegs[k + 3]);
          ctx.stroke();
        }
      }
    }
  }

  /**
   * カーソル周辺で流れを押しのける量（縦方向）。
   *
   * カーソルに近いほど大きく、離れると 0 に戻る。
   * 上下どちら側にいるかで押しのける向きを変える。
   */
  function pushY(x, y) {
    return pushAt(x, y) * MOUSE_PUSH;
  }

  /**
   * その地点が、カーソルにどれだけ歪められているか。
   *
   * 押しのけの量そのものではなく -1〜1 の強さを返す。
   * 線の色づきにも同じ値を使うので、
   * 歪みと色が必ず一致する。
   *
   * 向きを dy の符号で決めると、カーソルが線に重なったところで
   * 上下が反転し、線が縦に切れて段差になる。
   * 符号ではなく、カーソルからの縦のずれになめらかに比例させ、
   * 重なった点では押しのけ量が 0 になるようにする。
   */
  /**
   * その地点がカーソルにどれだけ近いか（0〜1）。
   *
   * 押しのけ量はカーソルの真上で 0 になるが、
   * 色と太さまで細らせると、いちばん見られている
   * 真下の区間だけ痩せて見えてしまう。
   * 見た目の強さは、ずれではなく距離だけで決める。
   */
  function nearAt(x, y) {
    if (!mouse.has) return 0;

    var dx = x - mouse.x;
    var dy = y - mouse.y;
    var d = Math.sqrt(dx * dx + dy * dy);

    if (d > MOUSE_R) return 0;

    var f = 1 - d / MOUSE_R;

    return f * f;
  }

  function pushAt(x, y) {
    if (!mouse.has) return 0;

    var dx = x - mouse.x;
    var dy = y - mouse.y;
    var d = Math.sqrt(dx * dx + dy * dy);

    if (d > MOUSE_R) return 0;

    // 中心で 1、縁で 0 になめらかに落とす
    var f = 1 - d / MOUSE_R;
    f = f * f;

    /*
     * 向きと強さ。dy / MOUSE_R は -1〜1 の連続値で、
     * カーソルのちょうど上では 0 になる。
     * これに掛けることで、反転による段差が生まれない。
     *
     * ずれが小さいうちに押しのけが立ち上がるよう、
     * 縦のずれは範囲の半分で頭打ちにする。
     */
    var dir = Math.max(-1, Math.min(1, dy / (MOUSE_R * 0.5)));

    return dir * f;
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

    updateRuns(dt);
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
