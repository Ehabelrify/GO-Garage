# GO Garage business research — restart checkpoint

Saved 16 November 2026 at the user's explicit request to preserve research before a session reset. **Research is in progress. Resume from these files; do not repeat the initial public-web research.**

## Latest status — resumed and consolidated, 16 November 2026

**Subsequent project handover:** The user approved all researched additions
and requested a full operational product with auxiliary demonstration layers
and phased future versions. Requirements are recorded in
[accepted scope](../../docs/product/PRODUCT_DIRECTION_AND_RELEASES.md).
The tracker now has44Open issues (P1-001–P1-044; nextP1-045).
The next requested task is the [complete implementation plan handover](../../docs/operations/PHASE_1_FULL_PLAN_HANDOVER.md),
covering every issue and finding. Do not resume social research or implement
features instead of that planning task. Repository instructions now link it.

**The evidence-bounded research dossier is now prepared:** [GO Stores / GO Garage meeting dossier](../../docs/product/GO_STORES_MEETING_DOSSIER_2026-11-16.md). The original preliminary brief path now points to it. The historical checkpoint and remaining-work list below describe the earlier paused state; they are not an instruction to repeat completed work.

All three agents resumed final checks, then encountered their usage limit. The coordinator independently verified the important newly reported owner replies and saved addenda to each authenticated report. No unsupported interrupted-agent result was promoted into a verified finding.

Completed since checkpoint:

- Consolidated verified roles, dated prices/packages, contacts, warranty gaps, customer conversation evidence, business opportunities and meeting questions into one current dossier.
- Rechecked current group replies: MG One shorthand price, same-day answer, Zayed tow-truck answer and an unconfirmed WhatsApp responder. Resumed Most relevant sample is19entries (10top-level+9replies), overlapping the prior15entry All-comments sample; do not sum them.
- Resolved group admin identifier742680390 directly to supplied moemen.osman profile. This verifies admin identity, not current Go Stores ownership/CEO status.
- Reopened Zayed recruitment source10163719064662450; caption names new Zayed branch, comments explicitly dated June2025. Historical expansion evidence only.
- Independently re-read recent Ultimate39,999caption and Nov15,2026comment dates. Post's exact timestamp remains unpinned.
- Kept Premium68,999and unpinned Military College/date leads out of verified conclusions. Complete approved warranty terms, legal ownership, exact current branch roster and present quote validity remain meeting questions; they were not established by the inspected sources.

Optional further work requires new evidence or a specific follow-up request: approved warranty/price/branch documents, meeting attendees/date, or broader third-party review coverage. Do not automatically recrawl the same social sources or restart the agents. Browser stays open; no logout or social account action was performed.

## User objective and authorization

Deep meeting preparation for GO Stores / GO Garage: business, owner and companions, publicly documented professional roles/communication, services, prices, warranties, contacts, customer questions/replies, and evidence-based business weaknesses. User explicitly requested capable parallel subagents. User supplied:

- https://www.facebook.com/gostoresegypt
- https://www.facebook.com/groups/5125742449
- https://www.instagram.com/gostores_gogarage/
- https://www.facebook.com/moemen.osman/
- https://www.facebook.com/mohamed.osman.947211/
- https://www.facebook.com/Amro.Bin.Ghanem/

Initial public-web fetches failed. User authorized using their Facebook account in Opera. At their request, we opened a **new isolated Opera instance/profile** rather than closing existing windows. User logged in and explicitly said **logged in**. Read-only browsing is authorized; no need to ask again to inspect relevant sources. No messaging, posting, joining, reacting, following, friend requests, or accepting invitations was authorized or performed. Do not access inbox, notifications, cookies, storage, credentials, network payloads, or unrelated personal content. Preserve only business-relevant evidence; ordinary customer names/contact details are excluded from reports. Group is public and can be viewed without joining; do not accept its invitation.

## Browser session and tools

