#!/usr/bin/env python3
"""Create a dedicated read-only DB login and copy Decypharr's API token privately.
Run with trusted kubectl access. No credentials are logged or written locally.
Re-running preserves the DB password and refreshes the copied API token.
"""
import base64
import json
import secrets
import subprocess


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


existing = run(['kubectl', '-n', 'bookorbit', 'get', 'secret',
                'download-cache-cleanup-credentials', '--ignore-not-found', '-o', 'json']).stdout
password = (base64.b64decode(json.loads(existing)['data']['PGPASSWORD']).decode()
            if existing.strip() else secrets.token_hex(32))
# A generated or previously provisioned password is hex, safe for this SQL literal.
if not password or any(c not in '0123456789abcdef' for c in password):
    raise SystemExit('Unexpected credential format; refusing to rotate or modify it')
auth = json.loads(run(['kubectl', '-n', 'decypharr', 'exec', 'deployment/decypharr',
                       '--', 'cat', '/app/auth.json']).stdout)
if not auth.get('api_token'):
    raise SystemExit('Decypharr has no API token')
sql = f"""
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='download_cache_cleanup') THEN
   CREATE ROLE download_cache_cleanup LOGIN PASSWORD '{password}';
 END IF;
END $$;
ALTER ROLE download_cache_cleanup SET default_transaction_read_only = on;
ALTER ROLE download_cache_cleanup SET statement_timeout = '10s';
GRANT CONNECT ON DATABASE bookorbit TO download_cache_cleanup;
GRANT USAGE ON SCHEMA public TO download_cache_cleanup;
GRANT SELECT (id, request_id, download_client_id, client_key, status, imported_at,
 content_path, local_path) ON book_request_downloads TO download_cache_cleanup;
GRANT SELECT (id, status, matched_book_id) ON book_requests TO download_cache_cleanup;
GRANT SELECT (id, adapter_type, base_url, category) ON download_clients TO download_cache_cleanup;
GRANT SELECT (id, status) ON books TO download_cache_cleanup;
GRANT SELECT (book_id, absolute_path, size_bytes) ON book_files TO download_cache_cleanup;
"""
run(['kubectl', '-n', 'bookorbit', 'exec', '-i', 'deployment/bookorbit-postgres', '--',
     'psql', '-U', 'bookorbit', '-d', 'bookorbit', '-v', 'ON_ERROR_STOP=1'], input=sql.encode())
resource = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {
    'name': 'download-cache-cleanup-credentials', 'namespace': 'bookorbit'},
    'type': 'Opaque', 'data': {
        'PGPASSWORD': base64.b64encode(password.encode()).decode(),
        'DECYPHARR_API_TOKEN': base64.b64encode(auth['api_token'].encode()).decode()}}
if existing.strip():
    resource['metadata']['resourceVersion'] = json.loads(existing)['metadata']['resourceVersion']
run(['kubectl', 'replace' if existing.strip() else 'create', '-f', '-'],
    input=json.dumps(resource).encode())
print('Cleanup read-only DB access and Secret provisioned; credentials not displayed.')
