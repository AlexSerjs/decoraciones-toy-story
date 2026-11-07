// Programa de escritorio (Electron): abre las mismas páginas HTML y guarda todo en una carpeta que eliges.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const ROOT = __dirname;
if (process.env.TS_SELFTEST) { // modo de prueba: datos aparte, no toca tu carpeta real
  const os = require('os'); const base = path.join(os.tmpdir(), 'ts-selftest'); fs.rmSync(base, { recursive: true, force: true });
  app.setPath('userData', path.join(base, 'user')); fs.mkdirSync(path.join(base, 'user'), { recursive: true });
  fs.writeFileSync(path.join(base, 'user', 'config.json'), JSON.stringify({ dataDir: path.join(base, 'datos') }));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.webp': 'image/webp' };

// Las páginas se sirven con un esquema propio (app://local/...): origen seguro y fijo, sin servidor ni puertos.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// ---------- Carpeta de datos ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); }
const defaultDir = () => path.join(app.getPath('documents'), 'Decoraciones Toy Story');
const dataDir = () => readCfg().dataDir || defaultDir();
const P = (...a) => path.join(dataDir(), ...a);
const sub = tag => (tag === 'sin fondo' ? 'sin-fondo' : 'originales');

async function ensure() { for (const d of ['imagenes/originales', 'imagenes/sin-fondo', 'datos', 'disenos']) await fsp.mkdir(P(...d.split('/')), { recursive: true }); }
const exists = async f => { try { await fsp.access(f); return true; } catch (e) { return false; } };
async function readJson(f, def) { try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch (e) { return def; } }
async function writeJson(f, v) { const t = f + '.tmp'; await fsp.writeFile(t, JSON.stringify(v)); await fsp.rename(t, f); }
const clean = s => (String(s || 'imagen').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'imagen');
const extOf = t => ((t || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
const safeId = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '');

const idxFile = () => P('datos', 'imagenes.json');
const readIdx = async () => { await ensure(); return readJson(idxFile(), []); };

const ops = {
  'cfg.get': async () => ({ dataDir: dataDir(), isDefault: !readCfg().dataDir, electron: true, version: currentVersion() }),
  'cfg.open': async () => { await ensure(); await shell.openPath(dataDir()); return true; },
  'cfg.choose': async (_, e) => {
    const win = BrowserWindow.getFocusedWindow();
    const r = await dialog.showOpenDialog(win, { title: 'Elige la carpeta donde guardar tus imágenes y diseños', properties: ['openDirectory', 'createDirectory'], defaultPath: dataDir() });
    if (r.canceled || !r.filePaths[0]) return { canceled: true, dataDir: dataDir() };
    const nueva = r.filePaths[0], vieja = dataDir();
    if (path.resolve(nueva) === path.resolve(vieja)) return { canceled: false, dataDir: nueva, copied: false };
    let copied = false;
    if (await exists(P('datos')) || await exists(P('disenos'))) {
      const m = await dialog.showMessageBox(win, { type: 'question', buttons: ['Copiar lo que ya tengo', 'Empezar vacía', 'Cancelar'], defaultId: 0, cancelId: 2, message: 'Vas a cambiar la carpeta de datos.', detail: 'Puedo copiar a la nueva carpeta lo que ya has guardado (imágenes y diseños). La carpeta anterior no se borra.' });
      if (m.response === 2) return { canceled: true, dataDir: vieja };
      if (m.response === 0) { for (const d of ['imagenes', 'datos', 'disenos']) if (await exists(path.join(vieja, d))) await fsp.cp(path.join(vieja, d), path.join(nueva, d), { recursive: true, force: false, errorOnExist: false }); copied = true; }
    }
    const c = readCfg(); c.dataDir = nueva; writeCfg(c); await ensure();
    return { canceled: false, dataDir: nueva, copied };
  },
  'cfg.reset': async () => { const c = readCfg(); delete c.dataDir; writeCfg(c); await ensure(); return { dataDir: dataDir() }; },

  // ---- galería de imágenes ----
  'img.list': async () => (await readIdx()).sort((a, b) => b.created - a.created),
  'img.add': async (_, { meta, bytes }) => {
    await ensure(); const idx = await readIdx(); const dir = P('imagenes', sub(meta.tag));
    const base = clean(meta.name), ext = extOf(meta.type); let fn = base + '.' + ext, n = 2;
    while (await exists(path.join(dir, fn))) fn = base + '-' + (n++) + '.' + ext;
    await fsp.writeFile(path.join(dir, fn), Buffer.from(bytes));
    idx.push({ ...meta, file: sub(meta.tag) + '/' + fn }); await writeJson(idxFile(), idx); return meta.id;
  },
  'img.get': async (_, id) => { const m = (await readIdx()).find(i => i.id === id); if (!m) return null; try { return { meta: m, bytes: new Uint8Array(await fsp.readFile(P('imagenes', m.file))) }; } catch (e) { return null; } },
  'img.remove': async (_, id) => { // se quita de la galería; el archivo va a la papelera
    const idx = await readIdx(), m = idx.find(i => i.id === id); await writeJson(idxFile(), idx.filter(i => i.id !== id));
    if (m) { try { await shell.trashItem(P('imagenes', m.file)); } catch (e) { } } return true;
  },

  // ---- diseños (historial) ----
  'proj.save': async (_, rec) => {
    await ensure(); const id = safeId(rec.id), f = P('disenos', id + '.json'), bdir = P('disenos', id);
    const old = await readJson(f, null); const desc = {};
    if (rec.blobs && Object.keys(rec.blobs).length) { await fsp.mkdir(bdir, { recursive: true }); }
    for (const [k, b] of Object.entries(rec.blobs || {})) { const fn = safeId(k) + '.' + extOf(b.type); await fsp.writeFile(path.join(bdir, fn), Buffer.from(b.bytes)); desc[k] = { file: fn, type: b.type }; }
    if (old && old.blobs) for (const [k, d] of Object.entries(old.blobs)) if (!desc[k]) { try { await fsp.rm(path.join(bdir, d.file), { force: true }); } catch (e) { } }
    await writeJson(f, { ...rec, id, blobs: desc, created: (old && old.created) || rec.created });
    return id;
  },
  'proj.list': async (_, tool) => {
    await ensure(); const out = [];
    for (const n of await fsp.readdir(P('disenos'))) { if (!n.endsWith('.json')) continue; const r = await readJson(P('disenos', n), null); if (r && (!tool || r.tool === tool)) out.push(r); }
    return out.sort((a, b) => b.updated - a.updated);
  },
  'proj.get': async (_, id) => {
    id = safeId(id); const r = await readJson(P('disenos', id + '.json'), null); if (!r) return null; const blobs = {};
    for (const [k, d] of Object.entries(r.blobs || {})) { try { blobs[k] = { type: d.type, bytes: new Uint8Array(await fsp.readFile(P('disenos', id, d.file))) }; } catch (e) { } }
    return { ...r, blobs };
  },
  'proj.remove': async (_, id) => { id = safeId(id); await fsp.rm(P('disenos', id + '.json'), { force: true }); await fsp.rm(P('disenos', id), { recursive: true, force: true }); return true; }
};

// ---------- Actualizaciones desde GitHub (Releases) ----------
const REPO = ((require('./package.json').repository || {}).url || '').replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '');
const gh = (url, extra = {}) => fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'decoraciones-toy-story', Accept: 'application/vnd.github+json', ...extra } });
const semver = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const currentVersion = () => process.env.TS_FAKE_VERSION || app.getVersion();
function pickAsset(assets) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const want = process.platform === 'darwin' ? a => a.name.endsWith('.dmg') && a.name.includes('mac-' + arch) : process.platform === 'win32' ? a => a.name.endsWith('.exe') && a.name.includes('win-x64') : () => false;
  return (assets || []).find(want) || null;
}
Object.assign(ops, {
  'upd.check': async () => {
    const current = currentVersion();
    try {
      const r = await gh(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (r.status === 404) return { ok: false, current, error: 'No se encuentra ninguna versión publicada todavía.' };
      if (r.status === 403 || r.status === 429) return { ok: false, current, error: 'GitHub ha limitado las consultas por ahora. Inténtalo de nuevo dentro de un rato.' };
      if (!r.ok) return { ok: false, current, error: 'GitHub respondió con el error ' + r.status + '.' };
      const j = await r.json(), asset = pickAsset(j.assets), latest = String(j.tag_name).replace(/^v/, '');
      return { ok: true, current, latest, hasUpdate: newer(latest, current), notes: j.body || '', asset: asset && { name: asset.name, size: asset.size, url: asset.url, digest: asset.digest || '' }, page: j.html_url };
    } catch (e) { return { ok: false, current, error: 'No se pudo conectar con GitHub (¿hay internet?).' }; }
  },
  'upd.download': async (e, { url, name, size, digest, open = true }) => {
    const https = require('https'), crypto = require('crypto');
    const headers = { 'User-Agent': 'decoraciones-toy-story', Accept: 'application/octet-stream' };
    // Descarga con el módulo https (siguiendo redirecciones) y calcula la huella SHA-256 al vuelo.
    const fetchTo = (u, dest, onProgress, hops = 0) => new Promise((resolve, reject) => {
      const req = https.get(u, { headers }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume(); if (hops > 6) return reject(new Error('demasiadas redirecciones'));
          return resolve(fetchTo(new URL(res.headers.location, u).toString(), dest, onProgress, hops + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('GitHub respondió ' + res.statusCode + ' al descargar.')); }
        const total = Number(res.headers['content-length']) || 0, hash = crypto.createHash('sha256'), out = fs.createWriteStream(dest); let got = 0, last = 0;
        res.on('data', c => { hash.update(c); got += c.length; const now = Date.now(); if (now - last > 250) { last = now; onProgress(got, total); } });
        res.on('error', reject); out.on('error', reject);
        out.on('finish', () => { onProgress(got, total || got); resolve({ sha: hash.digest('hex'), got }); });
        res.pipe(out);
      });
      req.on('error', reject);
    });
    const base = String(name).replace(/[^\w.\- ]+/g, '_'); let file = path.join(app.getPath('downloads'), base), n = 2;
    while (await exists(file)) file = path.join(app.getPath('downloads'), base.replace(/(\.[^.]+)$/, `-${n++}$1`));
    const part = file + '.part', want = String(digest || '').replace(/^sha256:/, '');
    let ok = false, lastErr = null;
    for (let intento = 1; intento <= 2 && !ok; intento++) {
      try {
        const r = await fetchTo(url, part, (got, total) => e.sender.send('ts:progress', { got, total }));
        if ((want && r.sha !== want) || (size && r.got !== size)) { lastErr = new Error('La descarga llegó incompleta o dañada.'); await fsp.rm(part, { force: true }); continue; }
        ok = true;
      } catch (err) { lastErr = err; await fsp.rm(part, { force: true }); }
    }
    if (!ok) throw lastErr || new Error('No se pudo descargar.');
    await fsp.rename(part, file);
    if (open) { const msg = await shell.openPath(file); if (msg) return { file, openError: msg }; }
    return { file };
  }
});
ipcMain.handle('ts', async (e, op, arg) => { if (!ops[op]) throw new Error('operación desconocida: ' + op); return ops[op](e, arg); });

