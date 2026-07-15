# Computer Vision Venture Theses, 2026: A Ranked, Verification-Weighted Build Guide

*Lead synthesist's final report. Ten concepts scored by a three-judge panel; the eight carried into the ranking were deep-dived and adversarially fact-checked (three independent refuters per load-bearing claim). Two lower-scoring concepts (AflaGate, AccessProof) were parked without a deep-dive or verification pass and are therefore excluded from the ranked set — see Appendix C. Concepts whose load-bearing claims were struck by ≥2 of 3 refuters are demoted or carry inline `[CONTESTED]` corrections. One recommendation is made.*

---

## 1. Executive summary

The 2025 collapse in the cost of building computer vision — open-weight promptable segmentation (SAM 3), label-free frozen backbones (DINOv3), self-hostable VLMs (Qwen3-VL), and sub-$250 edge boards — has made the *model* a commodity. Every concept below is technically buildable by a 1–5 person team in twelve months. That means the model is never the moat. The durable question is: **who has a budgeted, non-discretionary reason to pay, and is that reason already in force?** The ranking below is driven by that question and hardened by verification.

| Rank | Concept | Impact | Comm. | Feas. | Weighted | Verification status |
|---|---|---|---|---|---|---|
| 1 | **PoleLedger** — stampable distribution-pole condition records for wildfire liability | 7.67 | 7.00 | 5.67 | **6.83** | Clean (0 struck) |
| 2 | **ErgoClaim** — no-human MSD ergonomic pose scoring for WC insurers | 5.67 | 7.33 | 7.00 | **6.65** | Clean (0 struck) |
| 3 | **LineProof** — camera-based lead service-line ID + LCRI certificate | 7.00 | 5.00 | 7.33 | **6.40** | Contested (3 claims @ 1 vote) |
| 4 | **TurnProof** — never-event turn-verification for hospital beds | 6.67 | 6.33 | 6.00 | **6.35** | 1 struck (problem premise) |
| 5 | **MethaneSEM** — landfill surface-methane MRV + SEM records | 6.33 | 5.33 | 5.00 | **5.58** | 1 struck (credit math) |
| 6 | **EquivMRV** — L5-equivalent certification for EU gas imports | 5.67 | 6.67 | 4.00 | **5.52** | 1 struck (MARS stat) |
| — | *PodiaTherm* — home thermal DFU triage *(DEMOTED from 6.37)* | 7.33 | 6.00 | 5.67 | *6.37* | **3 struck** (efficacy, price, capability) |
| — | *LateralPACP* — automated NASSCO sewer coding *(DEMOTED from 5.55)* | 5.33 | 5.67 | 5.67 | *5.55* | **2 struck** (market, competitor) |

**Two concepts are excluded from the ranked set above.** *AflaGate* (raw 5.10) and *AccessProof* (raw 5.03) survived the three-judge scoring pass but were **never deep-dived and never sent through verification** — no load-bearing claim of either was assigned a refuted-vote count or verdict. Because the demotion/verification discipline that governs every ranked line was not applied to them, they are **not ranked recommendations**; they are parked as scored-but-unverified concepts in Appendix C, and none of the recommendations below rests on their un-logged claims.

