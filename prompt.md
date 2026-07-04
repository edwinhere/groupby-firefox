Prioritize a working MVP first, then refactor into extensible modules without overengineering.

## Prompt

Build a **Firefox extension** using WebExtensions and Manifest V3 that automatically groups tabs by domain name, with an architecture designed so I can add richer semantic grouping strategies later (for example grouping by topic, project, intent, or LLM-based classification). Firefox supports tab grouping through `tabs.group()` and tab-group management through the `tabGroups` API, and the extension should use those APIs rather than simulating groups in custom UI.[^2][^3][^1]

### Product goal

Create a production-quality Firefox extension that:

- Groups tabs in the current window by normalized domain, for example `docs.github.com` and `github.com` should be configurable to group either separately or under a shared base domain rule.
- Lets me trigger grouping manually from the toolbar popup, and optionally enable auto-grouping on tab create/update/move.
- Names each Firefox tab group based on domain and assigns a deterministic color.
- Is structured around a pluggable “grouping strategy” interface so domain grouping is only the first strategy.
- Avoids destructive behavior: do not regroup pinned tabs unless explicitly enabled, do not constantly reshuffle tabs during active browsing, and debounce event-driven regrouping.


### Technical constraints

- Target **Firefox** first, not Chrome-first code with Firefox as an afterthought.
- Use **Manifest V3**.
- Use Firefox tab grouping APIs: `browser.tabs.group()`, `browser.tabs.ungroup()`, `browser.tabs.query()` with `groupId`, and `browser.tabGroups.*` where appropriate.[^3][^1][^2]
- Request the `"tabGroups"` permission in `manifest.json`; note that MDN documents it as required for the `tabGroups` API.[^1]
- Use the `browser.*` namespace, not `chrome.*`, unless a compatibility shim is intentionally added.
- Keep permissions minimal. If host access is not required, do not request it.
- Use plain TypeScript if convenient, or plain JavaScript if simpler. Prefer maintainability over build complexity.
- Include code comments only where they explain important design choices.


### Deliverables

Return a complete project with:

1. `manifest.json`
2. background/service worker script
3. popup UI for manual actions and settings
4. options page for configuration
5. modular grouping engine
6. README with install/run/debug instructions for Firefox via `about:debugging`
7. clear file structure
8. no placeholders or TODO-only stubs; provide working code

### Required behavior

Implement the following features:

#### 1. Domain grouping engine

Create a grouping engine that:

- Enumerates tabs in the current window.
- Skips tabs that should not be grouped, including optionally pinned tabs, `about:` pages, Firefox internal pages, extension pages, and tabs with no normal URL.
- Extracts and normalizes the tab URL into a grouping key.
- Supports at least these domain normalization modes:
    - `hostname`: exact hostname, e.g. `docs.github.com`
    - `registrableDomain`: base domain when feasible, e.g. `github.com`
- Produces group plans in memory before mutating tabs.


#### 2. Strategy interface

Design the architecture around a pluggable interface like:

```ts
interface GroupingStrategy {
  id: string;
  label: string;
  buildGroups(tabs: BrowserTab[], settings: Settings): Promise<GroupPlan[]>;
}
```

Where:

- `DomainGroupingStrategy` is the first implementation.
- Future implementations could include `SemanticTopicStrategy`, `ProjectStrategy`, or `RuleBasedStrategy`.
- The rest of the app should not care which strategy is active.


#### 3. Safe grouping application

Implement an apply phase that:

- Computes desired groups first.
- Reuses existing matching tab groups when reasonable.
- Calls `tabs.group()` only when needed.[^3]
- Uses `tabGroups.update()` to set title/color/collapsed state where supported.[^2][^1]
- Avoids thrashing by hashing the desired grouping plan and skipping no-op reapplications.
- Debounces auto-grouping triggers.


#### 4. Popup UI

Create a popup with:

- “Group tabs now” button
- Toggle for auto-grouping
- Toggle for “include pinned tabs”
- Selector for normalization mode: exact hostname vs base domain
- Optional preview summary, for example “8 groups / 37 tabs”
- Status/error area


#### 5. Options page

Create an options page with:

- Default grouping strategy selector, even if only one strategy exists today
- Domain normalization settings
- Exclusion list, e.g. domains or URL prefixes never to group
- Color mode:
    - deterministic by domain hash
    - fixed single color
- Auto-grouping controls:
    - on tab created
    - on tab updated
    - on window focus change
- Advanced setting for future strategy config persistence


#### 6. Event model

Support manual grouping first, then optional auto-grouping based on:

- tab creation
- tab update completing
- tab movement
- window focus change

