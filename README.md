# Nino's Pizza: the APIblaze demo

A tiny table-booking app for pizzerias, used by `npx apiblaze@latest demo` to show what APIblaze does.

```
npx apiblaze@latest demo
```

That one command writes this folder to `./apiblaze-demo`, puts APIblaze in front of the backend,
starts everything and opens the page. No login, no prompts, no dependencies.

## What the page shows

1. **Your API is live on the internet.** The backend runs on your laptop; APIblaze gives it a public
   URL and an MCP address for AI assistants. A live ticker shows each request reaching your laptop.
2. **An AI assistant uses it.** Ask it to book a table and watch the request arrive.
3. **Included, no code:** only the owner can change a booking, each customer (Nino Pizza,
   Gino Pizza) is separate, rate limits, sign-in, and drop-in widgets for API keys and roles.

## The files

| File | What it is |
| --- | --- |
| `backend.js` | The pizzeria's API. No login, no keys, no permission checks. |
| `openapi.yaml` | Its endpoints. APIblaze builds the AI tools and the ownership rules from it. |
| `app.js` | The website's server. Calls the API with one key and says who is acting. |
| `public/index.html` | The page. |
| `start.js` | Starts the backend (port 3001) and the website (port 3000). |

`npx apiblaze@latest demo` also adds `lib/apiblaze-server.js` and `public/apiblaze-widgets.js`, the same
helpers you get from `npm i apiblaze`. Stop the demo with `npx apiblaze@latest demo stop`.