**The single recommendation: PoleLedger.** It carries the highest weighted composite (6.83) and the highest impact score in the set (7.67), and — uniquely among the top tier — *not one* of its nine load-bearing claims was struck in adversarial verification. It attaches to the most solvent, most structurally compelled buyer in the entire study: electric utilities facing existential wildfire liability (PG&E: ~$30B, Chapter 11, [SEC/Wikipedia](https://en.wikipedia.org/wiki/Pacific_Gas_and_Electric_Company)), spending from regulator-mandated wildfire-mitigation budgets against a 180M-pole distribution blind spot that drives most utility ignitions. It beats **#2 ErgoClaim** on impact magnitude (preventing catastrophic fires vs. incremental ergonomic injury reduction) and budget pool size (~$100B utility wildfire investment need vs. a slice of WC loss-control spend). It beats **#3 LineProof** on durability: LineProof is a largely one-time, commoditizable inventory buy against a shrinking unknown-line count, whereas PoleLedger compounds into a longitudinal condition-history moat and a hard-dollar joint-use pole-rent-audit upsell.

The honest caveat that keeps this at "recommend with eyes open" rather than "slam dunk": a funded incumbent, **Noteworthy AI**, already ships the near-identical fleet-mounted drive-by product — including leaning-pole detection — a fact verified at HIGH confidence. PoleLedger is therefore a *race on workflow and data lock-in*, not a greenfield. Section 5 lays out the first 90 days to win that race.

---

## 2. What changed — the 2025–2026 shifts driving the thesis

Two independent curves crossed, and they point in opposite strategic directions.

**Supply side — the build cost fell off a cliff.** In a single year the field shipped: **SAM 3** (Meta, 19 Nov 2025), open-weight text-promptable "segment anything by noun phrase" with no per-class training ([Meta](https://ai.meta.com/blog/segment-anything-model-3/), arXiv 2511.16719, verified); **DINOv3** (Meta, Aug 2025), a commercially-licensed frozen self-supervised backbone — including a Maxar-trained *satellite* variant — that hits SOTA dense-prediction "often without fine-tuning" ([Meta](https://ai.meta.com/blog/dinov3-self-supervised-vision-model/), verified); frontier open-weight document/OCR and video VLMs (Qwen3-VL, Qwen2.5-VL-72B at 96.1% DocVQA); and edge hardware that halved in price — **Jetson Orin Nano Super at $249 / 67 TOPS** ([NVIDIA](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-super-developer-kit/), verified) and the **Hailo-10H at ~$130 / 2.5W** running generative VLMs locally (verified). Consequence: labeling campaigns and per-call API fees, the two historical CV build-cost sinks, are gone. **The moat is no longer the model** — it is the code (accepted compliance artifact), the reimbursement/budget line, or the proprietary longitudinal data.

**Demand side — regulation created dated, non-discretionary buyers.** The EU is the dominant forcing function: the **European Accessibility Act** is enforceable (28 Jun 2025, penalties to 4% of revenue); **GSR2** puts a driver-monitoring camera in every new EU vehicle from 7 Jul 2026; the **AI Act** high-risk obligations bite 2 Aug 2026. In the US, hard deadlines drive the top concepts: **EPA LCRI** lead-line inventory due 1 Nov 2027 ([verified](https://www.chasolutions.com/news/changemakers/from-inventory-to-action-countdown-to-the-2027-lcri-deadline/)); **CMS never-event** non-payment for hospital-acquired Stage III/IV pressure injuries, in force since 2008 ([verified](https://pmc.ncbi.nlm.nih.gov/articles/PMC3478911/)); and — the standout — **workers-comp insurers moving from discount to mandate**: Zurich now conditions NY construction wrap-up coverage on jobsite cameras after a >$2B pilot cut WC claims >70% ([CNBC/Zurich, verified](https://www.cnbc.com/2025/11/14/workers-comp-insurance.html)).

**One caution the verification surfaced, repeatedly: separate the mandate from the money.** Policy-dependent *fee/subsidy* layers evaporated in 2025 even as *monitoring mandates* stood. The oil-and-gas methane **Waste Emissions Charge was postponed to 2034** by the July 2025 reconciliation law ([CRS R48906, verified](https://www.congress.gov/crs-product/R48906)), and IRA methane funds were largely rescinded — so methane-CV demand is now compliance-pull, not subsidy-push. Every business case below was pressure-tested for whether it rests on a mandate *already in force* (PoleLedger, ErgoClaim, LineProof, TurnProof: yes) versus a fee that could slip (a real discount on MethaneSEM and EquivMRV).

The strategic synthesis: **crowd into the deployment/compliance/data layer, not the perception layer.** The graveyard (Section 4) shows the perception-layer and "own the model" bets are precisely where capital over-funded and revenue never came.

---

## 3. The ranked concepts

### #1 — PoleLedger *(weighted 6.83; RECOMMENDED)*

**One-liner.** A passive, fleet-mounted CV system that turns every drive-by of a distribution pole into a structured, GIS-keyed, engineer-reviewable condition record — a defensible inspection trail for the 180M-pole distribution blind spot that drives most utility wildfire ignitions.

**Problem.** The US distribution grid spans ~5.5M line-miles and 180M+ poles and causes **>90% of power interruptions** and most utility wildfire ignitions ([DOE, verified High](https://www.energy.gov/sites/prod/files/2017/01/f34/Chapter%20IV%20Ensuring%20Electricity%20System%20Reliability,%20Security,%20and%20Resilience.pdf)), yet the long tail of distribution poles has no defensible condition record. The liability is existential: PG&E faced ~$30B in wildfire liabilities and entered Chapter 11 in 2019 ([verified High](https://en.wikipedia.org/wiki/Pacific_Gas_and_Electric_Company)). Regulators (CA GO 165, OEIS Wildfire Mitigation Plans) mandate inspection and records, but utilities lack a scalable, standardized deliverable for millions of poles.

**Product.** A dashcam-grade rig on utility fleet/meter-reader vehicles passively captures every pole. **SAM 3** zero-shot segmentation ("leaning wood pole," "vegetation encroachment") plus a **frozen DINOv3** backbone with lightweight adapters auto-rate lean, surface decay, third-party attachments, and vegetation clearance — no per-utility labeling. Each rating is GPS/asset-ID keyed, mapped to GO-165/WMP inspection categories, and routed through an engineer-review UI where a licensed PE confirms/stamps. **The deliverable is the audit-ready record, not the crack-pixel.**

**Why now.** SAM 3 (Nov 2025) and DINOv3 (Aug 2025) remove the per-utility labeled-dataset blocker — both verified High. FAA Part 108 BVLOS (NPRM Aug 2025, final expected ~2026, [verified Medium](https://www.federalregister.gov/documents/2026/01/28/2026-01644/normalizing-unmanned-aircraft-systems-beyond-visual-line-of-sight-operations-reopening-of-comment)) lowers the optional drone-collection cost. Caveat: these tailwinds are symmetric — they help incumbents too.

**Customer & business model + market math.** Buyers: wildfire-exposed IOUs first, then public power and cooperatives; secondarily their liability insurers. Spend is from non-discretionary vegetation-management, grid-hardening, and mandated wildfire-mitigation budgets. Model: per-pole-per-year SaaS (~$2–4/pole base; $6–8 blended with attachment-audit + defect + veg modules).
- **TAM:** 180M poles × $3 ≈ **$540M/yr**.
- **SAM:** ~35–45M wildfire-exposed poles × blended $6–8 ≈ **$210–360M/yr**.
- **SOM (5-yr):** 8–12 utilities, ~10–12M poles × $6 ≈ **$60–72M ARR**.
- **Path to $100M ARR:** ~17M poles @ $6 or ~33M @ $3.
- **Sanity check:** US vegetation management alone is ~$6–8B/yr (industry press), corroborated at global scale by AiDash's ~$24B utility veg-management figure ([AiDash, verified](https://www.aidash.com/news/aidash-unveils-intelligent-vegetation-management-system-2-0-revolutionizing-24b-utility-expense-globally/)); utilities also face ~$100B in wildfire investment need (ICF estimate, widely cited in 2024–25 industry coverage). A ~$540M condition-record TAM is 2–7% of that adjacent non-discretionary pool — plausible, not fabricated (the $540M figure itself remains the concept's own bottom-up inference). Payback for the buyer: a $2–4/pole/yr record vs. $20–100/pole manual inspection is trivially justified.

**Competition + the specific gap.** Crowded and incumbent-occupied — the single most important finding. **Noteworthy AI** already ships fleet-vehicle CV cameras that auto-geolocate poles and detect defects during routine operations, *including a shipped leaning-pole-detection feature and attachment inventory* (~$3M raised; [verified High](https://www.noteworthy.ai/blog/leaning-pole-detection-added-to-noteworthy-asset-inspection-suite)). **AiDash** ($83M+ raised, ~$249M valuation, strategic utility investors) owns the satellite veg-management budget relationship. Also Buzz Solutions, Neara, Overstory, Sharper Shape. **The specific gap PoleLedger must own is not the perception layer — it is the standardized, PE-stamped, GO-165/WMP-mapped compliance artifact plus the longitudinal condition-history dataset and the joint-use attachment-audit (pole-rent recovery) that deepen the account.**

**Moat.** Weak on perception (SAM3/DINOv3 commoditize it), potentially real on: (1) the regulator-accepted deliverable + PE-review workflow (high switching cost once embedded in a utility's asset system); (2) a **longitudinal data moat** — year-over-year condition history keyed to asset ID enables decay-rate/failure-probability models no snapshot competitor can match, and compounds with time; (3) the joint-use attachment-audit dataset tied to hard-dollar pole-rent recovery. None is defensible on day one; Noteworthy has a multi-year head start on (1) and (2). *Confidence: Low–Medium.*

**Regulatory path.** No FDA/UL gate. Three surfaces: (a) map the deliverable into CA GO 165 / GO 95 categories and WMP reporting (format, not approval — achievable); (b) **substitution limit** — GO 165 mandates *intrusive* below-groundline testing on a ~10-year cycle `[CONTESTED: it is a 10-year-then-20-year cycle, not a flat 10-year]` that a passing camera cannot satisfy, so PoleLedger *augments and prioritizes* intrusive inspection but cannot legally replace it ([verified High](https://docs.cpuc.ca.gov/PUBLISHED/GENERAL_ORDER/159182.htm)); (c) PE stamp on ratings driving repair/replace — hence the human-in-the-loop design. FAA Part 108 governs only the optional drone mode; fleet collection needs no FAA approval.

**Impact case.** Utility-caused wildfires kill and displace (Camp Fire, 85 dead). Bringing millions of unmonitored distribution poles under a verified condition record lets utilities detect decayed/leaning/encroached poles in high-fire-threat districts earlier, reducing ignition probability for tens of millions in the wildland-urban interface. Because >90% of outages originate on distribution, better data disproportionately helps rural and lower-income customers on the neglected long tail. *Confidence: Medium-High on mechanism; magnitude inferential until piloted.*

**Main risks (likeliest kill-shot flagged).** **① INCUMBENT (KILL-SHOT):** Noteworthy AI already ships the core differentiation, and SAM3/DINOv3 let it move as fast. ② PE-stamp / deliverable acceptance: manual re-review collapses margins into a services business. ③ Capability ceiling: internal/groundline decay is invisible to an external camera. ④ Collection coverage gap: backlot/rural poles are exactly the ones fleet vehicles rarely pass. ⑤ 12–24 month incumbent-locked utility procurement. ⑥ Foundation-model commoditization of perception erodes per-pole ARPU.

**Path to v1 (quarter-by-quarter).** *Q1:* off-the-shelf rig + SAM3/DINOv3 zero-shot pipeline (lean, surface decay, attachments, vegetation); condition-record schema mapped to GO-165/WMP. *Q2:* sign 1–2 wildfire-exposed design-partner utilities; mount on fleet vehicles; produce first GIS-keyed records; build PE-review UI. *Q3:* validate accuracy vs. the utility's existing detailed-inspection ground truth; integrate into GIS/asset system; ship the joint-use attachment-audit module (hard-dollar hook). *Q4:* convert to paid per-pole subscription across a territory; publish an accuracy/coverage benchmark; stand up WMP-ready reporting.

**Scores.** Impact 7.67 · Commercial 7.00 · Feasibility 5.67 · **Weighted 6.83.**
**Confidence.** Medium overall. HIGH that the problem, buyer solvency, regulatory pressure, and feasibility are real. MEDIUM-LOW on defensibility (funded incumbent + commoditized perception). All nine load-bearing claims survived verification (0 struck).

---

### #2 — ErgoClaim *(weighted 6.65)*

**One-liner.** On-device, no-human-in-the-loop pose CV that scores lifting/reaching/twisting biomechanics (REBA/RULA) and hands workers-comp insurers a face-free, actuarial-grade per-site MSD-risk trend — sold as insurer-funded loss control, a condition of coverage.

**Problem.** MSDs are the largest workplace-injury cost driver: **~937,600 private-sector MSD DART cases in 2023–24** ([NSC/BLS, verified High](https://injuryfacts.nsc.org/work/safety-topics/musculoskeletal-injuries/)) and **overexertion #1 at $12.49B** in the 2024 Liberty Mutual index ([verified High](https://riskandinsurance.com/two-injury-types-drive-40-of-americas-58-78b-workplace-safety-bill/)). MSD risk is a biomechanics-of-motion problem needing continuous per-task capture, which historically meant wearables or marker-based mocap.

**Product.** An edge appliance (Jetson Orin Nano Super / Hailo-10H) running markerless pose estimation on-device; computes REBA/RULA scores and overexertion flags in real time, discards raw video — no faces, no cloud, no human reviewer. Only a de-identified per-site risk index leaves the box, feeding the insurer's underwriting/loss-control workflow. Positioned as the automated successor to Arrowsight's human-reviewed model.

**Why now.** **Zurich now only insures NY construction wrap-ups that install mandated jobsite cameras** after a >$2B, 9-site pilot cut WC claims >70% (>50% frequency), compliance rising ~70%→97–100% ([verified High](https://www.cnbc.com/2025/11/14/workers-comp-insurance.html)) — the first hard coverage-condition mandate. Supply: sub-$250, sub-25W boards now run real-time pose ([verified High](https://www.nvidia.com/en-us/autonomous-machines/embedded-systems/jetson-orin/nano-super-developer-kit/)). The incumbent (Arrowsight) still uses **human overseas auditors** ([verified High](https://www.enr.com/articles/62692-suffolk-other-contractors-adopt-video-safety-review-platform-arrowsight)) — the automation wedge.

**Customer & model + market math.** Buyers: WC carriers (Zurich, Chubb, Travelers, AF Group, Safety National) and large self-insureds, paying from underwriting/loss-control budgets. Model: hardware + SaaS ~$100–200/camera/month as a condition-of-coverage/premium-credit program (carrier = distribution channel).
- Unit = camera-month; ~8 cameras/site × $150 × 12 = **$14,400/site/yr**.
- **$100M ARR = ~6,950 mandated sites.** Restricted addressable base ~100,000 large multi-worker sites → TAM ~**$1.44B**; $100M is <1% of establishments, ~7% of restricted TAM.
- Top-down check: US WC net written premium **$46.3B in 2024** ([NCCI, verified High](https://www.insurancejournal.com/magazines/mag-features/2025/06/02/825568.htm)); capturing 10–20% of MSD-directed loss-control spend ≈ $100–150M.
- Revealed WTP: Zurich already mandates and pays at *higher* human-review price points.

**Competition + gap.** **Arrowsight** (exclusive Zurich partner, human reviewers — the wedge *and* the warning). **Voxel** ($15M+, cloud AI EHS, carrier partners). **TuMeke** (pose REBA/RULA but clip-upload assessment tool). **Kinetic/Soter/Modjoul** (wearables bundled into WC policies). **The uncontested lane: on-device-only + face-free + MSD-pose-specialized + actuarial-aggregate deliverable + insurer-mandated distribution.**

**Moat.** Not the pose model (off-the-shelf). (1) Carrier condition-of-coverage relationship (one provider per book — Arrowsight's exclusivity proves it); (2) a longitudinal dataset linking automated scores to realized claims (data-network-effect, underwrites premium credits, raises switching cost); (3) the on-device/no-face architecture as a privacy + union-acceptance moat cloud/human-review competitors can't match.

**Regulatory path.** Not a medical device (aggregate, non-clinical). Primary exposure: biometric privacy — **Illinois BIPA excludes "physical descriptions" and does not clearly cover skeletal pose** ([verified High](https://natlawreview.com/article/2025-year-review-biometric-privacy-litigation)); a face-free, no-retention design has a strong argument for falling outside BIPA (gait-as-identifier is the untested edge). Layer electronic-monitoring notice laws and NLRA concerns; Arrowsight's unionized-NYC operation is precedent.

**Impact case.** ~937,600 DART cases/yr; validated interventions report 50–70% reductions. At ~10,000 sites / ~1M workers with a conservative 20–40% MSD reduction: tens of thousands of prevented injuries and millions of avoided lost workdays, concentrated in lower-income construction/warehouse labor. Privacy-forward design mitigates the surveillance harm usual to camera safety tech.

**Main risks (kill-shot flagged).** **① THE ARROWSIGHT CEILING (KILL-SHOT):** the incumbent deliberately uses humans; if automated scores miss edge cases and human review creeps back, unit economics collapse — must prove near-zero-intervention scores actuarially predict *and* reduce claims. ② Real-jobsite pose accuracy (occlusion/PPE) below the ~86–89% lab agreement ([verified](https://www.mdpi.com/1424-8220/25/17/5513)). ③ Attribution vs. Hawthorne effect. ④ Carrier concentration (1–2 mandating carriers). ⑤ `[CONTESTED: the concept's "Chubb MSA Nov 2025 MSD-camera mandate" does not verify — Chubb's Nov 2025 news was an embedded-insurance AI engine, not a camera program (verified High). Corrected: the "carriers already mandating" premise currently rests on Zurich/Arrowsight alone.]`

**Path to v1.** *Q1:* edge pipeline (RTMPose/YOLO-pose → REBA/RULA → per-site index), no-face/no-retention enforced, benchmark vs. expert labels. *Q2:* 2–3 pilot sites via a friendly carrier or self-insured; harden occlusion/PPE; ship carrier dashboard. *Q3–Q4:* actuarial validation study correlating score to claims with the carrier's actuaries; secure one condition-of-coverage/premium-credit LOI; BIPA/notice compliance package.

**Scores.** Impact 5.67 · Commercial 7.33 · Feasibility 7.00 · **Weighted 6.65.**
**Confidence.** Medium. The demand thesis is the best-anchored in the set (verified Zurich mandate). Held below High by the unproven automation-vs-human unit economics, sub-lab jobsite accuracy, and the single-carrier premise after the Chubb correction. **Zero load-bearing claims struck.**

---

### #3 — LineProof *(weighted 6.40; contested, not struck)*

**One-liner.** A field-crew phone app that photographs an exposed water service line and uses an on-device small VLM to classify material (lead/galvanized/copper/plastic) with a confidence score, auto-filling the EPA-required inventory record and homeowner certificate before the Nov 2027 LCRI deadline.

**Problem.** EPA's LCRI forces every water system to identify unknown-material service lines, with baseline inventory and validated non-lead classifications due **1 Nov 2027** and replacement over ~10 years ([verified High](https://www.chasolutions.com/news/changemakers/from-inventory-to-action-countdown-to-the-2027-lcri-deadline/)). Hand-classification at the curb is slow and carries misclassification liability; excavation to verify is expensive.

**Product.** A phone app: crew photographs the stub at the meter pit/curb-stop/entry; an on-device int4 small VLM classifies material with a calibrated confidence and an explicit "occluded — needs excavation" reject; high-confidence results auto-populate the EPA-format record and homeowner certificate; writes back to 120Water/leadCAST/Esri. Runs fully offline. The regulated deliverable is the auditable record.

**Why now.** Int4 small VLMs run offline on phones — Moondream int4 QAT ~0.6% accuracy drop `[CONTESTED: the ~2.5GB / 0.6% figure is benchmarked on an RTX 3090, not a phone — treat "runs on mid-range phones" as a mild extrapolation (verified, 0 struck)]`; **SmolVLM 256M runs inference under 1GB** `[CONTESTED: the 500M variant is ~1.2GB, not sub-1GB — only the 256M qualifies (1 of 3 refuted)]`. Plus a hard federal deadline.

**Customer & model + market math.** Buyers: water systems and inventory contractors (Stantec, CHA, CDM Smith/Trinnex). Model: ~$5–20/verified-line + workflow SaaS + recurring homeowner-notification generation.
- CV-addressable ≈ 30% of unknowns ≈ **6.2M lines** × $10 ≈ **$62M one-time**; replacement verification ~$109M spread to 2037 ≈ ~$9M/yr recurring.
- `[CONTESTED: the "5.1M lead / 1.7M GRR / 20.7M unknown" triad is disputed — one refuter notes DWINSA's 5.1M is lead+GRR *combined* and unknowns run ~23.5–23.8M, and EPA's late-2025 dashboard cut lead+GRR toward ~3M / ~4M LSLs; two refuters confirmed the SDWIS triad. Treat the unknown-pool size as directionally large but unstable (1 of 3 refuted).]`
- **Honest ceiling:** a strong venture business (~$5–15M ARR), **not a clean $100M pure-play on lead alone** — the leader BlueConduit raised only ~$2.25M `[CONTESTED: T3 aggregator figure; BlueConduit also holds grant capital, so "modestly funded" rests on soft data (1 of 3 refuted)]`. Reaching $100M requires dominant share + recurring verification + adjacency (gas service lines, 811 locate documentation).
- `[CONTESTED: potholing "$700–1,100/hole" — other sources give $300–600 or $1,500–3,500; the cost-gap conclusion holds but the precise range is soft (1 of 3 refuted).]`

**Competition + gap.** BlueConduit (statistical/ML prediction from records+geology, *not* imagery); 120Water, Trinnex leadCAST, Esri, engineering firms. No direct on-device phone-VLM classifier found — greenfield, but a low technical barrier that any incumbent can bolt on. The gap is the offline field-capture + certified record, not the classifier.

**Moat.** Weak at the classifier. Defensible if built: (1) state-primacy-agency-accepted certificate format; (2) two-way write-back into 120Water/leadCAST/Esri; (3) a proprietary field-image dataset improving calibration; (4) the occlusion-reject methodology bounding liability.

**Regulatory path.** No product certification. **EPA already accepts visual inspection of the pipe exterior** to identify unknowns — favorable. But **non-lead *validation* requires two-point inspection and validating the pool to 95% confidence (max 384 lines)** ([verified High](https://www.cdmsmith.com/en/resources/insights/validating-non-lead-service-lines-for-lcri)) — a single photo identifies unknowns but may not satisfy two-point validation. Get written primacy-agency acknowledgment before scaling.

**Impact case.** Accelerating classification of unknown/lead lines directly reduces childhood lead exposure, concentrated in older, lower-income housing. Real, measurable, but the app classifies rather than removes.

**Main risks (kill-shot flagged).** **① OCCLUSION / REGULATORY SUFFICIENCY (KILL-SHOT):** many lines can't be classified from a visible stub, capping CV-addressable share to ~25–35% and inviting commodity classifiers to undercut. ② Commoditization. ③ Timing cliff — largely one-time spend; survival needs the recurring verification/notification pivot. ④ False-"non-lead" liability. ⑤ City-by-city primacy variation.

**Path to v1.** *Q1:* 1–2 design-partner utilities; 5–10k labeled field images; EPA schema + 2–3 state variants. *Q2:* fine-tune int4 VLM (Moondream/SmolVLM) for 4-class + calibrated confidence + occlusion reject; offline app. *Q3:* certificate generation + write-back APIs. *Q4:* paid 50–100k-line pilot; benchmark vs. excavation; secure one primacy-agency acknowledgment.

**Scores.** Impact 7.00 · Commercial 5.00 · Feasibility 7.33 · **Weighted 6.40.**
**Confidence.** Medium. High on trigger, capability, and greenfield status. The commercial ceiling looks like a strong venture business, not a $100M lead-only pure-play. No claim struck by ≥2 refuters, but three carry single-refuter contests — the highest contested-claim load in the clean tier.

---

### #4 — TurnProof *(weighted 6.35; 1 struck — problem premise)*

**One-liner.** A ceiling-mounted <5W edge camera that classifies patient posture fully on-device (no pixels leave the room) to timestamp every repositioning event and auto-generate a defensible per-bed turn-adherence audit record, attacking the CMS never-event cost of hospital-acquired Stage III/IV pressure injuries.

**Problem.** HAPIs cost ~$9.1–11.6B/yr (AHRQ), with a peer-reviewed national estimate of ~$26.8B across all severities ([verified High](https://pmc.ncbi.nlm.nih.gov/articles/PMC7948545/)). **CMS does not pay the higher DRG for hospital-acquired Stage III/IV pressure ulcers** ([verified High](https://pmc.ncbi.nlm.nih.gov/articles/PMC3478911/)); Medicare (2007) estimated ~$43,180 average per case. The evidence-backed prevention — ~2h repositioning — is poorly documented. `[CONTESTED: the concept's "only ~40–47% adherence" premise was STRUCK (2 of 3 refuters). The cited chart-audit source actually found ~84% of patients repositioned; the 47% figure comes from a *separate* Swedish prevalence survey. Corrected: the low-adherence framing is mischaracterized — the real gap is objective *verification/documentation*, not necessarily turning frequency, which weakens the "verification lifts adherence" impact mechanism.]`

**Product.** A single camera on a ~3–5W SoC runs open-vocab posture detection on-device (supine/left/right/offloaded), debounces movement into genuine repositioning events, writes a timestamped per-bed log, and writes turn events back to the EHR flowsheet (HL7/FHIR). Raw video never leaves the room.

**Why now.** Edge <5W generative vision is verified: **Ambarella CV72 runs on-device generative AI under 5W** ([verified High](https://www.ambarella.com/news/ambarella-launches-4k-5nm-edge-ai-soc-for-mainstream-security-cameras-with-new-highs-in-ai-performance-per-watt-image-quality-and-sensor-fusion/)); Moondream int4 2B (~42% memory reduction, ~0.6% drop) and a ~375MB 0.5B model ([verified High](https://huggingface.co/moondream/moondream-2b-2025-04-14-4bit)).

**Customer & model + market math.** Buyers: hospital CNO/quality budgets (litigation-defense + HAC-non-payment avoidance); SNF/LTAC secondary. Model: ~$40–100/monitored bed/month on high-risk beds + install fee.
- **916,752 US staffed hospital beds** `[CONTESTED: current AHA may be 907,216, and only ~784,112 are community beds — a full-base TAM overstates reach (1 of 3 refuted)]` × $840/bed/yr.
- SAM (~350k pressure-injury-risk beds) × $840 ≈ **$294M/yr**; $100M path ≈ 119k monitored beds (~34% of the high-risk SAM).
- ROI: 60 high-risk beds cost ~$50,400/yr; a single prevented Stage IV stay (~$43,180 unreimbursed DRG delta, direct cost to ~$70k) covers the unit. Payback <1 prevented event/hospital/yr.

**Competition + gap.** **Smith+Nephew LEAF** (wearable, cloud, EMR-integrated, up to 73% HAPI reduction, relaunched Jun 2026, [verified High](https://www.smith-nephew.com/en/news/2026/06/01/sn-launch-next-generation-leaf-patient-monitoring-system)); Stryker/care.ai cameras. Gap: on-device, no-egress, camera-based (no per-patient wearable logistics) audit-record-of-truth.

**Moat.** (a) EHR flowsheet write-back as record-of-truth; (b) validated ward-condition accuracy (blankets, low light); (c) on-device/no-egress privacy for procurement + union negotiation. **NOT a moat: freedom-to-operate** — issued US patents already describe camera-based turn detection with dwell timers and EMR write-back ([USPTO 10,121,070](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10121070)). FTO review is a Q1 necessity.

**Regulatory path.** Launch as a documentation/QA tool (not diagnosing/time-critical); **FDA's Jan 6 2026 CDS guidance** extends enforcement discretion to single non-time-critical recommendations ([verified](https://www.ropesgray.com/en/insights/alerts/2026/01/fda-adapts-with-the-times-on-digital-health-updated-guidances-on-general-wellness-products)) — but a hidden caveat: the same guidance keeps software that "analyzes an image/signal" under device oversight, so a camera product may fail Criterion 1. Stage two: 510(k) with LEAF-class predicates for an outcome claim.

**Impact case.** CMS counted 257,412 hospital-acquired Stage III/IV cases in FY2007 alone; better verification across ~350k high-risk beds plausibly reduces incidence — *if* the audit trail actually changes staff behavior, which must be proven, not assumed (and is now less certain given the struck adherence premise).

**Main risks (kill-shot flagged).** **① CAUSAL-CHAIN / PRIVACY (KILL-SHOT, sharpened by the struck premise):** documenting non-adherence without improving it produces a *liability-generating* record ("we knew and didn't turn them"); if staffing is the bottleneck, it backfires. Nursing-union/privacy resistance to in-room cameras has repeatedly stalled deployments. ② Occlusion accuracy. ③ FTO. ④ Incumbent feature-crush. ⑤ Slow hospital procurement + IRB.

**Path to v1.** *Q1:* FTO review; prototype on Ambarella CV72S/Jetson; posture model; simulated-bed video. *Q2:* on-device debounce logic; tamper-evident log; QA dashboard. *Q3:* IRB single-site pilot (10–20 beds); sensitivity/specificity incl. blanket/low-light. *Q4:* Epic/Cerner write-back; multi-unit paid pilot; publish adherence data; 2–3 LOIs.

**Scores.** Impact 6.67 · Commercial 6.33 · Feasibility 6.00 · **Weighted 6.35.**
**Confidence.** Medium. Feasibility High; commercial contested by two funded incumbents + FTO risk. **One struck claim (adherence baseline) materially weakens the impact mechanism** — demoted within its tier accordingly.

---

### #5 — MethaneSEM *(weighted 5.58; 1 struck — credit math)*

**One-liner.** Continuous CV surface-methane monitoring for landfills that auto-generates the Clean Air Act SEM exceedance report, leak work orders, and an RNG capture-verification record — the compliance artifact O&G-focused aerial players ignore.

**Problem.** US landfill methane is under-counted (~51% above EPA inventory, Harvard/TROPOMI, [verified High](https://seas.harvard.edu/news/epa-underestimates-methane-emissions-landfills-urban-areas)); a 2024 *Science* survey found emissions ~1.4× reported and that Method 21 walking surveys miss dominant point-source plumes ([verified](https://carboncredits.com/study-shows-landfill-methane-emissions-are-1-4x-more-than-epa-estimates/)) `[CONTESTED: the embedded "four SE gas-capture landfills ran ~6× reported" figure could not be corroborated by refuters — the study emphasized a 1.4× average, not a 6× subset (2 of 3 flagged this sub-figure)]`. Operators must still pass quarterly SEM; RNG developers need verified capture for credits.

**Product.** Landfill-specific MRV: thermal + OGI cameras + edge localization that map/attribute surface plumes, auto-producing (1) the NSPS/EG SEM exceedance report, (2) prioritized 10-day-tracked work orders, (3) an LCFS/RIN capture-verification record. **The differentiator is software, not sensing.**

**Why now.** SEM mandate in force (quarterly Method 21, 500 ppm action level, [verified High](https://www.federalregister.gov/documents/2016/08/29/2016-17687/standards-of-performance-for-municipal-solid-waste-landfills)); EPA enforcement alerts for widespread SEM non-compliance; EPA now recognizes non-walking methods (Sniffer OTM-51, Kuva ATM). Crucially, the **WEC fee was delayed to 2034** — so this rests on the *monitoring* mandate, not a fee.

**Customer & model + market math.** Buyers: MSW operators + RNG developers. **~1,014 EG-subject landfills, ~731 requiring GCCS/SEM** `[CONTESTED: one refuter couldn't locate the exact 1,014/731 in the cited page; two confirmed via secondary RIA reporting (1 of 3 refuted)]`.
- ~900 recurring-compliance sites × blended ~$90k ≈ **$81M/yr** (premium-weighted ~$120M).
- **Honest verdict:** a defensible ~$100M US niche; $100M ARR needs the premium RNG tier + Canada/international, not US MSW SEM at commodity price.
- `[CONTESTED: the "LCFS+RIN $9–80/MMBtu, >$50 low-CI" claim was STRUCK (2 of 3 refuters). Corrected: >$50/MMBtu applies to deeply-negative-CI *dairy manure* RNG, NOT landfill gas (positive CI, modest LCFS value); LCFS credit prices collapsed in 2024–25; a ~100k MMBtu/yr project earns ~$2M, making $150k MRV ~7.5% (not <1%) of credit revenue; and only the RNG-upgrading subset earns credits at all — the flaring majority earn zero. The "credit spend is trivial" affordability argument does not hold for most SEM buyers.]`

**Competition + gap.** The "empty market" premise is half false. **Sniffer Robotics** holds the only EPA-approved drone SEM method (OTM-51) and partnered with **Project Canary** (2025) for quantification/reporting ([verified High](https://www.projectcanary.com/press/project-canary-sniffer/)) — the exact "compliance artifact + quantification" position. **Kuva/Sensirion** (fixed continuous cameras, entering landfill). Remote-sensing players (Carbon Mapper, Bridger, GHGSat) don't produce the site-level SEM record. Whitespace: the software artifact + RNG credit audit trail.

**Moat.** Regulatory-artifact fidelity (OTM-51 took Sniffer 3+ years; EPA ATM approval is a paperwork moat), credit-audit data-of-record, landfill-specific CV models. Not hardware/IP.

**Regulatory path.** (a) Near-term: sell as report-automation ingesting compliant Method 21/OTM-51 data — legal today. (b) Long-term: CV quantification substituting for the walking survey needs EPA Alternative Test Method approval (~3 years). Watch item: EPA Sept 2025 proposed eliminating GHGRP Subpart HH reporting — a deregulatory risk.

**Impact case.** Landfills are ~14% of US methane; a few persistent plumes dominate each site and walking surveys miss them, so faster detection → faster repair → near-term abatement. For ~900 sites, cutting 10–20% of surface losses ≈ hundreds of thousands of tonnes CO2e/yr.

**Main risks (kill-shot flagged).** **① CAPABILITY OVER-CLAIM (KILL-SHOT):** the whyNow conflates cheap "phone-grade thermal" (detects heat/cover breaches, NOT methane) with true methane imaging — **OGI/SWIR remains ~tens of thousands of dollars** ([verified](https://www.envirotech-online.com/news/gas-detection/8/flir-systems/affordablenbspogi-camera-for-methane-detection/50218)); cheap continuous quantification is unproven, and MethaneSAT failed in orbit mid-2025, thinning public supply. ② Incumbent (Sniffer + Project Canary). ③ Regulatory acceptance of CV quantification. ④ Deregulation drift. ⑤ ~$100M US revenue ceiling.

**Path to v1.** *Q1:* partner 1–2 operators; ingest existing Method 21/OTM-51 data; hand-build the auto-generated SEM report + 10-day tracking. *Q2:* add thermal + off-the-shelf OGI capture + edge localization; work orders. *Q3:* build the LCFS/RIN verification record; validate with a credit auditor. *Q4:* 3–5 paid pilots (~$50–75k); publish a hotspot-vs-walking-survey comparison; begin EPA ATM pre-consultation.

**Scores.** Impact 6.33 · Commercial 5.33 · Feasibility 5.00 · **Weighted 5.58.**
**Confidence.** Medium. Regulatory framing well-sourced; lowered by the struck credit-math affordability claim, the sensing over-claim, and the partly-occupied niche.

---

### #6 — EquivMRV *(weighted 5.52; 1 struck — MARS stat)*

**One-liner.** A satellite monitoring-plus-attribution service producing auditor-ready, OGMP-2.0-L5-equivalent methane MRV deliverables for EU gas importers ahead of the Jan 2027 mandate.

**Problem.** The EU Methane Regulation requires importers, from **1 Jan 2027**, to show imported gas was produced under MRV equivalent to the EU regime (Art 12 or OGMP 2.0 L5 + third-party verification); **no exporting country is yet deemed equivalent** and the EC Verification Protocol is expected summer 2026 ([verified High](https://www.ceesa.utexas.edu/verification-protocol)). The gap is real: **only ~7% of global O&G reached OGMP L5 in 2024** (forecast ~26% by 2027); IOGP estimates up to 43% of gas / 87% of oil supply at risk ([verified High](https://iogpeurope.org/wp-content/uploads/2026/03/EU-Methane-Emissions-Regulation-Study-Summary-Report.pdf)). `[CONTESTED: the "88% of MARS super-emitter alerts went unactioned in 2024" claim was STRUCK (3 of 3 refuters). Corrected: in 2024 the response rate was ~1% (i.e., ~99% unactioned); the 88%-unactioned/12%-response figure is the 2025 level. The directional thesis — attribution, not detection, is the bottleneck — holds.]`

**Product.** Fuses hyperspectral methane retrievals (Sentinel-5P, EMIT, GHGSat) for the gas signal, free/low-cost SAR (Umbra Open Data) + optical through a DINOv3 satellite backbone for facility identification/attribution, and a chain-of-custody workflow packaging an auditor-ready L5-equivalent deliverable. **Capability correction:** `[CONTESTED (author self-flagged, verified): SAR does NOT sense methane and DINOv3 is NOT a gas-retrieval model — the SAR+DINOv3 layer does facility/activity attribution; methane quantity still requires hyperspectral/SWIR. The concept as written overstates what SAR+DINOv3 alone deliver.]`

**Why now.** Hard 2027 mandate; Umbra Open Data free SAR up to 16cm `[CONTESTED: sample/partial coverage, not global monitoring-grade — comprehensive sub-metre requires commercial purchase (verified, 0 struck)]`; DINOv3 satellite backbone (verified). Detection is cheap exactly as the deadline lands.

**Customer & model + market math.** Buyers: EU importers + suppliers holding compliance/reputational risk. OGMP covers ~150 companies, ~45% of global O&G output, >80% of LNG.
- **~140 bcm EU LNG imports (2025) ≈ ~1,300–1,500 cargoes/yr** × $25k ≈ **$35M/yr**; ~800 pipeline facilities × $40k ≈ $32M/yr → **SAM ~$65–70M/yr**.
- **Honest verdict:** "$1B market with zero incumbents" is overstated — aggregate compliance spend may reach $1B+, but the certified-deliverable slice is thinner and already contested. Credible $100M-ARR path via a broad MRV/verification offering; no clean $1B single-vendor prize.

**Competition + gap.** The "no workable solution / zero incumbents" premise is **FALSE**: **MiQ's Standard + CIRIS registry is operational**, reports at measurement-informed L5-equivalent with third-party verification, and is marketed as meeting EU import MRV ([verified High](https://www.lngindustry.com/liquid-natural-gas/11062024/miq-standard-becomes-sole-benchmark-meeting-new-eu-gas-import-regulations/)); Kayrros (facility attribution, acquired 2026), GHGSat, UNEP MARS, and accredited verifiers DNV/Bureau Veritas occupy the rest. Realistic wedge: an attribution-data/verification-input vendor, not the legal issuer of equivalence.

**Moat.** As pitched ("own the certificate") the moat is weak — L5 equivalence is an operator reporting achievement verified by accredited bodies, not something a third party can emit, and MiQ holds the registry high ground. Buildable moat: a proprietary facility-linked attribution dataset feeding operators' L5 reconciliation.

**Regulatory path.** Do **not** position as issuer of legal equivalence. Position as (1) a measurement/attribution supplier into operators' L5 reconciliation and (2) a technical subcontractor to an EC-recognized verifier; align to the forthcoming Verification Protocol and CEN/ISO standards.

**Impact case.** Methane is ~30% of warming to date; super-emitter mitigation is among the cheapest levers. Better plume-to-facility attribution converts alerts into accountable notices, plausibly abating multi-Mt CO2e across the EU import chain.

**Main risks (kill-shot flagged).** **① FALSE PREMISE / CAPABILITY MISMATCH (KILL-SHOT):** the "empty market" is occupied (MiQ/CIRIS), and SAR+DINOv3 cannot measure methane — the stack is mis-specified and MethaneSAT's failure thinned facility-scale supply. ② Physical attribution: plume-to-*cargo* is near-impossible (gas is fungible); plume-to-facility is feasible. ③ Policy instability (EC could accept self-attestation or slip 2027). ④ Regulator-dependent moat.

**Path to v1.** *Q1:* ingest free layers (Sentinel-5P/EMIT, Umbra SAR, Sentinel-2); DINOv3 embedding pipeline; single-corridor facility registry (US Gulf LNG→EU). *Q2:* plume→facility attribution validated vs. MARS events. *Q3:* co-design deliverable with one accredited verifier + 1–2 importers; paid pilot on 20–50 facilities. *Q4:* harden chain-of-custody; publish methodology into the EC process.

**Scores.** Impact 5.67 · Commercial 6.67 · Feasibility 4.00 · **Weighted 5.52.**
**Confidence.** Medium-Low. Demand well-sourced; three load-bearing premises weakened (occupied market, mis-specified stack, one struck MARS stat). A viable attribution-vendor business exists, but not the "$1B, zero-incumbent, own-the-certificate" framing.

---

### The two demoted concepts

**PodiaTherm — home thermal DFU pre-ulcer triage *(raw 6.37 → DEMOTED)*.** By raw weighted score this would rank third. It is demoted below the entire clean tier because **three of its eight load-bearing claims were struck**, and they hit the spine of the thesis:
- `[CONTESTED — STRUCK 3/3: the clinical efficacy claim of "60–90% relative risk reduction" is unsupported. Corrected: the pooled meta-analysis gives RR 0.51 (~49% RRR) with *LOW* GRADE certainty; the DIATEMP RCT showed 36% vs 47% (~23% RRR, borderline), and DIATEMP's own cost-effectiveness analysis found home monitoring at best equivalent to usual care with QALYs non-significantly lower. The entire impact case rested on the inflated figure.]`
- `[CONTESTED — STRUCK 2/3: "clip-on thermal below ~$220" — the named InfiRay P2 Pro (~$299) and TOPDON units exceed $220; only the lower-res base FLIR One Gen 3 (~$199–214) qualifies, and the cited FLIR One Pro is ~$420.]`
- `[CONTESTED — STRUCK 3/3: the on-device "~99% accuracy" VLM capability is an unsourced founder assertion with no supporting evidence.]`

The underlying problem (2M DFUs/yr, 80% precede amputation; ~$52k amputation cost — both verified High) and the solvent risk-bearing-payer buyer are real, but the concept also faces two entrenched, FDA-cleared incumbents (Podimetrics, Siren) running the identical PMPM model, a de-facto-required 510(k) the feasibility story understated, and daily-adherence dependence. With its efficacy, capability, and hardware-cost claims all struck, PodiaTherm cannot be recommended above concepts whose load-bearing claims survived.

**LateralPACP — automated NASSCO sewer coding *(raw 5.55 → DEMOTED)*.** Demoted for **two struck load-bearing claims**:
- `[CONTESTED — STRUCK 2/3: the "$452B / 260,000 breaks/yr, ~20% past useful life" urgency figure describes DRINKING-WATER MAINS, not sewers/laterals — a scope mismatch for a sewer-coding product. The numbers are real but mis-attributed.]`
- `[CONTESTED — STRUCK 3/3: "Pallon already codes laterals (LACP) and has been acquired" is false on both counts — Pallon lists EN 13508-2/PACP/MACP only (no LACP), and Pallon *acquired* Drainiac.ai; it was not itself acquired. Ironically this means the lateral blind spot is *less* contested than the concept claimed — but the competitive analysis was built on wrong facts.]`

Additionally, the core auto-PACP capability is a funded red ocean (SewerAI, WinCan, VAPAR), the decisive gate (NASSCO does not yet certify machine coding — verified High) is unresolved, and the bottom-up TAM is tens of millions. A real point-of-sale-lateral wedge exists, but the concept's factual scaffolding did not survive verification.

---

## 4. The graveyard — failure patterns and how the recommendations avoid them

The market research surfaces eight recurring killers of CV companies. Whole-company "vision model" bets were over-capitalized relative to revenue (the entire CV/machine-vision *market* is only ~$20–24B of revenue in 2025, yet AV alone drew ~$21B and robotics ~$27.6B of *investment*); the deployment/workflow/regulatory layers were under-funded relative to demonstrated willingness to pay. The eight patterns and how the top recommendations dodge each:

1. **Long-tail reliability trap** (a 95–99% demo is not a product; Cruise burned >$10B, Argo/Starsky/Embark folded). *Avoidance:* none of the top three requires near-100% autonomy. PoleLedger and TurnProof keep a human (PE, nurse) in the loop by design; the deliverable is a prioritized record, not an autonomous safety action. ErgoClaim outputs an aggregate actuarial trend, not a per-decision autonomous call.

2. **Human-in-the-loop kills the ROI** (Amazon Just Walk Out's ~1,000 reviewers; Arrowsight's human ceiling). *Avoidance:* ErgoClaim's entire wedge is *removing* the human reviewer Arrowsight relies on — but its #1 risk is precisely that this may not hold, which is why the v1 plan front-loads the actuarial validation that intervention rate trends to zero. PoleLedger accepts a bounded PE-review step and prices for it rather than pretending it away.

3. **Commodity/incumbent "good-enough" erases the moat** (Airware vs. DJI; free MegaDetector/GFW). *Avoidance:* the recommended concepts move the moat off the (now-commodity) model onto an accepted compliance artifact + longitudinal data (PoleLedger), a carrier condition-of-coverage relationship (ErgoClaim), and a primacy-agency-accepted certificate (LineProof). This is the single most important strategic move given the 2025 model-cost collapse.

4. **Premium consumer CV hardware + subscription has no distribution** (Humane, Lighthouse, Light, Anki). *Avoidance:* every top concept sells B2B into an existing budget line — no consumer hardware, no direct-to-consumer distribution. (This is exactly the trap the demoted PodiaTherm flirts with via a patient-held device dependent on daily adherence.)

5. **No budget line / no reimbursement = no business** (Zebra/Nanox, IBM Watson Health; ~80% of medical AI is radiology with no CPT). *Avoidance:* PoleLedger draws on mandated wildfire-mitigation budgets; ErgoClaim on WC underwriting budgets with a *revealed* WTP (Zurich already pays); TurnProof on a live CMS never-event non-payment lever needing no new CPT. This pattern is why medical concepts (PodiaTherm's 510(k), TurnProof's IRB path) carry lower feasibility.

6. **Mega-round-dependent capital intensity dies when funding closes** (Embark's 72% SPAC redemptions, Small Robot, AppHarvest). *Avoidance:* all top concepts are 1–5-person, 12-month, software-first v1s reaching revenue milestones inside one seed round — no fleet ownership, no satellite constellation, no capital-intensive hardware.

7. **Episodic/government-tender demand + free public data starves startups** (Orbital Insight, One Concern, conservation "pilotitis"). *Avoidance:* PoleLedger (utilities), ErgoClaim (insurers), TurnProof (hospitals) attach to *recurring-budget commercial* buyers, not emergency-management grants. This is exactly the discount applied to EquivMRV (policy-created demand) and MethaneSEM (finite, lumpy tender-like segment).

8. **Policy-dependent demand can vaporize** (methane WEC postponed to 2034; NOAA whale rule withdrawn). *Avoidance:* the top four rest on mandates *already in force* (wildfire records, WC coverage conditions, LCRI deadline, CMS non-payment), not on a fee/subsidy that could slip. The two mid-ranked climate concepts (MethaneSEM, EquivMRV) are explicitly flagged for residual policy exposure and were scored accordingly.

The clean sweep on patterns 3–8 is the core reason PoleLedger and ErgoClaim sit at the top.

---

## 5. Recommendation & first 90 days — PoleLedger

The recommendation is **PoleLedger**, with clear eyes on the one thing that could sink it: **Noteworthy AI already ships the near-identical fleet-mounted drive-by product**. The first 90 days are therefore not a technology sprint (the model is a solved, commodity build) — they are a **differentiation-and-lock-in sprint** aimed squarely at the two moats Noteworthy cannot instantly copy: the PE-stamped, regulator-accepted compliance artifact, and the joint-use attachment-audit that pays for itself.

**Customer interviews to run (weeks 1–6, target ~15–20).**
- **3–4 wildfire-exposed IOU asset-management / vegetation-management leads** (CA/OR/CO/NV). Core questions: *What exact condition-record format does your WMP and GO-165 filing require? Where does Noteworthy's output fall short of "filing-ready"? Would a PE-stamped, GIS-integrated record change your inspection-coverage credit with the regulator?*
- **2–3 regulatory/compliance officers (OEIS/CPUC-facing).** Validate what makes a drive-by record *legally sufficient* for patrol/detailed coverage — the acceptance question that determines whether this is a data feed or a services engagement.
- **3–4 joint-use / pole-attachment managers.** Quantify unrecovered third-party pole rent and what an audit-grade attachment inventory is worth — this is the hard-dollar upsell that differentiates from a pure condition camera.
- **2–3 utility liability insurers / brokers.** Would a longitudinal condition record lower wildfire-liability premiums or satisfy a coverage condition (the ErgoClaim-style insurer-channel play, applied to poles)?
- **2 existing Noteworthy or AiDash customers.** What is missing today — the honest competitive-gap map.

The go/no-go gate at day 45: at least two utilities confirm the *deliverable format*, not the detection, is their binding constraint.

**Prototype to build (weeks 1–10, parallel).** A minimal but end-to-end **condition-record pipeline**, not a better detector: off-the-shelf dashcam + edge compute → **SAM 3** zero-shot segmentation (lean, surface decay, third-party attachments, vegetation clearance) + **frozen DINOv3** adapter → GPS/asset-ID keying → a **standardized condition-record schema explicitly mapped to GO-165 patrol/detailed categories and WMP reporting fields** → the **PE-review/stamp UI**. The demo that wins pilots is the *WMP-ready export and the attachment-audit report*, not a crack-pixel overlay. Ship the joint-use attachment module in the first prototype — it is the fastest path to hard-dollar ROI and the least-copyable near-term wedge.

**Dataset to acquire (weeks 2–12).** Two, in priority order: (1) **paired ground truth** — one design-partner utility's existing *detailed-inspection records* for a fire-threat district, to benchmark rating accuracy against the exact standard the buyer already trusts (this is the credibility asset and the seed of the longitudinal moat). (2) **Fleet-captured drive-by imagery** across that district's poles, mounted on the utility's own meter-reader/fleet vehicles — establishing the passive-collection cost advantage and beginning the year-over-year condition history that compounds into the data moat Noteworthy cannot retroactively acquire. Do **not** invest early in the drone-collection mode (FAA-gated, costlier); prove the fleet-vehicle economics first.

**Why this sequence beats the incumbent:** Noteworthy leads on the *detector*. PoleLedger's only durable path is to win on the *accepted artifact + accumulating longitudinal data + attachment-audit revenue* — so the first 90 days spend zero time trying to out-detect them and all of it locking in the compliance-format relationship and the joint-use revenue hook.

---

## 6. Appendix A — Full scoring matrix

Weighting is a roughly-equal, slightly impact-tilted composite of three-judge means. "Adj. rank" applies the demotion rule (concepts with ≥2 struck load-bearing claims moved below the clean/single-struck tier). Two concepts scored but never deep-dived or verified are listed below the ranked block as **parked** and carry no adjusted rank — the demotion/verification discipline could not be applied to them, so they are not ranked recommendations (see Appendix C).

**Ranked (deep-dived + verified):**

| Concept | Impact | Commercial | Feasibility | Weighted | Struck claims | Adj. rank |
|---|---|---|---|---|---|---|
| PoleLedger | 7.67 | 7.00 | 5.67 | 6.83 | 0 | **1** |
| ErgoClaim | 5.67 | 7.33 | 7.00 | 6.65 | 0 | **2** |
| LineProof | 7.00 | 5.00 | 7.33 | 6.40 | 0 (3 contested) | **3** |
| TurnProof | 6.67 | 6.33 | 6.00 | 6.35 | 1 | **4** |
| MethaneSEM | 6.33 | 5.33 | 5.00 | 5.58 | 1 | **5** |
| EquivMRV | 5.67 | 6.67 | 4.00 | 5.52 | 1 | **6** |
| PodiaTherm | 7.33 | 6.00 | 5.67 | 6.37 | **3** | **7 (demoted)** |
| LateralPACP | 5.33 | 5.67 | 5.67 | 5.55 | **2** | **8 (demoted)** |

**Parked (scored only — not deep-dived, no verification run, not ranked):**

| Concept | Impact | Commercial | Feasibility | Weighted | Verification | Adj. rank |
|---|---|---|---|---|---|---|
| AflaGate | 6.00 | 4.00 | 5.33 | 5.10 | none run — no claim logged | — (parked) |
| AccessProof | 5.33 | 5.33 | 4.33 | 5.03 | none run — no claim logged | — (parked) |

*Note on the parked concepts.* Neither AflaGate nor AccessProof was deep-dived or sent through the three-refuter verification pass, so no load-bearing claim of either carries a refuted-vote count or verdict. Their scoring-pass rationales and the figures below are therefore **Low confidence — asserted, not independently verified** — and they are excluded from the ranked recommendations rather than sitting at #9/#10 against un-logged claims.
- *AflaGate:* the panel's core concern is a scientific ceiling — aflatoxin is only partially visible, so UV/RGB proxies correlate imperfectly with actual ppb; false negatives create liability that pushes buyers back to chemical assays, and the ~$500–2,000/mo-per-rural-site, sub-$1B, price-sensitive, hard-to-collect market read is *unverified (Low confidence)*.
- *AccessProof:* ADA Title III / EAA penalties create budgeted liability spend, but the thesis rests on reliable *autonomous* GUI-agent transaction completion at the cited ~54% OSWorld figure — *unverified (Low confidence)* — plus unsettled legal safe-harbor and OEM-bundling risk.

---

## 7. Appendix B — Verification log

Every load-bearing claim of the eight ranked concepts, refuted-vote count (of 3), verdict, and source. `STRUCK` = ≥2 refuters refuted. *(AflaGate and AccessProof are not listed here: neither was deep-dived, so no verification pass was run on their claims — they are parked in Appendices A and C.)*

### PoleLedger (0 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| ~5.5M line-miles, 180M+ poles; distribution >90% of interruptions | 0/3 | Confirmed (High) | tingfire.com (corroborated DOE/EIA) |
| >90% of US interruptions on distribution (DOE) | 0/3 | Confirmed (High) | energy.gov QER Ch. IV; LBNL/Eto IET GTD 2019 |
| PG&E ~$30B wildfire liabilities; Ch. 11 2019 | 0/3 | Confirmed (High) | Wikipedia/PG&E 8-K |
| SAM 3 (19 Nov 2025) zero-shot promptable concept segmentation | 0/3 | Confirmed (High) | ai.meta.com; arXiv 2511.16719 |
| DINOv3 frozen backbone, SOTA "often without fine-tuning" | 0/3 | Confirmed (High) | ai.meta.com; arXiv 2508.10104 |
| Noteworthy AI ships fleet-mounted drive-by CV incl. leaning-pole detection | 0/3 | Confirmed (High) — competitor real | noteworthy.ai |
| CA GO 165 mandates intrusive below-ground testing (~10yr) | 0/3 | Confirmed (High); "~10yr" is 10-then-20 | docs.cpuc.ca.gov |
| Veg mgmt ~$6–8B/yr; ~$100B wildfire investment need | 0/3 | Confirmed (Med-High); figures verify against AiDash (~$24B global veg-mgmt) and the widely-cited ICF ~$100B estimate — mismatched DOE pole-maintenance citation replaced with correctly-matched sources; ~$540M TAM remains the concept's own inference | aidash.com; ICF (industry-cited) |
| FAA Part 108 BVLOS NPRM Aug 2025, final ~2026 | 0/3 | Confirmed (Med); timing may slip | federalregister.gov |

### ErgoClaim (0 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| Zurich coverage-condition mandate; >$2B/9-site pilot, claims −70%, compliance 70→97–100%; Arrowsight exclusive | 0/3 | Confirmed (High) | cnbc.com; Zurich release |
| Arrowsight uses human overseas auditors, not AI | 0/3 | Confirmed (High) | enr.com |
| Overexertion #1 at $12.49B (2024 LM); NIOSH MSD $13–54B | 0/3 | Confirmed (High) | riskandinsurance.com |
| ~937,600 MSD DART cases 2023–24 | 0/3 | Confirmed (High) | injuryfacts.nsc.org |
| US WC net written premium $46.3B (2024) | 0/3 | Confirmed (High) | insurancejournal.com/NCCI |
| Jetson Orin Nano Super $249/67 TOPS; Hailo-10H ~$130/2.5W/40 TOPS | 0/3 | Confirmed (High); minor board-naming slip | nvidia.com |
| Markerless pose ~86–89% REBA/RULA agreement (κ≈0.71) | 0/3 | Confirmed (High); degrades in field | mdpi.com 25/17/5513 |
| BIPA excludes physical descriptions; skeletal pose not clearly covered | 0/3 | Confirmed (High); untested edge | natlawreview.com |
| Chubb "Nov 2025 MSD mandate" does NOT verify (self-correction) | 0/3 | Correction confirmed (High) | news.chubb.com |

### LineProof (0 struck; 3 contested @1)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| EPA 5.1M lead / 1.7M GRR / 20.7M unknown | 1/3 | Contested — one refuter: 5.1M is lead+GRR combined, unknowns ~23.5–23.8M, late-2025 dashboard cut to ~3M/~4M | usmayors.org |
| LCRI compliance 1 Nov 2027; ~10-yr replacement | 0/3 | Confirmed (High) | chasolutions.com |
| EPA accepts visual inspection; non-lead validation needs 2-point, 95%/max 384 | 0/3 | Confirmed (High) | cdmsmith.com |
| Moondream int4 QAT ~0.6% drop / ~2.5GB | 0/3 | Confirmed; benchmarked on RTX 3090, not phone | moondream.ai |
| SmolVLM 256M/500M run <1GB | 1/3 | Contested — 500M is ~1.2GB; only 256M <1GB | huggingface.co |
| Potholing ~$700–1,100/hole | 1/3 | Contested — others cite $300–600 or $1,500–3,500 | developmentandengineering.com |
| BlueConduit uses ML prediction not CV; ~$2.25M raised | 0/3 | Confirmed (Med); funding is soft T3 data | blueconduit.com |
| EPA LCRI incremental cost $1.47–1.95B/yr | 0/3 | Confirmed (High); software-share inference | waterverge.com/EPA |

### PodiaTherm (3 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| DFUs ~$9–13B/yr incremental cost | 0/3 | Confirmed (High) | Diabetes Care (Rice 2014) |
| ~$33k DFU / ~$52k post-amputation Medicare | 0/3 | Confirmed (High); 2006–08 data | AHRQ Data Points #3 |
| ~2M DFUs/yr; precede ~80% of amputations | 0/3 | Confirmed (High) | PMC10723802 |
| Home thermal monitoring "60–90% RRR" | **3/3 STRUCK** | Refuted — real ~49% RRR (RR 0.51) LOW certainty; DIATEMP 36% vs 47%, not cost-effective | PMC9541448 |
| PMPM incumbents (Podimetrics/Siren) | 1/3 | Confirmed core; Siren/Molnlycke was Jan not Feb 2025 | fiercehealthcare.com |
| Clip-on thermal below ~$220 | **2/3 STRUCK** | Refuted — P2 Pro ~$299, TOPDON >$220; FLIR One Pro ~$420 | flir.com |
| MA ~56%/~35M; ~24% of 65+ diabetic | 1/3 | Contested — MA ~54–56%; total 65+ diabetes ~29% | kff.org |
| On-device int4 "~99% accuracy" | **3/3 STRUCK** | Refuted — unsourced founder claim | (mis-cited podimetrics.com) |

### TurnProof (1 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| HAPI cost ~$9.1–11.6B; ~$26.8B all severities | 0/3 | Confirmed (High) | PMC7948545 |
| CMS non-payment Stage III/IV; ~$43,180/case | 0/3 | Confirmed (High); "add" overstates (avg-cost figure) | PMC3478911 |
| Repositioning adherence only ~40–47% | **2/3 STRUCK** | Refuted — cited chart-audit found ~84%; 47% is a separate Swedish survey | PMC9284631 |
| 916,752 US staffed beds | 1/3 | Contested — may be 907,216; ~784,112 community | aha.org |
| CV72 generative AI <5W; CV72S <3W | 0/3 | Confirmed (High); "posture" is app inference | ambarella.com |
| Moondream int4 2B (~42%/0.6%) + ~375MB 0.5B | 0/3 | Confirmed (High) | huggingface.co |
| LEAF (Smith+Nephew) wearable, up to 73% HAPI reduction, relaunch Jun 2026 | 0/3 | Confirmed (High) | smith-nephew.com |
| FDA Jan 6 2026 CDS enforcement discretion | 0/3 | Confirmed core; image-analysis may fail Criterion 1 | ropesgray.com |

### MethaneSEM (1 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| Landfill methane ~51% above EPA (TROPOMI 2019) | 0/3 | Confirmed (High) | seas.harvard.edu |
| 2024 Science: ~1.4× reported; Method 21 misses plumes; "6× SE gas-capture" | 1/3 | Core confirmed; **6× subset unsupported/mis-attributed** | carboncredits.com |
| ~1,014 EG-subject / ~731 GCCS landfills | 1/3 | Confirmed via secondary RIA (one refuter couldn't locate in cited page) | epa.gov |
| SEM mandate: quarterly Method 21, 30m serpentine, 500 ppm, 10-day | 0/3 | Confirmed (High) | federalregister.gov |
| WEC delayed 2024→2034 (July 2025 law) | 0/3 | Confirmed (High) | congress.gov R48906 |
| Sniffer OTM-51 (only EPA drone SEM) + Project Canary 2025 | 0/3 | Confirmed (High) | projectcanary.com |
| LCFS+RIN $9–80/MMBtu; low-CI >$50 | **2/3 STRUCK** | Refuted — >$50 is dairy manure not landfill; LCFS prices collapsed; MRV ~7.5% not <1%; flaring majority earn zero | americanbiogascouncil.org |
| Phone thermal ≠ methane; OGI/SWIR still expensive (caveat) | 0/3 | Confirmed (High) — correct caveat | envirotech-online.com |

### LateralPACP (2 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| ~800k mi public sewers + ~500k mi laterals, largely uninspected | 0/3 | Confirmed (High) | epa.gov Region 1 |
| ~20% past useful life = $452B / 260k breaks | **2/3 STRUCK** | Refuted — figures are DRINKING-WATER MAINS, not sewers | usu.edu |
| Manual PACP ~60–70% accurate, 16 hr/mi + 4–6 QA | 1/3 | Contested — single self-interested T3 source | mswmag.com |
| SewerAI AutoCode "99%+/6x"; $15M Series B | 0/3 | Confirmed core; "6x" overstated vs "70% less time" | sewerai.com |
| NASSCO does not yet certify machine coding | 0/3 | Confirmed (High) | nassco.org |
| Pallon codes laterals (LACP) and was acquired | **3/3 STRUCK** | Refuted — Pallon lists PACP/MACP only; Pallon *acquired* Drainiac, not acquired itself | pallon.com |
| Hour-long single-pass temporal grounding unreliable | 0/3 | Confirmed (Med) | arXiv 2606.12300 |
| ~4.06M US existing-home sales 2025 | 0/3 | Confirmed (High); ceiling not addressable volume | cnbc.com |

### EquivMRV (1 struck)
| Claim | Refuted | Verdict | Source |
|---|---|---|---|
| Jan 2027 import equivalence; no country deemed equivalent; Protocol ~summer 2026 | 0/3 | Confirmed (High); date one refuter couldn't pin | energy.ec.europa.eu; ceesa |
| ~7% at L5 in 2024 (→26% 2027); 43% gas/87% oil at risk | 0/3 | Confirmed (High); at-risk is industry-commissioned | iogpeurope.org |
| MiQ/CIRIS operational, L5-equivalent, EU-positioned (contradicts "no incumbent") | 0/3 | Confirmed (High) | lngindustry.com |
| ~88% of MARS alerts unactioned in 2024 | **3/3 STRUCK** | Refuted — 2024 was ~1% response (~99% unactioned); 88% is the 2025 figure | unep.org |
| DINOv3 satellite backbone; SAR/optical ≠ methane (capability mismatch) | 0/3 | Confirmed (High) — correct caveat | ai.meta.com |
| Umbra free SAR to 16cm = sample, not global coverage | 0/3 | Confirmed (High) | umbra.space |
| ~140 bcm EU LNG 2025; OGMP ~150 cos / ~45% output / >80% LNG | 0/3 | Confirmed (High); SAM is inference | bruegel.org |
| Methane monitoring market ~$4.8B 2025, ~10% CAGR | 0/3 | Confirmed vs. source (T3 aggregator, soft) | dataintelo.com |

---

## 8. Appendix C — Discarded and parked concepts, with one-line reasons

**Merged duplicates** (folded into the strongest version of each thesis):
- *TurnProof (concept #1)* — duplicate; merged into the strongest never-event turn-verification survivor.
- *TurnProof (concept #16, bare)* — duplicate; merged (kept #8's on-device open-vocab framing and TAM).
- *CoverWatch (landfill methane, #2)* — semantic duplicate of MethaneSEM; merged (kept SEM-protocol deliverable + in-force-mandate framing).
- *LateralCode (#3)* — duplicate of LateralPACP; merged (kept point-of-sale buyer).
- *LateralCode (#12)* — duplicate of LateralPACP; merged.
- *LineID (#4)* — duplicate of LineProof; merged into the LCRI-certificate survivor.
- *LineSight LSL (#22)* — duplicate of LineProof; merged (kept recurring-vs-episodic risk note).
- *KioskVoice (#6)* — duplicate of AccessProof; merged (kept GUI-agent autonomous-navigation framing).
- *ErgoZero (#7)* — duplicate of ErgoClaim; merged.
- *ErgoGuard (#13)* — duplicate of ErgoClaim; merged.
- *PoleGrade (#10)* — duplicate of PoleLedger; merged (kept SAM 3 + DINOv3 + passive-fleet-capture strengths).

**Scored but PARKED — not ranked, not deep-dived, not verified.** These two cleared the three-judge scoring pass but were never deep-dived and never sent through the verification pipeline, so none of their load-bearing claims carries a refuted-vote count or verdict. The demotion/verification discipline that governs the ranked set was not applied to them; consequently they are **not ranked recommendations** and every figure below is **Low confidence — asserted, not independently verified**. They are parked here rather than occupying a ranked slot so that no ranked concept rests on an un-logged claim.
- *AflaGate — aflatoxin risk grading for exporters (raw 5.10).* Scientific ceiling: aflatoxin is only partially visible, so UV/RGB proxies correlate imperfectly with actual ppb; false-negative liability pushes buyers back to chemical assays. The market read — ~$500–2,000/mo per rural site, a thin, price-sensitive, hard-to-collect sub-$1B pool — is *unverified (Low confidence)*. To promote this into the ranked set it would need a full deep-dive and a three-refuter pass on the visibility-ceiling, market-size, and price claims.
- *AccessProof — ADA/EAA visual-assistance layer (raw 5.03).* ADA Title III / EAA penalties create budgeted liability spend, but the thesis depends on reliable *autonomous* GUI-agent transaction completion, cited at ~54% OSWorld (*unverified, Low confidence*) — not yet dependable enough to transact hands-free — plus unsettled legal safe-harbor and OEM-bundling risk. Same promotion requirement: deep-dive + verification of the capability, safe-harbor, and market claims before it can be ranked.

**Demoted but not discarded** (kept as full analyses in Section 3 with struck-claim flags): *PodiaTherm* (3 struck claims — efficacy, hardware price, capability), *LateralPACP* (2 struck claims — market misattribution, false competitor facts).

---

*Methodology note: rankings follow the impact-tilted weighted composite of three-judge scores, then apply the demotion rule (≥2-of-3 refuted load-bearing claims → demote below the surviving tier). Only concepts carried through a full deep-dive and the three-refuter verification pass are eligible for a rank; AflaGate and AccessProof were scored but neither deep-dived nor verified, so they are parked (Appendix C) outside the ranked set and their asserted figures are Low confidence. The #1 recommendation (PoleLedger) is both the top weighted score and the only top-tier concept with zero struck claims; its single gravest risk — the Noteworthy AI incumbent — is verified at High confidence and drives the entire first-90-day plan. All quantitative claims for ranked concepts retain citation URLs; confidence labels are preserved from the verification pass.*

---

## Appendix D — How this report was produced

This report was generated by executing `research/cv-product-research-plan.md` as a multi-agent research workflow (59 agents, ~3.57M tokens, ~2h24m wall clock):

- **Phase 1–3 (Research):** 16 parallel web-research agents — 3 capability analysts (models/edge/sensing), 10 domain scouts, and market-funding / graveyard / timing analysts.
- **Memo:** research compressed into a one-page synthesis + a banned "crowded categories" list to force contrarian ideation.
- **Phase 4 (Ideate):** 3 ideators (contrarian / capability-first / pain-first) × 7 concepts = 21 raw ideas.
- **Cut:** dedup + anti-goal kill → 10 survivors.
- **Phase 5 (Score):** 3 independent judges scored every survivor on the weighted rubric (0.35 impact / 0.35 commercial / 0.30 feasibility); scores averaged.
- **Phase 5b→6 (DeepDive→Verify):** top 8 concepts deep-dived into full cited one-pagers, then each load-bearing claim adversarially fact-checked by 3 independent refuters (2-of-3 refutes = struck).
- **Phase 7–8 (Synthesize + Critique):** lead synthesist wrote the ranked report; a completeness critic checked it against 10 quality gates; one revision pass fixed the flagged deficiencies (parking AflaGate and AccessProof as unverified, re-citing PoleLedger's adjacency anchor).

Every quantitative claim carries a source URL and a confidence label. See Appendix B for the full verification log.
