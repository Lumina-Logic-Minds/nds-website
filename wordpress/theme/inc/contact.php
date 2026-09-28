<?php
/**
 * お問い合わせフォーム（入力 → 確認 → 送信完了）
 *
 * 静的サイトで使っていた contact1.php（配布スクリプト）の動きを、WordPress の中へ移したもの。
 * 届くメールの文面は contact1.php と同じにしてある。
 *
 * 流れ：
 *   /contact/ の入力フォーム ──POST──▶ /contact/（確認画面）──POST──▶ 送信
 *        ──リダイレクト──▶ /contact/?sent=1（送信完了画面）
 *   送信後にリダイレクトするので、完了画面で再読み込みしても二重に送信されない。
 *
 * 受信先：
 *   本番（nextdays-solutions.com）… info@nextdays-solutions.com
 *   それ以外（テスト環境・ローカル）… WordPress の管理者メールアドレス（設定 → 一般）
 *   wp-config.php で NDS_CONTACT_TO を定義すれば、それが優先される。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** 送信元（自社ドメイン。SPF にエックスサーバーが登録済み） */
define( 'NDS_CONTACT_FROM', 'info@nextdays-solutions.com' );
define( 'NDS_CONTACT_FROM_NAME', '株式会社ネクストデイズソリューションズ' );

/** 本番のドメイン */
define( 'NDS_PRODUCTION_HOSTS', array( 'nextdays-solutions.com', 'www.nextdays-solutions.com' ) );


/* ============================================
   設定
   ============================================ */

/**
 * フォームの項目（name 属性）。この順で確認画面とメールに出す
 */
function nds_contact_fields() {
	return array(
		'氏名',
		'フリガナ',
		'会社名',
		'部署名',
		'役職',
		'TEL',
		'メールアドレス',
		'メールアドレス確認用',
		'お問い合わせ内容',
		'プライバシーポリシーへの同意',
	);
}

/**
 * 必須の項目。入力フォームの required と合わせる
 */
function nds_contact_required() {
	return array( '氏名', 'フリガナ', 'TEL', 'メールアドレス', 'メールアドレス確認用', 'プライバシーポリシーへの同意' );
}

/**
 * 受信先
 */
function nds_contact_to() {
	if ( defined( 'NDS_CONTACT_TO' ) ) {
		return NDS_CONTACT_TO;
	}

	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	if ( in_array( $host, NDS_PRODUCTION_HOSTS, true ) ) {
		return 'info@nextdays-solutions.com';
	}

	return get_option( 'admin_email' );
}

/**
 * メールの署名（管理者宛・自動返信の両方に付ける）
 */
function nds_contact_signature() {
	return <<<'TEXT'
----------------------------------------------------------------------
※上記につきまして、お客様自身に心当たりがない場合は
　本メールにご返信頂く等、早急にご連絡ください。

内容を確認の上、担当より
今後のお手続きについて、詳細をご連絡させていただきます。
恐れ入りますが今暫くお待ちくださいませ。

その他ご不明点等ございましたら、お気軽にお問い合わせください。
今後とも株式会社ネクストデイズソリューションズをよろしくお願い申し上げます。

株式会社ネクストデイズソリューションズ
----------------------------------------------------------------------
株式会社ネクストデイズソリューションズ
営業時間 : 平日　10:00〜19:00
※営業時間外のお問い合わせは翌営業日以降に順次対応いたします。
----------------------------------------------------------------------

TEXT;
}


/* ============================================
   入力フォームに足す隠し項目
   ============================================ */

/**
 * page-contact.php の <form> の直後に出す（tools/build_theme.py が差し込む）
 * - nonce：このサイトのフォームから送られたかの確認（contact1.php のリファラチェックの代わり）
 * - ハニーポット：人には見えない欄。ここに入力があればボットとみなす
 */
function nds_contact_hidden_fields() {
	wp_nonce_field( 'nds_contact', 'nds_contact_nonce', false );
	echo '<div class="cform__hp" aria-hidden="true"><label>この欄は空のままにしてください<input type="text" name="nds_hp" value="" tabindex="-1" autocomplete="off"></label></div>';
}


/* ============================================
   受け付け
   ============================================ */

add_action( 'template_redirect', function () {
	if ( ! is_page( 'contact' ) ) {
		return;
	}

	if ( 'POST' === $_SERVER['REQUEST_METHOD'] ) {
		nds_contact_handle_post();
		exit;
	}

	if ( isset( $_GET['sent'] ) ) {
		nds_contact_render( 'done' );
		exit;
	}
} );

