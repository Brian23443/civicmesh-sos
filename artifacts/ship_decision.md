# Stage 2 ship decision

Rule (§15): ship Stage 2 only if it beats Stage 1 on Red recall **and** whole-summary accuracy, on Appendix A **and** the chatbot validation rows. Both sides scored as INT8 browser models.

## Candidates (§5.1: higher Red recall on Appendix A, then whole-summary; ≤ 30 MB)

| Model | gz MB | INT8 parity | Appendix A (test) Red recall | Appendix A (test) whole-summary | chatbot validation Red recall | chatbot validation whole-summary |
|---|---|---|---|---|---|---|
| **Stage 1 (shipped)** | — | — | 89.3% | 14.8% | 98.1% | 4.5% |
| triage-bge-small | 27.6 | 96.6% | 89.3% | 20.4% | 98.1% | 15.9% |
| triage-minilm ← winner | 17.9 | 96.4% | 100.0% | 27.8% | 99.0% | 12.3% |

## Decision

- Appendix A (test), red_recall: Stage 1 89.3% vs triage-minilm 100.0% → beats ✓
- Appendix A (test), whole_summary_acc: Stage 1 14.8% vs triage-minilm 27.8% → beats ✓
- chatbot validation, red_recall: Stage 1 98.1% vs triage-minilm 99.0% → beats ✓
- chatbot validation, whole_summary_acc: Stage 1 4.5% vs triage-minilm 12.3% → beats ✓

**SHIP triage-minilm**
