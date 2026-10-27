# CareVision AI - Complete Guide (Run, AI part, Publish, Present)

## 1. What the website does

**Patient journey:** AI symptom chat, or upload a scan / lab report / skin photo -> **AI Health Report** (findings, what to expect while recovering, do's & don'ts, warning signs) -> **best-matched doctors with reasons** -> "Book this doctor" -> video consult -> diagnosis + prescription in the dashboard. Also lab tests, scans, care plans, corporate plans and medicines.

**Three portals** (each has limited access, enforced by the server):

| | Patient | Doctor (Clinician Portal) | Admin |
|---|---|---|---|
| Account made by | signs up on the site | **admin** adds doctors | seeded (`npm run seed`) |
| Opens | Dashboard: overview, appointments, AI reports, orders, profile | **Clinician Workspace**: live queue by AI triage, case brief, chat log, patient reports, video call, diagnosis + prescription; plus history & profile | Admin Panel: revenue, 7-day chart, AI usage, doctors, users, appointments, requests |
| Can | book/cancel, use AI agents, order, print prescription | see **only their own** patients, close cases | add/edit/remove doctors & fees, disable users, update orders |
| Cannot | see anyone else's data | see other doctors' patients, admin pages | read patients' medical records |

The login window has **Patient / Doctor / Admin tabs**. Using the wrong kind of account on a tab is refused with a clear message.

## 2. Quick start (5 steps)

1. Install **Node.js 18+**. Create a free **MongoDB Atlas** cluster (database user + Network Access `0.0.0.0/0`), copy the connection string and add `/carevision` before the `?`.
2. `cd backend` -> `npm install` -> copy `.env.example` to `.env`.
3. In `.env` set `MONGO_URI`, a long random `JWT_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and a strong `ADMIN_PASSWORD`.
4. `npm run seed` (5 doctors + admin + demo patient), then `npm run dev`.
5. Open **http://localhost:5000**. (AI needs one more step: section 3.)

| Role | Login | Password |
|---|---|---|
| Admin | admin@carevision.test | your `ADMIN_PASSWORD` (default `Admin@123`) |
| Doctor | alan@ / grace@ / rosalind@ / christian@ / jonas@carevision.test | `Doctor@123` |
| Patient | patient@carevision.test (or sign up) | `Patient@123` |

On **localhost** (or with `?demo=1` in the address) the login window shows a "Use demo ..." button per tab. Hidden on the live site. (Old installs: `npm run seed` upgrades `owner@carevision.test` to the admin account.)

## 3. The AI part - FREE, no API key (how to run it)

The three agents (Cara chat, Scan & Report Analyst, Skin Analyst) and the AI Health Report use **open-source models running on your own computer through Ollama**. No account, no key, no cost, patient data never leaves your machine.

| Job | Model (default) | Size |
|---|---|---|
| Chat, reports, PDF lab reports | `llama3.2:3b` (Meta Llama) | ~2 GB |
| Reading images (X-ray / MRI / CT / skin photo) | `gemma3:4b` (can see images) | ~3.3 GB |

**Steps**
1. Install **Ollama** from https://ollama.com (Windows / Mac / Linux). Let it start (it runs in the background).
2. Open a terminal and download the two models (once, ~5.5 GB total):
   ```bash
   ollama pull llama3.2:3b
   ollama pull gemma3:4b
   ```
3. Check everything: `cd backend` then `npm run ai:check`. It must end with **"All good"**. If not, it prints the exact command to fix it.
4. Start the site (`npm run dev`). In the **AI Agents** section the badge turns **green: "Free local AI online · llama3.2:3b · gemma3:4b"**.
5. Test: upload a skin photo, a lab-report PDF and an X-ray image; ask Cara a question. Results say **"Analysed by gemma3:4b"**.
6. First answer can take 20-60 s on a laptop (model loading). Later answers are faster. A computer with 8 GB RAM or more is recommended.

**If it is not running** the site never breaks: Cara answers from a short FAQ, PDF lab values are still read by a rule-based reader, images show a clear "AI engine unavailable" notice, and the AI Health Report uses built-in medical advice templates. The badge shows "AI engine offline" with a "How to start it" button.

**Low on RAM / slower laptop?** Use smaller models in `.env`: `LLM_TEXT_MODEL=llama3.2:1b` (and pull it). Vision models smaller than ~3B are noticeably less reliable; text and PDFs still work well.
**Other free options (same code, only `.env` changes):** LM Studio (`LLM_BASE_URL=http://localhost:1234/v1`), or a free tier of Groq / OpenRouter (`LLM_BASE_URL`, `LLM_API_KEY`, model names). Any OpenAI-compatible server works.

