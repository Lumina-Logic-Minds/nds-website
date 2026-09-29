<?php
/**
 * Next Days Solutions テーマ
 *
 * 見た目と動きは静的 HTML 版（リポジトリ直下）と同じ css/ js/ image/ を使う。
 * このファイルでは、WordPress 側で必要になる処理だけを持つ。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NDS_SITE_NAME', '株式会社Next Days Solutions' );

require_once get_theme_file_path( 'inc/page-meta.php' );
require_once get_theme_file_path( 'inc/template-tags.php' );
require_once get_theme_file_path( 'inc/setup.php' );
require_once get_theme_file_path( 'inc/contact.php' );


/* ============================================
   URL ヘルパー
   ============================================ */

/**
 * テーマ内のファイルの URL（css/ js/ image/ pdf/）
 */
function nds_asset_url( $path ) {
	return get_theme_file_uri( $path );
}

/**
 * 固定ページの URL。'' ならトップ。
 */
function nds_page_url( $slug = '' ) {
	return home_url( $slug === '' ? '/' : '/' . $slug . '/' );
}

/**
 * キャッシュ対策に、ファイルの更新時刻をバージョンとして付ける
 */
function nds_asset_ver( $path ) {
	$file = get_theme_file_path( $path );
	return file_exists( $file ) ? (string) filemtime( $file ) : null;
}


/* ============================================
   テーマの基本設定
   ============================================ */

add_action( 'after_setup_theme', function () {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );

	// NEWS のサムネイル（一覧・TOP のカード・記事詳細）。16:9 で切り抜く
	add_image_size( 'nds-news', 800, 450, true );
} );

// 固定ヘッダーやオープニングと重なるため、表側では管理バーを出さない
add_filter( 'show_admin_bar', '__return_false' );

// 使わない出力を止める
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'rsd_link' );


/* ============================================
   CSS / JS
   ============================================ */

add_action( 'wp_enqueue_scripts', function () {
	$is_front = is_front_page();

	wp_enqueue_style(
		'nds-fonts',
		'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap',
		array(),
		null
	);

	$styles = $is_front
		? array( 'base', 'layout', 'home', 'splash' )
		: array( 'base', 'layout', 'page' );

	$prev = 'nds-fonts';
	foreach ( $styles as $name ) {
		$path = 'css/' . $name . '.css';
		wp_enqueue_style( 'nds-' . $name, nds_asset_url( $path ), array( $prev ), nds_asset_ver( $path ) );
		$prev = 'nds-' . $name;
	}

	// 静的 HTML と同じ順に読み込む。main.js は必ず最後
	$scripts = $is_front
		? array( 'splash', 'fv-scene', 'three.min', 'fv-cards', 'contents-rail', 'main' )
		: array( 'main' );

	$prev = null;
	foreach ( $scripts as $name ) {
		$path   = 'js/' . $name . '.js';
		$handle = 'nds-' . str_replace( '.min', '', $name );
		wp_enqueue_script( $handle, nds_asset_url( $path ), $prev ? array( $prev ) : array(), nds_asset_ver( $path ), true );
		$prev = $handle;
	}

	// fv-cards.js は画像を相対パスで読むため、テーマの場所を渡す
	if ( $is_front ) {
		wp_add_inline_script(
			'nds-fv-cards',
			'window.NDS_THEME_URI = ' . wp_json_encode( trailingslashit( get_theme_file_uri() ) ) . ';',
			'before'
		);
	}
} );

// 記事本文にブロックを使うので、ブロックの CSS は記事詳細でだけ読む
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_singular( 'post' ) ) {
		wp_dequeue_style( 'wp-block-library' );
		wp_dequeue_style( 'wp-block-library-theme' );
		wp_dequeue_style( 'classic-theme-styles' );
		wp_dequeue_style( 'global-styles' );
	}
}, 100 );

add_filter( 'wp_resource_hints', function ( $urls, $relation ) {
	if ( 'preconnect' === $relation ) {
		$urls[] = 'https://fonts.googleapis.com';
		$urls[] = array(
			'href'        => 'https://fonts.gstatic.com',
			'crossorigin' => 'anonymous',
		);
	}
	return $urls;
}, 10, 2 );


/* ============================================
   <head> の中身
   ============================================ */

add_action( 'wp_head', function () {
	/*
	 * オープニングを再生する可能性がある間は、描画前に TOP を伏せておく。
	 * DOMContentLoaded を待つと、その一瞬だけ TOP が見えてしまう。
	 */
	if ( is_front_page() ) :
		?>
<script>
  (function () {
    var play = true;

    try {
      if (sessionStorage.getItem('nds_splash_shown')) play = false;
    } catch (e) { /* 取得できない場合は再生する */ }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) play = false;

    if (play) document.documentElement.className += ' splash-pending';
  })();
</script>
		<?php
	endif;

	$desc = nds_meta_description();
	if ( $desc !== '' ) {
		printf( '<meta name="description" content="%s">' . "\n", esc_attr( $desc ) );
	}

	// 管理画面でサイトアイコンを設定していなければ、テーマのファビコンを使う
	if ( ! has_site_icon() ) {
		$icon = esc_url( nds_asset_url( 'image/favicon.png' ) );
		echo '<link rel="icon" type="image/png" href="' . $icon . '">' . "\n";
		echo '<link rel="apple-touch-icon" href="' . $icon . '">' . "\n";
	}
}, 1 );

