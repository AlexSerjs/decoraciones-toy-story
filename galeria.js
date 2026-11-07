/* Galería compartida. Guarda las imágenes en este navegador y, si eliges una carpeta,
   también las copia ahí (originales/ y sin-fondo/) para poder subirlas a Git.
   Uso: Galeria.add({blob,name,tag,sig}) · Galeria.pick() · Galeria.manage() · Galeria.list() */
(function () {
  const DB = 'toystory-galeria', FS = !!window.showDirectoryPicker;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('imgs')) d.createObjectStore('imgs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('proj')) d.createObjectStore('proj', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), q = fn(t.objectStore(store));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  async function thumbOf(blob) {
    const im = await createImageBitmap(blob), k = Math.min(1, 240 / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return { thumb: c.toDataURL('image/png'), w: im.width, h: im.height };
  }
  // En el programa de escritorio (Electron) todo se guarda como archivos en la carpeta elegida en Ajustes.
  const EL = !!(window.ToyStory && window.ToyStory.call), TS = (op, arg) => window.ToyStory.call(op, arg);
  const bytesBlob = (bytes, type) => new Blob([bytes], { type: type || 'application/octet-stream' });
  const list = async () => EL ? ((await TS('img.list')) || []) : ((await run('imgs', 'readonly', s => s.getAll())) || []).sort((a, b) => b.created - a.created);
  const get = async id => {
    if (!EL) return run('imgs', 'readonly', s => s.get(id));
    const r = await TS('img.get', id); return r && Object.assign({}, r.meta, { blob: bytesBlob(r.bytes, r.meta.type || 'image/png') });
  };
  const remove = id => EL ? TS('img.remove', id) : run('imgs', 'readwrite', s => s.delete(id));
  const put = it => run('imgs', 'readwrite', s => s.put(it));

  // ---- Carpeta en disco ----
  const sd = tag => (tag === 'sin fondo' ? 'sin-fondo' : 'originales');
  const dirHandle = async () => { try { return (await run('meta', 'readonly', s => s.get('dir'))) || null; } catch (e) { return null; } };
  async function perm(h, ask) {
    if (!h) return false; const o = { mode: 'readwrite' };
    try { if ((await h.queryPermission(o)) === 'granted') return true; if (ask && (await h.requestPermission(o)) === 'granted') return true; } catch (e) { }
    return false;
  }
  async function status() { if (EL) return { supported: false, electron: true, has: false, connected: false }; const h = await dirHandle(); return { supported: FS, has: !!h, name: h && h.name, connected: h ? await perm(h, false) : false }; }
  async function exists(dir, fn) { try { await dir.getFileHandle(fn); return true; } catch (e) { return false; } }
  async function writeOut(h, it) {
    const sub = await h.getDirectoryHandle(sd(it.tag), { create: true });
    const ext = ((it.blob.type || 'image/png').split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
    const base = (it.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'imagen');
    let fn = base + '.' + ext, n = 2; while (await exists(sub, fn)) fn = base + '-' + (n++) + '.' + ext;
    const w = await (await sub.getFileHandle(fn, { create: true })).createWritable(); await w.write(it.blob); await w.close();
    it.file = sd(it.tag) + '/' + fn; await put(it);
  }
  async function sync(ask) { // exporta lo pendiente e importa lo que haya en la carpeta
    const h = await dirHandle(); if (!(await perm(h, ask))) return null;
    let out = 0, inn = 0;
    let items = await list();
    for (const it of items) if (!it.file) { try { await writeOut(h, it); out++; } catch (e) { console.warn(e); } }
    items = await list(); const known = new Set(items.map(i => i.file).filter(Boolean));
    for (const tag of ['original', 'sin fondo']) {
      let sub; try { sub = await h.getDirectoryHandle(sd(tag)); } catch (e) { continue; }
      for await (const e of sub.values()) {
        if (e.kind !== 'file' || !/\.(png|jpe?g|webp)$/i.test(e.name) || known.has(sd(tag) + '/' + e.name)) continue;
        const f = await e.getFile(), t = await thumbOf(f);
        await put({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: e.name.replace(/\.[^.]+$/, ''), tag, sig: 'd:' + sd(tag) + '/' + e.name, file: sd(tag) + '/' + e.name, blob: f, thumb: t.thumb, w: t.w, h: t.h, created: f.lastModified || Date.now() });
        inn++;
      }
    }
    return { out, inn };
  }
  async function chooseFolder() {
    const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'toystory-galeria' });
    await run('meta', 'readwrite', s => s.put(h, 'dir'));
    return sync(true);
  }

  async function add({ blob, name, tag, sig }) {
    try {
      if (sig) { const ex = (await list()).find(i => i.sig === sig); if (ex) return ex.id; }
      const t = await thumbOf(blob), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const it = { id, name: name || 'imagen', tag: tag || 'original', sig: sig || null, blob, thumb: t.thumb, w: t.w, h: t.h, created: Date.now() };
      if (EL) { const meta = { id, name: it.name, tag: it.tag, sig: it.sig, type: blob.type || 'image/png', thumb: t.thumb, w: t.w, h: t.h, created: it.created }; await TS('img.add', { meta, bytes: new Uint8Array(await blob.arrayBuffer()) }); return id; }
      await put(it);
      try { const h = await dirHandle(); if (h && (await perm(h, false))) await writeOut(h, it); } catch (e) { console.warn('No se pudo copiar a la carpeta', e); }
      return id;
    } catch (e) { console.warn('Galería no disponible', e); return null; }
  }

  function css() {
    if (document.getElementById('gal-css')) return;
    const s = document.createElement('style'); s.id = 'gal-css';
    s.textContent = `.gal-ov{position:fixed;inset:0;background:rgba(10,20,40,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;font:16px system-ui,sans-serif}
.gal-box{background:#fff;border-radius:14px;width:min(980px,100%);max-height:92vh;display:flex;flex-direction:column;color:#1d2733}
.gal-h,.gal-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #d9dfe7}
.gal-h b{font-size:1.1rem;margin-right:auto}
.gal-bar{background:#f3f5f8;font-size:.88rem}
.gal-bar span{flex:1 1 260px}
.gal-box button,.gal-box select,.gal-box label{min-height:40px;padding:6px 12px;border:1px solid #1b6fe0;background:#fff;color:#1b6fe0;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;display:inline-flex;align-items:center}
.gal-g{padding:14px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.gal-i{position:relative;border:2px solid #d9dfe7;border-radius:10px;padding:6px;cursor:pointer;background:#fff;text-align:left}
.gal-i:hover{border-color:#1b6fe0}
.gal-t{height:120px;border-radius:6px;background:repeating-conic-gradient(#e6e9ee 0 25%,#f7f8fa 0 50%) 0 0/14px 14px;display:flex;align-items:center;justify-content:center}
.gal-t img{max-width:100%;max-height:100%}
.gal-n{font-size:.8rem;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gal-m{font-size:.72rem;color:#667385}
.gal-box .gal-x{position:absolute;top:4px;right:4px;width:28px;min-height:28px;height:28px;padding:0;justify-content:center;border-radius:50%;border:none;background:#e3202a;color:#fff;font-weight:700}
.gal-e{padding:30px;text-align:center;color:#667385;grid-column:1/-1}`;
    document.head.appendChild(s);
  }

  // Panel. Si "choose" es true, al pulsar una imagen se devuelve; si no, se descarga.
  function open(choose) {
    css();
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'gal-ov';
      ov.innerHTML = `<div class="gal-box"><div class="gal-h"><b>Galería</b>
<select class="gal-f"><option value="">Todas</option><option value="original">Originales</option><option value="sin fondo">Sin fondo</option></select>
<label>Subir a la galería<input type="file" accept="image/*" multiple hidden></label><button class="gal-c">Cerrar</button></div>
<div class="gal-bar"><span class="gal-s"></span><button class="gal-dir"></button><button class="gal-re" hidden>Reconectar carpeta</button><button class="gal-sy" hidden>Sincronizar</button></div>
<div class="gal-g"></div></div>`;
      document.body.appendChild(ov);
      const q = s => ov.querySelector(s), grid = q('.gal-g'), fil = q('.gal-f');
      const close = v => { ov.remove(); resolve(v || null); };
      async function bar(msg) {
        if (EL) { const c = await TS('cfg.get'); q('.gal-dir').hidden = false; q('.gal-dir').textContent = 'Abrir carpeta'; q('.gal-re').hidden = true; q('.gal-sy').hidden = true; q('.gal-s').textContent = 'Todo se guarda en: ' + c.dataDir + ' (se cambia en ⚙ Ajustes).'; return; }
        const st = await status(), t = q('.gal-s');
        q('.gal-dir').hidden = !st.supported; q('.gal-re').hidden = !(st.has && !st.connected); q('.gal-sy').hidden = !st.connected;
        q('.gal-dir').textContent = st.has ? 'Cambiar carpeta' : 'Elegir carpeta';
        t.textContent = msg || (!st.supported ? 'Este navegador no permite elegir carpeta (usa Chrome o Edge). Las imágenes solo se guardan en el navegador.'
          : st.connected ? `Carpeta conectada: «${st.name}». Se copian en originales/ y sin-fondo/.`
          : st.has ? `La carpeta «${st.name}» necesita permiso: pulsa Reconectar.`
          : 'Sin carpeta: las imágenes solo están en este navegador. Elige una carpeta (por ejemplo «galeria» dentro de tu proyecto) para guardarlas ahí.');
      }
      const summary = r => r ? `Sincronizado: ${r.out} copiadas a la carpeta, ${r.inn} importadas de la carpeta.` : 'No se pudo acceder a la carpeta.';
      async function render() {
        const items = (await list()).filter(i => !fil.value || i.tag === fil.value);
        grid.innerHTML = items.length ? '' : '<div class="gal-e">Aún no hay imágenes guardadas. Se guardan solas al subirlas.</div>';
        items.forEach(it => {
          const d = document.createElement('div'); d.className = 'gal-i'; d.tabIndex = 0;
          d.innerHTML = `<div class="gal-t"><img alt=""></div><div class="gal-n"></div><div class="gal-m"></div><button class="gal-x" title="Borrar" aria-label="Borrar">×</button>`;
          d.querySelector('img').src = it.thumb; d.querySelector('.gal-n').textContent = it.name;
          d.querySelector('.gal-m').textContent = `${it.tag} · ${it.w}×${it.h}px${it.file ? ' · en carpeta' : ''}`;
          d.querySelector('.gal-x').onclick = async e => { e.stopPropagation(); if (confirm('¿Quitar "' + it.name + '" de la galería? (el archivo de la carpeta no se borra)')) { await remove(it.id); render(); } };
          const pickIt = async () => { const full = it.blob ? it : await get(it.id); if (!full) { alert('No se encuentra el archivo de esta imagen.'); return; }
            if (choose) close({ id: it.id, name: it.name, tag: it.tag, blob: full.blob }); else { const a = document.createElement('a'); a.href = URL.createObjectURL(full.blob); a.download = it.name.replace(/[^\w.\- ]+/g, '_') + '.png'; a.click(); } };
          d.onclick = pickIt; d.onkeydown = e => { if (e.key === 'Enter') pickIt(); };
          grid.appendChild(d);
        });
      }
      fil.onchange = render;
      q('.gal-c').onclick = () => close();
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      q('input').onchange = async e => {
        for (const f of e.target.files) await add({ blob: f, name: f.name, tag: 'original', sig: 'f:' + f.name + ':' + f.size + ':' + f.lastModified });
        render();
      };
      q('.gal-dir').onclick = async () => { if (EL) { TS('cfg.open'); return; } try { const r = await chooseFolder(); await bar(summary(r)); render(); } catch (e) { if (e.name !== 'AbortError') alert('No se pudo abrir la carpeta: ' + e.message); } };
      q('.gal-re').onclick = async () => { const r = await sync(true); await bar(r ? summary(r) : 'No se concedió el permiso.'); render(); };
      q('.gal-sy').onclick = async () => { const r = await sync(true); await bar(summary(r)); render(); };
      bar(); render();
    });
  }


  // ---- Historial de proyectos (estado de cada herramienta) ----
  async function saveProject(p) {
    const now = Date.now();
    const rec = { id: p.id || ('p' + now.toString(36) + Math.random().toString(36).slice(2, 5)), tool: p.tool, saved: !!p.saved, name: p.name || 'Sin nombre', summary: p.summary || '', data: p.data || {}, blobs: p.blobs || {}, thumb: p.thumb || '', created: now, updated: now };
    if (EL) {
      const blobs = {}; for (const [k, b] of Object.entries(rec.blobs || {})) if (b) blobs[k] = { type: b.type || 'application/octet-stream', bytes: new Uint8Array(await b.arrayBuffer()) };
      await TS('proj.save', { ...rec, blobs });
    } else {
      if (p.id) { const ex = await run('proj', 'readonly', s => s.get(p.id)); if (ex) rec.created = ex.created; }
      await run('proj', 'readwrite', s => s.put(rec));
    }
    if (!rec.saved) { // los borradores no crecen sin límite: se guardan los 30 más recientes de cada herramienta
      const drafts = (await listProjects(rec.tool)).filter(x => !x.saved);
      for (const old of drafts.slice(30)) await removeProject(old.id);
    }
    return rec.id;
  }
  const listProjects = async tool => EL ? ((await TS('proj.list', tool || null)) || []) : ((await run('proj', 'readonly', s => s.getAll())) || []).filter(p => !tool || p.tool === tool).sort((a, b) => b.updated - a.updated);
  const getProject = async id => {
    if (!EL) return run('proj', 'readonly', s => s.get(id));
    const r = await TS('proj.get', id); if (!r) return null; const blobs = {};
    for (const [k, b] of Object.entries(r.blobs || {})) blobs[k] = bytesBlob(b.bytes, b.type); return { ...r, blobs };
  };
  const removeProject = id => EL ? TS('proj.remove', id) : run('proj', 'readwrite', s => s.delete(id));

  // Guarda solo, tras cada cambio, el trabajo actual. collect() devuelve {name,summary,data,blobs,thumb} o null.
  function tracker(tool, collect) {
    let id = null, timer = null, last = null, named = null;
    const sigOf = p => JSON.stringify(p.data) + '|' + Object.entries(p.blobs || {}).map(([k, b]) => k + (b && b.size)).join(',');
    async function now(force) {
      try {
        const p = await collect(); if (!p) return null; const sg = sigOf(p) + '|' + (named || ''); if (!force && sg === last) return id;
        if (named) p.name = named; p.saved = !!named; p.tool = tool; p.id = id || undefined; id = await saveProject(p); last = sg; return id;
      } catch (e) { console.warn('Historial no disponible', e); return null; }
    }
    return {
      touch() { clearTimeout(timer); timer = setTimeout(now, 1500); },
      fork() { id = null; last = null; named = null; clearTimeout(timer); },
      async saveAs(name) { named = name; clearTimeout(timer); return now(true); },   // guarda con nombre (queda marcado ★)          // el siguiente guardado será un proyecto nuevo
      rebase() { id = null; named = null; clearTimeout(timer); setTimeout(async () => { try { const p = await collect(); last = p ? sigOf(p) + '|' : null; } catch (e) { } }, 700); } // tras abrir uno: no guardar hasta que lo cambies
    };
  }

  function history(tool) {
    css();
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'gal-ov';
      ov.innerHTML = `<div class="gal-box"><div class="gal-h"><b>Historial</b><select class="gal-f"><option value="">Todo</option><option value="1">Solo guardados ★</option></select><button class="gal-c">Cerrar</button></div>
<div class="gal-bar"><span>Pulsa «Guardar diseño» para darle nombre (★). Lo demás se guarda solo. Al abrir uno y modificarlo se crea una copia: el original no cambia.</span></div><div class="gal-g"></div></div>`;
      document.body.appendChild(ov);
      const grid = ov.querySelector('.gal-g'), fil = ov.querySelector('.gal-f'), close = v => { ov.remove(); resolve(v || null); };
      fil.onchange = () => render();
      async function render() {
        const items = (await listProjects(tool)).filter(p => !fil.value || p.saved);
        grid.innerHTML = items.length ? '' : '<div class="gal-e">Todavía no hay nada en el historial. Se guarda solo al trabajar.</div>';
        items.forEach(p => {
          const d = document.createElement('div'); d.className = 'gal-i'; d.tabIndex = 0;
          d.innerHTML = `<div class="gal-t"><img alt=""></div><div class="gal-n"></div><div class="gal-m"></div><div class="gal-m"></div><button class="gal-x" title="Borrar" aria-label="Borrar">×</button>`;
          if (p.thumb) d.querySelector('img').src = p.thumb;
          const [n, m1, m2] = d.querySelectorAll('.gal-n,.gal-m'); n.textContent = p.name; m1.textContent = p.summary; if (p.saved) n.textContent = '★ ' + p.name; m2.textContent = new Date(p.updated).toLocaleString();
          d.querySelector('.gal-x').onclick = async e => { e.stopPropagation(); if (confirm('¿Borrar "' + p.name + '" del historial?')) { await removeProject(p.id); render(); } };
          d.onclick = () => close(p); d.onkeydown = e => { if (e.key === 'Enter') close(p); };
          grid.appendChild(d);
        });
      }
      ov.querySelector('.gal-c').onclick = () => close();
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      render();
    });
  }


  // Pregunta un texto con una ventanita propia (prompt() no funciona en el programa de escritorio).
  function ask(msg, def) {
    css();
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'gal-ov';
      ov.innerHTML = `<div class="gal-box" style="width:min(460px,100%)"><div class="gal-h"><b></b></div><div style="padding:14px"><input class="gal-in" type="text" style="width:100%;min-height:44px;padding:6px 10px;border:1px solid #d9dfe7;border-radius:8px;font:inherit"></div><div class="gal-bar" style="justify-content:flex-end"><button class="gal-no">Cancelar</button><button class="gal-ok" style="background:#1b6fe0;color:#fff">Guardar</button></div></div>`;
      document.body.appendChild(ov); ov.querySelector('b').textContent = msg;
      const inp = ov.querySelector('.gal-in'); inp.value = def || ''; inp.focus(); inp.select();
      const end = v => { ov.remove(); res(v); };
      ov.querySelector('.gal-ok').onclick = () => end(inp.value); ov.querySelector('.gal-no').onclick = () => end(null);
      inp.onkeydown = e => { if (e.key === 'Enter') end(inp.value); if (e.key === 'Escape') end(null); };
    });
  }
  const toB64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1] || ''); f.readAsDataURL(blob); });
  const fromB64 = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  async function exportAll() { // todo lo guardado en un solo archivo (copia de seguridad / pasar del navegador al programa)
    const imgs = [], projs = [];
    for (const m of await list()) { const f = m.blob ? m : await get(m.id); if (!f) continue; const { blob, ...meta } = f; imgs.push({ ...meta, type: blob.type, data: await toB64(blob) }); }
    for (const m of await listProjects()) { const f = await getProject(m.id); if (!f) continue; const blobs = {}; for (const [k, b] of Object.entries(f.blobs || {})) blobs[k] = { type: b.type, data: await toB64(b) }; projs.push({ ...f, blobs }); }
    return new Blob([JSON.stringify({ v: 1, app: 'decoraciones-toy-story', imgs, projs })], { type: 'application/json' });
  }
  async function importAll(file) {
    const j = JSON.parse(await file.text()); if (j.app !== 'decoraciones-toy-story') throw new Error('Este archivo no es una copia de seguridad de la aplicación.');
    let ni = 0, np = 0;
    for (const it of j.imgs || []) { const before = (await list()).length; await add({ blob: fromB64(it.data, it.type), name: it.name, tag: it.tag, sig: it.sig || ('imp:' + it.id) }); if ((await list()).length > before) ni++; }
    for (const p of j.projs || []) { const blobs = {}; for (const [k, b] of Object.entries(p.blobs || {})) blobs[k] = fromB64(b.data, b.type); await saveProject({ ...p, blobs }); np++; }
    return { ni, np };
  }

  window.Galeria = { ask, exportAll, importAll, electron: EL, config: () => EL ? TS('cfg.get') : Promise.resolve({ electron: false }), chooseDataDir: () => TS('cfg.choose'), openDataDir: () => TS('cfg.open'), resetDataDir: () => TS('cfg.reset'), getProject, saveProject, listProjects, removeProject, tracker, history, add, list, get, remove, status, sync, pick: () => open(true), manage: () => open(false) };

  // ---- Menús desplegables (se abre uno solo): convierte las tarjetas del panel izquierdo ----
  function acordeon() {
    const panel = document.querySelector('.panel'); if (!panel || panel.dataset.acc) return; panel.dataset.acc = '1';
    if (!document.getElementById('acc-css')) {
      const st = document.createElement('style'); st.id = 'acc-css';
      st.textContent = `details.acc{background:#fff;border:1px solid #d9dfe7;border-radius:12px}
details.acc>summary{list-style:none;cursor:pointer;padding:14px;font-weight:700;display:flex;justify-content:space-between;align-items:center;min-height:52px;text-transform:uppercase;letter-spacing:.04em;font-size:.95rem;color:#44527a}
details.acc>summary::-webkit-details-marker{display:none}
details.acc>summary::after{content:"▾";color:#667385;transition:transform .15s}
details.acc[open]>summary::after{transform:rotate(180deg)}
details.acc[open]>summary{border-bottom:1px solid #d9dfe7;color:#1d2733}
details.acc>.in{padding:14px}`;
      document.head.appendChild(st);
    }
    const cards = [...panel.children].filter(c => c.classList.contains('card') && c.querySelector(':scope>h2'));
    const ds = cards.map((c, i) => {
      const h = c.querySelector(':scope>h2'), d = document.createElement('details'), sm = document.createElement('summary'), inn = document.createElement('div');
      d.className = 'acc'; sm.innerHTML = h.innerHTML; inn.className = 'in'; h.remove();
      while (c.firstChild) inn.appendChild(c.firstChild);
      d.append(sm, inn); if (i === 0) d.open = true; c.replaceWith(d); return d;
    });
    ds.forEach(d => d.addEventListener('toggle', () => { if (d.open) ds.forEach(o => { if (o !== d) o.open = false; }); }));
  }
  window.Galeria.acordeon = acordeon;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', acordeon); else acordeon();
})();
