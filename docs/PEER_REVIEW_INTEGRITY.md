# Peer-review integrity

Peer review is the layer that moves a credential from "code looks reasonable" (Layer 3) to "another human verified the claim" (Layer 4/5). It is also the easiest layer to abuse. This doc lays out what can go wrong, what VeriSkill now does about each, and what still cannot be solved without heavier machinery than the pilot can justify.

## The threats

**Collusion.** A developer registers a second account, or recruits a friend, and that account approves their credential. Weight was previously only discounted when the two accounts shared an ASN or had reviewed each other more than once. A fresh sybil on a different ASN defeats both heuristics.

**AI-written reviews.** A reviewer pastes the credential into a chatbot and submits whatever comes back. The rationale looks fluent and plausible. The reviewer did not actually inspect the code. From inside the system this is indistinguishable from a careful but concise human review.

**Bias.** A reviewer sees the candidate's name and profile before judging. Even well-meaning reviewers are influenced by name, gender, affiliation, and prior interaction. Blind review is standard in academic peer review for exactly this reason.

**Sybil accounts.** A new account registered minutes ago has the same vote weight as one a year old with a track record. Nothing in the old system penalised new accounts.

**Reviewer gaming.** A reviewer who always approves is a free pass to anyone who gets assigned to them. Nothing in the old system detected a reviewer whose decisions consistently diverged from later expert outcomes.

## What the controls do

The controls are stacked. No single one is strong on its own; together they raise the cost of each attack.

### 1. Eligibility (`checkEligibility` in `peer-review.service.ts`)

A reviewer is only assigned if they:

- have an account at least `PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS` old (default 7),
- hold a credential at Layer 3 or above, preferably in the same skill (we fall back to any L3+ credential when there is no same-skill candidate, and record `skillMatch: false` in the audit trail),
- have reviewed this developer fewer than `PEER_REVIEW_MAX_MUTUAL_REVIEWS` times (default 2).

`peer_verifier` accounts skip the credential gate because they are vetted off-platform.

Self-review is blocked at assignment and at submit. The submit-time check is defence in depth against directly-inserted database rows.

### 2. Structured submission (`peerReviewSubmitSchema` in `@veriskill/shared`)

A review must include:

- a decision (`APPROVE` or `FLAG`),
- a rationale of at least 60 characters (was 20),
- a rubric with four fixed fields (skill demonstrated, authorship checked, evidence quality, concerns),
- an artifact URL pointing at a specific GitHub file, commit, PR, or gist.

Bare GitHub user profiles and non-GitHub hosts are rejected. The rubric is validated with Zod — missing fields reject with a 422 and never reach the database.

### 3. Duplicate detection

Every submission's rationale is normalised (lowercased, whitespace-collapsed) and compared against this reviewer's last `PEER_REVIEW_DUP_HISTORY_LIMIT` submissions.

- **Exact duplicate** (SHA-256 fingerprint match) → hard reject. The reviewer gets a 422.
- **Near-duplicate** (character 5-shingle Jaccard ≥ `PEER_REVIEW_DUP_SHINGLE_THRESHOLD`, default 0.75) → soft flag. The review still counts, but its weight is multiplied by `PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER` (default 0.5) and the credential is escalated to the expert queue.

Jaccard on 5-shingles is cheap (set intersection, O(n)) and tolerant of superficial edits like swapped punctuation or reordered sentences.

### 4. "Fast submit" heuristic

If the submission arrives within `PEER_REVIEW_FAST_SUBMIT_SECONDS` (default 60) of assignment, the review is soft-flagged, downweighted and routed to the expert queue. Reviewing a repository in under a minute is not plausible.

**This is not an "AI detector".** It is a weak behavioural signal. A human who happens to type fast is penalised; a determined bot can wait 61 seconds before submitting. We therefore never auto-reject on this signal — it only lowers the weight and surfaces the review to an expert. The docs describe it as a heuristic and the code calls it that.

### 5. Bias controls

**Partial blinding.** The reviewer-facing endpoints (`GET /api/v1/peer-reviews`, `GET /api/v1/peer-reviews/history`) strip the developer identity from the credential before returning it. The rubric answers and the artifact URL remain. The audit record (`weightFactors`) is also stripped — a reviewer cannot see how their own review was weighted.

**What blinding cannot do.** The artifact URL is a GitHub link, and GitHub URLs contain the owner's username. We do not rewrite or proxy evidence, because that would destroy the chain of evidence the recruiter later verifies. A determined reviewer can click the artifact URL and learn who the developer is. Blinding reduces casual bias; it does not defeat motivated identification.

**Weight cap.** A single review's weight is capped at 1.0. Layer 5 requires ≥3 weighted approvals, so no single reviewer, however trusted, can push a credential to Layer 5 alone. Layer 6 requires an expert — peer review cannot reach it at all.

