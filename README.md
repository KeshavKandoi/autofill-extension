# Autofill

A local-first Manifest V3 Chrome extension for filling conventional forms from an encrypted profile and answers you have approved. The matching engine uses standard autocomplete hints, field labels, synonyms and saved question aliases. It runs without an account, backend, or language model.

## Install

Use Node.js 22 or later and a current version of Google Chrome.

```sh
npm ci
npm run build
```

1. Visit `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this project's `dist/` directory.
3. Open **Manage information** from the extension popup if the dashboard is closed. Create a vault with a passphrase of at least 12 characters and save your profile.
4. Use **Websites** to grant access to a host, or use **Allow this site** in the popup for the current website.
5. Open a form on an allowed site with the vault unlocked. Open the floating assistant to review matches. To try learning, enable **Ask to save answers I enter** in Settings, complete a field, and move focus away from it. Review the proposed answers in the assistant.

## Features

- Encrypted personal, professional and education profiles, with additional education entries and custom question-and-answer records.
- Confidence-based autofill, suggestions for conflicting or uncertain answers, and filters for sensitive fields and consent controls.
- On an allowed page, choose **Open page assistant** in the toolbar popup and choose **Capture entered details** to review fields you edited during the current visit. Manual capture works with automatic learning turned off and skips sensitive fields.
- User-approved learning from completed edits. Update an existing answer, save a site-specific variant, or dismiss a suggestion. Use Question Memory to add aliases and exclude different questions.
- Profile fields for school, college or university, X / Twitter, a personal site and another URL. Use **Add custom field** for extra details and links.
- Site grants, site blocks, learning exclusions, vault lock, JSON import/export and local data deletion.
- Native text, email, telephone, numeric and URL inputs, textareas, single-select dropdowns and native radio groups. Eligible dates, contenteditable controls and some native checkboxes require individual review. Unsupported custom controls can present a value for manual entry.
- Dynamic form detection, including accessible frames with granted origins and discoverable open shadow roots.

## Development and tests

```sh
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
```

The development command watches and rebuilds both the extension pages and the content script. Reload the extension from `chrome://extensions` and refresh the fixture or website tab after rebuilding. The browser tests launch an isolated Chromium profile and run a local Vite fixture server on port 4173. They seed grants in a temporary fixture-only manifest and exercise revocation with the optional-permission manifest. The native first-time approval dialog needs manual verification.

```text
public/
  manifest.json          Manifest V3 permissions and entry points
  icons/                 Toolbar and extension icons
scripts/
  dev.mjs                Extension watch builds
src/
  background/worker.ts   Permission and message routing, vault access, matching, learning
  content/
    index.ts             Mutation scheduling, safe fill orchestration, learning queue
    fields.ts            Accessible field extraction and native form adapters
    assistant.ts         Page assistant in a closed shadow root
  matching/engine.ts     Classification, ranking and semantic-provider interface
  storage/
    schema.ts            Validation, version migrations and candidate construction
    vault.ts             Key derivation and authenticated encryption
  ui/
    main.tsx             React popup and dashboard
    style.css            Tailwind and interface styles
  messages.ts            Typed and validated extension messages
tests/
  engine.test.ts         Matching, schema and encryption checks
  extension.spec.ts      Chromium extension workflows
  fixtures/              Native, embedded, controlled and dynamic form fixtures
popup.html
options.html
vite.config.ts
vite.content.ts
vitest.config.ts
playwright.config.ts
tsconfig.json
package.json
package-lock.json
```

## Permissions and privacy

- **Storage** holds settings and vault ciphertext locally. The derived vault key stays in trusted extension session memory, which survives service-worker suspension and is cleared on lock or Chrome restart. The password is used only to derive a key. The toolbar never asks for the password. Opening a new dashboard to view or change saved details requires the password, even if autofill is already unlocked for the current Chrome session.
- **Scripting** registers the form assistant after you grant optional HTTP or HTTPS host access. **activeTab** lets the popup identify the current website. Host permissions span ports for each granted scheme and host. Site blocks and answer scopes use the full origin, including its port.
- **Revoke** removes an optional grant. If a wildcard grant covers an individual site, you can remove the wildcard or block that site in **Websites**. The service worker rechecks the frame's access and site rules before matching or saving.
- The vault uses AES-256-GCM with a fresh 96-bit nonce for each write. PBKDF2-SHA-256 derives its key with 600,000 iterations and a random 128-bit salt. Chrome storage alone offers no encryption guarantee.
- Learning is off by default. Pending answers live in page memory and are discarded on navigation or when learning becomes unavailable. Saved values travel only within the extension until an approved answer is written to a website field. The website can read a value once it is filled. Autofill never submits the form.
- Exports contain readable personal information. Store them in a trusted location. A forgotten passphrase requires clearing the vault and restoring a backup.

### Backup format

An export is a JSON object with `version: 1`, a `profile` object keyed by standard identifiers such as `personal.email`, an `education` array, and an `answers` array. Education records include an ID, college, degree, specialization, graduation year and GPA. Answer records include a UUID, question, value, aliases, exclusions, source origin, optional semantic key, scope, category, timestamps and an autofill flag. An empty scope means global. Timestamps use ISO 8601 UTC. Import validates the format and replaces the vault's profile, education and answers. Unversioned backups with the same fields are migrated to version 1.

## Limitations and troubleshooting

- If a form stays empty, check the vault, website grant, site block, and autofill setting. Reload pages that were open before granting access. Inspect the assistant for fields that need review.
- Browser-protected URLs, restricted extension-store pages, closed website shadow roots, and frames without applicable permission are outside the assistant's reach.
- Site-specific controls, multi-select widgets, custom dropdowns, masked input libraries and hardened event handlers can limit filling. Verify important values before sending a form. The tests use local fixtures and establish no compatibility guarantee for Google Forms or other live applications.
- The sensitive-field filter uses the labels and metadata the website actually provides. Grant access only where you intend to use the extension, especially if you opt into automatic fill or learning.
- The extension remembers edits to existing controls and to replacement fields with stable identifiers. Replacements without a stable ID or unique name can reset edit history. Fields that already have a value are skipped.
- Popup statistics refer to the top frame. Each accessible embedded frame detects and fills its own controls.
- Future versions can add specialized widget adapters, stronger repeated-section tracking, aggregate frame statistics and optional on-device semantic matching.