// ---------- Ventana ----------
function createWindow() {
  const win = new BrowserWindow({ width: 1360, height: 900, minWidth: 900, minHeight: 640, title: 'Decoraciones Toy Story', backgroundColor: '#5b9be0', icon: path.join(ROOT, 'build', 'icon.png'), webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL('app://local/decoraciones-toy-story.html');
  return win;
}

app.whenReady().then(async () => {
  protocol.handle('app', async req => {
    try {
      let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || p === '') p = '/decoraciones-toy-story.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT + path.sep) || file.includes(path.sep + 'node_modules' + path.sep)) return new Response('No permitido', { status: 403 });
      const buf = await fsp.readFile(file);
      return new Response(buf, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch (e) { return new Response('No encontrado', { status: 404 }); }
  });
  if (process.platform === 'darwin' && app.dock) { try { app.dock.setIcon(path.join(ROOT, 'build', 'icon.png')); } catch (e) { } }
  await ensure().catch(() => { });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Archivo', submenu: [{ label: 'Inicio', accelerator: 'CmdOrCtrl+Home', click: () => BrowserWindow.getFocusedWindow()?.loadURL('app://local/decoraciones-toy-story.html') }, { label: 'Abrir carpeta de datos', click: () => ops['cfg.open']() }, { type: 'separator' }, process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recargar' }, { role: 'forceReload', label: 'Recargar sin caché' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ]));
  const win = createWindow();
  if (process.env.TS_SELFTEST) require('./selftest.js')(win, ops, app);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
