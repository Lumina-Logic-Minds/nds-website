<?php
/**
 * 専用テンプレート（page-{スラッグ}.php）がない固定ページ
 * 管理画面で追加したページは、見出し + 本文だけのこの形で出る
 */
get_header();

while ( have_posts() ) :
	the_post();
	?>
  <main>

    <section class="phead" style="--page-c: #010038;">
      <div class="inner">
        <h1 class="phead__ja"><?php the_title(); ?></h1>
      </div>
    </section>

    <article class="section post">
      <div class="inner post__inner">
        <div class="post__body reveal">
          <?php the_content(); ?>
        </div>
      </div>
    </article>

  </main>
	<?php
endwhile;

get_footer();
