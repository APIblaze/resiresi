# ResiResi: the APIblaze demo

A tiny table-booking app for pizzerias, used by `npx apiblaze@latest demo` to show what APIblaze does.

```
npx apiblaze@latest demo
```

That one command writes this folder to `./apiblaze-demo`, puts APIblaze in front of the backend,
starts everything and opens the page. No login, no prompts, no dependencies.

## What the page shows

1. **Without APIblaze.** The app uses one shared password, so Ben can cancel Ana's booking.
2. **With APIblaze.** Same app, unchanged. Ben tries again and is blocked: only the person who made
   a booking can change it.
3. **An AI assistant.** It uses the same app, under the same rules, and cannot cancel Ana's booking either.

## The files

| File | What it is |
| --- | --- |
| `backend.js` | The pizzeria's API. No login, no keys, no permission checks. |
| `openapi.yaml` | The list of endpoints. APIblaze reads it to work out who may change what. |
| `app.js` | The website's server. It calls the API with one key and says who is acting. |
| `public/index.html` | The page. |
| `start.js` | Starts the backend (port 3001) and the website (port 3000). |

Stop the demo with `npx apiblaze@latest demo stop`.
