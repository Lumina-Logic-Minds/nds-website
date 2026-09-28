<?php
/**
 * ページが見つからないとき
 */
get_header();
?>
  <main>

    <section class="phead" style="--page-c: #010038;">
      <div class="inner">
        <h1 class="phead__en split-mask">404</h1>
        <p class="phead__ja">ページが見つかりません</p>
      </div>
    </section>

    <section class="section">
      <div class="inner post__inner">
        <div class="post__body reveal">
          <p>お探しのページは、移動または削除された可能性があります。<br>お手数ですが、トップページからお探しください。</p>
          <p><a href="<?php echo esc_url( home_url( '/' ) ); ?>">トップページへ戻る</a></p>
        </div>
      </div>
    </section>

  </main>
<?php
get_footer();
