<?php
/**
 * テーマを有効化したときの初期設定（1 回だけ実行）
 *
 * - 固定ページ（ホーム / COMPANY / SERVICE / RECRUIT / CONTACT / PRIVACY / NEWS）を作る
 * - 表示設定：ホームを固定ページに、NEWS を投稿ページにする
 * - パーマリンク：記事は /news/123/ の形
 * - 「未分類」カテゴリを「お知らせ」に変える
 * - WordPress の初期記事・初期ページを削除し、サンプル記事 6 件を登録する
 *
 * 一度実行すると nds_setup_done オプションが立ち、再有効化しても実行しない。
 * 本番へはデータベースごと移すので、本番で有効化し直す必要はない。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'after_switch_theme', 'nds_initial_setup' );

/*
 * 初期設定の次のリクエストで、新しいパーマリンク設定の書き換えルールを作る。
 * after_switch_theme は init の途中で呼ばれるため、初期設定をしたリクエストの中では
 * WordPress がまだ古いパーマリンク設定を持っている。そのリクエストでは作らない。
 */
add_action( 'wp_loaded', function () {
	if ( get_option( 'nds_flush_rewrite' ) && empty( $GLOBALS['nds_setup_ran'] ) ) {
		flush_rewrite_rules();
		delete_option( 'nds_flush_rewrite' );
	}
} );

// 有効化の仕方によっては after_switch_theme が届かないことがあるので、管理画面を開いたときにも確認する
add_action( 'admin_init', function () {
	if ( ! get_option( 'nds_setup_done' ) && current_user_can( 'manage_options' ) ) {
		nds_initial_setup();
	}
} );

function nds_initial_setup() {
	if ( get_option( 'nds_setup_done' ) ) {
		return;
	}
	$GLOBALS['nds_setup_ran'] = true;

	// ---- 固定ページ ----
	// 本文は空。中身はテーマのテンプレート（page-{スラッグ}.php）が出す
	$pages = array(
		'home'    => 'ホーム',
		'company' => '会社案内',
		'service' => '事業案内',
		'recruit' => '採用情報',
		'news'    => 'お知らせ',
		'contact' => 'お問い合わせ',
		'privacy' => '個人情報保護方針',
	);

	$ids = array();
	foreach ( $pages as $slug => $title ) {
		$found = get_page_by_path( $slug );
		$ids[ $slug ] = $found ? $found->ID : wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_status' => 'publish',
				'post_name'   => $slug,
				'post_title'  => $title,
			)
		);
	}

	update_option( 'show_on_front', 'page' );
	update_option( 'page_on_front', $ids['home'] );
	update_option( 'page_for_posts', $ids['news'] );

	// ---- パーマリンク ----
	update_option( 'permalink_structure', '/news/%post_id%/' );

	// ---- カテゴリ ----
	$default_cat = (int) get_option( 'default_category' );
	$term        = get_term( $default_cat, 'category' );
	if ( $term && ! is_wp_error( $term ) && 'uncategorized' === $term->slug ) {
		wp_update_term( $default_cat, 'category', array( 'name' => 'お知らせ', 'slug' => 'info' ) );
	}

	// ---- WordPress の初期コンテンツを削除 ----
	foreach ( array( 'hello-world' => 'post', 'sample-page' => 'page' ) as $slug => $type ) {
		$p = get_page_by_path( $slug, OBJECT, $type );
		if ( $p ) {
			wp_delete_post( $p->ID, true );
		}
	}
	$privacy_draft = (int) get_option( 'wp_page_for_privacy_policy' );
	if ( $privacy_draft && 'draft' === get_post_status( $privacy_draft ) ) {
		wp_delete_post( $privacy_draft, true );
		update_option( 'wp_page_for_privacy_policy', 0 );
	}

	// ---- サンプル記事 ----
	if ( 0 === (int) wp_count_posts( 'post' )->publish ) {
		nds_insert_sample_posts();
	}

	update_option( 'nds_setup_done', 1 );

	/*
	 * 書き換えルールは次のリクエストで作り直す。
	 * このリクエストの中で flush すると、カテゴリなどが古いパーマリンク設定のまま作られてしまう。
	 */
	update_option( 'nds_flush_rewrite', 1 );
}

/**
 * 静的 HTML 版の NEWS に載せていた 6 件を登録する
 */
