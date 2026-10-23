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

## Measurement

The page asks, once, whether it may send anonymous usage events to Google Analytics — which
buttons you press here, so we can see what people actually try. It never includes your bookings,
your messages to the assistant, or anything you type.

Nothing is loaded from Google and nothing is sent until you press **Allow**. Your answer is kept
in this browser. If your browser sends Do Not Track (or Global Privacy Control), the question is
not asked and nothing is sent. To remove it entirely:

```
APIBLAZE_DEMO_ANALYTICS=0 npx apiblaze@latest demo
```
