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
