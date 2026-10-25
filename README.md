# Anti-Private Messenger

**End-to-End Miscommunication.** A hackathon messenger that turns your decoded message into a spicy satirical headline for everyone except the recipient, who receives a ROT13-encoded fun misinterpretation instead. Even the Chat Future puzzle arrives encoded.

Vite + plain JavaScript/CSS · Supabase Auth/PostgreSQL/Realtime · Vercel Functions · optional Groq. No paid dependencies, subscriptions, or credit card are required by the app. Select provider Free/Hobby plans; do not accept paid upgrades.

## First run

Use Node.js **24** and npm. Use the existing checkout; cloud tasks are already isolated and do not need another Git worktree.

```sh
npm ci
cp .env.example .env.local
```

Edit `.env.local` in your editor, never in a shared terminal transcript. It is ignored by Git. Fill in the four Supabase variables described below, then:

```sh
npm run dev
```

This starts Vite **and the actual Vercel API handlers** on port 5173. Restart after changing server environment variables or API/server code. The UI provides setup instructions when public configuration is missing. `npm run preview` serves a static production build only; it cannot send messages through server functions.

In a cloud environment with a restricted home directory, use `npm ci --cache /workspace/.npm-cache`. The development and live-security commands enable Node's environment-proxy support so Supabase requests follow the cloud's configured network route; TLS verification stays enabled.

## 1. Supabase setup — dashboard actions

Use a dedicated **Free** project. Anonymous accounts and intentionally public messages make this unsuitable for real personal data.

1. In Supabase, select your project. Open **Authentication → Sign In / Providers** (sometimes labeled **Providers**) and enable **Anonymous Sign-Ins**. Save. Email/password configuration and redirect URLs are not needed for this flow.
2. Open **SQL Editor → New query**. Paste all of [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql), then click **Run**. Run it once in an empty project; it creates tables and policies in one transaction. Do not drop existing tables to resolve a name conflict.
3. In **Table Editor**, confirm `profiles`, `challenges`, `broadcasts`, and `inbox_messages` exist and have RLS enabled.
4. In **Database → Publications**, confirm `supabase_realtime` includes `broadcasts` and `inbox_messages`. The migration adds them automatically when the publication exists. Some dashboard versions expose the same setting under table Realtime controls.
5. Open **Settings → Data API** for the Project URL. Use the base URL, e.g. `https://PROJECT_REF.supabase.co`, **without `/rest/v1/`**.
6. Open **Settings → API Keys** for your publishable key and a server secret key. A legacy `anon`/`service_role` key pair also works. Never put a secret/service-role key into a `VITE_` variable.

Your selected project URL is `https://xqhrubtpeumwpvksupks.supabase.co`.