function nds_insert_sample_posts() {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';

	$posts = array(
		array(
			'2026-08-05',
			'news-01.jpg',
			'コーポレートサイトをリニューアルいたしました',
			'このたび、株式会社Next Days Solutionsのコーポレートサイトを全面的にリニューアルいたしました。',
			nds_sample_body_renewal(),
		),
		array(
			'2026-07-22',
			'news-02.jpg',
			'AI勤怠管理システム「はたらくAI」の導入企業数が〇〇社を突破しました',
			'当社が提供するAI勤怠管理システム「はたらくAI」の導入企業数が〇〇社を突破いたしました。',
		),
		array(
			'2026-07-10',
			'news-03.jpg',
			'実践型AI研修プログラムの説明会を開催いたします',
			'WEB・対面式の実践型AI研修プログラムについて、内容をご紹介する説明会を開催いたします。',
		),
		array(
			'2026-06-28',
			'news-04.jpg',
			'夏季休業期間のお知らせ',
			'誠に勝手ながら、下記の期間を夏季休業とさせていただきます。',
		),
		array(
			'2026-06-12',
			'news-05.jpg',
			'BPO事業の提供を開始いたしました',
			'業務プロセスの受託を行うBPO事業の提供を開始いたしました。',
		),
		array(
			'2026-05-30',
			'news-06.jpg',
			'東京キャリアアカデミーの研修プログラムを拡充いたしました',
			'東京キャリアアカデミーにおいて、受講いただける研修プログラムを拡充いたしました。',
		),
	);

	foreach ( $posts as $p ) {
		list( $date, $image, $title, $excerpt ) = $p;
		$body = isset( $p[4] ) ? $p[4] : "<!-- wp:paragraph -->\n<p>" . $excerpt . "</p>\n<!-- /wp:paragraph -->";

		$post_id = wp_insert_post(
			array(
				'post_type'     => 'post',
				'post_status'   => 'publish',
				'post_title'    => $title,
				'post_excerpt'  => $excerpt,
				'post_content'  => $body,
				'post_date'     => $date . ' 10:00:00',
				'post_category' => array( (int) get_option( 'default_category' ) ),
			)
		);

		if ( ! $post_id || is_wp_error( $post_id ) ) {
			continue;
		}

		// 画像はテーマ内の image/news/ からメディアライブラリへ取り込む
		$src = get_theme_file_path( 'image/news/' . $image );
		if ( file_exists( $src ) ) {
			$tmp = wp_tempnam( $image );
			copy( $src, $tmp );
			$att = media_handle_sideload( array( 'name' => $image, 'tmp_name' => $tmp ), $post_id );
			if ( is_wp_error( $att ) ) {
				@unlink( $tmp );
			} else {
				set_post_thumbnail( $post_id, $att );
			}
		}
	}
}

function nds_sample_body_renewal() {
	return <<<'HTML'
<!-- wp:paragraph -->
<p>平素は格別のご高配を賜り厚く御礼申し上げます。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>このたび、株式会社Next Days Solutionsのコーポレートサイトを全面的にリニューアルいたしました。より見やすく、必要な情報にたどり着きやすいサイトを目指して構成を見直しております。</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">リニューアルの主な内容</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>今回のリニューアルでは、以下の点を中心に改善を行いました。</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>スマートフォンからの閲覧に対応したデザインへの刷新</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>事業内容ページの再構成と、各サービスサイトへの導線の整理</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>お知らせ機能の新設による、最新情報の発信強化</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>採用情報の掲載内容の拡充</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">お知らせ機能について</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>本ページのように、当社からのお知らせを随時掲載してまいります。サービスの提供開始や各種ご案内など、皆様にお役立ていただける情報を発信いたします。</p>
<!-- /wp:paragraph -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p>今日より快適な明日を目指す。<br>私たちは、人と企業の「はたらく」を支え続けます。</p>
<!-- /wp:paragraph --></blockquote>
<!-- /wp:quote -->

<!-- wp:heading -->
<h2 class="wp-block-heading">今後について</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>今後も掲載内容の充実に努めてまいります。引き続き変わらぬご愛顧を賜りますよう、よろしくお願い申し上げます。</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>本件に関するお問い合わせは、<a href="/contact/">お問い合わせフォーム</a>よりご連絡ください。</p>
<!-- /wp:paragraph -->
HTML;
}
