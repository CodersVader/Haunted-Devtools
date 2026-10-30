# Haunted DevTools

Haunted DevTools is a local-first Chrome DevTools extension for investigating browser failures without sending debugging data to a hosted service. It captures failures in the inspected page, groups them into stable incident fingerprints, and can ask a locally running Ollama model for a diagnosis in a chosen ghost persona.

The extension separates immediate debugging from long-term history: **Live feed** shows what is happening in the current DevTools visit, while **Haunted websites** is the persistent archive of errors you have explicitly marked as fixed.

## What it detects

- Uncaught JavaScript runtime errors.
- Unhandled Promise rejections.
- Failed HTTP requests seen by Chrome DevTools: `4xx`, `5xx`, and requests with no response.
- Repeated incidents are grouped by a stable fingerprint. Runtime fingerprints use the error type, sanitized message, and source location; network fingerprints use method, sanitized endpoint, and status.

## How the workflow works

1. Open DevTools and select **Haunted DevTools**. The default **Live feed** starts capturing incidents for the inspected tab.
2. The first sighting of a fingerprint creates one live parent group. Repeats become `×2`, `×3`, and so on inside that group instead of creating duplicate cards.
3. When a local model is active, a new group is diagnosed once. The panel shows a separate diagnosis state: awaiting, queued, reading, diagnosed, or failed.
4. Choose **Mark exorcised** after you have attempted a fix. That removes the group from Live feed and commits its diagnosis and lifecycle history to the website archive.
5. If an archived fingerprint appears again later, Live feed looks it up first. It immediately shows **Resurrected** and reuses the saved diagnosis without another Ollama request.
6. Exorcise the returned error again to complete the next resurrection/exorcism cycle. Archive counts represent these completed cycles—not noisy page-refresh sightings.

## Live feed and archive

### Live feed

- Shows only grouped errors captured during the current DevTools visit for the inspected site.
- Uses a horizontal incident rail and one focused case-file pane, so a busy page does not turn into a long vertical stack.
- Shows lifecycle status (**Active** or **Resurrected**) separately from diagnosis status.
- Keeps all unexorcised errors in memory only. Closing the DevTools session discards them.

### Haunted websites

- Opens a guided archive: website list → grouped exorcised errors → full case file.
- Lets you browse saved sites without changing the active live capture target.
- Stores the diagnosis, first/last seen timestamps, exorcism time, and resurrection-cycle count for each archived fingerprint.
- Lets you move back up the hierarchy at any point; entering another website closes the lower archive context.

The incident inbox automatically queues diagnoses one at a time while a local model is active. This prevents a burst of errors from overwhelming Ollama.

For `localhost`, `127.0.0.1`, and IPv6 loopback pages, Haunted DevTools asks you to select or create a local project when DevTools attaches. That choice lasts only for the inspected tab, so a different app later served from the same local URL cannot inherit the wrong history. **Clear site** removes one website’s archived errors and diagnoses; **Clear all** also removes saved local-project labels.

## Prerequisites

- Google Chrome or another Chromium browser that supports Manifest V3 DevTools extensions.
- Node.js 20 or newer.
- [Ollama](https://ollama.com/) for optional local diagnoses.

## Run from a clean checkout

```bash
git clone <your-repository-url>
cd Haunted-Devtools
npm ci
npm run build
```

Then load the compiled extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's `dist` folder.
5. Open any page, open DevTools, then select the **Haunted DevTools** tab.

After changing extension code, run `npm run build` again and select Chrome's reload button for the extension.

## Use a local Ollama model

The extension supports these exact model tags:

- `gemma4:e2b-it-qat`
- `qwen2.5:7b-instruct`

Install either model locally:

```bash
ollama pull gemma4:e2b-it-qat
# or
ollama pull qwen2.5:7b-instruct
```

Make sure Ollama is running:

```bash
ollama serve
```

From Haunted DevTools, open **AI settings**, select an installed model, and choose **Start model**. Model selection is disabled while a model is resident. Choose **Stop model** to unload the selected model from memory and unlock the selection again.

### Allow the extension to talk to Ollama

Ollama must allow the extension's `chrome-extension://` origin. If model start or diagnosis reports a `403`, stop Ollama, set `OLLAMA_ORIGINS`, and restart it.

For a development session, allow Chrome extension origins:

```bash
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

On macOS when Ollama is started as an app/service, set the launch environment first, then fully quit and reopen Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
```

For a tighter policy, replace `*` with the specific extension ID shown on `chrome://extensions`. The extension only requests `http://127.0.0.1:11434` and `http://localhost:11434` permissions.

## Try the demo labs

Start the local demo server:

```bash
npm run demo
```

Open one of these pages, then open Chrome DevTools and select **Haunted DevTools**:

- `http://127.0.0.1:5173/demo/cursed-website/` — plain-browser errors, rejected promises, malformed URLs, failed requests, and a burst queue.
- `http://127.0.0.1:5173/demo/react-cursed-app/` — React-style missing state, async effect rejection, failed API request, invalid persisted state, and refused local dependency.

Each lab is deterministic and works offline after Node dependencies and any selected Ollama model are already installed.

## Demo previews

The existing screenshots show the demo pages. Add panel screenshots when you want the README to demonstrate the Live feed and archive flows described above.

![The static Cursed Website demo](docs/screenshots/cursed-website.png)

![The React Cursed App demo](docs/screenshots/react-cursed-app.png)

## Product walkthrough

[Watch the recorded walkthrough: trigger an error, inspect its local diagnosis, and follow the original panel flow.](docs/media/haunted-devtools-demo.mp4)

## Privacy boundary

Haunted DevTools is designed to be local-first:

- Live incident groups remain in the DevTools session until you exorcise them or close DevTools.
- Exorcised incident groups and their diagnoses are stored in Chrome extension local storage on this device until you clear them.
- Sanitized event details are sent only to the Ollama API at `127.0.0.1:11434` for a new, undiagnosed fingerprint while a local model is active.
- No hosted AI endpoint, telemetry endpoint, or analytics SDK is used.
- The extension does not send request bodies, response bodies, cookies, authorization headers, or local storage values to Ollama.

## Known limitations

- Chrome does not expose an extension API to clear the native Console or Network panels. Haunted DevTools clears only its own archive; Live feed is scoped to the current DevTools visit.
- Chrome's own console output is not mirrored line-for-line; the extension captures browser runtime errors and unhandled rejections through a main-world bridge.
- The extension must be reloaded after rebuilding, and the inspected page may need a refresh after an extension reload so content scripts attach again.
- Local diagnosis quality and speed depend on the selected model and available local hardware.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