- Opera GX executable: `C:\Users\bebo_\AppData\Local\Programs\Opera GX\opera.exe`.
- Isolated research profile: `$env:TEMP\go-garage-opera-research`. Login state stays in that browser profile, outside the repo. Do not copy it or extract cookies.
- Local CDP endpoint: `http://127.0.0.1:9223`. Verified working after login. First check `/json/list` if resuming; the browser may still be open.
- Helper: [browser-read.mjs](browser-read.mjs). Uses Node 24 built-in WebSocket/fetch, no dependencies or credentials.
- Commands: `node artifacts/research/browser-read.mjs new URL` creates own tab; `read ID`; `nav ID URL`; `front ID`; `hover ID X Y`; `eval ID EXPRESSION`; `eval64 ID BASE64_UTF8_EXPRESSION` avoids Windows argument quoting issues. `search ID QUERY` submits ONLY an already opened scoped profile search field whose placeholder starts Search in GO stores/Mohamed/Moemen/Amro. No generic form submission.
- Use existing tabs per topic. Do not navigate another active agent's tab. Bringing a tab to front improves lazy loading. First page load often needs another read after a few seconds.
- **Important Facebook DOM scope:** main profile/about/search content is under `[role=main]`. Post permalinks often render the target post in a dialog above an unrelated home feed. Scope exact post heading (e.g. `GO stores's Post`, `Mohamed Osman's Post`, or `Mohamed's Post`). Never enumerate/read all dialogs: Facebook has hidden notification dialogs. Do not capture the background feed. The helper default protects main and GO stores post dialogs; for group/personal post dialogs use a heading-scoped eval. Multiple nested dialogs can duplicate content; deduplicate before counting.
- Facebook timestamps are deliberately obfuscated in innerText/hrefs until hover. Hover the visible timestamp via CDP to resolve its canonical permalink and full date tooltip. Use DOM `getBoundingClientRect()`; `scrollIntoView` then scroll upward ~180px if the sticky header hides it. Search results have `[aria-posinset]` containers. Read-only comment-count click can open a canonical post dialog. `See more`, `View replies`, `All comments` are allowed read controls. Do not click comment composer or submit.
- Windows PowerShell may strip double quotes inside eval arguments. Prefer `eval64` or JS expressions using single-quoted literals inside a double-quoted PowerShell argument. Attribute selector values can be avoided with `.find(e => e.getAttribute('aria-posinset') === '2')`.

## Files already saved

1. [Original meeting brief](../../docs/product/GO_STORES_BUSINESS_RESEARCH_2026-11-16.md): **PRELIMINARY and now partly obsolete**, because it says profiles/posts could not be accessed. Must consolidate/rewrite with authenticated findings before final delivery.
2. [Public business findings](business-findings.md).
3. [Public leadership findings](leadership-findings.md).
4. [Public customer evidence audit](customer-findings.md).
5. [Coordinator authenticated evidence](coordinator-authenticated-findings.md).
6. [Authenticated leadership findings](leadership-authenticated-findings.md) — saved and verified,11KB.
7. [Authenticated group/business findings](group-authenticated-findings.md) — saved and verified,15KB.
8. [Authenticated customer findings](customer-authenticated-findings.md) — saved and verified,14KB.

**All three agents confirmed their checkpoints were saved and stopped further research.** Final file existence/size and local-link validation were performed. No browser closure/logout or application changes were performed.

Read the authenticated files first. Public-file absence/access claims describe the earlier phase only; do not repeat them as current limitations.

## Established findings to preserve

### Leadership / entity map

- Supplied Mohamed Osman profile's Work section directly links exact GO stores page and self-describes **Owner, January 2008–Present**. This now resolves the supplied account/business relationship. Treat date/title as self-declared, not legal registration evidence.
- Supplied Amro.Bin.Ghanem profile displays **Amro Kamal El Din**. Work lists **Store Manager** and **Marketing and Promotions Manager**; August24,2015–Present is shown specifically under the marketing role, not independently dated for both. Entries link exact GO stores page/Instagram. Do not upgrade to CMO without evidence.
- Supplied Moemen Osman profile: **former Team leader at GO stores**; current **Owner and CEO, MOE.osman Autoparts, July11,2020–Present**. That CEO title concerns a separate business, not GO stores. Do not infer family relationship or co-ownership from surname/admin status.
- Public group admin list includes all three exact people. Admin status is independent of legal ownership.
- Business Instagram bio: **GO Stores & GO garage**, founded by `@mohamedosman.official`; his Instagram calls him cofounder. Facebook directly links exact business Instagram. No need to retain earlier entity-match gap for these linked sources.
- TeN TV primary interview: https://www.dailymotion.com/video/xa0gd1o at00:21 introduces Mohamed Osman as owner of Go Stores chain;01:08–01:58 discusses trust/name guarantee;02:13–02:43 Chinese-origin transparency;03:21–03:55 claims own-brand Chinese production. https://www.dailymotion.com/video/xa0gd1s 05:59–06:25 customer service/reputation and claimed daily presence. Same interview cuts, not independent corroboration; transcripts read, audio not independently checked; publication date not resolved.
- Professional interpretation: public messaging centers on personal guarantee/reputation, specification/price detail, colloquial/direct promotional copy. Do not diagnose character, honesty, ego, negotiation style, private motivations, or vulnerabilities. Suggested example-led meeting format is our proposal, not a verified preference.

### Channels and public group

