#!/usr/bin/env python3
"""
静的 HTML 版から WordPress テーマを組み立てる。

    python3 tools/build_theme.py

出力：
    dist/nds/      … テーマ一式（FTP でアップロードする場合はこのフォルダ）
    dist/nds.zip   … 管理画面の「テーマのアップロード」用

やっていること：
    1. wordpress/theme/ の手書きファイル（functions.php、NEWS のテンプレートなど）をコピー
    2. css/ js/ image/ pdf/ をテーマの中へコピー
    3. 静的 HTML から次のテンプレートを生成
         header.php / footer.php  … index.html のヘッダー・ドロワー・オープニング・フッター
         front-page.php           … index.html（NEWS の 6 件は WordPress の記事に差し替え）
         page-{スラッグ}.php      … company / service / recruit / contact / privacy / bpo（SERVICE の子ページ）
         inc/page-meta.php        … 各ページの <title> と meta description
       リンク（company.html など）と画像などのパスは、WordPress 用の URL に置き換える

文言やデザインの修正は、これまでどおり静的 HTML と css/ js/ で行い、
このスクリプトを実行し直してテーマに反映する。生成されたファイルは直接編集しない。
"""

import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_THEME = ROOT / 'wordpress' / 'theme'
DIST = ROOT / 'dist'
OUT = DIST / 'nds'

ASSET_DIRS = ['css', 'js', 'image', 'pdf']

# 静的 HTML のファイル名 → WordPress の固定ページのパス（'' はトップ）
# 'service/bpo' は SERVICE の子ページ（URL は /service/bpo/、スラッグは bpo）
PAGES = {
    'index.html': '',
    'company.html': 'company',
    'service.html': 'service',
    'recruit.html': 'recruit',
    'news.html': 'news',
    'contact.html': 'contact',
    'privacy.html': 'privacy',
    'bpo.html': 'service/bpo',
}

# page-{スラッグ}.php を生成するページ（値は PAGES のパス）
PAGE_TEMPLATES = ['company', 'service', 'recruit', 'contact', 'privacy', 'service/bpo']


def page_slug(path):
    """固定ページのパスから、スラッグ（最後の部分）を取り出す"""
    return path.rsplit('/', 1)[-1]

GENERATED_NOTE = (
    '<?php\n'
    '/**\n'
    ' * 自動生成：tools/build_theme.py（元：{src}）\n'
    ' * 直接編集しないこと。静的 HTML を直してから再生成する。\n'
    ' */\n'
    '?>\n'
)

warnings = []


def read(name):
    return (ROOT / name).read_text(encoding='utf-8')


def between(text, start, end, name, include=True):
    """start から end までを取り出す。見つからなければ止める"""
    i = text.find(start)
    j = text.find(end, i + len(start)) if i != -1 else -1
    if i == -1 or j == -1:
        sys.exit(f'[error] {name}: 「{start}」〜「{end}」が見つかりません')
    part = text[i:j + len(end)] if include else text[i + len(start):j]
    # テンプレートに入る部分に "<?" があると PHP として解釈されてしまう
    if '<?' in part:
        sys.exit(f'[error] {name}: テンプレートに入る部分に "<?" が含まれています')
    return part


def php_url(expr):
    return f'<?php echo esc_url( {expr} ); ?>'


def rewrite_urls(html, src):
    """href / src / action の値を WordPress 用に置き換える"""

    def repl(m):
        attr, val = m.group(1), m.group(2)

        page = re.match(r'^([a-z0-9-]+\.html)(#.*)?$', val)
        if page:
            file, frag = page.group(1), page.group(2) or ''
            if file in PAGES:
                return f'{attr}="{php_url(f"nds_page_url( {PAGES[file]!r} )")}{frag}"'
            warnings.append(f'{src}: 置き換え先のないリンク {val}')
            return m.group(0)

        if val.split('/')[0] in ASSET_DIRS and '/' in val:
            return f'{attr}="{php_url(f"nds_asset_url( {val!r} )")}"'

        if val == 'contact1.php':
            # フォームの送信先。WordPress 版ではお問い合わせページ自身が受け付ける（inc/contact.php）
            expr = "nds_page_url( 'contact' )"
            return f'{attr}="{php_url(expr)}"'

        return m.group(0)

    return re.sub(r'\b(href|src|action)="([^"]*)"', repl, html)