But apply guardrails:

- debounce regrouping
- avoid infinite loops from the extension reacting to its own tab moves
- ignore transient intermediate events
- prefer regrouping only the active window unless explicitly configured otherwise


#### 7. Persistence

Persist settings using extension storage. Keep the schema versioned so future semantic grouping settings can be added safely.

### Architecture expectations

Use a structure like:

```text
src/
  background/
    main.ts
    events.ts
  popup/
    popup.html
    popup.ts
  options/
    options.html
    options.ts
  core/
    types.ts
    settings.ts
    storage.ts
    planner.ts
    applier.ts
  strategies/
    grouping-strategy.ts
    domain-grouping.ts
  util/
    domain.ts
    color.ts
    debounce.ts
    log.ts
```

Key design requirements:

- Separate **planning** from **mutation**.
- Keep grouping logic pure where possible.
- Abstract Firefox API calls behind thin adapters if that improves testability.
- Make it easy to add a future semantic strategy that takes tab title, URL, openerTabId, history, or content-derived metadata and returns `GroupPlan[]`.


### Data model

Define types similar to:

```ts
type Settings = {
  schemaVersion: number;
  activeStrategyId: string;
  autoGroup: boolean;
  includePinned: boolean;
  normalizationMode: "hostname" | "registrableDomain";
  excludedDomains: string[];
  excludedUrlPrefixes: string[];
  colorMode: "deterministic" | "fixed";
  fixedColor?: string;
  groupCollapsedByDefault: boolean;
};

type CandidateTab = {
  id: number;
  windowId: number;
  index: number;
  pinned: boolean;
  title?: string;
  url?: string;
  hostname?: string;
  registrableDomain?: string;
  groupId?: number;
};

type GroupPlan = {
  key: string;
  title: string;
  color: string;
  collapsed?: boolean;
  tabIds: number[];
};
```


### Domain handling details

Implement domain parsing carefully:

- Use `URL` parsing.
- Ignore unsupported schemes.
- Normalize case.
- Strip `www.` only if configured or clearly justified.
- If using registrable domain reduction, do it in a way that is replaceable later; if a PSL-based library is needed, isolate it behind a helper module.
- Make the normalization helper testable.


### UX expectations

- Clean, minimal popup and options UI.
- Show useful error messages, for example when Firefox APIs are unavailable or grouping fails.
- Do not freeze the UI during regrouping.
- Provide a dry-run or preview mode internally even if not fully exposed in the first UI.


### Testing expectations

Include:

- unit tests for domain normalization
- unit tests for planning logic
- at least a small integration-style test or mocked API test for apply logic
- manual QA checklist in README


### README requirements

Document:

- what the extension does
- project structure
- how to run in Firefox using `about:debugging`
- required Firefox version assumptions
- permissions rationale
- known limitations of tab grouping APIs
- how to add a new grouping strategy later


### Important implementation notes

- Firefox added WebExtensions support for tab grouping starting in Firefox 138, and the `tabGroups` API followed right after, so note the minimum Firefox version assumption in the README.[^2]
- MDN documents that the `tabGroups` API requires the `"tabGroups"` permission, while group creation itself is performed with `tabs.group()` rather than `tabGroups` directly.[^1][^3]
- All tabs in a Firefox tab group must be adjacent, so the implementation should expect tab moves during grouping and handle that cleanly.[^3]


### Output format

Please provide:

1. the full source tree
2. full contents of each file
3. a brief explanation of architecture choices
4. setup and run instructions
5. a short section titled “How to add semantic grouping later”

<div align="center">⁂</div>

[^1]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups

[^2]: https://blog.mozilla.org/addons/2025/04/30/webextensions-support-for-tab-groups/

[^3]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/group

[^4]: https://developer.mozilla.org/de/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups

[^5]: https://developer.mozilla.org/de/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/TabGroup

[^6]: https://github.com/mdn/content/blob/main/files/en-us/mozilla/add-ons/webextensions/api/tabs/tab/index.md?plain=1

[^7]: https://searchfox.org/firefox-main/source/browser/components/extensions/schemas/tabGroups.json

[^8]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions

[^9]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions

[^10]: https://blog.mozilla.org/en/firefox/firefox-tab-groups/

[^11]: https://developer.mozilla.org/ja/docs/Mozilla/Firefox/Releases/138

[^12]: https://mdn.org.cn/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions

[^13]: https://bugzilla.mozilla.org/show_bug.cgi?id=1851083

[^14]: https://support.mozilla.org/en-US/kb/extensions-button

[^15]: https://support.mozilla.org/en-US/kb/tab-groups

