This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Environment

Copy `.env.example` to `.env.local` and fill in values there. `.env.local` is gitignored.

Public (inlined into the browser at build time):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only (never import these from a Client Component):

- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`

Missing public vars fail when a page first talks to Supabase. Missing server secrets fail only on the server path that reads them (upload, grading, progress). Do not print secret values in logs or diagnostics.

## Deploy on Vercel

`POST /api/quests` runs the full AI pipeline in one request and sets `maxDuration` to 300 seconds. Deploy on a plan that allows at least that function duration. Hobby-plan defaults will time out mid-pipeline.

Each OpenAI call is capped at 20 seconds with one retry. That bound is intentional; do not raise retries without also raising `maxDuration`.

The easiest way to deploy is the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
