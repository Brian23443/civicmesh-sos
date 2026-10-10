# Design references and tokens

Two sections, two owners. Edit only your own section. The **triage colors must be identical** in both apps (agree them by hour 1 and copy them into both sections).

## Shared: triage colors (T3 + T4 agree)

| Priority | Dark theme | Light theme |
|---|---|---|
| Red — Immediate | _TBD_ | _TBD_ |
| Yellow — Delayed | _TBD_ | _TBD_ |
| Green — Minor | _TBD_ | _TBD_ |
| Black — Deceased (near-black + outline in dark mode) | _TBD_ | _TBD_ |

---

## Survivor PWA (owner: T4) — §12.2

### Dribbble references (3–5)

- [Emergency SOS App — Ashar Waseem](https://dribbble.com/shots/27764432-Emergency-SOS-App-Mobile-UI-UX-Design): emergency categories and clear navigation; borrow calm hierarchy and large controls.
- [Emergency App Concept — Nixtio](https://dribbble.com/shots/25711688-Emergency-App-Concept-Design): high contrast and direct access; borrow a single dominant action and restrained cards.
- [Disaster Relief App — Sushant Kumar Rai](https://dribbble.com/shots/5543034-Disaster-Relief-App): connects people needing help with helpers; borrow focused mobile task organization.

References were reviewed through their public descriptions before UI implementation. Their red action colors are not adopted.

### Design tokens

Foundation tokens (triage colors remain pending agreement with T3):

| Token | Dark | Light |
|---|---|---|
| Background | #101820 | #F3F5F7 |
| Surface | #19252F | #FFFFFF |
| Text | #F4F7FA | #17232E |
| Secondary text | #BAC9D5 | #4B5E6D |
| Accent / focus | #A9C7FF | #264F98 |
| Border | #435666 | #7B8C99 |

Inter bundled locally; system fallback. Body 17 px / 1.6; headings 28–40 px; spacing 4/8/12/16/24/32/48 px; card radius 20 px, control radius 12 px; tap targets at least 48 px. Dark default, explicit light toggle. Reduced motion respected. T2 can use background, surface, text, accent, radius, and `Inter, system-ui, sans-serif`.


### Provisional T4 triage presentation (awaiting T3 agreement)

| Priority | Dark background / text / outline | Light background / text |
|---|---|---|
| Minor | #214A37 / #CBF2DB / #7BBA96 | #DDF2E4 / #15452A |
| Delayed | #4A421F / #F5E8B0 / #CEB964 | #FFF2B8 / #4A3904 |
| Immediate | #512F35 / #FFE0E3 / #DC9DA8 | #FFE3E7 / #702032 |
| Deceased | #090B0D / #F4F7FA / #9DAAB4 | same |

These apply only to triage. They are proposals, not an agreement with T3. Hazard and medical icon mappings are exported from `web/src/lib/presentation.ts` for coordination.

---

## Operator dashboard (owner: T3) — §13.4

### Dribbble references (3–5)

<!-- link · screenshot/description · what to borrow -->

### Design tokens

<!-- colors, radii, spacing, type scale, monospace font -->
