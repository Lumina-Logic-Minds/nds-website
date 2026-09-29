#!/usr/bin/env bash
#
# ローカルで WordPress を立ち上げて、テーマの表示を確認する
#
#   bash tools/local-wp.sh
#
# 1. 静的 HTML からテーマを生成（tools/build_theme.py）
# 2. WordPress Playground を起動し、生成したテーマを有効化
# 3. http://localhost:9400/ で確認できる（止めるときは Ctrl + C）
#
# 必要なもの：python3 と Node.js（npx）。PHP・MySQL・Docker は不要。
# データは起動のたびに作り直される（サンプル記事 6 件の状態から始まる）。
# 起動したまま HTML や CSS を直した場合は、別のターミナルで
# python3 tools/build_theme.py を実行してからブラウザを再読み込みすればよい。

# Windows のブラウザからは 127.0.0.1 では届かず localhost なら届く（WSL の転送の都合）ので、
# WordPress のサイト URL も localhost にしておく。
#
# Playground のバージョンは固定している（最新版が壊れて公開されることがあるため）。
# 上げるときは、下の @3.1.55 を書き換えて動くか確かめる。

set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-9400}"

python3 tools/build_theme.py

echo
echo "WordPress を起動します（初回は数分かかります）"
echo "  サイト    : http://localhost:${PORT}/"
echo "  管理画面  : http://localhost:${PORT}/wp-admin/  （自動でログイン済み）"
echo "  止めるとき: Ctrl + C"
echo

exec npx -y @wp-playground/cli@3.1.55 server \
  --port="${PORT}" \
  --site-url="http://localhost:${PORT}" \
  --mount=./dist/nds:/wordpress/wp-content/themes/nds \
  --blueprint=./wordpress/playground-blueprint.json \
  --login
