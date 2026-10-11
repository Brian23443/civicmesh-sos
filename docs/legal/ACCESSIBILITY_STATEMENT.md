# RescuNote Accessibility Statement

Status: Draft pending maintainer approval and accessibility evaluation.  
Prepared: October 11, 2026. Intended audience: United States of America (USA).

## Our accessibility goal

RescuNote aims to make its survivor application and operator dashboard usable by people with disabilities, including people using keyboards, screen readers, magnification, and other assistive technologies. The proposed target is [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/). This is a goal, not a claim of achieved conformance, ADA compliance, certification, or independent audit.

## Current assessment status

A complete accessibility evaluation has not been performed for this statement. No verified screen-reader/browser compatibility matrix, disability-user testing results, or conformance report is available. Development checks and functional smoke tests do not establish accessibility conformance.

## Features and evaluation priorities

The survivor application includes text-based reporting, selectable report details, and voice prompts. Voice prompts are assistance, not a replacement for accessible text and controls. Evaluation must verify keyboard navigation, visible focus, meaningful labels, heading structure, contrast, zoom/reflow, error messages, and focus management across the full reporting flow.

The dashboard includes incident information outside the map. Evaluation must ensure that operators can select and review incidents without relying only on map gestures or colors, and that priority, connection changes, alerts, removal, and Undo are understandable with assistive technology. Keyboard access and reduced-motion behavior must be checked, including the detail drawer.

## Limitations and alternatives

Interactive maps and geographic accuracy rings may be difficult to interpret with a screen reader or magnification. Use available incident lists and textual coordinates as an alternative; equivalent access still needs evaluation. Color-coded urgency must also be communicated in text. Sound alerts may be unavailable, muted, or inaudible and must not be the only way important updates are conveyed.

Model loading, offline asset availability, browser storage, voice playback, location permissions, and hardware connections can affect reporting. Full-flow behavior with assistive technologies and on mobile devices remains unverified. If the app is inaccessible or unavailable during an emergency, contact 911 through an available channel or seek help from a nearby person when safe. RescuNote is not a substitute for official emergency services.

## Accessibility feedback

No dedicated accessibility contact has been supplied yet. Before release, the deployment operator must publish a monitored, accessible contact method and a realistic response process, including how to request an alternative format or assistance. Until then, non-sensitive technical feedback may be raised with repository maintainers where repository access is available. Do not put medical details, precise locations, or personal report frames in public issues. This is not an emergency-response channel.

When reporting a barrier, describe the page or step, what you tried, the problem, and optionally your browser and assistive technology. Sharing disability or medical details should not be required to describe a usability issue.

## Before publishing and maintaining this statement

Identify the responsible operator and contact; evaluate survivor and dashboard journeys against the target standard; test representative assistive technologies and involve users with disabilities; record known barriers, alternatives, tested environments, and assessment dates; and approve a remediation and feedback process. Update this statement as verified results become available. No remediation deadline or support response time has been established by this draft.

Statement structure informed by [W3C guidance on accessibility statements](https://www.w3.org/WAI/planning/statements/). Related documents: [Privacy Policy](PRIVACY_POLICY.md), [Terms of Service](TERMS_OF_SERVICE.md), and [EULA](EULA.md).
