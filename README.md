# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Supabase target safety

This repo can talk to different Supabase projects depending on which env file
the frontend loads and which project the Supabase CLI is linked to locally.
That is the main source of "it worked in Antigravity but broke in Codex local"
drift on this project.

Rules for this repo:

- `supabase/.temp/` is local-only and must never be committed.
- The default local target is development. Switch targets explicitly instead of
  reusing stale CLI link metadata.
- Run `npm run supabase:target:dev` to reset local work to the development
  project.
- Run `npm run supabase:target:prod` before a production deploy, then relink if
  your CLI needs it.
- Run `npm run supabase:doctor` before `supabase db push` or `supabase functions deploy`.
- Run `npm run supabase:doctor:prod` before any production deploy.
- If the doctor fails, align the frontend env and your local `supabase link`
  target before continuing.

Common commands:

```sh
npm install
npm run supabase:target:dev
npm run supabase:doctor
npm run supabase:doctor:prod
```

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Verify that the frontend target and local Supabase link agree.
npm run supabase:target:dev
npm run supabase:doctor

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
