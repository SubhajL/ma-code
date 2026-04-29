Validate the task below.
Use Auggie discovery first when it is available and non-blocking; otherwise fall back immediately to local inspection and say so.
Prefer exact proof over narration, and name the specific missing validation or evidence when proof is weak.
Use this normalized validation structure so downstream consumers depend less on prose interpretation:
Proof Status: sufficient | partial | missing | contradictory
Missing Proof Category: none | acceptance_gap | evidence_missing | validation_missing | wiring_unchecked | blocked_dependency | contradictory_evidence
Missing Proof Item Fields: category | gap | evidence_needed | blocking_effect
Decision Basis: proof_sufficient | proof_gap | blocked_dependency

Return exactly:
## Discovery Path
## Acceptance Criteria Check
## Evidence Review
## Validation Result
## Missing Proof
## Final Decision
Final Decision: pass | fail | blocked

Task:
{{TASK}}