function nds_contact_handle_post() {
	// ボットには、送れたように見せて何もしない
	if ( ! empty( $_POST['nds_hp'] ) ) {
		wp_safe_redirect( add_query_arg( 'sent', '1', nds_page_url( 'contact' ) ), 303 );
		return;
	}

	$nonce = isset( $_POST['nds_contact_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['nds_contact_nonce'] ) ) : '';
	if ( ! wp_verify_nonce( $nonce, 'nds_contact' ) ) {
		nds_contact_render( 'error', array( 'errors' => array( 'ページの有効期限が切れました。お手数ですが、お問い合わせページを開き直してからご入力ください。' ) ) );
		return;
	}

	$data   = nds_contact_collect();
	$errors = nds_contact_validate( $data );

	if ( $errors ) {
		nds_contact_render( 'error', array( 'errors' => $errors ) );
		return;
	}

	// 1 回目の POST（入力フォームから）は確認画面へ
	if ( ! isset( $_POST['mail_set'] ) || 'confirm_submit' !== $_POST['mail_set'] ) {
		nds_contact_render(
			'confirm',
			array(
				'data'    => $data,
				'referer' => wp_get_referer() ?: nds_page_url( 'contact' ),
			)
		);
		return;
	}

	// 2 回目の POST（確認画面から）で送信する
	$referer = isset( $_POST['httpReferer'] ) ? esc_url_raw( wp_unslash( $_POST['httpReferer'] ) ) : '';

	if ( ! nds_contact_send( $data, $referer ) ) {
		nds_contact_render(
			'error',
			array( 'errors' => array( '送信に失敗しました。お手数ですが、時間をおいて再度お試しいただくか、お電話（03-6265-9810）にてお問い合わせください。' ) )
		);
		return;
	}

	wp_safe_redirect( add_query_arg( 'sent', '1', nds_page_url( 'contact' ) ), 303 );
}

/**
 * POST から、決まった項目だけを取り出す
 */
function nds_contact_collect() {
	$data = array();

	foreach ( nds_contact_fields() as $key ) {
		if ( ! isset( $_POST[ $key ] ) || is_array( $_POST[ $key ] ) ) {
			continue;
		}

		$val = str_replace( "\0", '', (string) wp_unslash( $_POST[ $key ] ) );

		// 複数行を許すのはお問い合わせ内容だけ
		$val = ( 'お問い合わせ内容' === $key )
			? str_replace( array( "\r\n", "\r" ), "\n", $val )
			: preg_replace( '/[\r\n]+/', ' ', $val );

		$data[ $key ] = $val;
	}

	return $data;
}

/**
 * 入力チェック。エラー文の配列を返す（問題なければ空）
 */
function nds_contact_validate( $data ) {
	$errors = array();

	foreach ( nds_contact_required() as $key ) {
		if ( ! array_key_exists( $key, $data ) ) {
			$errors[] = '【' . $key . '】が未選択です。';
		} elseif ( '' === trim( $data[ $key ] ) ) {
			$errors[] = '【' . $key . '】は必須項目です。';
		}
	}

	$mail  = isset( $data['メールアドレス'] ) ? trim( $data['メールアドレス'] ) : '';
	$mail2 = isset( $data['メールアドレス確認用'] ) ? trim( $data['メールアドレス確認用'] ) : '';

	if ( '' !== $mail && ! is_email( $mail ) ) {
		$errors[] = '【メールアドレス】はメールアドレスの形式が正しくありません。';
	}
	if ( '' !== $mail && '' !== $mail2 && $mail !== $mail2 ) {
		$errors[] = '【メールアドレス確認用】が【メールアドレス】と一致しません。';
	}

	return $errors;
}


/* ============================================
   メール
   ============================================ */

/**
 * 項目を「【 項目名 】 値」の形で並べる（contact1.php と同じ書式）
 */
function nds_contact_lines( $data ) {
	$out = '';
	foreach ( $data as $key => $val ) {
		$out .= '【 ' . $key . ' 】 ' . $val . "\n";
	}
	return $out;
}

function nds_contact_send( $data, $referer ) {
	$to   = nds_contact_to();
	$mail = trim( $data['メールアドレス'] );
	$from = 'From: ' . NDS_CONTACT_FROM_NAME . ' <' . NDS_CONTACT_FROM . '>';
	$line = "＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝\n";
	$now  = wp_date( 'Y/m/d (D) H:i:s' );
	$ip   = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';

	// ---- 管理者宛 ----
	$subject = 'お問い合わせ内容';
	$body    = '「' . $subject . "」からメールが届きました\n\n"
		. $line . "\n"
		. nds_contact_lines( $data )
		. "\n" . $line
		. '送信された日時：' . $now . "\n"
		. '送信者のIPアドレス：' . $ip . "\n"
		. '送信者のホスト名：' . ( $ip ? gethostbyaddr( $ip ) : '' ) . "\n"
		. '問い合わせのページURL：' . $referer . "\n"
		. nds_contact_signature();

	$sent = wp_mail( $to, $subject, $body, array( $from, 'Reply-To: ' . $mail ) );

	if ( ! $sent ) {
		return false;
	}

	// ---- お客様への自動返信 ----
	$name      = isset( $data['氏名'] ) ? $data['氏名'] . " 様\n" : '';
	$re_body   = $name
		. "\n平素よりご高配を賜り厚く御礼申し上げます。\n"
		. "株式会社ネクストデイズソリューションズでございます。\n\n"
		. "お申し込みいただいた情報は以下のとおりです。\n\n"
		. "\n" . $line . "\n"
		. nds_contact_lines( $data )
		. "\n" . $line . "\n"
		. '送信日時：' . $now . "\n"
		. nds_contact_signature();

	wp_mail(
		$mail,
		'株式会社ネクストデイズソリューションズにお問い合わせありがとうございます。',
		$re_body,
		array( $from, 'Reply-To: ' . $to )
	);

	return true;
}


/* ============================================
   画面（確認・エラー・送信完了）
   元：contact1.php の確認画面 / 完了画面
   ============================================ */

function nds_contact_render( $type, $args = array() ) {
	status_header( 200 );
	nocache_headers();

	$heads = array(
		'confirm' => array( 'CONFIRM', '入力内容の確認' ),
		'error'   => array( 'ERROR', '入力内容の確認' ),
		'done'    => array( 'THANK YOU', '送信完了' ),
	);
	list( $en, $ja ) = $heads[ $type ];

	get_header();
	?>
  <main>
    <section class="phead" style="--page-c: #010038;">
      <div class="inner">
        <h1 class="phead__en split-mask"><?php echo esc_html( $en ); ?></h1>
        <p class="phead__ja"><?php echo esc_html( $ja ); ?></p>
      </div>
    </section>

    <section class="section cform-sec">
      <div class="inner cform__inner">
        <div class="cform__card">
	<?php if ( 'error' === $type ) : ?>
        <div class="cform__error">
          <p class="cform__error-head">入力内容に不備があります</p>
          <div class="cform__error-body">
            <?php foreach ( $args['errors'] as $msg ) : ?>
            <p class="error_messe"><?php echo esc_html( $msg ); ?></p>
            <?php endforeach; ?>
          </div>
        </div>
        <div class="cform__submit">
          <button type="button" class="cform__btn cform__btn--back" onclick="history.back()">前の画面に戻る</button>
        </div>

	<?php elseif ( 'confirm' === $type ) : ?>
        <p class="cform__lead">以下の内容で間違いがなければ、「送信する」ボタンを押してください。</p>

        <form method="post" action="<?php echo esc_url( nds_page_url( 'contact' ) ); ?>">
          <dl class="cconf">
            <?php foreach ( $args['data'] as $key => $val ) : ?>
            <div class="cconf__row"><dt><?php echo esc_html( $key ); ?></dt><dd><?php echo nl2br( esc_html( $val ) ); ?><input type="hidden" name="<?php echo esc_attr( $key ); ?>" value="<?php echo esc_attr( $val ); ?>"></dd></div>
            <?php endforeach; ?>
          </dl>

          <input type="hidden" name="mail_set" value="confirm_submit">
          <input type="hidden" name="httpReferer" value="<?php echo esc_url( $args['referer'] ); ?>">
          <?php nds_contact_hidden_fields(); ?>

          <div class="cform__submit cform__submit--pair">
            <button type="button" class="cform__btn cform__btn--back" onclick="history.back()">修正する</button>
            <button type="submit" class="cform__btn">
              送信する
              <?php nds_arrow( 'next', 15 ); ?>
            </button>
          </div>
        </form>

	<?php else : ?>
        <div class="cdone">
          <p class="cdone__lead">お問い合わせいただき、ありがとうございます。</p>
          <p class="cdone__text">
            送信は正常に完了しました。<br>
            ご入力いただいたメールアドレス宛に、確認のメールをお送りしております。<br>
            内容を確認のうえ、担当者よりご連絡いたします。
          </p>
          <a class="cform__btn" href="<?php echo esc_url( home_url( '/' ) ); ?>">
            トップページへ戻る
            <?php nds_arrow( 'next', 15 ); ?>
          </a>
        </div>
	<?php endif; ?>
        </div>
      </div>
    </section>
  </main>
	<?php
	get_footer();
}
