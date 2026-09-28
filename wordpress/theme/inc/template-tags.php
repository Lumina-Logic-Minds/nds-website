<?php
/**
 * テンプレートから呼ぶ表示用の関数
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 矢印アイコン（ボタンやページ送りで共通）
 *
 * @param string $dir 'next' か 'prev'
 */
function nds_arrow( $dir = 'next', $size = 14, $stroke = '2.4' ) {
	$d = ( 'prev' === $dir ) ? 'M19 12H5M11 18l-6-6 6-6' : 'M5 12h14M13 6l6 6-6 6';

	// $size が 0 なら大きさは CSS に任せる
	$wh = $size ? sprintf( ' width="%1$d" height="%1$d"', (int) $size ) : '';

	printf(
		'<svg%1$s viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="%2$s" aria-hidden="true"><path d="%3$s" /></svg>',
		$wh,
		esc_attr( $stroke ),
		esc_attr( $d )
	);
}

/**
 * 記事のサムネイル。アイキャッチがなければ代わりの画像を出す
 */
function nds_post_thumb( $post = null, $lazy = true ) {
	$post = get_post( $post );

	if ( has_post_thumbnail( $post ) ) {
		echo get_the_post_thumbnail(
			$post,
			'nds-news',
			array(
				'alt'     => '',
				'loading' => $lazy ? 'lazy' : 'eager',
			)
		);
		return;
	}

	printf(
		'<img src="%s" alt="" width="800" height="500"%s>',
		esc_url( nds_asset_url( 'image/contents/news.jpg' ) ),
		$lazy ? ' loading="lazy"' : ''
	);
}

/**
 * 記事のカテゴリ名（最初の 1 つ）
 */
function nds_post_cat( $post = null ) {
	$cats = get_the_category( get_post( $post )->ID );
	return $cats ? $cats[0]->name : '';
}

/**
 * 日付。<time> の中身は 2026.08.05 の形
 */
function nds_post_date( $class, $post = null ) {
	printf(
		'<time class="%s" datetime="%s">%s</time>',
		esc_attr( $class ),
		esc_attr( get_the_date( 'Y-m-d', $post ) ),
		esc_html( get_the_date( 'Y.m.d', $post ) )
	);
}

/**
 * NEWS 一覧の上に並べるカテゴリの切り替え
 * 記事が 1 件以上あるカテゴリだけを出す。カテゴリが 1 つしかなければ出さない
 */
function nds_news_filter() {
	$cats = get_categories( array( 'hide_empty' => true ) );
	if ( count( $cats ) < 2 ) {
		return;
	}

	$current = is_category() ? get_queried_object_id() : 0;
	$all_url = get_permalink( get_option( 'page_for_posts' ) ) ?: home_url( '/' );

	echo '<nav class="ncat reveal" aria-label="カテゴリ">';

	printf(
		'<a class="ncat__item%s" href="%s"%s>すべて</a>',
		$current ? '' : ' is-current',
		esc_url( $all_url ),
		$current ? '' : ' aria-current="page"'
	);

	foreach ( $cats as $cat ) {
		$is = ( $cat->term_id === $current );
		printf(
			'<a class="ncat__item%s" href="%s"%s>%s</a>',
			$is ? ' is-current' : '',
			esc_url( get_category_link( $cat ) ),
			$is ? ' aria-current="page"' : '',
			esc_html( $cat->name )
		);
	}

	echo '</nav>';
}

/**
 * ページ送り。1 ページしかなければ何も出さない
 * 例：前へ 1 … 4 [5] 6 … 12 次へ
 */
function nds_pager() {
	global $wp_query;

	$total = (int) $wp_query->max_num_pages;
	if ( $total < 2 ) {
		return;
	}

	$current = max( 1, (int) get_query_var( 'paged' ) );

	// 最初・最後・今のページの前後だけを番号で出し、あいだは … にする
	$pages = array();
	for ( $n = 1; $n <= $total; $n++ ) {
		if ( 1 === $n || $total === $n || abs( $n - $current ) <= 1 ) {
			$pages[] = $n;
		} elseif ( end( $pages ) !== '…' ) {
			$pages[] = '…';
		}
	}

	echo '<nav class="pager reveal" aria-label="ページ送り">';

	if ( $current > 1 ) {
		printf( '<a class="pager__prev" href="%s">', esc_url( get_pagenum_link( $current - 1 ) ) );
		nds_arrow( 'prev' );
		echo '前へ</a>';
	}

	foreach ( $pages as $n ) {
		if ( '…' === $n ) {
			echo '<span class="pager__dots" aria-hidden="true">…</span>';
		} elseif ( $n === $current ) {
			printf( '<span class="pager__item is-current" aria-current="page">%d</span>', $n );
		} else {
			printf( '<a class="pager__item" href="%s">%d</a>', esc_url( get_pagenum_link( $n ) ), $n );
		}
	}

	if ( $current < $total ) {
		printf( '<a class="pager__next" href="%s">次へ', esc_url( get_pagenum_link( $current + 1 ) ) );
		nds_arrow( 'next' );
		echo '</a>';
	}

	echo '</nav>';
}
