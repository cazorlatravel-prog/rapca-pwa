// --- Comparador de Fotos ---
var compModo='slider';

function initComparador(){
  var rs=getRegistros();
  var unidades={};
  rs.forEach(function(r){if(r.unidad)unidades[r.unidad]=true;});
  var sel=document.getElementById('comp-unidad');
  if(sel){
    var h='<option value="">Selecciona Unidad</option>';
    Object.keys(unidades).sort().forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
    sel.innerHTML=h;
  }
}

function cargarFechasComparador(){
  var unidad=document.getElementById('comp-unidad').value;
  var sel1=document.getElementById('comp-fecha1');
  var sel2=document.getElementById('comp-fecha2');
  sel1.innerHTML='<option value="">Fecha A</option>';
  sel2.innerHTML='<option value="">Fecha B</option>';
  document.getElementById('compResult').innerHTML='';
  if(!unidad)return;

  var rs=getRegistros().filter(function(r){return r.unidad===unidad;});
  var fechas={};
  rs.forEach(function(r){
    var key=r.fecha+'_'+r.tipo+(r.transecto?'_'+r.transecto:'');
    if(!fechas[key])fechas[key]={fecha:r.fecha,tipo:r.tipo,transecto:r.transecto||'',id:r.id};
  });

  var lista=Object.keys(fechas).sort();
  lista.forEach(function(k){
    var f=fechas[k];
    var label=f.fecha+' ('+f.tipo+(f.transecto?' '+f.transecto:'')+')';
    sel1.innerHTML+='<option value="'+f.id+'">'+label+'</option>';
    sel2.innerHTML+='<option value="'+f.id+'">'+label+'</option>';
  });
}

function cargarFotosComparador(){
  var id1=parseInt(document.getElementById('comp-fecha1').value);
  var id2=parseInt(document.getElementById('comp-fecha2').value);
  if(!id1||!id2){document.getElementById('compResult').innerHTML='<p style="text-align:center;color:#888;padding:20px">Selecciona dos fechas para comparar</p>';return;}

  var rs=getRegistros();
  var r1=rs.find(function(x){return x.id===id1;});
  var r2=rs.find(function(x){return x.id===id2;});
  if(!r1||!r2)return;

  var fotos1=obtenerFotosCodigos(r1);
  var fotos2=obtenerFotosCodigos(r2);

  if(fotos1.length===0&&fotos2.length===0){
    document.getElementById('compResult').innerHTML='<p style="text-align:center;color:#888;padding:20px">No hay fotos para comparar</p>';
    return;
  }

  if(compModo==='slider')renderSlider(fotos1,fotos2,r1,r2);
  else renderSideBySide(fotos1,fotos2,r1,r2);
}

function obtenerFotosCodigos(r){
  var fotos=[];
  var d=r.datos||{};
  if(d.fotos)d.fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){fotos.push(c);});
  if(d.fotosComp)d.fotosComp.forEach(function(fc){if(fc.numero)fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){fotos.push(c);});});
  return fotos;
}

function setModoComparador(modo){
  compModo=modo;
  document.querySelectorAll('.comp-mode button').forEach(function(b,i){
    b.classList.toggle('active',(modo==='slider'&&i===0)||(modo==='side'&&i===1));
  });
  cargarFotosComparador();
}

function renderSideBySide(fotos1,fotos2,r1,r2){
  var el=document.getElementById('compResult');
  var maxPairs=Math.max(fotos1.length,fotos2.length);
  var h='';
  for(var i=0;i<maxPairs;i++){
    var c1=fotos1[i]||null;
    var c2=fotos2[i]||null;
    var src1=c1?fotosCacheMemoria[c1]||'':'';
    var src2=c2?fotosCacheMemoria[c2]||'':'';
    h+='<div class="comp-side" style="margin-bottom:12px">';
    h+='<div class="comp-img-box">';
    if(src1)h+='<img src="'+src1+'">';
    else h+='<div style="aspect-ratio:3/4;background:#e0e0e0;display:flex;align-items:center;justify-content:center;color:#999">📷 Sin foto</div>';
    h+='<div class="comp-label">'+r1.fecha+' '+(c1||'--')+'</div></div>';
    h+='<div class="comp-img-box">';
    if(src2)h+='<img src="'+src2+'">';
    else h+='<div style="aspect-ratio:3/4;background:#e0e0e0;display:flex;align-items:center;justify-content:center;color:#999">📷 Sin foto</div>';
    h+='<div class="comp-label">'+r2.fecha+' '+(c2||'--')+'</div></div>';
    h+='</div>';
  }
  el.innerHTML=h;
}

