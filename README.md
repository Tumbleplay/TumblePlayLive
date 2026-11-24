# Tumble

A free-to-play game room: ten casino-style originals, a live sportsbook, chat, VIP levels, rewards and an admin panel. It works like Stake or Parimatch, but everything runs on **free coins** only. Coins can't be bought, sold, withdrawn or cashed out, and the app has no payment code at all.

## What's inside

| Area | Features |
|---|---|
| Casino | Crash (live multiplayer), Dice, Limbo, Mines, Plinko, Keno, Wheel, Roulette, HiLo, Blackjack. Autobet on Dice, Limbo, Plinko, Keno and Wheel |
| Sportsbook | Football, cricket, basketball and tennis. Live scores and moving odds, singles and multis (up to 12 picks), automatic settlement, odds-change protection |
| Fairness | Every result comes from HMAC-SHA256 (server seed, client seed, nonce). Players can rotate seeds and check any bet on the Fairness page. Crash publishes each round's hash before it starts |
| Rewards | 1,000 welcome coins, a daily bonus, rakeback on every bet, and a top-up to 1,000 once an hour when under 100 |
| VIP | 7 levels by amount wagered. Each level-up pays a bonus and raises the daily bonus and rakeback |
| Social | Live bet feed (all, high rollers, mine), global chat, leaderboards (profit, wagered, biggest multiplier), public profiles |
| Admin | House stats per game, coins given out, player search, add or remove coins, mute, ban, make admin, delete chat messages, add custom matches and settle them |

Every casino game keeps a 1% house edge, except Roulette, which has the standard single-zero edge of 2.7%. Demo sports matches play out in about 10 minutes, so players can follow a game from kickoff to result.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run build     # builds the web app into client/dist
npm start         # http://localhost:3000
```

The first account you create becomes the admin. For front-end work, run `npm run dev` (API) and `npm run dev:web` (Vite with hot reload on port 5173) in two terminals.

`npm test` plays tens of thousands of bets against a scratch database and checks payouts, seed verification, rewards, sportsbook settlement and that the coin ledger always matches balances.

## Put it online for free (Oracle Cloud + DuckDNS)

Runs 24/7 at no cost on an Oracle Cloud "Always Free" server with a free `yourname.duckdns.org` address and automatic HTTPS.

1. **DuckDNS:** sign in at duckdns.org, add a subdomain, copy your token.
2. **Oracle Cloud:** create an Always Free account. Create a compute instance: Ubuntu, shape **VM.Standard.A1.Flex** (up to 2 OCPUs, 12 GB) or **VM.Standard.E2.1.Micro** if Arm is out of capacity.
   Under **Advanced options → Initialization script**, paste `deploy/oracle-free-setup.sh` with the three values at the top filled in.
3. **Open the ports:** Networking → your VCN → Default security list → add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
4. Wait about 10 minutes, open `https://yourname.duckdns.org` and sign up. The first account is the admin.

On the server: `sudo tumble-update` pulls new code and restarts; `sudo tumble-backup` runs nightly and keeps 14 days of database copies in `/var/backups/tumble`.

## Put it online (Railway)

The repo includes `railway.json` and a `Dockerfile`, so Railway builds it with no extra settings.

1. In Railway: **New Project → Deploy from GitHub repo** and pick this repo.
2. Open the service → **Volumes → Add volume**, mount path `/data`. This keeps players and balances between deploys.
3. **Variables** → add:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = a long random string (keep it private)
   - `DB_PATH` = `/data/tumble.db`
4. **Settings → Networking → Generate domain**. Open it and sign up. The first account becomes the admin.

Every push to the main branch redeploys automatically.

**Docker anywhere else**
```bash
docker build -t tumble .
docker run -p 3000:3000 -v tumble-data:/data -e JWT_SECRET=your-long-secret tumble
```

## Real fixtures (optional)

Set `ODDS_API_KEY` from [the-odds-api.com](https://the-odds-api.com) and the server imports real matches and odds every 15 minutes and settles them from official scores. Free plans have a monthly quota, so only a few sports are pulled (`ODDS_API_MAX_SPORTS`, default 4). Demo matches keep running alongside. You can also add matches yourself from Admin → Custom matches and settle them with the final score.

## Project layout

```
server/            Express API, Socket.IO, game and sportsbook engines
  games/           casino.js (instant games, Mines, Roulette), cards.js (HiLo, Blackjack), crash.js
  sports/          demo match models, live engine, odds API importer
  wallet.js        every coin movement goes through here and writes a ledger row
shared/math.js     game math used by the server to play and by the browser to verify
client/src/        React app (Vite): pages, games, layout
test/              engine and sportsbook tests
```

## Notes

- Coin amounts are stored as whole cents in SQLite, so balances never drift.
- One server process handles about a few thousand players. To go beyond that, move from SQLite to Postgres and run Crash and the sports loop as a single worker.
- Keep coins free. Adding a way to buy coins, or to turn them into anything of value, would make this a real-money game, which is regulated or banned in many places, including India.