- Official Facebook page ~60K followers, Instagram~19.8K, group282,093 members at observation. These are platform-displayed counts, not customer/unique reach metrics.
- Official page Contact info and Instagram both list **01111800073**.
- Group promotions additionally publish **01228100499** and **01116629009**. Older official page promotion also lists **01004190941**. Keep current-vs-historical source dates.
- Group public; created24Sept2007; name last changed26Mar2018; member posting paused except admins. Group is a managed promotional channel, not a representative neutral review forum. Its founding date does not establish business founding.
- Group About has GO car tuning at10Saqr Qoraish/Sheraton and GO DRIFT units28,29TwinsMall. Historical address claims do not establish current active branch roster.

### Official price matrix (dated, not confirmed current quote)

Coordinator verified official PAGE post **26April2026 12:07PM**, deadline says offers stop Friday1May:
https://www.facebook.com/gostoresegypt/posts/pfbid0FUw4hYD2e2Te4ad1RVAfS6SkfdMprMLuwHkqdwgnAhc2mFCwCNMToqSbArKa88L7l

| Product | Microns | Advertised warranty | Sedan EGP | SUV EGP |
|---|---:|---|---:|---:|
| GO garage Pro |150|7years|28,000|30,000|
| GO stores Ultimate |180|10years|35,000|38,000|
| GO stores Plus+ |200|Lifetime|40,000|43,000|
| Black edition |180|7years|35,000|38,000|
| Matte |180|10years|38,000|40,000|

Same post: roof excluded from full-car price; roof extra by size. Glass heat film GO stores plus5,000, VKool High Performance9,000 (both lifetime claims;99% heat/99.9%UV are marketing claims, not independently validated). Interior nano2,500; front GlassGuard5,000; panorama8,000. Origin wording American technology/Asian assembly/China-made is supplier marketing, not certification. Booking asks full three-part name + car type/model by WhatsApp01111800073. Existing bookings' offers honored even if execution much later, including two years. Group agent also found May9 re-posted matrix, canonical10165255820427450.

### Later bundles / benefits (group agent detailed sources to read)

-4Oct2026 group10165939800732450: bundle44,999 vs claimed55,000 component total; details in group report.
-18Oct2026 **09:10AM** group10166017053312450: Plus200micron/lifetime bundle52,999 including glass/roof/screens/interior; Mohamed-authored source visible through supplied profile too. 30Aug duplicate10165785933557450. Do not treat duplicates as independent corroboration.
-5Nov2026 **21:05** group10166131659747450: PPF starting32,999; free new-car delivery inspection; free tow within Cairo; three cars fourth free; free washing/maintenance during warranty; VIP chauffeur car during service. Coordinator independently read caption; group agent verified date. These are advertised promises, conditions/fulfilment unverified.
-12Mar2025 group10163308131997450: challenges competing six-month maintenance requirements. Do not interpret as contractual coverage rule. Need clarify relation to free maintenance promise.
-No inspected written legal warranty definition, lifetime limit, exclusions, transferability, claim process, required checkups, proration, rework/refund policy, or exact guarantee issuer yet. Preserve as unanswered questions, not absence claims or accusations.

### Actual customer sample to preserve

- Featured Sheraton post https://www.facebook.com/gostoresegypt/posts/pfbid0bg6rTiM2drbs9UTC9bvujDZnUqWQa78GYM9HtJk4e8UHhQ3rzEH5rtxRxuxFjB1Ml : agent inspected All comments,5top-level+4page replies, UI10total one not loaded.1Feb2026 customer Sunday-hours question13:24; GO stores reply13:28 says Sunday closed. One21Jan2026 model-specific diffuser question had no visible reply in sampled view. Generic praise not verified transactions.
- Historical tier post https://www.facebook.com/gostoresegypt/posts/pfbid028cKFRpAaVwR9Emq4V3WhdPxqDVpHdCsDD86EaCjC43FHPFZvQKVNxw7E2yGUs4Ykl :30June/10July2025 customer perceived unclear SUV/panorama prices; one customer's unverified perception, not recurring pattern. July3BAICX7 price question gets page phone-only reply July4 (~22h22m).8ofdisplayed9entries inspected. Intermediate reply actor not verified page.
- **Important chronology:** July2025 SUV-pricing complaint PRECEDES April2026 matrix with explicit sedan/SUV rates. Report later clarification as well; do not accuse current hidden pricing. Roof remains conditional quote.
-5Nov2026 group10166131659747450 has73displayed comments. Customer agent SAVED10top-level+5expanded replies under All comments (15entries; separate initialMost relevant set not added to count). Current questions concern model prices, duration and delivery. Mohamed answers Peugeot5008 price with **'35'**5Nov22:21 and JetourDashing **'same price'**6Nov09:14. **Do not silently convert shorthand into a firm35,000EGP quote or infer scope**. Further duration/delivery replies can be researched if useful.
-Total saved page sample: **6posts,27retrieved entries against29displayed**,19top-level+8replies. Includes card-payment, standalone insulation and fitment queries. A December2025offer explicitly gives SUV same price; preserve this additional counterexample to broad hidden-pricing claims. Full ledger is in customer-authenticated-findings.md.
- No representative sentiment, response-time average, complaint frequency, transaction verification, or broad service-quality verdict can be claimed. Sampling was purposive and affected by ranking/lazy loading. Preserve exact denominators from agent report.