function renderSlider(fotos1,fotos2,r1,r2){
  var el=document.getElementById('compResult');
  var c1=fotos1[0]||null;
  var c2=fotos2[0]||null;
  var src1=c1?fotosCacheMemoria[c1]||'':'';
  var src2=c2?fotosCacheMemoria[c2]||'':'';

  if(!src1&&!src2){
    el.innerHTML='<p style="text-align:center;color:#888;padding:20px">No hay fotos con thumbnails disponibles</p>';
    return;
  }

  // Selector de foto si hay múltiples
  var h='';
  if(fotos1.length>1||fotos2.length>1){
    h+='<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">';
    h+='<select id="comp-foto-idx" onchange="cambiarFotoSlider()" style="flex:1;padding:8px;border:2px solid #ddd;border-radius:8px;font-size:.85rem">';
    var maxF=Math.max(fotos1.length,fotos2.length);
    for(var i=0;i<maxF;i++){
      h+='<option value="'+i+'">Foto '+(i+1)+': '+(fotos1[i]||'--')+' vs '+(fotos2[i]||'--')+'</option>';
    }
    h+='</select></div>';
  }

  h+='<div class="comp-area" id="compSliderArea" style="position:relative">';
  h+='<div style="position:relative;width:100%">';
  // Imagen B (fondo completo)
  if(src2)h+='<img src="'+src2+'" style="width:100%;display:block" id="compImgB">';
  else h+='<div style="aspect-ratio:3/4;background:#e0e0e0" id="compImgB"></div>';
  // Imagen A (recortada por clip-path)
  h+='<div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden" id="compClipWrap">';
  if(src1)h+='<img src="'+src1+'" style="width:100%;display:block" id="compImgA">';
  h+='</div>';
  // Línea slider
  h+='<div class="comp-slider-line" id="compSliderLine" style="left:50%"><div class="comp-slider-handle">⟷</div></div>';
  h+='</div></div>';
  // Labels
  h+='<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.75rem;font-weight:bold;color:#1a3d2e">';
  h+='<span>◀ '+r1.fecha+'</span><span>'+r2.fecha+' ▶</span></div>';

  el.innerHTML=h;

  // Guardar refs para selector
  el.dataset.fotos1=JSON.stringify(fotos1);
  el.dataset.fotos2=JSON.stringify(fotos2);
  el.dataset.r1=JSON.stringify({fecha:r1.fecha});
  el.dataset.r2=JSON.stringify({fecha:r2.fecha});

  initSliderEvents();
  actualizarClipSlider(50);
}

function cambiarFotoSlider(){
  var idx=parseInt(document.getElementById('comp-foto-idx').value)||0;
  var el=document.getElementById('compResult');
  var fotos1=JSON.parse(el.dataset.fotos1||'[]');
  var fotos2=JSON.parse(el.dataset.fotos2||'[]');
  var c1=fotos1[idx]||null;
  var c2=fotos2[idx]||null;
  var imgA=document.getElementById('compImgA');
  var imgB=document.getElementById('compImgB');
  if(imgA&&c1)imgA.src=fotosCacheMemoria[c1]||'';
  if(imgB&&c2)imgB.src=fotosCacheMemoria[c2]||'';
  actualizarClipSlider(50);
}

function initSliderEvents(){
  var area=document.getElementById('compSliderArea');
  if(!area)return;
  var dragging=false;

  function handleMove(clientX){
    var rect=area.getBoundingClientRect();
    var pct=Math.max(0,Math.min(100,((clientX-rect.left)/rect.width)*100));
    actualizarClipSlider(pct);
  }

  area.addEventListener('mousedown',function(e){dragging=true;handleMove(e.clientX);e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(dragging)handleMove(e.clientX);});
  document.addEventListener('mouseup',function(){dragging=false;});

  area.addEventListener('touchstart',function(e){dragging=true;handleMove(e.touches[0].clientX);},{passive:true});
  area.addEventListener('touchmove',function(e){if(dragging){handleMove(e.touches[0].clientX);e.preventDefault();}},{passive:false});
  area.addEventListener('touchend',function(){dragging=false;});
}

function actualizarClipSlider(pct){
  var clip=document.getElementById('compClipWrap');
  var line=document.getElementById('compSliderLine');
  if(clip)clip.style.clipPath='inset(0 '+(100-pct)+'% 0 0)';
  if(line)line.style.left=pct+'%';
}
