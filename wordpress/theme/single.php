<?php
/**
 * NEWS 記事詳細
 * 元：news-detail.html
 */
get_header();

while ( have_posts() ) :
	the_post();

	// 前 = 1 つ古い記事、次 = 1 つ新しい記事
	$nds_prev = get_previous_post();
	$nds_next = get_next_post();
	$nds_list = get_permalink( get_option( 'page_for_posts' ) ) ?: home_url( '/' );
	?>
  <main>

    <!--
      ============ 記事詳細 ============
      タイトル / 日付 / アイキャッチ / 本文 / 前後の記事、の順。
      本文の中で使う要素（見出し・段落・箇条書き・表・引用）は
      すべて .post__body の中でスタイルを当てている。
    -->
    <article class="section post">
      <div class="inner post__inner">

        <header class="post__head">
          <p class="post__meta reveal">
            <?php nds_post_date( 'post__date' ); ?>
            <?php if ( $cat = nds_post_cat() ) : ?>
            <span class="post__cat"><?php echo esc_html( $cat ); ?></span>
            <?php endif; ?>
          </p>

          <h1 class="post__title reveal"><?php the_title(); ?></h1>
        </header>

        <?php if ( has_post_thumbnail() ) : ?>
        <figure class="post__eyecatch reveal">
          <?php nds_post_thumb( null, false ); ?>
        </figure>
        <?php endif; ?>

        <div class="post__body reveal">
          <?php the_content(); ?>
        </div>

        <!-- 前後の記事。ない側は is-disabled にして押せなくする -->
        <nav class="post__nav" aria-label="記事の移動">
          <?php if ( $nds_prev ) : ?>
          <a class="post__nav-btn post__nav-btn--prev" href="<?php echo esc_url( get_permalink( $nds_prev ) ); ?>">
            <?php nds_arrow( 'prev' ); ?>
            前の記事へ
          </a>
          <?php else : ?>
          <span class="post__nav-btn post__nav-btn--prev is-disabled" aria-disabled="true">
            <?php nds_arrow( 'prev' ); ?>
            前の記事へ
          </span>
          <?php endif; ?>

          <a class="post__nav-btn post__nav-btn--list" href="<?php echo esc_url( $nds_list ); ?>">記事一覧</a>

          <?php if ( $nds_next ) : ?>
          <a class="post__nav-btn post__nav-btn--next" href="<?php echo esc_url( get_permalink( $nds_next ) ); ?>">
            次の記事へ
            <?php nds_arrow( 'next' ); ?>
          </a>
          <?php else : ?>
          <span class="post__nav-btn post__nav-btn--next is-disabled" aria-disabled="true">
            次の記事へ
            <?php nds_arrow( 'next' ); ?>
          </span>
          <?php endif; ?>
        </nav>

      </div>
    </article>

  </main>
	<?php
endwhile;

get_footer();
