/**
 * 共通スクリプト
 * ヘッダー / ドロワー / スクロール演出 / 文字分割 / カーソル追従 / ロゴ描画
 */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ヘッダー：スクロールで背景を付ける ---------- */
  function initHeader() {
    var header = document.querySelector('.header');
    if (!header) return;

    // 濃色のセクション（TOP のコンテンツ）
    var darks = document.querySelectorAll('.contents');

    var toggle = function () {
      header.classList.toggle('is-solid', window.scrollY > 40);

      /*
       * 濃色のセクションに重なっている間は白抜きにする。
       * ヘッダーの下端がセクションの範囲に入っているかで判定する。
       */
      if (darks.length) {
        var h = header.offsetHeight;
        var over = Array.prototype.some.call(darks, function (el) {
          var r = el.getBoundingClientRect();
          return r.top <= h * 0.6 && r.bottom >= h * 0.6;
        });

        header.classList.toggle('is-dark', over);

        // 濃色の上では白い半透明の膜を出さない
        if (over) header.classList.remove('is-solid');
      }
    };

    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
  }

  /* ---------- ドロワー（SP） ---------- */
  function initDrawer() {
    var burger = document.querySelector('.burger');
    var drawer = document.querySelector('.drawer');
    if (!burger || !drawer) return;

    var close = function () {
      burger.classList.remove('is-open');
      drawer.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    burger.addEventListener('click', function () {
      var open = !drawer.classList.contains('is-open');

      burger.classList.toggle('is-open', open);
      drawer.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });

    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
  }

  /* ---------- 文字分割：1文字ずつ立ち上げる ---------- */
  function splitChars() {
    document.querySelectorAll('.split-text').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var text = el.textContent;
      var frag = document.createDocumentFragment();

      Array.prototype.forEach.call(text, function (ch, i) {
        var span = document.createElement('span');

        span.className = 'char';
        span.textContent = ch === ' ' ? ' ' : ch;
        span.style.transitionDelay = (i * 0.115) + 's';
        frag.appendChild(span);
      });

      el.textContent = '';
      el.appendChild(frag);
      el.dataset.split = 'done';
    });
  }

  /**
   * 3導線の欧文を 1 文字ずつに分解する。
   *
   * 各文字を「マスク（overflow: hidden）＋中身」の 2 重にして、
   * 中身を下から押し上げることで、マスクが開きながら
   * 文字が立ち上がって見えるようにする。
   * ホバー用に 2 枚重ねているので、表示側だけを分解する。
   */
  /**
   * 下層ページの大見出しを 1 文字ずつに分解する。
   * 3 導線の見出しと同じく、マスク＋中身の 2 重構造にする。
   */
  function splitPageHeading() {
    document.querySelectorAll('.split-mask').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var text = el.textContent;
      var frag = document.createDocumentFragment();

      Array.prototype.forEach.call(text, function (ch, i) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');

        mask.className = 'pc';
        inner.className = 'pc__i';
        inner.textContent = ch;
        inner.style.transitionDelay = (i * 0.06) + 's';

        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      el.textContent = '';
      el.appendChild(frag);
      el.dataset.split = 'done';

      // 画面上部にあるので、読み込み直後に動かす
      requestAnimationFrame(function () {
        setTimeout(function () { el.classList.add('is-in'); }, 120);
      });
    });
  }

  /*
   * テキストを「実際に折り返している行」ごとに分けて、
   * 1 行ずつマスクの下から立ち上げる。
   *
   * 折り返し位置はブラウザにしか分からないので、1 文字ずつ Range で
   * 位置を測り、上端が変わったところを行の切れ目とみなす。
   */
  function splitLines() {
    /*
     * 遅延は段落をまたいで通し番号で積む。
     * 段落ごとに 0 から数え直すと、3 つの段落が同時に動いてしまう。
     * グループは data-lines-group で分ける。
     */
    var counters = {};

    document.querySelectorAll('.split-lines').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var text = el.textContent.trim();
      if (!text) return;

      // 組み直すときのために素のテキストを控えておく
      if (!el.dataset.raw) el.dataset.raw = text;

      /*
       * 遅延はグループ単位の通し番号で積む。
       * data-lines-start があれば、その番号から数え始める
       * （HTML に直接書いた見出しの続きに繋げるため）。
       */
      var group = el.dataset.linesGroup || 'default';
      if (counters[group] === undefined) {
        counters[group] = parseInt(el.dataset.linesStart, 10) || 0;
      }

      // 計測用に 1 文字ずつの span を並べる
      var probe = document.createElement('div');
      probe.textContent = '';
      var chars = [];

      Array.prototype.forEach.call(text, function (ch) {
        var sp = document.createElement('span');
        sp.textContent = ch;
        probe.appendChild(sp);
        chars.push(sp);
      });

      el.textContent = '';
      el.appendChild(probe);

      // 上端が変わった位置で行を切る
      var lines = [];
      var current = '';
      var lastTop = null;

      chars.forEach(function (sp) {
        var top = sp.getBoundingClientRect().top;
        if (lastTop !== null && Math.abs(top - lastTop) > 1) {
          lines.push(current);
          current = '';
        }
        current += sp.textContent;
        lastTop = top;
      });
      if (current) lines.push(current);

      // 計測結果をもとに、行ごとのマスクを組み直す
      var frag = document.createDocumentFragment();

      lines.forEach(function (line) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');

        mask.className = 'ln';
        inner.className = 'ln__i';
        inner.textContent = line;
        // 行ごとにはっきり差をつける。詰めると一斉に出て見える
        inner.style.transitionDelay = (counters[group] * 0.3) + 's';
        counters[group] += 1;

        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      el.textContent = '';
      el.appendChild(frag);
      el.dataset.split = 'done';
    });
  }

  /*
   * 1 文字ずつに分解し、縦にばらけた「中抜き」の状態から
   * 整列しながら塗りが入るようにする。
   *
   * 中抜きは -webkit-text-stroke で描き、塗りは同じ字を重ねた
   * 疑似要素側の幅を広げて出す（左から塗られていく）。
   */
  function splitScatter() {
    document.querySelectorAll('.split-scatter').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var rows = el.querySelectorAll('.rmsg__row');
      if (!rows.length) return;

      var n = 0;

      Array.prototype.forEach.call(rows, function (row) {
        var frag = document.createDocumentFragment();

        // <em> を保ったまま 1 文字ずつ包む
        Array.prototype.forEach.call(row.childNodes, function (node) {
          var isEm = node.nodeType === 1 && node.tagName === 'EM';
          var text = node.textContent;

          Array.prototype.forEach.call(text, function (ch) {
            var sp = document.createElement('span');
            sp.className = 'sc' + (isEm ? ' sc--em' : '');
            sp.setAttribute('data-ch', ch);
            sp.textContent = ch;

            /*
             * 上下のばらけ方は文字ごとに変える。
             * 乱数だと読み込むたび変わって落ち着かないので、
             * 通し番号から決まった値を作る。
             */
            var wave = Math.sin(n * 1.7) * 0.42 + Math.sin(n * 0.6) * 0.26;
            sp.style.setProperty('--sc-y', wave.toFixed(3) + 'em');
            sp.style.transitionDelay = (n * 0.05) + 's';
            sp.style.setProperty('--sc-d', (n * 0.05) + 's');

            frag.appendChild(sp);
            n += 1;
          });
        });

        row.textContent = '';
        row.appendChild(frag);
      });

      el.dataset.split = 'done';
    });
  }

  /*
   * 幅が変わると折り返し位置も変わるので、組み直す。
   * 元のテキストは data 属性に控えておく。
   */
  function initLineResplit() {
    var targets = document.querySelectorAll('.split-lines');
    if (!targets.length) return;

    var w = window.innerWidth;
    var timer;

    window.addEventListener('resize', function () {
      // 高さだけの変化（スマホのアドレスバー等）では組み直さない
      if (window.innerWidth === w) return;
      w = window.innerWidth;

      clearTimeout(timer);
      timer = setTimeout(function () {
        var wasIn = [];

        // いったん全部を素のテキストへ戻してから、まとめて組み直す。
        // 1 つずつ splitLines() を呼ぶと通し番号がリセットされてしまう。
        Array.prototype.forEach.call(targets, function (el, i) {
          wasIn[i] = el.classList.contains('is-in');
          el.textContent = el.dataset.raw || el.textContent.trim();
          el.dataset.split = '';
          el.classList.remove('is-in');
        });

        splitLines();

        Array.prototype.forEach.call(targets, function (el, i) {
          if (wasIn[i]) el.classList.add('is-in');
        });
      }, 200);
    });
  }

  function splitGateHeadings() {
    document.querySelectorAll('.gate__en-in').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var text = el.textContent;
      var frag = document.createDocumentFragment();

      Array.prototype.forEach.call(text, function (ch, i) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');

        mask.className = 'gc';
        inner.className = 'gc__i';
        inner.textContent = ch;
        inner.style.transitionDelay = (i * 0.075) + 's';

        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      el.textContent = '';
      el.appendChild(frag);
      el.dataset.split = 'done';
    });

    /*
     * 説明文にも同じ演出を入れる。
     * 文字数が多いので、全体が出そろう時間を一定に保つよう
     * 1 文字あたりの間隔を文字数から逆算する。
     */
    document.querySelectorAll('.gate__text').forEach(function (el) {
      if (el.dataset.split === 'done') return;

      var text = el.textContent;
      var chars = Array.prototype.slice.call(text);
      var step = Math.min(0.022, 1.1 / Math.max(chars.length, 1));
      var frag = document.createDocumentFragment();

      chars.forEach(function (ch, i) {
        // 空白は分解せずそのまま置く（折り返しの起点を保つ）
        if (ch === ' ' || ch === '　') {
          frag.appendChild(document.createTextNode(ch));
          return;
        }

        var mask = document.createElement('span');
        var inner = document.createElement('span');

        mask.className = 'tc';
        inner.className = 'tc__i';
        inner.textContent = ch;
        inner.style.transitionDelay = (0.78 + i * step) + 's';

        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      el.textContent = '';
      el.appendChild(frag);
      el.dataset.split = 'done';
    });
  }

  /* ---------- スクロール演出 ---------- */
  function initReveal() {
    // FV 内の要素はオープニング明けに手動で出すため対象外
    var fv = document.querySelector('.fv');

    var targets = Array.prototype.filter.call(
      document.querySelectorAll('.reveal, .split-text, .gate'),
      function (el) { return !(fv && fv.contains(el)); }
    );

    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- カーソル追従（FV の中だけ表示する） ---------- */
  function initStalker() {
    if (reduced) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var fv = document.querySelector('.fv');
    if (!fv) return;

    var ring = document.createElement('div');

    ring.className = 'stalker';
    document.body.appendChild(ring);

    var mx = window.innerWidth / 2;
    var my = window.innerHeight / 2;
    var rx = mx;
    var ry = my;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX;
      my = e.clientY;

      // FV の範囲内にいるときだけ見せる
      var r = fv.getBoundingClientRect();
      var inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;

      ring.classList.toggle('is-active', inside);
    });

    document.addEventListener('mouseleave', function () {
      ring.classList.remove('is-active');
    });

    // スクロールで FV が画面外へ出たら、カーソルを動かさなくても消す
    window.addEventListener('scroll', function () {
      var r = fv.getBoundingClientRect();

      if (my < r.top || my > r.bottom) ring.classList.remove('is-active');
    }, { passive: true });

    // リングだけ遅れて追従させる
    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      requestAnimationFrame(loop);
    })();

    /*
     * 反応するのは FV の中と、その上に重なるヘッダーのリンク。
     * FV 自体にはリンクが無いので、ヘッダーを含めないと色が変わらない。
     */
    var hoverables = []
      .concat(Array.prototype.slice.call(fv.querySelectorAll('a, button')))
      .concat(Array.prototype.slice.call(
        document.querySelectorAll('.header a, .header button')
      ));

    hoverables.forEach(function (el) {
      el.addEventListener('mouseenter', function () { ring.classList.add('is-hover'); });
      el.addEventListener('mouseleave', function () { ring.classList.remove('is-hover'); });
    });
  }

  /**
   * FV 演出の開始タイミングを一本化する。
   *
   * 起点は splash:opened（円が開きはじめた時点）。
   * オレンジの幕に隠れている間に始めるとロゴの描画が見えないので、
   * 幕が開きはじめてから走らせる。
   */
  function onFvStart(fn) {
    var once = false;

    var go = function () {
      if (once) return;
      once = true;
      // rAF は非表示タブで止まるため setTimeout で確実に走らせる
      setTimeout(fn, 0);
    };

    // 既に完了済み、またはスプラッシュ自体が無い場合は即開始
    if (window.NDSSplashDone || !document.querySelector('.splash')) {
      go();
      return;
    }

    document.addEventListener('splash:opened', go, { once: true });
    document.addEventListener('splash:done', go, { once: true });
    setTimeout(go, 6000); // 保険
  }

  /* ---------- FV ロゴ：線で描いてから塗る ---------- */
  function initLogoDraw() {
    var logo = document.querySelector('.fv__logo');
    if (!logo) return;

    var paths = logo.querySelectorAll('path');

    if (reduced) {
      logo.classList.add('is-filled');
      paths.forEach(function (p) { p.style.strokeDashoffset = '0'; });
      return;
    }

    // 各パスの実長を測って dasharray に反映（描画前に必ず適用する）
    paths.forEach(function (p) {
      var len = 0;

      try {
        len = p.getTotalLength();
      } catch (e) {
        len = 200;
      }

      if (!len || !isFinite(len)) len = 200;

      // 長いパスほど時間がかかるとバラつくため、速度を揃える
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.style.animationDuration = Math.min(2.2, Math.max(1.1, len / 90)) + 's';
    });

    var start = function () {
      logo.classList.add('is-drawing');
      // 線が描き切ってから塗りを乗せる（描画 2.6s）
      setTimeout(function () { logo.classList.add('is-filled'); }, 2400);
    };

    onFvStart(start);
  }

  /* ---------- FV：コピーとインジケーター ---------- */
  function initFvIntro() {
    var copy = document.querySelector('.fv__copy');
    var scroll = document.querySelector('.fv__scroll');

    var start = function () {
      // ロゴの描画とほぼ同時に走らせ、少しだけ遅らせて重ねる
      setTimeout(function () {
        if (copy) copy.classList.add('is-in');

        // 背景の円もこのタイミングで波紋から湧き出させる
        document.dispatchEvent(new CustomEvent('fv:copy'));
      }, 400);

      // コピーが出揃ってから（13文字 × 0.115s ＋ 余韻）
      setTimeout(function () {
        if (scroll) scroll.classList.add('is-in');
      }, 3300);
    };

    onFvStart(start);
  }

  /* ---------- init ---------- */
  /**
   * 3導線の ON / OFF（.is-on）。見た目は home.css 側。
   *
   * PC（ホバーできる端末）：
   *   マウスが乗っている行を ON にする。触れた地点を --mx / --my に渡し、
   *   そこを中心に色が広がる。離れた地点へ収束するので、毎回違う動きになる。
   *
   * スマホ・タブレット：
   *   ホバーがないので、画面の中央を通過している行を ON にする。
   *   スクロールするだけで COMPANY → SERVICE → RECRUIT と順に色づく。
   *   タップすると触れた地点から波紋を広げ、広がるのを見せてからページを移る。
   */
  function initGate() {
    var gates = document.querySelectorAll('.gate');
    if (!gates.length) return;

    if (window.matchMedia('(hover: hover)').matches) {
      gates.forEach(function (gate) {
        var set = function (e, on) {
          var r = gate.getBoundingClientRect();

          gate.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          gate.style.setProperty('--my', (e.clientY - r.top) + 'px');
          gate.classList.toggle('is-on', on);
        };

        gate.addEventListener('mouseenter', function (e) { set(e, true); });
        gate.addEventListener('mouseleave', function (e) { set(e, false); });
      });
      return;
    }

    if (reduced) return;

    // ---- スクロール：画面の上下 45% を除いた、中央の細い帯に掛かっている行を ON ----
    var io = null;

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          entry.target.classList.toggle('is-on', entry.isIntersecting);
        });
      }, { rootMargin: '-45% 0px -45% 0px' });

      gates.forEach(function (gate) { io.observe(gate); });
    }

    // ---- タップ：触れた地点から波紋を広げてから移動する ----
    var WAIT = 420;

    gates.forEach(function (gate) {
      var point = null;

      gate.addEventListener('pointerdown', function (e) {
        var r = gate.getBoundingClientRect();
        point = { x: e.clientX - r.left, y: e.clientY - r.top };
      });

      gate.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();

        var r = gate.getBoundingClientRect();
        var p = point || { x: r.width / 2, y: r.height / 2 };
        var ripple = document.createElement('span');

        // 色づいている行には白い波紋、まだの行には行の色で広げる
        ripple.className = 'gate__ripple' + (gate.classList.contains('is-on') ? '' : ' is-fill');
        ripple.style.left = p.x + 'px';
        ripple.style.top = p.y + 'px';
        gate.appendChild(ripple);
        gate.classList.add('is-on');

        setTimeout(function () { location.href = gate.href; }, WAIT);
      });
    });

    // 戻るボタンでページが復元されたときに、波紋と ON 状態を戻す
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;

      document.querySelectorAll('.gate__ripple').forEach(function (el) { el.remove(); });
      gates.forEach(function (gate) {
        gate.classList.remove('is-on');
        if (io) { io.unobserve(gate); io.observe(gate); }
      });
    });
  }

  /**
   * NEWS の登場演出の下ごしらえ（見た目は home.css 側。スマホだけで効く）
   * - 見出しの「NEWS」を 1 文字ずつ .nc / .nc__i に分ける
   * - カードに順番（--i）を入れて、右から順に滑り込ませる
   */
  function initNewsIntro() {
    var en = document.querySelector('.news__en');

    if (en && en.dataset.split !== 'done') {
      var text = en.textContent;
      var frag = document.createDocumentFragment();

      Array.prototype.forEach.call(text, function (ch, i) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');

        mask.className = 'nc';
        inner.className = 'nc__i';
        inner.textContent = ch;
        inner.style.setProperty('--c', i);

        mask.appendChild(inner);
        frag.appendChild(mask);
      });

      en.setAttribute('aria-label', text);
      en.textContent = '';
      en.appendChild(frag);
      en.dataset.split = 'done';
    }

    document.querySelectorAll('.news-card').forEach(function (card, i) {
      card.style.setProperty('--i', i);
    });
  }

  /**
   * NEWS のスマホ表示（横スワイプのカルーセル）。見た目は home.css 側。
   * - 中央に来たカードに .is-current を付ける（PC のホバー時と同じ見た目になる）
   * - 下に「01 / 06」と進捗バーを足す
   * - 中央以外のカードをタップしたときは、ページを移らずにそのカードを中央へ寄せる
   * PC・タブレットでは .is-current のスタイルが効かないので、付いていても見た目は変わらない。
   */
  function initNewsCarousel() {
    var grid = document.querySelector('.news__grid');
    if (!grid) return;

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.news-card'));
    if (cards.length < 2) return;

    var mq = window.matchMedia('(max-width: 640px)');
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    var pager = document.createElement('div');
    pager.className = 'news__pager';
    pager.setAttribute('aria-hidden', 'true');
    pager.innerHTML = '<span class="news__count"><b>01</b> / ' + pad(cards.length) + '</span>' +
      '<span class="news__bar"><i></i></span>';
    grid.parentNode.insertBefore(pager, grid.nextSibling);

    var countEl = pager.querySelector('b');
    var barEl = pager.querySelector('i');
    var current = -1;
    var ticking = false;

    var update = function () {
      ticking = false;
      if (!mq.matches) return;

      // グリッドの中心にいちばん近いカードを「今のカード」にする
      var box = grid.getBoundingClientRect();
      var center = box.left + box.width / 2;
      var best = 0;
      var bestDist = Infinity;

      cards.forEach(function (card, i) {
        var r = card.getBoundingClientRect();
        var d = Math.abs(r.left + r.width / 2 - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });

      if (best !== current) {
        if (current >= 0) cards[current].classList.remove('is-current');
        cards[best].classList.add('is-current');
        countEl.textContent = pad(best + 1);
        current = best;
      }

      // バーは 1 枚目で 1/6、最後で満タン。スクロールに合わせてなめらかに伸ばす
      var max = grid.scrollWidth - grid.clientWidth;
      var progress = max > 0 ? grid.scrollLeft / max : 0;
      var n = cards.length;
      barEl.style.setProperty('--p', (1 / n + (1 - 1 / n) * progress).toFixed(4));
    };

    var request = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    grid.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    if (mq.addEventListener) mq.addEventListener('change', request);

    cards.forEach(function (card, i) {
      card.querySelector('a').addEventListener('click', function (e) {
        if (!mq.matches || i === current) return;

        e.preventDefault();
        var r = card.getBoundingClientRect();
        var box = grid.getBoundingClientRect();
        grid.scrollBy({
          left: r.left + r.width / 2 - (box.left + box.width / 2),
          behavior: reduced ? 'auto' : 'smooth'
        });
      });
    });

    update();
  }

  /*
   * SERVICE の背景に敷いた英字を、スクロールに合わせて横に流す。
   * ブロックが画面を通過する間の進み具合を 0〜1 にして --p に渡す。
   */
  function initServiceParallax() {
    var blocks = document.querySelectorAll('.srv');
    if (!blocks.length || reduced) return;

    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;

      Array.prototype.forEach.call(blocks, function (el) {
        var r = el.getBoundingClientRect();
        // 画面外は計算しない
        if (r.bottom < 0 || r.top > vh) return;

        // 下から入ってきて上へ抜けるまでを 0→1 に写す
        var p = (vh - r.top) / (vh + r.height);
        el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(4));
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------- PRIVACY のタブ切り替え ---------- */
  function initPrivacyTabs() {
    var tabs = document.querySelectorAll('.pv__tab');
    if (!tabs.length) return;

    Array.prototype.forEach.call(tabs, function (tab) {
      tab.addEventListener('click', function () {
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (!panel) return;

        Array.prototype.forEach.call(tabs, function (t) {
          var p = document.getElementById(t.getAttribute('aria-controls'));
          var on = t === tab;

          t.classList.toggle('is-current', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          if (p) {
            p.classList.toggle('is-current', on);
            p.hidden = !on;
          }
        });
      });
    });
  }

  function init() {
    splitChars();
    splitGateHeadings();
    splitPageHeading();
    splitLines();
    splitScatter();
    initLineResplit();
    initHeader();
    initDrawer();
    initReveal();
    initStalker();
    initGate();
    initNewsIntro();
    initNewsCarousel();
    initLogoDraw();
    initFvIntro();
    initServiceParallax();
    initPrivacyTabs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
