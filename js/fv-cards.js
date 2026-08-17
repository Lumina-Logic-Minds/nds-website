/**
 * FV の 3D カード（Three.js / WebGL）
 *
 * 厚みのある箱に事業バナーを貼り、光源による陰影と
 * 前後関係を GPU に処理させることで、板が本物のカードに見える。
 *
 * 粒（fv-scene.js）と同じく左から右へ流れ、
 * 流れに乗って滑るようにゆっくり傾く。
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('fv-cards');
  if (!canvas) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /*
   * 事業バナーと、その厚み（小口）の色。
   * 各画像の主要な色に合わせると、立体感がはっきり出る。
   */
  var CARDS = [
    { src: 'image/hataraku_logo1.png', edge: 0x0d2a3a }, // 夜空の紺
    { src: 'image/nfree_logo1.png',    edge: 0x2fae7f }, // N-Free の緑
    { src: 'image/dx_logo.png',        edge: 0x7b6fd0 }, // DX研修の紫
    { src: 'image/tokyo.png',          edge: 0xc0574c }  // アカデミーの赤
  ];

  var LANES = 4;             // 縦位置の帯（＝同時に出る枚数）
  var CARD_W = 2.7;          // カードの幅（3D 空間の単位）
  var CARD_H = CARD_W * (422 / 750);
  var CARD_D = 0.03;         // 厚み

  var renderer, scene, camera, cards = [];
  var w = 0, h = 0;
  var visible = true;
  var started = true;
  var clock = null;
  var elapsed = 0;

  /*
   * カーソル。画面座標ではなく、カードと同じ 3D 空間の座標で持つ。
   * has が false の間は誰にも力が掛からない。
   */
  var mouse = { x: 0, y: 0, nx: 0, ny: 0, has: false };

  var PUSH_R = 3.4;      // 力が届く範囲（3D 単位）

  /*
   * 押しのけはごく僅かに留める。
   * カードは逃げるのではなく、その場で少し向きを変えて反応する。
   */
  var PUSH_F = 3.2;      // 押す力の強さ
  var SPRING = 7.0;      // 元の位置へ戻ろうとする強さ
  var DAMP = 3.4;        // 速度の減衰。大きいほど早く落ち着く

  /*
   * 回転の反応。カーソルのある側へ、少しだけ傾いて向く。
   * TILT_MAX を超えて回らないので、大きく振り回されることはない。
   */
  var TILT_MAX = 0.46;    // 押されて増える傾きの上限（ラジアン, 0.46 ≒ 26度）

  /*
   * ゆっくり向きを変えるほど滑らかに見える。
   * ばねを弱めると同時に減衰も緩め、
   * 行き過ぎて戻る揺り返しが穏やかに出るようにする。
   */
  var TILT_SPRING = 14;   // 目標の傾きへ向かう強さ
  var TILT_DAMP = 4.6;    // 傾きの減衰

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------- カード形状 ---------- */

  /**
   * 角丸の平面を作り、UV を XY 座標から張り直す。
   * ShapeGeometry の UV は形状の外接矩形基準でずれるため、
   * カード全体に画像がぴったり収まるよう計算し直す。
   */
  /** カードの輪郭（角丸の長方形） */
  function makeCardShape(inset) {
    var cw = CARD_W - (inset || 0) * 2;
    var ch = CARD_H - (inset || 0) * 2;

    var r = CARD_H * 0.085;
    var x = -cw / 2;
    var y = -ch / 2;

    var shape = new THREE.Shape();

    shape.moveTo(x + r, y);
    shape.lineTo(x + cw - r, y);
    shape.quadraticCurveTo(x + cw, y, x + cw, y + r);
    shape.lineTo(x + cw, y + ch - r);
    shape.quadraticCurveTo(x + cw, y + ch, x + cw - r, y + ch);
    shape.lineTo(x + r, y + ch);
    shape.quadraticCurveTo(x, y + ch, x, y + ch - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);

    return shape;
  }

  /** 厚みの芯。輪郭を押し出すので四つ角が丸くなる */
  function makeCoreGeometry() {
    var geo = new THREE.ExtrudeGeometry(makeCardShape(0.004), {
      depth: CARD_D,
      bevelEnabled: false,
      curveSegments: 14
    });

    geo.center();

    return geo;
  }

  function makeRoundedFace() {
    var geo = new THREE.ShapeGeometry(makeCardShape(0), 14);

    var pos = geo.attributes.position;
    var uv = geo.attributes.uv;

    for (var i = 0; i < pos.count; i++) {
      uv.setXY(
        i,
        (pos.getX(i) + CARD_W / 2) / CARD_W,
        (pos.getY(i) + CARD_H / 2) / CARD_H
      );
    }

    uv.needsUpdate = true;

    return geo;
  }

  /**
   * 厚みのあるカードを、芯（BoxGeometry）と表裏の面（PlaneGeometry）で組む。
   *
   * ExtrudeGeometry は UV が押し出し用で画像貼りに向かないため、
   * UV が最初から正しい PlaneGeometry を芯の両面に貼る方式にする。
   * 角丸はテクスチャ画像側で切り抜いて表現する。
   */
  function makeCard(faceMat, edgeMat) {
    var group = new THREE.Group();

    /*
     * 芯：これが厚みになる。表面と同じ角丸の輪郭を押し出すので、
     * 厚みの四つ角もきちんと丸くなる。
     */
    var core = new THREE.Mesh(makeCoreGeometry(), edgeMat);

    group.add(core);

    var planeGeo = makeRoundedFace();

    // 表面
    var front = new THREE.Mesh(planeGeo, faceMat);
    front.position.z = CARD_D / 2 + 0.001;
    group.add(front);

    // 裏面（同じ絵。裏返っても白い板にならない）
    var backFace = new THREE.Mesh(planeGeo, faceMat);
    backFace.position.z = -CARD_D / 2 - 0.001;
    backFace.rotation.y = Math.PI;
    group.add(backFace);

    return group;
  }

  /* ---------- カード ---------- */

  /**
   * カードを配置する。
   *
   * 粒と同じく左から右へ流れるので、帯（lane）は縦位置を決め、
   * 横位置は画面の外から入ってくる。
   */
  function placeCard(mesh, lane, initial) {
    /*
     * 流れとしての位置は base に持ち、カーソルで押された
     * ぶんのズレ（o*）を足したものを実際の position にする。
     * 両者を分けておかないと、押されたズレが流れに溶けて
     * 元の位置へ戻れなくなる。
     */
    var bz = rand(-2.2, 0.6);

    // 奥行きによって見える高さが変わるので、カードの z で測る
    var vh = viewHeight(bz);
    var lh = (vh * 1.02) / LANES;
    var ly = -vh * 0.51 + lh * (lane + 0.5);

    var side = viewWidth(bz) / 2 + CARD_W;

    mesh.userData.baseZ = bz;
    mesh.userData.baseY = ly + rand(-lh * 0.18, lh * 0.18);
    mesh.userData.baseX = initial ? rand(-side, side) : -side;

    mesh.position.set(
      mesh.userData.baseX,
      mesh.userData.baseY,
      bz
    );

    mesh.userData.vx = rand(0.5, 0.9);

    /*
     * 各軸を正面中心に往復させる（裏返らないので文字が読める）。
     *
     * 流れに乗って滑っていく見せ方なので、
     * 舞い上がる旧実装より振り幅を抑え、ゆっくり傾かせる。
     */
    mesh.userData.ax = rand(0.20, 0.42);
    mesh.userData.ay = rand(0.28, 0.54);
    mesh.userData.az = rand(0.10, 0.24);

    // 速さ
    mesh.userData.sx = rand(0.26, 0.52);
    mesh.userData.sy = rand(0.30, 0.60);
    mesh.userData.sz = rand(0.18, 0.40);
    mesh.userData.px = Math.random() * Math.PI * 2;
    mesh.userData.py = Math.random() * Math.PI * 2;
    mesh.userData.pz = Math.random() * Math.PI * 2;

    /*
     * カーソルに押されたときのズレと、その速度。
     *
     * 粒のように目標値へ直接寄せると弾かれたように動いてしまう。
     * カードは厚みのある物体として見せたいので、速度を持たせ、
     * 力を加えて動かす。押されてから動き出すまでに一拍あり、
     * 離れたあとも慣性で流れてからゆっくり戻る。
     */
    mesh.userData.ox = 0;
    mesh.userData.oy = 0;
    mesh.userData.oz = 0;
    mesh.userData.ovx = 0;
    mesh.userData.ovy = 0;
    mesh.userData.ovz = 0;

    // 押されて傾く量と、その速度
    mesh.userData.tiltX = 0;
    mesh.userData.tiltY = 0;
    mesh.userData.tvx = 0;
    mesh.userData.tvy = 0;

    /*
     * 重さ。軽いカードほど大きく速く動く。
     * 全部が同じだと、群れが一斉に同じ動きをして嘘っぽくなる。
     */
    mesh.userData.mass = rand(0.78, 1.35);
    mesh.userData.lane = lane;
  }

  /** 指定した奥行きでカメラに見える範囲（3D 単位） */
  function viewHeight(z) {
    var d = camera.position.z - (z || 0);
    return 2 * Math.tan((camera.fov * Math.PI) / 360) * d;
  }

  function viewWidth(z) {
    return viewHeight(z) * camera.aspect;
  }

  /* ---------- 初期化 ---------- */

  function init() {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 10;

    /*
     * 光源。白背景に馴染むよう、環境光を強めにして
     * 平行光で角と側面にだけ陰影が出るようにする。
     */
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    var key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(-3, 5, 6);
    scene.add(key);

    var fill = new THREE.DirectionalLight(0xdfe6f2, 0.4);
    fill.position.set(4, -2, 3);
    scene.add(fill);

    for (var i = 0; i < LANES; i++) {
      var def = CARDS[i % CARDS.length];

      // 側面（小口）はカードごとの色。光を受けて陰影が出る
      var edgeMat = new THREE.MeshLambertMaterial({ color: def.edge });

      /*
       * 表面は光の影響を受けない材質にする。
       * Lambert だと光源の色と強さで画像本来の色がくすむため。
       */
      var faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      /*
       * TextureLoader は file:// だと CORS で失敗するため、
       * 通常の Image で読み込み、角丸に切り抜いてからテクスチャにする。
       */
      (function (mat, src) {
        var img = new Image();

        /*
         * 画像は Canvas を経由せず、そのままテクスチャにする。
         * file:// では Canvas に描いた時点で汚染され、
         * WebGL のテクスチャとして使えなくなるため。
         * 角の丸みは形状（ExtrudeGeometry）側で作る。
         */
        var apply = function () {
          if (!img.naturalWidth) return;

          var tex = new THREE.Texture(img);

          tex.encoding = THREE.sRGBEncoding;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          tex.needsUpdate = true;

          mat.map = tex;
          mat.color.setHex(0xffffff);
          mat.needsUpdate = true;
        };

        img.onload = apply;
        img.src = src;

        // キャッシュ済みで onload が発火しない場合に備える
        if (img.complete) apply();
      })(faceMat, def.src);

      var mesh = makeCard(faceMat, edgeMat);

      mesh.userData.img = i % CARDS.length;
      scene.add(mesh);
      cards.push(mesh);
    }

    resize();
    cards.forEach(function (m, i) { placeCard(m, i, true); });

    clock = new THREE.Clock();
    renderer.setAnimationLoop(frame);
  }

  /* ---------- リサイズ ---------- */

  function resize() {
    var rect = canvas.getBoundingClientRect();

    w = rect.width;
    h = rect.height;

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ---------- ループ ---------- */

  function frame() {
    if (!visible) return;

    /*
     * getDelta() は前回の getDelta() からの差分を返すため、
     * 先に getElapsedTime() を呼ぶと dt がほぼ 0 になり動かなくなる。
     * 必ず getDelta() を先に取り、経過時間は自前で積算する。
     */
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    var t = elapsed;

    for (var i = 0; i < cards.length; i++) {
      var m = cards[i];
      var u = m.userData;

      if (started) u.baseX += u.vx * dt;

      // 画面右へ抜けたら左から出し直す
      if (u.baseX > viewWidth(u.baseZ) / 2 + CARD_W) {
        placeCard(m, u.lane, false);
      }

      /*
       * カーソルから受ける力。
       *
       * 位置はほとんど動かさない。カードはその場に留まったまま、
       * 少しだけ向きを変えることで反応を返す。
       */
      var fx = 0, fy = 0, fz = 0, near = 0;

      // 押されて向く先（傾きの目標値）
      var tgX = 0, tgY = 0;

      if (mouse.has) {
        // カードの現在位置（ズレ込み）とカーソルの距離
        var dx = (u.baseX + u.ox) - mouse.x;
        var dy = (u.baseY + u.oy) - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d < PUSH_R) {
          // 中心で 1、縁で 0。二乗で落として近いほど強くする
          var f = 1 - d / PUSH_R;
          f = f * f;

          near = f;

          // 押しのける向き。真上に重なったときは動かさない
          if (d > 0.0001) {
            var s = (PUSH_F * f) / u.mass;

            fx = (dx / d) * s;
            fy = (dy / d) * s;

            /*
             * 傾きの目標。カーソルのある側へ面を向ける。
             *
             * 距離で正規化した向きに上限を掛けるので、
             * どれだけ近づいても TILT_MAX 以上には回らない。
             * 重いカードほど傾きが浅くなる。
             */
            var tilt = (TILT_MAX * f) / u.mass;

            tgY = -(dx / d) * tilt;
            tgX = (dy / d) * tilt;
          }

          // 押されたぶんだけ、わずかに手前へ浮き上がる
          fz = (PUSH_F * 0.5 * f) / u.mass;
        }
      }

      /*
       * ばね：元の位置（ズレ 0）へ引き戻す。
       * 減衰：速度を殺して、いつまでも揺れ続けないようにする。
       */
      u.ovx += (fx - u.ox * SPRING) * dt;
      u.ovy += (fy - u.oy * SPRING) * dt;
      u.ovz += (fz - u.oz * SPRING) * dt;

      var damp = Math.max(0, 1 - DAMP * dt);

      u.ovx *= damp;
      u.ovy *= damp;
      u.ovz *= damp;

      u.ox += u.ovx * dt;
      u.oy += u.ovy * dt;
      u.oz += u.ovz * dt;

      m.position.x = u.baseX + u.ox;
      m.position.y = u.baseY + u.oy;
      m.position.z = u.baseZ + u.oz;

      /*
       * 傾き。目標の向きへ、ばねで滑らかに寄せる。
       *
       * 目標そのものに上限があるので、振り回されることはない。
       * 減衰を効かせて、行き過ぎてから静かに落ち着かせる。
       */
      var tdamp = Math.max(0, 1 - TILT_DAMP * dt);

      u.tvx += (tgX - u.tiltX) * TILT_SPRING * dt;
      u.tvy += (tgY - u.tiltY) * TILT_SPRING * dt;

      u.tvx *= tdamp;
      u.tvy *= tdamp;

      u.tiltX += u.tvx * dt;
      u.tiltY += u.tvy * dt;

      /*
       * 常時の往復に、押された分の傾きを足す。
       *
       * カーソルが近いあいだは往復の振り幅を抑える。
       * 手を当てられた板が、ふらつきを止めて正対する感じになる。
       */
      var calm = 1 - near * 0.55;

      m.rotation.x = Math.sin(t * u.sx + u.px) * u.ax * calm + u.tiltX;
      m.rotation.y = Math.sin(t * u.sy + u.py) * u.ay * calm + u.tiltY;
      m.rotation.z = Math.sin(t * u.sz + u.pz) * u.az * calm;
    }

    renderer.render(scene, camera);
  }

  /* ---------- イベント ---------- */

  var rt = null;

  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 180);
  });

  /**
   * カーソルを 3D 空間の座標に直す。
   *
   * カードは z = -2.2 〜 0.6 に散らばっているが、
   * 面ごとに測り直すと重いので、中ほどの平面で代表させる。
   */
  function toWorld(px, py) {
    if (!camera) return;

    // -1 〜 1 に正規化（画面中央が 0）
    mouse.nx = (px / w) * 2 - 1;
    mouse.ny = -((py / h) * 2 - 1);

    var z = -0.8;
    var vh = viewHeight(z);

    mouse.x = (mouse.nx * vh * camera.aspect) / 2;
    mouse.y = (mouse.ny * vh) / 2;
  }

  window.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();

    toWorld(e.clientX - rect.left, e.clientY - rect.top);
    mouse.has = true;
  }, { passive: true });

  // 画面の外へ出たら力を切る。押されていたカードは自然に戻る
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

  init();
})();