/**
 * <title>。静的 HTML と同じ「ページ名｜社名」の形にそろえる
 */
add_filter( 'pre_get_document_title', function () {
	$meta = nds_current_page_meta();
	if ( $meta ) {
		return esc_html( $meta['title'] );
	}

	if ( is_singular() ) {
		return esc_html( single_post_title( '', false ) . '｜' . NDS_SITE_NAME );
	}
	if ( is_404() ) {
		return esc_html( 'ページが見つかりません｜' . NDS_SITE_NAME );
	}
	return '';
} );

/**
 * meta description の中身
 */
function nds_meta_description() {
	$meta = nds_current_page_meta();
	if ( $meta ) {
		return $meta['description'];
	}

	if ( is_singular( 'post' ) ) {
		$text = wp_strip_all_tags( get_the_excerpt( get_queried_object_id() ) );
		return mb_substr( preg_replace( '/\s+/u', ' ', $text ), 0, 120 );
	}
	return '';
}

/**
 * 今のページに対応する、静的 HTML から取り出した title / description
 */
function nds_current_page_meta() {
	$meta = nds_page_meta();
	$key  = null;

	if ( is_front_page() ) {
		$key = 'front';
	} elseif ( is_home() ) {
		$key = 'news';
	} elseif ( is_page() ) {
		$key = get_post_field( 'post_name', get_queried_object_id() );
	}

	return ( $key && isset( $meta[ $key ] ) ) ? $meta[ $key ] : null;
}


/* ============================================
   NEWS
   ============================================ */

// NEWS 一覧は 1 ページ 10 件
add_action( 'pre_get_posts', function ( $query ) {
	if ( is_admin() || ! $query->is_main_query() ) {
		return;
	}
	if ( $query->is_home() ) {
		$query->set( 'posts_per_page', 10 );
	}
} );

/*
 * NEWS はカテゴリー・タグで分けない（2026-09-29 決定）。
 * 管理画面の投稿からカテゴリー欄・タグ欄を外す。
 */
add_action( 'init', function () {
	unregister_taxonomy_for_object_type( 'category', 'post' );
	unregister_taxonomy_for_object_type( 'post_tag', 'post' );
} );

// 日付・著者・カテゴリー・タグのアーカイブは使わないので、NEWS 一覧へ送る
add_action( 'template_redirect', function () {
	if ( is_date() || is_author() || is_category() || is_tag() ) {
		wp_safe_redirect( get_permalink( get_option( 'page_for_posts' ) ) ?: home_url( '/' ), 301 );
		exit;
	}
} );


/* ============================================
   旧サイトの URL を新しいページへ転送する（301）
   公開時に旧サイトのファイルを消したあと、ブックマークや検索結果から来た人を迷わせない。
   旧ファイルがサーバーに残っていると、そちらが表示されて転送されないので注意。
   ============================================ */

add_action( 'template_redirect', function () {
	if ( ! is_404() ) {
		return;
	}

	$old = array(
		'index.html'       => '',
		'maintenance.html' => '',
		'company.html'     => 'company',
		'service.html'     => 'service',
		'recluit.html'     => 'recruit', // 旧サイトは綴りが recluit だった
		'recruit.html'     => 'recruit',
		'job_list.html'    => 'recruit',
		'contact.html'     => 'contact',
		'contact1.php'     => 'contact',
		'check.php'        => 'contact',
		'check_done.php'   => 'contact',
		'privacy.html'     => 'privacy',
	);

	$path = trim( (string) wp_parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ), '/' );

	if ( isset( $old[ $path ] ) ) {
		wp_safe_redirect( nds_page_url( $old[ $path ] ), 301 );
		exit;
	}
}, 1 ); // WordPress の「似た URL を推測して転送」より先に処理する


/* ============================================
   コメント機能を止める（お知らせでは使わない）
   ============================================ */

add_filter( 'comments_open', '__return_false', 20 );
add_filter( 'pings_open', '__return_false', 20 );
add_filter( 'comments_array', '__return_empty_array', 10 );

add_action( 'init', function () {
	remove_post_type_support( 'post', 'comments' );
	remove_post_type_support( 'post', 'trackbacks' );
	remove_post_type_support( 'page', 'comments' );
} );

add_action( 'admin_menu', function () {
	remove_menu_page( 'edit-comments.php' );
} );

add_action( 'wp_before_admin_bar_render', function () {
	global $wp_admin_bar;
	$wp_admin_bar->remove_menu( 'comments' );
} );
