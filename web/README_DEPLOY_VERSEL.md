Deployment instructions for Vercel (deploy only the `web` folder)

Options:

1) Quick CLI deploy (deploys from `web` folder)

   cd web
   # first-time: vercel login
   vercel --prod

   This will upload the contents of `web` and use `web/vercel.json` to serve files from the `public/` folder.

2) Git integration (recommended for CI)

   - In the Vercel dashboard, when creating the project from this repository, set "Root Directory" to `web`.
   - Ensure the project has a build step if you later generate files; with the current static files in `web/public` no build is required.

Notes:

- `web/vercel.json` uses the `@vercel/static` builder and serves files from `public/`.
- If you prefer to deploy the Node `server.js` as Serverless, adapt `vercel.json` and add an `api/` function, or deploy from the repo root with proper project settings.
