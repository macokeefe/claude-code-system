# CLAUDE.md — Creator Tool / Automation Project

<!--
HOW TO USE THIS FILE:
1. Drop this file in the root of your project as `CLAUDE.md`
2. Fill in every section — the more context you give Claude, the less it will guess
3. Keep it updated as your stack or workflows evolve
4. At the start of each session, paste the Session Kickoff Prompt at the bottom
-->

---

## Project Type

<!-- What kind of creator tool is this? Check all that apply or write your own. -->

- [ ] Newsletter automation (drafting, scheduling, analytics)
- [ ] Social media scheduler / repurposing engine
- [ ] AI writing assistant / content generator
- [ ] Course or digital product platform
- [ ] Lead magnet / opt-in tool
- [ ] YouTube workflow tool (scripts, thumbnails, descriptions)
- [ ] Podcast production assistant
- [ ] Creator CRM / audience management
- [ ] Revenue / analytics dashboard
- [ ] Zapier/Make replacement — custom automation scripts
- [ ] Other: ___________________________

**One-line description of what this project does:**
> Example: "Pulls my tweet drafts from Notion, runs them through GPT-4 for a polish pass, then schedules them via Typefully."

---

## Creator Context

**Platform(s) I create for:**
- Primary: (e.g., Newsletter via Beehiiv, Twitter/X, YouTube)
- Secondary: (e.g., LinkedIn repurposing, Gumroad products)

**Audience:**
- Who they are: (e.g., indie founders, solopreneur designers, early-career marketers)
- Approx size: (e.g., 4,200 newsletter subscribers, 11k Twitter followers)
- What they pay for: (e.g., weekly deep dives, templates, cohort courses)

**Content goals:**
- (e.g., publish 3x/week on Twitter, send newsletter every Tuesday, launch one product per quarter)

**Monetization model:**
- [ ] Paid newsletter (Substack / Beehiiv premium)
- [ ] Digital products (Gumroad, Lemon Squeezy, Payhip)
- [ ] Sponsorships / brand deals
- [ ] Cohort courses / live workshops
- [ ] Consulting / services
- [ ] Affiliate revenue
- [ ] Other: ___________________________

---

## Tech Stack

**Language(s):** (e.g., Python 3.11, Node 20, plain shell scripts)

**Key dependencies / libraries:**
```
# Example:
openai==1.x         # LLM calls
tweepy==4.x         # Twitter API
httpx               # API requests
python-dotenv       # env management
schedule            # cron-style scheduling in Python
```

**Where things run:**
- [ ] Local machine (cron job / launchd)
- [ ] VPS / Droplet (systemd service)
- [ ] Railway / Render / Fly.io
- [ ] AWS Lambda / GCP Cloud Functions
- [ ] n8n / Make (low-code runner)
- [ ] GitHub Actions

**Environment variables file:** `.env` (never commit — add to `.gitignore`)

**Package manager:** (pip / npm / bun / uv)

---

## Key Files

| File / Path | What it does |
|---|---|
| `main.py` / `index.js` | Entry point — run this to trigger the automation |
| `.env` | API keys and secrets — DO NOT EDIT live without backup |
| `config.yaml` | Tweakable settings (schedule, tone, word count, etc.) |
| `prompts/` | All LLM system prompts and templates live here |
| `content/drafts/` | Raw content before processing |
| `content/published/` | Archive of what has gone out |
| `logs/run.log` | Execution log — check here first when something breaks |

<!-- Add or remove rows as needed -->

---

## Content Automation Patterns

**How content flows through this system:**
```
[Source] → [Draft] → [Enrich/Polish] → [Review Gate] → [Publish] → [Archive]

Example:
Notion DB → GPT-4 rewrite → manual Slack review → Typefully schedule → Google Sheet log
```

**Generation approach:**
- LLM model used: (e.g., gpt-4o, claude-3-5-sonnet, gemini-flash)
- System prompt location: `prompts/system.md`
- Temperature setting: (e.g., 0.7 for varied output, 0.3 for consistent formatting)

**Scheduling:**
- Frequency: (e.g., Tuesday 8am ET, daily at 6am)
- Scheduler type: (e.g., cron, Python `schedule` lib, GitHub Actions cron)
- Timezone handling: Always use UTC internally; convert to local at output

**Human review gate:**
- [ ] No review — fully automated
- [ ] Review via Slack message with approve/reject
- [ ] Drafts posted to Notion for review before publish
- [ ] Email digest of pending posts
- [ ] Manual file review before running publish step

---

## API Integrations

**Active integrations — treat credentials as read-only unless asked:**

