#!/bin/bash
# Деплой сервера пушей. Требует одноразового: npx wrangler login (вход в браузере).
set -e
cd "$(dirname "$0")"
npx wrangler whoami >/dev/null 2>&1 || { echo "Сначала выполните: npx wrangler login"; exit 1; }
if grep -q KV_PLACEHOLDER wrangler.toml; then
  out=$(npx wrangler kv namespace create SUBS 2>&1)
  id=$(echo "$out" | grep -oE '[0-9a-f]{32}' | head -1)
  [ -n "$id" ] || { echo "Не удалось создать KV:"; echo "$out"; exit 1; }
  sed -i '' "s/KV_PLACEHOLDER/$id/" wrangler.toml
  echo "KV namespace: $id"
fi
grep '^VAPID_PRIVATE=' .dev.vars | cut -d= -f2- | npx wrangler secret put VAPID_PRIVATE
npx wrangler deploy
