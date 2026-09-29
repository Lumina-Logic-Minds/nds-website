<?php
/**
 * TOP の NEWS（最新 6 件）
 * front-page.php の <ul class="news__grid"> の中に差し込まれる
 */

$nds_news = new WP_Query(
	array(
		'post_type'           => 'post',
		'posts_per_page'      => 6,
		'ignore_sticky_posts' => true,
		'no_found_rows'       => true,
	)
);

while ( $nds_news->have_posts() ) :
	$nds_news->the_post();
	?>
          <li class="news-card">
            <a href="<?php the_permalink(); ?>">
              <span class="news-card__thumb">
                <?php nds_post_thumb(); ?>
              </span>
              <span class="news-card__body">
                <span class="news-card__title"><?php the_title(); ?></span>
                <?php nds_post_date( 'news-card__date' ); ?>
                <span class="news-card__btn">
                  View
                  <?php nds_arrow( 'next', 0, '2.2' ); ?>
                </span>
              </span>
            </a>
          </li>
	<?php
endwhile;

wp_reset_postdata();