| Variable                        | Value                                                      | Exposure          |
| ------------------------------- | ---------------------------------------------------------- | ----------------- |
| `VITE_SUPABASE_URL`             | Project base URL                                           | Browser/public    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`), or legacy `anon` key | Browser/public    |
| `SUPABASE_URL`                  | Same project base URL                                      | Server            |
| `SUPABASE_SERVICE_ROLE_KEY`     | Secret key (`sb_secret_…`), or legacy `service_role` key   | **Server secret** |
| `GROQ_API_KEY`                  | Optional Groq key                                          | **Server secret** |
| `GROQ_MODEL`                    | Optional model ID available in your Groq account           | Server            |

In Codex cloud, enter the public variables and server secret in **environment settings**, using the saved requirement names. Do not send secret values in chat. Saving a draft does not inject values into an already-running process; apply the configuration, then restart the development server. For macOS local development, put the same variables in `.env.local` instead.

## 2. Confirm the fallback flow first

Leave Groq variables unset initially. The app then uses deterministic absurd interpretations, with no provider call.

1. Open the app in **three isolated browser profiles/sessions**. Regular tabs often share an account. Use different browsers or separate profiles for Alice, Bob, and Charlie. Two incognito windows in the same browser may share storage too.
2. Enter fictional usernames. Users appear in the selector within five seconds; usernames are labels, not unique login credentials. The short ID suffix distinguishes duplicates.
3. Alice selects Bob. Decode the ROT13 envelope around the Chat Future puzzle, then read the puzzle to identify the outgoing cipher. Chat Future displays no decoding hint or automatic decoder.
4. If it says **A became D**, type `KHOOR`. If it describes an alphabet mirror, type `SVOOL`. Either decodes to `HELLO`.
5. Alice clicks **Transmit poorly**. Alice and Charlie see a sensational headline about the greeting in the broadcast. Bob sees no corresponding headline and gets a different, ROT13-encoded fun misinterpretation in his inbox. The decoded original is not written to the public broadcast for new messages.
6. Incoming messages use ROT13: A↔N, B↔O. There is intentionally no automatic decrypt button.
7. Request a new future for each new message. Challenges last ten minutes. Challenge creation and successful sends have a three-second cooldown per sender.

Realtime triggers authorized database refreshes. A five-second polling fallback and reconnect refresh keep the demo working if WebSockets are unavailable. Only the latest 50 permitted messages are displayed. Incorrect manual encoding is confidently treated as the resulting gibberish.

Signing out abandons an anonymous identity; there is no password recovery. Reloading while signed in retains the same account.

## Miscommunication Meter

Open **Miscommunication Meter** in the sidebar or **Open the meter** in the top bar. Its direct URL is `/miscommunication-meter`. The same anonymous account works across both pages. Select any two registered people, including pairs you are not part of.

The page displays fictional negative understanding %, a tone category (Goofy mood, Existential crisis, or Cartoon villain), friendship damage out of 100, and financial risk in imaginary credits. It counts messages in both directions. Scores are deterministic for the unordered pair and message count: swapping people or reloading preserves them; new transmissions lower understanding and increase imaginary financial risk. Friendship damage caps at 100. No messages produces an empty state rather than invented results.

Every signed-in user can access a scorecard. `/api/meter` verifies the bearer token and reads only the selected profile labels and an exact message count through the server-only Supabase client. It never queries message text, inbox ciphertext, or challenge data. Existing message RLS is unchanged. The meter page does not fetch broadcast or inbox contents. Scores refresh automatically every ten seconds and can also be refreshed manually. They are satire, not AI sentiment analysis or actual relationship/financial assessments.

No new SQL, storage, credentials, or Groq calls are required. The dedicated route is rewritten to the shared frontend by Vercel; local Vite development supports it too. API and browser tests cover public access, pair ordering, bidirectional history, score changes, empty states, failures, and mobile layout. The live security script checks that all three independent users get the same scorecard without obtaining private message content.

## 3. Optional Groq setup

1. In Groq's console, use an available free account and create an API key. Do not select a paid plan or accept a credit-card requirement.
2. Enter it securely as `GROQ_API_KEY` on the server.
3. Set `GROQ_MODEL` to a currently available text chat model in your account. Model names and free quotas change, so the app does not assume a model ID.
4. Restart locally or redeploy on Vercel.

The server makes one request with a 3.5-second timeout, asking for a JSON object containing both a 6–16 word tabloid `headline` (maximum 180 characters) and a 15–45 word fun `interpretation` (maximum 600 characters). Only the headline is broadcast; only the ROT13 interpretation enters the private inbox. Missing configuration, provider errors, rate limits, malformed/missing outputs, repeated input, or excessive output use deterministic fallbacks for both channels. Keys never enter the frontend bundle. The UI explicitly identifies fallback delivery.

The prompt asks Groq to distort the actual message's intention while retaining a recognizable topic, detail, or social gesture. The headline is fictional tabloid-style satire, and the inbox version is a separate first-person misinterpretation. It discourages unrelated surreal scenes. Responses are generated independently, so unique wording is not guaranteed; basic validation does not prove semantic relevance.

`openai/gpt-oss-120b` and `openai/gpt-oss-20b` use low reasoning effort and a 1,024-token completion budget so the model can finish both outputs. Reasoning text is excluded from the response and never delivered to users. Other models use a 240-token budget. JSON mode keeps the two outputs distinct.

For troubleshooting, authenticated send responses and Vercel function logs include a safe fallback category (`missing_configuration`, `provider_http_error`, `timeout`, `invalid_output`, `invalid_response`, or `request_failed`). HTTP failures include a status and, when recognized, a fixed provider error code. Missing configuration reports only whether each variable is present. Keys, message text, and raw provider error messages are never included in these diagnostics.

Groq uses `api.groq.com`. If Codex cloud egress is restricted, add this exact hostname in environment network settings, and configure any proxy-backed key for this destination. The fallback requires only Supabase access.

## 4. Deploy through GitHub and Vercel — dashboard actions

Account access is separate: signing into services with GitHub does not give Codex permission to configure them.

1. Put the code in `OjassMohod/Anti-Private-Messenger` on `main`. Never commit `.env.local` or secret keys.
2. In Vercel, select the **Hobby** plan and **Add New → Project**. Import the GitHub repository. If it is absent, grant the Vercel GitHub app access to this repository.
3. Use repository root, **Vite**, build command `npm run build`, output `dist`, and Node.js **24.x**. `vercel.json` configures the API functions; do not deploy only the `dist` directory.
4. Add all four Supabase variables in **Project Settings → Environment Variables**, for Production and any Preview deployment you will test. Mark the server key and Groq key sensitive. Groq variables remain optional.
5. Click **Deploy**. Changes to `VITE_` variables require a new build. After changing variables later, redeploy; changing dashboard values alone does not rebuild the deployed app.
6. Open the resulting HTTPS deployment on separate browsers/devices and repeat the three-user flow. Test the actual production domain rather than assuming a local pass proves deployment.

For automated live checks, set the non-secret `TEST_BASE_URL` to your deployment's HTTPS base URL and run `npm run test:security` from a machine with the four Supabase variables configured securely. Vercel preview protection must allow the test runner to reach your deployment. No bypass key is required for a publicly accessible production demo.

## Validation commands

```sh
npm test                # API/cipher/provider tests; provider is mocked
npm run build          # Production Vite build
npm run test:database  # Actual PostgreSQL permissions, RLS, transactions; needs Docker
npm run test:e2e       # Chromium UI tests with mocked backend; NOT proof of live RLS
npm run test:security  # Real Supabase Auth/REST/Realtime + actual app API; needs credentials
```

On macOS, start Docker Desktop before `test:database`. It pulls a pinned PostgreSQL 16 image, creates an isolated container with no network/host port exposure, applies the real migration, tests distinct user roles, and removes the container. This is a test dependency only; Docker is not required to run or deploy the app.

For browser tests, run `npx playwright install chromium` if Playwright has no browser installed. The cloud runner uses its installed `/usr/bin/chromium` when available.

The live security script creates three temporary anonymous users and profiles, sends a dummy message through the real API, verifies known-ID recipient exclusion, inbox isolation, rejected browser writes/RPC calls, Realtime delivery/exclusion, and exact retry behavior. It then removes **only its own test users**, cascading their dummy data. It can consume anonymous-auth rate limits. Run against the dedicated project. Cleanup failures identify the test user IDs to remove in **Authentication → Users**.

Set `REQUIRE_GROQ=1` when running the live security script to require a real provider response instead of accepting fallback delivery. This also prints the generated headline and decoded fun version of the script's dummy greeting; no user messages or credentials are logged.

## Security model

- Supabase verifies each bearer token with `auth.getUser` on the server; the body cannot choose the sender.
- **Storage compatibility:** the existing `broadcasts.original` column and `p_original` function parameter retain their legacy names, but new sends store the generated headline there. No additional migration is needed. Historical entries keep their prior contents. The decoded original is used in server memory for Groq and is not separately persisted as public text; the server-owned challenge retains the submitted ciphertext for safe retries.
- Challenges are server-owned, tied to sender/recipient, expire, and can be consumed once.
- `broadcasts` SELECT RLS excludes `auth.uid() = recipient_id`, even for a query by known message ID. `inbox_messages` SELECT RLS permits only its recipient. Unauthenticated visitors have no table access.
- Browser roles cannot write messages, read challenges, or execute either privileged database function. Profile writes are limited to the signed-in user's username and own profile creation.
- The server-only delivery function inserts both messages and consumes the challenge in a single transaction. A failed insert rolls the whole operation back. Row/advisory locks and submission IDs prevent duplicate concurrent delivery.
- Exact retries with the same challenge, submission ID, and ciphertext return success. The UI keeps the ID after an ambiguous response; changing its message requires a new challenge.
- Inbox rows contain only the misinterpretation's ciphertext, never the original. API responses contain delivery metadata only. Message text and usernames are HTML-escaped before rendering.
- Ciphers are not cryptographic protection. RLS provides account-based access control. Bob can create another anonymous account or look at Charlie's screen; this prototype cannot stop that.

The browser uses a public key and RLS; the backend uses a privileged key and must keep enforcing authentication. Do not expose the latter in a browser, log, commit, or chat. This hackathon app is not a production-hardened public service: cooldowns do not stop anonymous-account creation abuse.

## Troubleshooting

| Symptom                                  | Check                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Setup card remains                       | Both `VITE_` variables must exist at build/dev startup; restart or redeploy                  |
| Anonymous login fails                    | Enable anonymous sign-in; check Supabase Auth logs, IP rate limits, and any CAPTCHA settings |
| Username save fails                      | Migration installed; browser key points to the same project                                  |
| No other users                           | Use isolated browser profiles; complete each username form; wait five seconds                |
| Challenge/send says server setup pending | Server variables set in the process/deployment, with no `VITE_` prefix                       |
| Database operation failed                | Migration/functions installed; server key matches the same project and is privileged         |
| Realtime unavailable                     | Check publication; polling should still update within five seconds                           |
| Changed message cannot retry             | Restore the original ciphertext, or request a new future; changing a retry could double-send |
| Groq always falls back                   | Both Groq variables set; model is available; provider quota/network permits requests         |

## Layout

`src/` is the browser app. `api/` contains Vercel endpoints. `server/` holds server-only authentication, ciphers, and AI logic. `supabase/migrations/` defines permissions and transactional writes. `scripts/` contains the shared local API runner and real-service validation. No Supabase, Vercel, or Groq resources are provisioned automatically.
