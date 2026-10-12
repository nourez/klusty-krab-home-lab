'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = '/downloads/bookorbit';
const SERVICE = 'http://decypharr.decypharr.svc.cluster.local';
const LIBRARIES = ['/books/ebooks', '/books/audiobooks', '/books/comics'];
const COMPLETE = new Set(['uploading', 'stalledUP', 'pausedUP', 'stoppedUP']);
const DAY = 86400000;

function within(file, root) {
  return typeof file === 'string' && !file.endsWith('/') && !file.includes('\\') && !file.includes('\0') &&
    path.isAbsolute(file) && path.normalize(file) === file && file.startsWith(root + '/');
}
function downloadDirectory(file) {
  return within(file, ROOT) && path.dirname(file) === ROOT;
}
function complete(torrent, hash) {
  return torrent && torrent.hash?.toLowerCase() === hash && torrent.category === 'bookorbit' &&
    COMPLETE.has(torrent.state) && torrent.progress === 1 && torrent.amount_left === 0 &&
    downloadDirectory(torrent.content_path);
}
function eligibility(rows, torrent, now, retentionDays) {
  const hash = rows[0]?.client_key?.toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(hash || '')) return 'invalid_hash';
  if (!complete(torrent, hash)) return 'not_completed_or_unsafe_path';
  const imported = rows.filter(r => r.download_status === 'imported');
  if (!imported.length) return 'not_imported';
  for (const r of rows) {
    if (r.download_status === 'imported') continue;
    // A failed attempt superseded by a successful import for the same request
    // must not prevent cleanup indefinitely. All other attempts block deletion.
    if (r.download_status !== 'failed' || !imported.some(i =>
      i.request_id === r.request_id && i.download_id > r.download_id)) return 'unconfirmed_attempt';
  }
  for (const r of imported) {
    if (r.request_status !== 'available' || !r.matched_book_id || r.book_status !== 'present' ||
        !Array.isArray(r.library_files) || !r.library_files.length) return 'unlinked_library';
    const importedAt = new Date(r.imported_at).getTime();
    if (!r.imported_at || !Number.isFinite(importedAt) || importedAt > now - retentionDays * DAY) return 'retention';
    if (r.content_path !== torrent.content_path || !within(r.local_path, torrent.content_path)) return 'path_mismatch';
    if (r.library_files.some(f => !LIBRARIES.some(root => within(f.path, root)) || Number(f.size) <= 0)) return 'unsafe_library_path';
  }
  return null;
}

// No encrypted client credentials are selected. The dedicated database role
// has SELECT only on the columns used here and no write privileges.
const QUERY = `SELECT d.id AS download_id, d.request_id, lower(d.client_key) AS client_key,
 d.status AS download_status, d.imported_at, d.content_path, d.local_path,
 r.status AS request_status, r.matched_book_id, b.status AS book_status,
 COALESCE((SELECT json_agg(json_build_object('path', f.absolute_path, 'size', f.size_bytes))
   FROM book_files f WHERE f.book_id = b.id), '[]'::json) AS library_files
 FROM book_request_downloads d
 JOIN book_requests r ON r.id = d.request_id
 JOIN download_clients c ON c.id = d.download_client_id
 LEFT JOIN books b ON b.id = r.matched_book_id
 WHERE c.adapter_type = 'qbittorrent' AND c.base_url = $1 AND c.category = 'bookorbit'`;

async function verifyLibrary(rows) {
  for (const row of rows.filter(r => r.download_status === 'imported')) {
    for (const file of row.library_files) {
      const real = await fs.realpath(file.path);
      if (!LIBRARIES.some(root => within(real, root))) throw Error('library_symlink_escape');
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size !== Number(file.size)) throw Error('library_file_missing_or_changed');
    }
  }
}

