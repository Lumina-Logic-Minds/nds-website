<?php
/**
 * NEWS 一覧（投稿ページとカテゴリ一覧で共通）
 * 元：news.html
 */
?>
  <main>

    <!-- ============ ページ見出し ============ -->
    <!-- --page-c は TOP の 3 導線で使っている各ページの色 -->
    <section class="phead" style="--page-c: #010038;">
      <div class="inner">
        <h1 class="phead__en split-mask">NEWS</h1>
        <p class="phead__ja"><?php echo is_category() ? esc_html( single_cat_title( '', false ) ) : 'お知らせ一覧'; ?></p>
      </div>
    </section>

    <!-- ============ 一覧 ============ -->
    <!-- 1 件 = 1 行。左にサムネイル、中央にカテゴリ・タイトル・抜粋、右に日付 -->
    <section class="section nlist-sec">
      <div class="inner">
        <?php nds_news_filter(); ?>

        <?php if ( have_posts() ) : ?>
        <ul class="nlist">
          <?php while ( have_posts() ) : the_post(); ?>
          <li class="nlist__item reveal">
            <a href="<?php the_permalink(); ?>">
              <span class="nlist__thumb">
                <?php nds_post_thumb(); ?>
              </span>
              <span class="nlist__body">
                <?php if ( $cat = nds_post_cat() ) : ?>
                <span class="nlist__cat"><?php echo esc_html( $cat ); ?></span>
                <?php endif; ?>
                <span class="nlist__title"><?php the_title(); ?></span>
                <span class="nlist__excerpt"><?php echo esc_html( wp_strip_all_tags( get_the_excerpt() ) ); ?></span>
              </span>
              <?php nds_post_date( 'nlist__date' ); ?>
            </a>
          </li>
          <?php endwhile; ?>
        </ul>

        <?php nds_pager(); ?>

        <?php else : ?>
        <p class="nlist__empty">現在、お知らせはありません。</p>
        <?php endif; ?>
      </div>
    </section>

  </main>
