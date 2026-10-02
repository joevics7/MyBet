# BetMeter

Booking code tools with a confidence score on every selection — decoder, converter,
splitter, odds comparison, vault + auto result checker, and a stake calculator, plus a
bonus daily predictor. Telegram bot + Next.js website, backed by Supabase.

See the product spec for the full shared-service architecture (Decode, Encode,
Confidence Engine, Odds Lookup, Fixture/Results Feed) and build order.

## Stack

- Next.js 13 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, `pg_cron` for the Vault's hourly result checker)

## Getting started

```bash
cp .env.example .env.local   # fill in Supabase + provider keys
npm install
npm run dev
```

Apply `supabase/migrations/` to your Supabase project, then run
`supabase/seeds/platforms.sql` to seed the initial platform list.

## Telegram bot setup

1. Create a bot via [@BotFather](https://t.me/BotFather), get its token.
2. Set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` in your
   Vercel env vars, then deploy.
3. Register the webhook (replace the placeholders):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://betmeter.vercel.app/api/telegram/webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
   ```
4. Message the bot — `/start` should reply immediately, and pasting a real
   SportyBet booking code should decode it.

v1 scope: decode only (SportyBet + Bet9ja), no confidence scoring yet --
see `app/api/telegram/webhook/route.ts`'s top comment for why.
