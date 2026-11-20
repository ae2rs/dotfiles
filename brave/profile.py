#!/usr/bin/env python3 -I
"""Writes home.mobileconfig: Brave's ProxySettings policy, home.pac inline as a data: URL.
Chromium enforces proxy policy only from a profile; plain `defaults write` is ignored.
Install it by opening the file, then System Settings > General > Device Management."""
import base64, pathlib, plistlib, uuid

here = pathlib.Path(__file__).parent
pac = base64.b64encode((here / "home.pac").read_bytes()).decode()
ns = uuid.UUID("6f1c2e0a-5b7d-4c1e-9a3f-2d8b7e4c9a10")
payload = {
    "PayloadType": "com.brave.Browser",
    "PayloadIdentifier": "onl.factory.brave.proxy.settings",
    "PayloadUUID": str(uuid.uuid5(ns, "settings")).upper(),
    "PayloadVersion": 1,
    "ProxySettings": {
        "ProxyMode": "pac_script",
        "ProxyPacUrl": f"data:application/x-ns-proxy-autoconfig;base64,{pac}",
    },
}
profile = {
    "PayloadType": "Configuration",
    "PayloadDisplayName": "Brave: home through the home tailnet",
    "PayloadIdentifier": "onl.factory.brave.proxy",
    "PayloadUUID": str(uuid.uuid5(ns, "profile")).upper(),
    "PayloadScope": "User",
    "PayloadVersion": 1,
    "PayloadContent": [payload],
}
(here / "home.mobileconfig").write_bytes(plistlib.dumps(profile))
