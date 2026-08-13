/**
 * FV の 3D カード（Three.js / WebGL）
 *
 * 参考の日テレアートと同じく WebGL で描く。
 * 厚みのある箱に事業バナーを貼り、光源による陰影と
 * 前後関係を GPU に処理させることで、板が本物のカードに見える。
 *
 * 背景の波紋とカラフルな円は fv-scene.js（Canvas 2D）が担当。
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

  var LANES = 5;             // 横位置の帯（＝同時に出る枚数）
  var CARD_W = 2.7;          // カードの幅（3D 空間の単位）
  var CARD_H = CARD_W * (422 / 750);
  var CARD_D = 0.03;         // 厚み

  var renderer, scene, camera, cards = [];
  var w = 0, h = 0;
  var visible = true;
  var started = true;
  var clock = null;
  var elapsed = 0;

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

  function placeCard(mesh, lane, initial) {
    mesh.position.z = rand(-2.2, 0.6);

    // 奥行きによって見える幅が変わるので、カードの z で測る
    var vw = viewWidth(mesh.position.z);
    var lw = (vw * 1.08) / LANES;
    var lx = -vw * 0.54 + lw * (lane + 0.5);

    mesh.position.x = lx + rand(-lw * 0.2, lw * 0.2);

    var top = viewHeight(mesh.position.z) / 2 + CARD_H;

    mesh.position.y = initial
      ? rand(-top, top)
      : -top;

    mesh.userData.vy = rand(0.55, 0.95);

    // 各軸を正面中心に往復させる（裏返らないので文字が読める）
    // 振り幅（ラジアン）。1.3 ≒ 75度まで倒れる
    mesh.userData.ax = rand(0.7, 1.3);
    mesh.userData.ay = rand(0.8, 1.35);
    mesh.userData.az = rand(0.3, 0.7);

    // 速さ
    mesh.userData.sx = rand(0.45, 0.95);
    mesh.userData.sy = rand(0.5, 1.05);
    mesh.userData.sz = rand(0.3, 0.7);
    mesh.userData.px = Math.random() * Math.PI * 2;
    mesh.userData.py = Math.random() * Math.PI * 2;
    mesh.userData.pz = Math.random() * Math.PI * 2;
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

      if (started) m.position.y += u.vy * dt;

      // 画面上へ抜けたら下から出し直す
      if (m.position.y > viewHeight(m.position.z) / 2 + CARD_H) {
        placeCard(m, u.lane, false);
      }

      // 正面を中心に往復。裏返らないので文字が読める
      m.rotation.x = Math.sin(t * u.sx + u.px) * u.ax;
      m.rotation.y = Math.sin(t * u.sy + u.py) * u.ay;
      m.rotation.z = Math.sin(t * u.sz + u.pz) * u.az;
    }

    renderer.render(scene, camera);
  }

  /* ---------- イベント ---------- */

  var rt = null;

  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(resize, 180);
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
