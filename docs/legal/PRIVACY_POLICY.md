# RescuNote Privacy Policy

Status: Draft for maintainer and legal review; not yet effective.  
Prepared: October 11, 2026. Intended audience: United States of America (USA).

## Who this covers

RescuNote is the product name for the survivor application and operator dashboard in this repository. This draft describes the reviewed application, local relay, and bridge. RescuNote is not an identified legal entity. The organization operating a deployment must supply its legal name, privacy contact, hosting details, and effective date before publishing this as its policy. Different deployments may process information differently.

## Information handled

The survivor application uses the emergency description you enter to suggest structured triage labels. In the reviewed implementation, model inference runs in the browser; the original description is not included in the radio frame. This does not make a report anonymous: location, medical flags, timing, and identifiers can reveal sensitive information.

The compact report contains priority, hazard, rescue status, adult and child counts, medical flags, third-party and location indicators, coordinates, timestamp, device identifier, sequence counter, and GPS accuracy. The receiver also records radio measurements and reception times. Location access requires browser permission; permission may be denied. For third-party reports, GPS may identify the reporter rather than the incident scene.

Browser storage holds a generated device identifier, sequence counter, and sent-report history including frame hex and handoff time. Offline assets may be cached. Hosting providers and deployed relays may record request metadata, including IP addresses and URLs. The relay handoff places the encoded frame in an HTTP request URL, which can also appear in browser history and logs.

## Purposes and recipients

Information is used to prepare reports, hand them to a relay, display incidents to operators, and maintain local report history. Reports can be received by configured relays, bridge operators, and parties with access to those systems. Radio reception and onward operator handling are not confined to the browser. The reviewed client does not include advertising or analytics integrations; an operator must disclose any added integrations, disclosures, or hosting practices before deployment.

## Storage, retention, and choices

Browser records remain until cleared or evicted. Clearing site data removes local history and cached assets, not copies already received elsewhere. The bridge stores incidents in its local database; removing a dashboard pin marks it removed rather than erasing the record. The reviewed implementation does not provide an automatic retention deadline or a deployment-wide deletion service.

You may decline browser location permission and clear browser site data. Data-access, correction, or deletion requests must be directed to the deployment operator once a verified private contact is supplied. Applicable rights depend on the operator and relevant laws. No unimplemented self-service rights mechanism is promised by this draft.

## Security and sensitive reports

Do not assume that radio frames, the local HTTP relay, or a default development bridge are encrypted, authenticated, or confidential. Operators must secure network access and stored records before real-world deployment. Avoid adding unnecessary names, contact details, or other identifying information to descriptions. Do not post medical information, precise locations, or report frames in public issues.

Reports may describe children or other people in danger. This draft does not establish child-privacy, health-privacy, or breach-notification compliance. Operators must determine applicable duties and necessary safeguards before processing real reports.

## Contact, updates, and release requirements

No verified privacy contact has been supplied. This draft must not be presented as a completed public policy until the operator provides a private contact and confirms actual recipients, hosting logs, retention/deletion procedures, security controls, and applicable federal and state requirements. Material practice changes require a corresponding policy update and any notice or consent required by applicable law.

Related documents: [Terms of Service](TERMS_OF_SERVICE.md), [EULA](EULA.md), and [Accessibility Statement](ACCESSIBILITY_STATEMENT.md).

Maintainer review resource: [FTC guidance for mobile health app developers](https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices).
