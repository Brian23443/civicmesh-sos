# Design references and tokens

Two sections, two owners. Edit only your own section. The triage colors below are the shared canonical values for both Track 3 and Track 4.

## Shared: triage colors (T3 + T4)

| Priority | Dark theme | Light theme |
|---|---|---|
| Red — Immediate | `#FF4D5E` | `#C81E3A` |
| Yellow — Delayed | `#F6C344` | `#A16207` |
| Green — Minor | `#35C978` | `#15803D` |
| Black — Deceased | `#111827` with `#94A3B8` outline | `#111827` |

Use triage colors only to communicate triage priority. Deceased markers need the slate outline in dark mode so they remain visible against the map.

---

## Survivor PWA (owner: T4) — §12.2

### Dribbble references (3–5)

<!-- link · screenshot/description · what to borrow -->

### Design tokens

<!-- colors, radii, spacing, type scale (body ≥ 17 px), tap targets ≥ 48 px -->

---

## Operator dashboard (owner: T3) — §13.4

### Dribbble references

1. [Truck Tracking Dashboard — Light & Dark Mode](https://dribbble.com/shots/27345717-Truck-Tracking-Dashboard-Light-Dark-Mode) — A map-led fleet view with compact floating controls. Borrow: map-first hierarchy, restrained glass panels, and dense status chips.
2. [Logistics & Freight SaaS — Fleet Tracking Dashboard](https://dribbble.com/shots/27681099-Logistics-Freight-SaaS-UI-UX-Fleet-Tracking-Dashboard) — Operations layout pairing a large map with a scan-friendly side rail. Borrow: 70/30 map-to-queue split, layered map controls, and consistent list-card rhythm.
3. [Cybersecurity Operations Command Center Dashboard](https://dribbble.com/shots/27463648-Cybersecurity-Operations-Command-Center-Dashboard) — Dark, high-density monitoring surface with clear system health. Borrow: low-glare navy surfaces, persistent connection telemetry, and high-salience alert treatment.
4. [Enterprise Security Dashboard — Real-Time Analytics](https://dribbble.com/shots/26686390-Enterprise-Security-Dashboard-UX-Real-Time-Analytics) — Real-time security console balancing alerts and ambient system data. Borrow: compact typography, bordered panels, quiet secondary metrics, and priority-first scanning.

These references guide hierarchy and interaction density only; no artwork or layouts are copied verbatim.

### Design tokens

#### Color

| Token | Value | Use |
|---|---|---|
| `bg.canvas` | `#07101D` | App and map-grid base |
| `bg.surface` | `#0D1726` | Sidebar, controls, top bar |
| `bg.raised` | `#111E30` | Incident cards and popovers |
| `bg.soft` | `#162338` | Tags and secondary controls |
| `border.default` | `#223047` | Panel and card borders |
| `border.strong` | `#31425C` | Hover/focus separation |
| `text.primary` | `#F2F6FB` | Primary UI text |
| `text.muted` | `#8FA1B8` | Metadata and timestamps |
| `accent.system` | `#58C7E8` | Non-triage system state |
| `triage.immediate` | `#FF4D5E` | Immediate only |
| `triage.delayed` | `#F6C344` | Delayed only |
| `triage.minor` | `#35C978` | Minor only |
| `triage.deceased` | `#111827` + `#94A3B8` outline | Deceased only |

#### Typography

- UI family: Inter, bundled locally through `@fontsource/inter`.
- Data family: JetBrains Mono, bundled locally through `@fontsource/jetbrains-mono`; use for frame hex, coordinates, sequence numbers, and radio telemetry.
- Scale: 10 px micro labels, 12 px metadata, 14 px body, 16 px section title, 20 px dashboard title, 26 px major count.
- Weights: 400 body, 500 metadata, 600 headings, 700 urgent labels.

#### Shape, spacing, and elevation

- Radii: 4 px tags, 8 px controls, 10 px cards, 14 px major panels, 999 px status pills.
- Spacing: 4, 8, 12, 16, 24, and 32 px.
- Borders carry most separation; shadows are reserved for floating map controls and popovers.
- Motion: 140–180 ms for hover/state changes. Red alerts may use a soft pulse; honor `prefers-reduced-motion`.
- Focus: 2 px `#58C7E8` ring with 2 px offset.
