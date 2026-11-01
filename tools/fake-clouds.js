/* Dropbox e Google Drive simulati: usati da sync-test.js e feat-smoke.js. Ogni finto servizio espone http({method,url,headers,form,body}). */
const assert = require('assert');
function fakeDropbox(opts) {
  opts = opts || {};
  const srv = { file: null, rev: 0, log: [], tokens: 0, accessOK: 'AT1', failAuth: false };
  srv.http = async (req) => {
    srv.log.push(req.method + ' ' + req.url.replace(/\?.*/, ''));
    const H = { 'content-type': 'application/json' };
    if (req.url === 'https://api.dropboxapi.com/oauth2/token') {
      const f = req.form || {};
      if (f.grant_type === 'authorization_code') {
        if (f.code !== 'GOODCODE' || !f.code_verifier || f.client_id !== 'KEY') return { status: 400, text: '{"error":"invalid_grant"}', headers: H };
        return { status: 200, text: JSON.stringify({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 14400 }), headers: H };
      }
      if (f.grant_type === 'refresh_token') {
        if (f.refresh_token !== 'RT1' || srv.failAuth) return { status: 400, text: '{"error":"invalid_grant"}', headers: H };
        srv.tokens++; srv.accessOK = 'AT' + (srv.tokens + 1); return { status: 200, text: JSON.stringify({ access_token: srv.accessOK, expires_in: 14400 }), headers: H };
      }
    }
    const auth = req.headers && req.headers.Authorization;
    if (auth !== 'Bearer ' + srv.accessOK) return { status: 401, text: '{"error":"expired"}', headers: H };
    if (req.url === 'https://content.dropboxapi.com/2/files/download') {
      if (srv.file == null) return { status: 409, text: '{"error_summary":"path/not_found/"}', headers: H };
      return { status: 200, text: srv.file, headers: { 'dropbox-api-result': JSON.stringify({ rev: 'r' + srv.rev }) } };
    }
    if (req.url === 'https://content.dropboxapi.com/2/files/upload') {
      const arg = JSON.parse(req.headers['Dropbox-API-Arg']);
      if (arg.path !== '/coglio-sync.json') return { status: 409, text: '{}', headers: H };
      if (typeof arg.mode === 'object' && arg.mode.update !== 'r' + srv.rev) return { status: 409, text: '{"error_summary":"path/conflict/file"}', headers: H };
      if (opts.raceOnce && !srv._raced) { srv._raced = 1; srv.rev++; srv.file = srv.file; return { status: 409, text: '{"error_summary":"path/conflict/file"}', headers: H }; }
      srv.file = req.body; srv.rev++; return { status: 200, text: JSON.stringify({ rev: 'r' + srv.rev }), headers: H };
    }
    return { status: 404, text: '{}', headers: H };
  };
  return srv;
}
function fakeGoogle() {
  const srv = { file: null, id: null, log: [], polls: 0, accessOK: 'GA1', refreshes: 0 };
  srv.http = async (req) => {
    srv.log.push(req.method + ' ' + req.url.replace(/\?.*/, ''));
    const H = { 'content-type': 'application/json' };
    if (req.url === 'https://oauth2.googleapis.com/device/code') {
      if (req.form.client_id !== 'GID' || req.form.scope !== 'https://www.googleapis.com/auth/drive.appdata') return { status: 400, text: '{"error":"invalid_client"}', headers: H };
      return { status: 200, text: JSON.stringify({ device_code: 'DEV', user_code: 'ABCD-EFGH', verification_url: 'https://www.google.com/device', expires_in: 1800, interval: 5 }), headers: H };
    }
    if (req.url === 'https://oauth2.googleapis.com/token') {
      const f = req.form;
      if (f.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
        if (f.client_secret !== 'GSEC') return { status: 401, text: '{"error":"invalid_client"}', headers: H };
        srv.polls++;
        if (srv.polls < 3) return { status: 428, text: '{"error":"authorization_pending"}', headers: H };
        return { status: 200, text: JSON.stringify({ access_token: 'GA1', refresh_token: 'GR1', expires_in: 3599 }), headers: H };
      }
      if (f.grant_type === 'refresh_token' && f.refresh_token === 'GR1' && f.client_secret === 'GSEC') { srv.refreshes++; srv.accessOK = 'GA' + (srv.refreshes + 1); return { status: 200, text: JSON.stringify({ access_token: srv.accessOK, expires_in: 3599 }), headers: H }; }
      return { status: 400, text: '{"error":"invalid_grant"}', headers: H };
    }
    if (!/^Bearer /.test(req.headers.Authorization) || req.headers.Authorization !== 'Bearer ' + srv.accessOK) return { status: 401, text: '{}', headers: H };
    const u = new URL(req.url);
    if (u.pathname === '/drive/v3/files' && req.method === 'GET') {
      if (u.searchParams.get('spaces') !== 'appDataFolder') return { status: 400, text: '{}', headers: H };
      return { status: 200, text: JSON.stringify({ files: srv.id ? [{ id: srv.id, modifiedTime: '2026-01-01T00:00:00Z' }] : [] }), headers: H };
    }
    if (u.pathname === '/drive/v3/files/' + srv.id && u.searchParams.get('alt') === 'media') return { status: 200, text: srv.file, headers: H };
    if (u.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      assert(/^multipart\/related; boundary=/.test(req.headers['Content-Type']), 'multipart');
      const parts = req.body.split(/--coglio\w+/).filter(x => x.trim() && x.trim() !== '--');
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].replace(/\r\n$/, ''));
      assert(meta.name === 'coglio-sync.json' && meta.parents[0] === 'appDataFolder', 'metadati del file');
      srv.file = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, ''); srv.id = 'F1';
      return { status: 200, text: '{"id":"F1"}', headers: H };
    }
    if (u.pathname === '/upload/drive/v3/files/' + srv.id && req.method === 'PATCH') { srv.file = req.body; return { status: 200, text: '{"id":"F1"}', headers: H }; }
    return { status: 404, text: '{}', headers: H };
  };
  return srv;
}


module.exports = { fakeDropbox, fakeGoogle };
