<?php
/**
 * アーカイブ（カテゴリー・日付などはすべて NEWS 一覧へ転送しているので、通常は使われない）
 */
get_header();
get_template_part( 'template-parts/news-archive' );
get_footer();