def extract_meta(html, name):
    title = re.search(r'<title>(.*?)</title>', html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    if not title or not desc:
        sys.exit(f'[error] {name}: <title> か meta description が見つかりません')
    return title.group(1).strip(), desc.group(1).strip()


def php_str(s):
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main_block(html, name):
    return between(html, '<main>', '</main>', name)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)

    # 1. 手書きのテーマファイル
    shutil.copytree(SRC_THEME, OUT)

    # 2. 静的ファイル
    for d in ASSET_DIRS:
        shutil.copytree(ROOT / d, OUT / d)

    index = read('index.html')

    # 3-1. header.php
    body_top = between(index, '<body>', '<main>', 'index.html', include=False)
    splash_start = body_top.find('<!-- ============ オープニング')
    header_start = body_top.find('<!-- ============ ヘッダー')
    if splash_start == -1 or header_start == -1:
        sys.exit('[error] index.html: オープニング / ヘッダーの目印コメントが見つかりません')

    splash = body_top[splash_start:header_start].rstrip()
    header = body_top[header_start:].rstrip()

    header_php = (
        GENERATED_NOTE.format(src='index.html のオープニング / ヘッダー / ドロワー')
        + '<!DOCTYPE html>\n'
        '<html <?php language_attributes(); ?>>\n\n'
        '<head>\n'
        '  <meta charset="<?php bloginfo( \'charset\' ); ?>">\n'
        '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '  <?php wp_head(); ?>\n'
        '</head>\n\n'
        '<body <?php body_class(); ?>>\n'
        '<?php wp_body_open(); ?>\n\n'
        '  <?php if ( is_front_page() ) : ?>\n'
        f'  {splash}\n'
        '  <?php endif; ?>\n\n'
        f'  {header}\n\n'
    )
    (OUT / 'header.php').write_text(rewrite_urls(header_php, 'header.php'), encoding='utf-8')

    # 3-2. footer.php
    footer = between(index, '<!-- ============ フッター ============ -->', '</footer>', 'index.html')
    footer_php = (
        GENERATED_NOTE.format(src='index.html のフッター')
        + f'\n  {footer}\n\n'
        '  <?php wp_footer(); ?>\n'
        '</body>\n\n'
        '</html>\n'
    )
    (OUT / 'footer.php').write_text(rewrite_urls(footer_php, 'footer.php'), encoding='utf-8')

    # 他のページのヘッダー・フッターが index.html と同じか確かめる
    shared_header = between(index, '<header class="header">', '</nav>\n\n  <main>', 'index.html')
    for name in PAGES:
        html = read(name)
        if between(html, '<header class="header">', '</nav>\n\n  <main>', name) != shared_header:
            warnings.append(f'{name}: ヘッダーが index.html と違います（テーマでは index.html の内容を使います）')
        if between(html, '<footer class="footer">', '</footer>', name) != \
                between(index, '<footer class="footer">', '</footer>', 'index.html'):
            warnings.append(f'{name}: フッターが index.html と違います（テーマでは index.html の内容を使います）')

    # 3-3. front-page.php（NEWS の中身を WordPress の記事に差し替える）
    front_main = main_block(index, 'index.html')
    grid = re.search(r'(<ul class="news__grid[^"]*"[^>]*>)(.*?)(\n\s*</ul>)', front_main, re.S)
    if not grid:
        sys.exit('[error] index.html: <ul class="news__grid"> が見つかりません')
    front_main = (
        front_main[:grid.start()]
        + grid.group(1)
        + "\n<?php get_template_part( 'template-parts/home-news' ); ?>"
        + grid.group(3)
        + front_main[grid.end():]
    )
    front_php = (
        GENERATED_NOTE.format(src='index.html')
        + '<?php get_header(); ?>\n\n'
        f'  {front_main}\n\n'
        '<?php get_footer(); ?>\n'
    )
    (OUT / 'front-page.php').write_text(rewrite_urls(front_php, 'front-page.php'), encoding='utf-8')

    # 3-4. page-{スラッグ}.php
    files = {path: name for name, path in PAGES.items()}
    for path in PAGE_TEMPLATES:
        name = files[path]
        slug = page_slug(path)
        main = main_block(read(name), name)

        if slug == 'contact':
            # フォームの直後に nonce とハニーポットを差し込む
            form = re.search(r'<form [^>]*id="contactForm"[^>]*>', main)
            if not form:
                sys.exit('[error] contact.html: <form id="contactForm"> が見つかりません')
            main = main[:form.end()] + '\n<?php nds_contact_hidden_fields(); ?>' + main[form.end():]

        page_php = (
            GENERATED_NOTE.format(src=name)
            + '<?php get_header(); ?>\n\n'
            f'  {main}\n\n'
            '<?php get_footer(); ?>\n'
        )
        (OUT / f'page-{slug}.php').write_text(rewrite_urls(page_php, f'page-{slug}.php'), encoding='utf-8')

    # 3-5. inc/page-meta.php
    rows = []
    for name, slug in PAGES.items():
        title, desc = extract_meta(read(name), name)
        key = page_slug(slug) or 'front'
        rows.append(
            f'\t\t{php_str(key)} => array(\n'
            f'\t\t\t\'title\'       => {php_str(title)},\n'
            f'\t\t\t\'description\' => {php_str(desc)},\n'
            f'\t\t),\n'
        )
    meta_php = (
        '<?php\n'
        '/**\n'
        ' * 自動生成：tools/build_theme.py（元：各ページの <title> と meta description）\n'
        ' * 直接編集しないこと。静的 HTML を直してから再生成する。\n'
        ' */\n\n'
        'if ( ! defined( \'ABSPATH\' ) ) {\n\texit;\n}\n\n'
        'function nds_page_meta() {\n'
        '\treturn array(\n'
        + ''.join(rows)
        + '\t);\n'
        '}\n'
    )
    (OUT / 'inc' / 'page-meta.php').write_text(meta_php, encoding='utf-8')

    # 4. zip
    zip_path = DIST / 'nds.zip'
    if zip_path.exists():
        zip_path.unlink()
    shutil.make_archive(str(DIST / 'nds'), 'zip', root_dir=DIST, base_dir='nds')

    for w in warnings:
        print('[warn]', w)
    print(f'テーマを出力しました：{OUT.relative_to(ROOT)}/ と {zip_path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