## Root coordinator tabs (existing research browser)

| ID | Target |
|---|---|
|4D04878770AFE57B9E0AB5775CAA0D9C|Official page warranty search, profile/100068597331882/search/?q=ضمان; expanded first5captions|
|F52CD361D11F804BF8A5FCBABB704CE6|Business About|
|C9F9CD03DAF2F8EE401330B193CE0F71|Official Contact info|
|DF5886A2820E5E7821E1D0D0A30BF842|Official PPF specialties|
|BAD7F9C771A4771F06F2B24E2196DD97|Business Instagram expanded bio; no post grid available without separate Instagram login|
|56D54F376DBB24F8EB664DF23A4EFF84|Official page basic info (generic Cairo10/address, no full hours)|
|4AF1E4F8053CAEB065E705EB3B4A45CC|Featured Sheraton post dialog|
|FE740E3E1DDDB7769F8F0B5A8E2CF1AD|April26official price-list post|
|43F47C862BEC28E5888EA741D449A06B|Nov5current benefits group post; scope Mohamed Osman's Post dialog|
|C1B1FD59CE8A8CA1BE763C7AA85E9655|Official address search result,2019historical Sheraton address|

Other agents' own tab IDs are in their authenticated reports. Get live `/json/list` after reset rather than assuming IDs persist.

## Remaining work / next actions

1. Read all three authenticated reports and confirm saved checkpoint completeness. Agents were asked to save immediately and pause; original canonical names: leadership_research, business_research, customer_research. Reuse via followup_task only if needed; user explicitly authorized subagents. After reset agent availability uncertain; saved files are source of truth.
2. Finish modest **current2026 customer reply** sampling on Nov5post, if not already in customer report. Select All comments, expand author replies about duration, pricing, collection/delivery. Record source link/date without customer PII.
3. If useful, inspect actual warranty terms/photo card or explicit exclusions from public posts; do not claim sales slogans are contractual policy. Ask for approved terms in meeting if none found.
4. Consolidate **one current deep meeting brief** in docs/product/GO_STORES_BUSINESS_RESEARCH_2026-11-16.md. Replace stale public-access gaps with authenticated evidence, keeping historical source conflicts distinct. Link source reports and direct posts, role self-reports versus legal facts, prices dated by package, limitations.
5. Add practical meeting strategy and business opportunities grounded in evidence: promotion version/price-lock preservation; sedan/SUV/roof/bundle quoting; transport/VIP resource commitments; warranty evidence/eligibility/free-maintenance redemption; enquiry ownership and FAQ handoff; confirm exact current branch roster and decision authority. Hypotheses must remain questions, not findings of failures.
6. Tie recommendations to existing product context:6WhatsApp numbers handled by one central team, requested branch sets availability (user-confirmed prior task). Only3numbers publicly in latest inspected promotion; do not claim the public sources establish6. WhatsApp in repo remains simulator/provider delivery disabled; no production-ready claims or unsolicited feature implementation.
7. Validate local links/source citations, privacy sanitization, report consistency. No app-code tests needed for research-only work. Do not commit/push. Existing user changes in tracker/WhatsApp proposal/workflow research must remain untouched.

## Important cautions from public phase

- Sala7a search snippet referenced3.9/220reviews and a film complaint, but opened page lacked it. No original review inspected: exclude from conclusions.
- egostores.com now fashion; don't call it current automotive website or infer cause.
- Hatla2ee10-year warranty mention is seller assertion, now weaker than direct published first-party warranty tiers.
- Ignore namesake Saudi, Indian, UK, pharmaceutical, and Puerto Rican businesses.
- Do not call Moemen GO CEO, Amro CMO, group creation business founding, or aggregate followers customers. No private family/character guesses.
- Do not overwrite project policies with research; posted promotional promises require owner confirmation for app configuration.
- Profile Work-field audiences were not exposed: label authenticated-visible/public-status-unknown, not automatically public. Group was separately verified public. Browser timestamps are as displayed; timezone not independently verified, so do not silently label them Cairo or UTC. The Plus52,999post did not explicitly state currency in inspected caption; report context carefully. Full approved warranty terms remain unresolved.