**Cluster diversity.** `calculateTrustScore` counts the distinct network clusters (ASN when available, IP-hash otherwise) across the approvers. If all approvers come from a single cluster the credential plateaus at Layer 3, regardless of how many approvals it has. This is the single biggest change against a sybil ring: three approvals from three fresh accounts on one ASN no longer promote the credential.

**Historical agreement with experts.** Each reviewer's past decisions are compared against expert confidence ratings on the same credentials. The agreement rate (0..1) is mapped onto 0.5..1.0 and multiplied into the final weight. New reviewers with no history get 1.0 (neutral). Over time, a reviewer whose decisions consistently diverge from expert outcomes contributes less. Cold-start is honest: this does nothing on day one.

### 6. Audit trail

Every submitted review carries a `weightFactors` JSONB column with:

- the base weight (post-collusion),
- whether skill match was exact or a fallback,
- the reviewer's agreement rate (or null if no history),
- the cluster identifier (ASN or IP-hash prefix),
- which soft heuristics fired,
- the final weight that was actually used.

The admin endpoint `GET /api/v1/admin/peer-reviews/:id/factors` returns this record. The reviewer never sees it. The developer never sees it. Admins can inspect why any review got the weight it did.

### 7. Peer review stays one layer

Layer 6 is explicitly gated on `ExpertReview.confidenceRating >= 3`. The trust-score engine does not grant Layer 6 from peer approvals alone, no matter how many or how diverse. A flagged peer review automatically escalates the credential to the expert queue; the expert decides whether Layer 6 is justified.

## What remains unsolved

Being honest about this matters, both for the pilot and for the dissertation.

- **The artifact URL leaks identity.** Blinding is partial by design. See section 5.
- **ASN is a weak cluster signal.** Shared VPNs, ISPs, or university networks land many unrelated people in the same ASN. The cluster gate will occasionally penalise honest geographically-clustered reviewers. The alternative — demanding geographically distinct IPs — would exclude whole countries.
- **The duplicate heuristic is bypassable.** A reviewer who has never submitted before cannot have a duplicate. Reviewers using separate LLM chats with different seeds produce text diverse enough to defeat 5-shingle Jaccard. The signal is a trip-wire, not a wall.
- **Fast-submit does not detect slow bots.** As noted, a bot that sleeps 61 seconds avoids the heuristic.
- **Agreement-with-experts has no signal at cold start.** Early in platform life, every reviewer is 1.0. Signal builds only as experts rule on credentials the same peer reviewers have already seen.
- **The simulation is a model, not evidence.** `apps/backend/scripts/simulate-peer-review.ts` reports pass-rates on synthetic adversary populations. The adversaries are idealised; real colluders are rarely this neat. Treat the numbers as indicative, not as deployed effectiveness.
- **We do not claim AI detection.** The flagging heuristic is coarse and never used as the sole reason to reject a review. A reader who equates "flag" with "AI" is overclaiming; we try not to.

## Configuration

Every threshold is an env var so a deployer can tighten or loosen without a code change. Defaults are in `.env.example`:

| Variable | Default | Effect |
| -------- | ------: | ------ |
| `PEER_REVIEW_MIN_ACCOUNT_AGE_DAYS` | 7 | Minimum account age to be assigned as reviewer |
| `PEER_REVIEW_MAX_MUTUAL_REVIEWS` | 2 | Max times a reviewer may review the same developer |
| `PEER_REVIEW_FAST_SUBMIT_SECONDS` | 60 | Submissions faster than this are soft-flagged |
| `PEER_REVIEW_DUP_SHINGLE_THRESHOLD` | 0.75 | Jaccard threshold for the near-dup flag |
| `PEER_REVIEW_DUP_HISTORY_LIMIT` | 50 | How many prior reviews to compare against |
| `PEER_REVIEW_FLAG_WEIGHT_MULTIPLIER` | 0.5 | Weight multiplier applied to flagged reviews |

## Where to look in the code

- `apps/backend/src/services/peer-review.service.ts` — eligibility, text heuristics, weight computation, assignment.
- `apps/backend/src/routes/peer-review.routes.ts` — submit flow, blinding, duplicate detection, flag-and-queue.
- `apps/backend/src/services/trust-score.service.ts` — cluster-diversity gate, Layer 4/5/6 band logic.
- `apps/backend/src/services/expert-review.service.ts` — auto-assignment on Layer 5 or on a flagged review.
- `apps/backend/src/routes/admin.routes.ts` — `GET /admin/peer-reviews/:id/factors`.
- `apps/backend/src/migrations/20261128000001-peer-review-integrity.js` — the schema change (artifact, rubric, weight factors, reviewer ASN, flagged).
- `apps/backend/tests/unit/peer-review.service.test.ts`, `peer-review.submit.test.ts`, `trust-score.cluster.test.ts` — the unit tests for each rule.
- `apps/backend/scripts/simulate-peer-review.ts` — the labelled simulation.
