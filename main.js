const refs = document.getElementById('refs');
const material = document.getElementById('material');
const refNames = document.getElementById('refNames');
const matName = document.getElementById('matName');
const run = document.getElementById('run');
const status = document.getElementById('status');
const result = document.getElementById('result');
const output = document.getElementById('output');
const progress = document.getElementById('progress');
const bar = document.getElementById('bar');

refs.onchange = () => refNames.textContent = refs.files.length ? [...refs.files].map(f=>f.name).join(', ') : 'No files selected';
material.onchange = () => matName.textContent = material.files[0]?.name || 'No file selected';

function esc(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function render(data){
  result.style.display='block';
  const issues = Array.isArray(data.issues) ? data.issues : [];
  if(!issues.length){
    output.innerHTML = '<div class="ok">✓ No confirmed technical specification errors found.</div>';
    return;
  }
  output.innerHTML = `
    <div class="errtitle"><h2 style="margin:0">Confirmed Issues</h2><span class="badge">${issues.length} confirmed error${issues.length>1?'s':''}</span></div>
    <table>
      <thead><tr><th>Location</th><th>Exact visible evidence</th><th>Why incorrect</th><th>What it should be</th></tr></thead>
      <tbody>${issues.map(x=>`<tr><td>${esc(x.location)}</td><td><b>${esc(x.evidence)}</b></td><td>${esc(x.why_incorrect)}</td><td>${esc(x.should_be)}</td></tr>`).join('')}</tbody>
    </table>`;
}

async function uploadOne(file, idx, total){
  status.textContent = `Preparing ${idx}/${total}: ${file.name}`;

  const metaResp = await fetch('/api/upload', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size
    })
  });

  const metaRaw = await metaResp.text();
  let meta;
  try { meta = JSON.parse(metaRaw); }
  catch { throw new Error(metaRaw.slice(0,300) || `Upload setup failed (${metaResp.status})`); }

  if (!metaResp.ok) throw new Error(meta.error || 'Could not prepare upload.');

  status.textContent = `Uploading ${idx}/${total}: ${file.name}`;

  const putResp = await fetch(meta.presignedUrl, {
    method: 'PUT',
    headers: {'Content-Type': file.type || 'application/octet-stream'},
    body: file
  });

  if (!putResp.ok) {
    const t = await putResp.text();
    throw new Error(`Upload failed for ${file.name}: ${t.slice(0,200) || putResp.status}`);
  }

  const base = idx / total;
  bar.style.width = `${Math.round(base * 70)}%`;

  return {
    pathname: meta.pathname,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size
  };
}

run.onclick = async () => {
  if(!refs.files.length){ alert('Please upload at least one reference document.'); return; }
  if(!material.files.length){ alert('Please upload a material to review.'); return; }

  run.disabled = true;
  result.style.display = 'none';
  progress.style.display = 'block';
  bar.style.width = '2%';

  try{
    const allFiles = [...refs.files, material.files[0]];
    const uploaded = [];
    for(let i=0;i<allFiles.length;i++){
      uploaded.push(await uploadOne(allFiles[i], i+1, allFiles.length));
    }

    bar.style.width='75%';
    status.textContent='Checking technical consistency...';

    const payload = {
      references: uploaded.slice(0, refs.files.length),
      material: uploaded[uploaded.length-1]
    };

    const resp = await fetch('/api/check',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });

    const raw = await resp.text();
    let data;
    try{ data = JSON.parse(raw); }
    catch{ throw new Error(raw.slice(0,300) || `Server error (${resp.status})`); }
    if(!resp.ok) throw new Error(data.error || 'Check failed');

    bar.style.width='100%';
    status.textContent='Done';
    render(data);
    result.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    status.textContent='';
    alert(e.message || String(e));
  }finally{
    run.disabled=false;
    setTimeout(()=>{progress.style.display='none';bar.style.width='0%';},700);
  }
};