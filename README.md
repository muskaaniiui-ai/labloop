# LabLoop - The Trusted Sharing Network for University Labs
Problem statement: **Unlock Underused Equipment and Spaces.**
Features: **TrustPass** (eligibility), **FairShare** (limits + waiting list), **Condition Passport** (check-out/return evidence), full audit log.

## Run in VS Code (no npm install, no API keys)
1. Install Node.js 18+.
2. Open this folder in VS Code, open a terminal, run: `node server.js`
3. Open http://localhost:3000
4. Optional tests (server running): `node test.js`

## Demo accounts (fictional, click to sign in)
| Account | Role | Notes |
|---|---|---|
| Ana Silva | Student | Trained in microscopy + camera (eligible) |
| Ben Okoye | Student | No training (blocked by TrustPass) |
| Dr. Rao | Owner | Approves/rejects/waitlists |
| Mia Chen | Lab Manager | Incident review, dashboard, reset demo data |

## Judge test journey
1. Dr. Rao > My equipment: list a new device.
2. Ana > Discover > search > Request access (2h slot, with purpose).
3. Ben > request the Confocal Microscope: blocked, missing training.
4. Dr. Rao > Approvals > Approve (or reject/waitlist with a reason).
5. Ana > My bookings > Confirm collection (initial condition), then Return item.
6. Dashboard shows the closed transaction and audit trail.
Scenario 2: request the Thermal Camera (unavailable) as Ana, then Dr. Rao marks it available: longest-waiting eligible user is promoted. Return an item with "Report damage" ticked; Mia reviews it under Incidents.

## Where the rules live (server.js, enforced server-side)
Eligibility (403), time conflicts (409), FairShare weekly limit (422), role permissions (403), required reasons on reject/waitlist, damage incidents requiring manager review.

## Deploy for a public link
Push to GitHub, create a free Render/Railway "Web Service": build command empty, start command `node server.js`. Note: data is stored in `data.json` (persistent across restarts locally; on free hosts the disk may reset, so use Mia's "Reset demo data" before judging).

## Honest limitations / future scope
JSON-file storage (swap for Supabase/PostgreSQL), demo login instead of real auth, photo upload not implemented (text condition only), incident summary is rule-based not an LLM, QR check-in not implemented, no email notifications.
Disclosure: built with AI assistance (Claude); all decisions on bookings and incidents are made by humans in the product.