**How it works (for your viva):** frontend upload -> `/api/agents/...` (login + rate limit) -> agent service -> **one small client** (`llmClient.js`, OpenAI-compatible API) -> Ollama -> JSON -> `normalize.js` forces the answer into the exact shape and applies safety rules -> saved in MongoDB (`AgentResult`, with the model name) -> shown on the page.
* **PDF reports:** text is extracted (pdfjs), a **rule-based reader** flags abnormal lab values (reliable numbers), then Llama explains them. The AI cannot invent the numbers.
* **Images:** sent as base64 to the vision model with a strict JSON prompt.
* **Safety nets in code** (small models can ignore prompts): "melanoma / cancer" in a skin answer forces *urgent*; fracture / mass / bleed wording is never left as *routine*; every result carries "a doctor must confirm"; broken JSON is repaired or replaced by a safe fallback.
* Prompts live in `agents/prompts.js` (one file per behaviour change).

**Be honest in your presentation:** these are general open models, **not trained or validated for medical imaging**; a 3-4B model is much less accurate than large cloud models; it can miss findings or make things up. Call the output **pre-screening / decision support, never a diagnosis**. Future work: validated models trained on public datasets (ISIC skin, ChestX-ray14).

**Hosting note:** Ollama cannot run on free Render. On the live link the AI runs in basic mode (still works). For the college demo run everything on your laptop (AI on), and keep the live link as a backup.

## 4. Where every button goes

| Button / area | What happens |
|---|---|
| Nav: Log in / My Dashboard / Clinician Portal / Admin Panel / Logout | login window; role-specific dashboard; logout clears the session |
| Home "Portals" cards | open the login window on the right tab (Patient sign-up / Doctor / Admin) |
| Symptom chat -> **AI Health Report & Best Doctors** | report + top-3 doctors; "Book this doctor" opens booking on the date/time step |
| AI Agents: Cara / Scan & Report Analyst / Skin Analyst | upload -> structured result -> best doctors -> full AI Health Report (login required for the two analysts) |
| Services: Labs / Scans / Care Plans / Corporate | Services Hub: request saved with a reference number |
| Medicines checkout | real order (phone + address) in dashboard and admin panel |
| Clinician Workspace | queue from `doctorQueue()`, case closed with `completeCase()` -> patient sees diagnosis, prescription, follow-up |
| Footer / CTAs / FAQ | open the matching flow, info window or accordion |

## 5. Project structure

```
carevision-ai/
├── frontend/   index.html styles.css script.js (your original page)
│   ├── css/    extras.css agents.css app.css
│   └── js/     api.js ui.js auth.js agents.js recommend.js services.js dashboard.js reports.js
└── backend/
    ├── server.js  package.json  .env.example
    ├── scripts/ai-check.js              npm run ai:check
    ├── tests/   api.e2e.js ai.e2e.js ui.e2e.js mockLlm.js
    └── src/  app.js  config/  models/  routes/  controllers/  middleware/  seed/
        └── services/  symptomEngine reportAnalyzer doctorRecommender healthReport catalog
            └── agents/  llmClient normalize prompts supportAgent imagingAgent skinAgent
```
Pattern: **Route -> Controller -> Model / Service**. Each file has one job.

## 6. API reference

| Method | URL | Who |
|---|---|---|
| POST | /api/auth/register, /login | public |
| GET / PATCH | /api/auth/me | logged in |
| GET | /api/doctors, /api/doctors/:id | public |
| GET | /api/doctors/me | doctor |
| POST | /api/ai/triage, /api/ai/recommend-doctors | public |
| POST | /api/ai/health-report | logged in |
| GET | /api/agents/status | public (is the AI engine up, which models) |
| POST | /api/agents/support | public (rate-limited) |
| POST | /api/agents/imaging, /api/agents/skin | logged in (multipart field `file`) |
| GET | /api/agents/history | logged in |
| POST / GET / PATCH | /api/appointments, /mine, /:id/cancel | patient |
| GET | /api/appointments/queue?status=booked\|completed | doctor |
| GET | /api/appointments/patient/:userId/records | doctor (own patients only) |
| PATCH | /api/appointments/:id/complete | doctor |
| GET / POST / PATCH | /api/services/catalog, /requests, /requests/mine, /requests/:id/cancel | public / logged in |
| POST / GET | /api/reports | logged in |
| GET / PATCH / POST / DELETE | /api/admin/stats, /users, /users/:id/toggle, /doctors, /appointments, /requests | admin |

## 7. Testing

| Command | What it checks |
|---|---|
| `npm test` | **62 API tests**: all three roles, access limits, booking + double-booking, sanitised briefs, prescriptions, services pricing, admin actions, disabled accounts |
| `npm run test:ai` | **36 AI-pipeline tests** against a mock open-LLM server: models used (text vs vision), image/JSON format, messy-output cleaning, PDF path, safety nets, JSON-mode retry, garbage output, missing model, timeout, LLM switched off, **engine offline fallbacks** |
| `npm run test:ui` | **27 browser-level tests** (jsdom): clinician workspace on live data, prescription flow, other doctors blocked, stored-XSS attack blocked |
| `npm run test:all` | all three in a row |

