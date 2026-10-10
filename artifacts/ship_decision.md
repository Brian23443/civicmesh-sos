# Stage 2 ship decision

Rule (§15): ship Stage 2 only if it beats Stage 1 on Red recall **and** whole-summary accuracy, on Appendix A **and** the chatbot validation rows. Both sides scored as INT8 browser models.

## Candidates (§5.1: higher Red recall on Appendix A, then whole-summary; ≤ 30 MB)

| Model | gz MB | INT8 parity | Appendix A (test) Red recall | Appendix A (test) whole-summary | chatbot validation Red recall | chatbot validation whole-summary |
|---|---|---|---|---|---|---|
| **Stage 1 (shipped)** | — | — | 89.3% | 14.8% | 96.2% | 4.9% |
| triage-minilm ← winner | 17.9 | 96.3% | 96.4% | 24.1% | 99.0% | 12.6% |
| triage-bge-small | 27.6 | 96.9% | 92.9% | 24.1% | 98.1% | 16.8% |
| triage-minilm-balanced | 17.9 | 95.0% | 92.9% | 22.2% | 94.3% | 10.7% |

## Decision

- Appendix A (test), red_recall: Stage 1 89.3% vs triage-minilm 96.4% → beats ✓
- Appendix A (test), whole_summary_acc: Stage 1 14.8% vs triage-minilm 24.1% → beats ✓
- chatbot validation, red_recall: Stage 1 96.2% vs triage-minilm 99.0% → beats ✓
- chatbot validation, whole_summary_acc: Stage 1 4.9% vs triage-minilm 12.6% → beats ✓

**SHIP triage-minilm**