async function main() {
  const retention = Number(process.env.RETENTION_DAYS || '7');
  if (!Number.isInteger(retention) || retention < 7) throw Error('retention_must_be_at_least_seven_days');
  if (!['true', 'false'].includes(process.env.DRY_RUN)) throw Error('explicit_dry_run_setting_required');
  const dryRun = process.env.DRY_RUN === 'true';
  const {Client} = require('/app/node_modules/pg');
  const db = new Client({host: 'bookorbit-postgres.bookorbit.svc.cluster.local', port: 5432,
    database: 'bookorbit', user: 'download_cache_cleanup', password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 10000, statement_timeout: 10000});
  const token = process.env.DECYPHARR_API_TOKEN;
  if (!token) throw Error('missing_decypharr_token');
  async function api(endpoint, data) {
    const response = await fetch(SERVICE + endpoint, {
      method: data ? 'POST' : 'GET', redirect: 'error',
      headers: {Authorization: 'Bearer ' + token},
      body: data ? new URLSearchParams(data) : undefined,
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw Error('decypharr_http_' + response.status);
    return data ? null : response.json();
  }
  await db.connect();
  let deleted = 0, candidates = 0, failures = 0;
  try {
    const snapshot = (await db.query(QUERY, [SERVICE])).rows;
    const torrents = await api('/api/v2/torrents/info?category=bookorbit');
    if (!Array.isArray(torrents)) throw Error('invalid_queue_response');
    const hashes = [...new Set(snapshot.map(r => r.client_key))];
    for (const hash of hashes) {
      const rows = snapshot.filter(r => r.client_key === hash);
      const torrent = torrents.find(t => t.hash?.toLowerCase() === hash);
      if (!torrent) continue; // Already removed or never belonged to this queue.
      let reason = eligibility(rows, torrent, Date.now(), retention);
      if (reason) { console.log(JSON.stringify({event:'skip', hash, reason})); continue; }
      try {
        await verifyLibrary(rows);
        // Recheck both applications immediately before deletion. Fail closed
        // if any request, import, path, or queue state changed during this run.
        const freshRows = (await db.query(QUERY, [SERVICE])).rows.filter(r => r.client_key === hash);
        const fresh = await api('/api/v2/torrents/info?hashes=' + hash);
        if (!Array.isArray(fresh) || fresh.length !== 1) throw Error('queue_changed');
        reason = eligibility(freshRows, fresh[0], Date.now(), retention);
        if (reason || fresh[0].content_path !== torrent.content_path) throw Error(reason || 'path_changed');
        await verifyLibrary(freshRows);
        candidates++;
        console.log(JSON.stringify({event:dryRun?'would_delete':'delete',hash,
          requestIds:[...new Set(freshRows.map(r=>r.request_id))],retentionDays:retention}));
        if (!dryRun) {
          // Decypharr v2.7's qBittorrent handler deletes only the queued entry
          // and local DownloadPath. It does not invoke TorBox deletion.
          await api('/api/v2/torrents/delete', {hashes:hash, deleteFiles:'true'});
          const remaining = await api('/api/v2/torrents/info?hashes=' + hash);
          if (!Array.isArray(remaining) || remaining.length) throw Error('delete_not_confirmed');
          deleted++;
        }
      } catch (error) {
        failures++;
        // Do not log upstream bodies, URLs, database errors or credentials.
        console.log(JSON.stringify({event:'candidate_failed', hash,
          reason:/^[a-z_0-9]+$/.test(error.message)?error.message:'verification_failed'}));
      }
    }
    console.log(JSON.stringify({event:'summary',dryRun,retentionDays:retention,candidates,deleted,failures}));
    if (failures) process.exitCode = 1;
  } finally { await db.end(); }
}
module.exports = {within, downloadDirectory, complete, eligibility, verifyLibrary};
if (require.main === module) main().catch(() => {
  console.error('Cleanup aborted; no further deletions attempted. Check database/API connectivity and mounted library files.');
  process.exitCode = 1;
});