| Service | Purpose | Auth method | Env var |
|---|---|---|---|
| OpenAI | Content generation | API key | `OPENAI_API_KEY` |
| Beehiiv | Newsletter publish/analytics | API key | `BEEHIIV_API_KEY` |
| ConvertKit | Subscriber management | API key + secret | `CK_API_KEY` |
| Twitter/X | Post scheduling, DM automation | OAuth 2.0 | `TWITTER_BEARER_TOKEN` |
| YouTube Data API | Upload descriptions, analytics pull | OAuth + service account | `YOUTUBE_API_KEY` |
| Typefully | Tweet thread scheduling | API key | `TYPEFULLY_API_KEY` |
| Gumroad | Product / sales data | API key | `GUMROAD_TOKEN` |
| Notion | Content database / CRM | Integration token | `NOTION_TOKEN` |
| Airtable | Scheduling calendar | API key | `AIRTABLE_API_KEY` |
| Slack | Review notifications | Webhook URL | `SLACK_WEBHOOK_URL` |

<!-- Remove rows that don't apply. Add others as needed. -->

**Rate limit notes:**
- Twitter free tier: 1,500 tweets/month — do NOT bulk post
- YouTube Data API: 10,000 units/day — avoid polling in tight loops
- OpenAI: respect token limits per model; log usage to catch runaway loops

---

## Workflow — How Claude Should Approach New Automations

When I ask you to build or modify something, follow this order:

1. **Understand the content goal first** — ask what the output should look like before writing any code
2. **Check existing patterns** — look at `prompts/`, `config.yaml`, and existing scripts before building from scratch
3. **Reuse API clients already in the project** — don't add a new library if one already handles it
4. **Keep scripts single-purpose** — one script, one job. Don't bundle unrelated steps
5. **Always add logging** — every automation should write to `logs/run.log` with timestamps
6. **Make it reversible** — if the script publishes or sends, add a `--dry-run` flag that previews output without firing
7. **Secrets stay in `.env`** — never hardcode keys; always use `os.getenv()` or `dotenv`
8. **Document the trigger** — add a comment at the top of every script explaining how/when to run it

**When I say "automate X":**
- Ask: Is this a one-time script or recurring?
- Ask: Should it be interactive (confirm before sending) or fully headless?
- Default to dry-run mode until I explicitly say to run live

---

## Output Standards

**Brand voice:**
- Tone: (e.g., direct and slightly irreverent, like a smart friend who's been around the block)
- Reading level: (e.g., 8th grade — clear, no jargon unless the audience expects it)
- Sentence style: (e.g., short punchy sentences. Vary length. Never academic.)
- Vocabulary to avoid: (e.g., "leverage", "synergy", "dive deep", "unlock your potential")

**Format defaults:**
- Newsletter: No more than 600 words for main section. Use H2s sparingly. End with a single CTA.
- Twitter threads: 8–12 tweets. Hook in tweet 1. Each tweet standalone-readable. No thread of threads.
- LinkedIn: One idea per post. 3-5 short paragraphs. Avoid bullet soup.
- YouTube descriptions: First 2 lines must be hook (shown in search). Timestamps required if > 10 min.

**What good output looks like:**
- Reads like I wrote it, not like ChatGPT wrote it
- Has a clear point of view
- No filler intro ("In today's newsletter, we'll be exploring...")
- CTA is specific, not vague ("Reply with your answer" > "Let me know what you think")

---

## Do Not Touch

**These automations are live and working — do not modify without explicit instruction:**

- `scripts/newsletter_send.py` — live Beehiiv sender, runs every Tuesday
- `scripts/tweet_scheduler.py` — connected to Typefully, schedule is active
- `.env` production values — never overwrite; create `.env.example` for new vars
- `content/published/` — archive, read-only
- Any cron job or systemd service currently running on the server

**If you think one of these needs to change**, tell me why and what you'd do — don't just make the change.

---

## Session Kickoff Prompt

> Paste this (or a version of it) at the start of each Claude Code session:

```
We're working on my creator automation project. Read CLAUDE.md before doing anything.

Here's what I want to accomplish this session:
[describe your goal — be specific about inputs, outputs, and what "done" looks like]

Current status:
- Last thing that worked: [e.g., "tweet scheduler runs clean"]
- What's broken or missing: [e.g., "newsletter draft step pulls wrong Notion DB"]
- Any new APIs or tools I'm adding: [e.g., "want to add Beehiiv analytics pull"]

Before writing code, confirm you understand what the automation should do and ask me anything that's unclear. Default to dry-run mode unless I say otherwise.
```

---

*CLAUDE.md last updated: [DATE] | Project: [PROJECT NAME]*
