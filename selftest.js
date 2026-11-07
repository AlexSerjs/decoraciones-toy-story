// Pruebas automáticas dentro de Electron (npm run prueba). Usa una carpeta temporal.
const path = require('path'), fs = require('fs');
module.exports = (win, ops, app) => {
  const wc = win.webContents, out = []; const log = (k, v) => { out.push([k, v]); console.log('TEST', k, JSON.stringify(v)); };
  const js = code => wc.executeJavaScript(code, true);
  const load = url => new Promise(res => { wc.once('did-finish-load', res); win.loadURL(url); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    try {
      await new Promise(r => wc.once('did-finish-load', r)); await sleep(500);
      log('origen', await js('location.origin + " electron=" + Galeria.electron'));
      // 1) galería + diseños por archivos
      const r1 = await js(`(async()=>{
        const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle='#e3202a';x.fillRect(0,0,80,60);
        const blob=await new Promise(r=>c.toBlob(r,'image/png'));
        const id=await Galeria.add({blob,name:'prueba roja',tag:'original',sig:'t1'}); const id2=await Galeria.add({blob,name:'prueba roja',tag:'original',sig:'t1'});
        const id3=await Galeria.add({blob,name:'prueba roja (sin fondo)',tag:'sin fondo',sig:'t2'});
        const l=await Galeria.list(); const g=await Galeria.get(id);
        const pid=await Galeria.saveProject({tool:'circulo',name:'Mi diseño',summary:'s',data:{a:1},blobs:{img:blob},thumb:'',saved:true});
        const pl=await Galeria.listProjects('circulo'); const pg=await Galeria.getProject(pid);
        return {dup:id===id2, total:l.length, tags:l.map(i=>i.tag+':'+i.file).sort(), blobBytes:g.blob.size, tipo:g.blob.type, proyectos:pl.length, guardado:pl[0].saved, pBlob:pg.blobs.img.size, pData:pg.data.a};
      })()`);
      log('galeria+diseños', r1);
      const base = path.join(require('os').tmpdir(), 'ts-selftest', 'datos');
      log('archivos', { originales: fs.readdirSync(path.join(base, 'imagenes/originales')), sinFondo: fs.readdirSync(path.join(base, 'imagenes/sin-fondo')), disenos: fs.readdirSync(path.join(base, 'disenos')) });
      // 2) copia de seguridad: exportar, borrar e importar
      const r2 = await js(`(async()=>{ const b=await Galeria.exportAll(); const n0=(await Galeria.list()).length; for(const i of await Galeria.list()) await Galeria.remove(i.id); for(const p of await Galeria.listProjects()) await Galeria.removeProject(p.id);
        const vacio=(await Galeria.list()).length+'/'+(await Galeria.listProjects()).length; const f=new File([b],'c.json'); const r=await Galeria.importAll(f); return {antes:n0, vacio, importado:r, ahora:(await Galeria.list()).length+'/'+(await Galeria.listProjects()).length, kb:Math.round(b.size/1024)}; })()`);
      log('copia de seguridad', r2);
      // 3) herramienta de círculos: guarda solo el borrador en archivos
      await load('app://local/decoracion-circulo.html'); await sleep(800);
      await js(`(async()=>{ const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');x.fillStyle='#1b6fe0';x.fillRect(0,0,300,300);
        const blob=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'azul.png',{type:'image/png',lastModified:7}));
        const i=document.getElementById('imgFile'); i.files=dt.files; i.dispatchEvent(new Event('change')); })()`);
      await sleep(3500);
      log('borrador del círculo', await js(`Galeria.listProjects('circulo').then(l=>l.map(p=>p.name+'|'+p.summary))`));
      log('hub', await (async () => { await load('app://local/decoraciones-toy-story.html'); await sleep(1200); return js(`[...document.querySelectorAll('details.grp summary span:first-child')].map(s=>s.textContent)`); })());
      // 4) quitar fondo con la IA guardada (modelo en ia-modelo/ servido por app://)
      await load('app://local/decoracion-imagenes.html'); await sleep(800);
      await js(`(async()=>{ const c=document.createElement('canvas');c.width=700;c.height=800;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,800);g.addColorStop(0,'#3d7fd1');g.addColorStop(1,'#a9cdf5');x.fillStyle=g;x.fillRect(0,0,700,800);
        x.fillStyle='#b5651d';x.beginPath();x.ellipse(350,420,170,250,0,0,7);x.fill();x.fillStyle='#f2c49b';x.beginPath();x.arc(350,330,110,0,7);x.fill();x.fillStyle='#e3202a';x.fillRect(250,480,200,160);
        const blob=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'foto.png',{type:'image/png',lastModified:9}));
        const i=document.getElementById('imgFile'); i.files=dt.files; i.dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,800)); document.getElementById('bRemove').click(); })()`);
      const t0 = Date.now(); let ia = null;
      while (Date.now() - t0 < 90000) { await sleep(1500); ia = await js(`(()=>{const w=document.getElementById('bgWarn'); return {oculto:w.hidden, texto:w.textContent.slice(0,200), dim:document.getElementById('srcDim').textContent};})()`); if (ia.oculto || /No se pudo/.test(ia.texto)) break; }
      log('quitar fondo IA', { ...ia, segundos: Math.round((Date.now() - t0) / 1000) });
      log('esquina transparente', await js(`document.getElementById('src').getContext('2d').getImageData(2,2,1,1).data[3]`));
      await load('app://local/ajustes.html'); await sleep(800);
      log('ajustes: carpeta', await js(`({app:!document.getElementById('dirApp').hidden, web:!document.getElementById('dirWeb').hidden, ruta:document.getElementById('dirPath').textContent})`));
      log('ajustes: tarjeta actualizar', await js(`!document.getElementById('updCard').hidden`));
      // vista previa de la hoja en etiquetas de botella
      await load('app://local/etiquetas-botella.html'); await sleep(4500);
      log('hoja A4 etiquetas', await js(`(()=>{const c=document.getElementById('sheetPrev'),x=c.getContext('2d'); const px=(a,b)=>Array.from(x.getImageData(a,b,1,1).data).join(','); return {tam:c.width+'x'+c.height, margenBlanco:px(10,10), etiqueta1:px(400,45), etiqueta4:px(400,40+3*150)};})()`));
      // actualizaciones contra GitHub (repositorio público, sin token)
      const chk = await ops['upd.check'](); log('actualizar', { ok: chk.ok, actual: chk.current, ultima: chk.latest, hayNueva: chk.hasUpdate, instalador: chk.asset && chk.asset.name, error: chk.error });
      if (chk.ok && chk.asset && process.env.TS_TEST_DOWNLOAD) {
        const tmp = path.join(require('os').tmpdir(), 'ts-selftest', 'descargas'); fs.mkdirSync(tmp, { recursive: true }); app.setPath('downloads', tmp);
        const d = await ops['upd.download']({ sender: wc }, { url: chk.asset.url, name: chk.asset.name, open: false });
        log('descarga', { archivo: path.basename(d.file), mb: Math.round(fs.statSync(d.file).size / 1048576), coincide: fs.statSync(d.file).size === chk.asset.size });
      }
    } catch (e) { log('ERROR', String(e && e.stack || e)); }
    app.exit(0);
  })();
};
