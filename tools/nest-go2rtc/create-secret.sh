#!/usr/bin/env bash
# Copy only Nest stream credentials into a dedicated Kubernetes Secret.
# Never print the generated configuration or save it in the repository.
set -euo pipefail
kubectl -n homeassistant exec -i deployment/homeassistant -c homeassistant -- python - <<'PY' | kubectl apply -f -
import base64
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

storage = Path('/config/.storage')
entries = json.loads((storage / 'core.config_entries').read_text())['data']['entries']
nest_entries = [e['data'] for e in entries if e['domain'] == 'nest']
if len(nest_entries) != 1:
    raise SystemExit('Expected exactly one Nest integration; select the intended entry first.')
nest = nest_entries[0]
credentials = json.loads((storage / 'application_credentials').read_text())['data']['items']
credential = next(c for c in credentials if c['domain'] == 'nest' and c['id'] == nest['auth_implementation'])
params = {
    'client_id': credential['client_id'],
    'client_secret': credential['client_secret'],
    'refresh_token': nest['token']['refresh_token'],
}
request = Request('https://oauth2.googleapis.com/token', data=urlencode({
    **params, 'grant_type': 'refresh_token',
}).encode())
token = json.load(urlopen(request, timeout=20))['access_token']
request = Request(
    'https://smartdevicemanagement.googleapis.com/v1/enterprises/' + nest['project_id'] + '/devices',
    headers={'Authorization': 'Bearer ' + token},
)
devices = json.load(urlopen(request, timeout=20))['devices']
doorbells = [d for d in devices if d['type'] == 'sdm.devices.types.DOORBELL']
if len(doorbells) != 1:
    raise SystemExit('Expected exactly one Nest doorbell; select the intended device first.')
device = doorbells[0]
protocols = device['traits']['sdm.devices.traits.CameraLiveStream']['supportedProtocols']
if 'WEB_RTC' not in protocols:
    raise SystemExit('This adapter is intended for WebRTC Nest doorbells.')
source = 'nest:?' + urlencode({
    **params, 'project_id': nest['project_id'], 'device_id': device['name'].split('/')[-1],
})
# JSON is valid YAML. Disable unused listeners: hostNetwork exposes default ports.
config = json.dumps({
    'api': {'listen': ''},
    'rtsp': {'listen': '127.0.0.1:18564'},
    'webrtc': {'listen': ''},
    'srtp': {'listen': ''},
    'streams': {'nest_doorbell': source},
    # Source URLs contain secrets; suppress upstream logs that can include URLs.
    'log': {'level': 'disabled'},
})
print(json.dumps({
    'apiVersion': 'v1', 'kind': 'Secret',
    'metadata': {'name': 'nest-go2rtc', 'namespace': 'homeassistant'},
    'type': 'Opaque',
    'data': {'go2rtc.yaml': base64.b64encode(config.encode()).decode()},
}))
PY