They create test data, so they **refuse to run unless the database name contains "test"**. Make a second Atlas database (e.g. `carevision_test`), set `TEST_MONGO_URI` in `.env`, run `npm run seed` with that URI, then the test.
During development the site was also driven in a **real Chromium browser** (login validation, wrong password, wrong-portal refusal, show/hide password, register, login -> dashboard/workspace/admin panel -> logout for all roles, mobile layout, AI agents online and offline): 45 + 24 checks passed. A real-model run (Llama / Gemma through real Ollama) is **not** covered by automated tests - do the 5-step check in section 3 on your machine.

## 8. Publish (free)

1. **GitHub:** `git init`, `git add .`, `git commit -m "CareVision AI"`, create an empty repo, `git remote add origin ...`, `git push -u origin main`. `.env` is git-ignored - confirm it is not on GitHub.
2. **Render:** New -> Web Service -> repo; **Root Directory** `backend`, Build `npm install`, Start `npm start`; Environment: `MONGO_URI`, `JWT_SECRET`, `ADMIN_PASSWORD` (strong!), `NODE_ENV=production`, `LLM_ENABLED=false` (no Ollama there).
3. From your PC run `npm run seed` against Atlas once. Open the Render URL (the backend also serves the frontend, no CORS setup).
4. *Optional split hosting:* frontend on Vercel: set `API_BASE` in `frontend/js/api.js`, add `CLIENT_ORIGIN=https://your-app.vercel.app` on Render.

**Before sharing the link:** change `ADMIN_PASSWORD` and `JWT_SECRET`, change or delete the demo doctors (`Doctor@123`), keep demo buttons off (they only show on localhost). Free Render sleeps after ~15 min: open it a minute before presenting. Uploaded files on free Render vanish on redeploy.

## 9. Presenting at college

**Demo order (5 min, on your laptop with Ollama running):** 1) home -> symptom chat -> **AI Health Report** -> "Book this doctor"; 2) upload a skin photo and a lab PDF in AI Agents (point at the green badge and "Analysed by ..."); 3) log in as **patient** -> dashboard; 4) log out, log in as **doctor** -> queue -> case -> diagnosis + prescription; 5) patient dashboard shows the prescription; 6) **admin** -> revenue, add a doctor, update an order; 7) show a wrong-portal login being refused.

**Viva answers**
* *Which model scans the X-ray?* A free open-source vision model (Gemma 3 4B by default) served by Ollama; chat/reports use Llama 3.2 3B. We did not train them; we built the agent layer (prompts, JSON repair, safety rules, storage).
* *Why not a paid API?* Free, private (data stays local), works offline, no keys to leak. The client speaks the OpenAI-compatible protocol, so any server can be swapped in via `.env`.
* *Is it accurate?* No medical validation. It is pre-screening; a doctor confirms. Rule-based parts (lab values, triage, doctor ranking) are deterministic and explainable.
* *Why JWT / bcrypt / roles / limited access?* Stateless login; hashed passwords (12 rounds); `protect` + `restrictTo(role)` + data checks (a doctor must have an appointment with the patient).
* *Double booking?* Code check + unique index. *Prices?* Server-side catalog (medicine prices still client-side in this demo).

## 10. Honest limits

* Not a certified medical device. Small open models can be wrong; DICOM must be exported to JPG/PNG; scanned PDFs without a text layer must be uploaded as images.
* Not built: online payments, email/SMS, in-site video (uses Jitsi links), OCR, permanent file storage, doctor-managed availability, password reset.
* Prices, ratings, fees and "market prices" are **sample data**. The three example scenarios on the home page are illustrative, not real reviews. Unsupported claims (fake accuracy/patient counts, HIPAA, "continuously learning") were removed - keep it that way.
* Uploaded images go only to **your own** Ollama on this computer (unless you point `LLM_BASE_URL` at an online service). Add consent and a privacy review before real patient use.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| Badge says "AI engine offline" | start Ollama (open the app / `ollama serve`), then `npm run ai:check` |
| Badge says model missing | run the `ollama pull ...` command shown |
| "took too long" | first answer loads the model; retry. Raise `LLM_TIMEOUT_MS` or use smaller models |
| Result says "Basic mode" | the engine was unreachable for that request; check the notice text |
| Wrong tab at login | the window switches to the right tab; log in again |
| `MongoDB connection failed` | wrong password (URL-encode special characters), IP not allowed in Atlas, missing `/carevision` |
| Doctors list shows only demo doctors | run `npm run seed` |
| Admin cannot log in | use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` that was in `.env` when you ran `npm run seed` |
