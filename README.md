# CivicMesh-SOS

Offline disaster triage: a survivor types a message on a phone in Airplane Mode → an on-device model turns it into triage fields → the survivor confirms → an 18-byte frame goes over local Wi-Fi to a LoRa field node → 915 MHz LoRa → base station → laptop dashboard with a color-coded pin.

- Full specification: [MASTER_PROMPT.md](MASTER_PROMPT.md)
- Team plan and track briefs: [tracks/00_OVERVIEW.md](tracks/00_OVERVIEW.md)
- Live integration values (URLs, ports, demo area): [docs/INTEGRATION.md](docs/INTEGRATION.md)

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
python3 -m pip install -r requirements.txt
pytest
```

Run Python scripts as modules from the repo root, e.g. `python3 -m bridge.server --simulate`. Node.js 20+ for `web/` and `dashboard/`.

## Layout

See MASTER_PROMPT.md §14. Ownership of each path is in the track files ("Team structure").
