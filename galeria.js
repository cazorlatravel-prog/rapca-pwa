// --- Galería de Fotos Cloudinary ---
var galeriaFotos=[];
var galeriaTotal=0;
var galeriaOffset=0;
var galeriaLimit=60;
var galeriaSeleccion=[]; // Para modo comparador manual: [{codigo,url}, ...]
var galeriaModo='galeria'; // 'galeria', 'comparar', 'comparativas'
var galeriaLbIndex=0;
var galeriaTab='galeria'; // 'galeria', 'comparativas', 'precache'
var galeriaCompDatos=[]; // Array temporal para onclick de comparativas

function initGaleria(){
  galeriaSeleccion=[];
  galeriaModo='galeria';
  actualizarBtnModoGaleria();
  var tab=galeriaTab||'galeria';
  if(tab==='galeria')cargarFotosGaleria(true);
  else if(tab==='comparativas')initComparativas();
  else if(tab==='precache')initPrecache();
}

function setGaleriaTab(tab){
  galeriaTab=tab;
  document.querySelectorAll('.gal-tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab===tab);});
  document.getElementById('gal-vista-galeria').style.display=tab==='galeria'?'block':'none';
  document.getElementById('gal-vista-comparativas').style.display=tab==='comparativas'?'block':'none';
  document.getElementById('gal-vista-precache').style.display=tab==='precache'?'block':'none';
  if(tab==='galeria')cargarFotosGaleria(true);
  else if(tab==='comparativas')initComparativas();
  else if(tab==='precache')initPrecache();
}

// =============================================
// TAB 1: GALERÍA GENERAL (código existente)
// =============================================

function cargarFotosGaleria(resetear){
  if(resetear){
    galeriaOffset=0;
    galeriaFotos=[];
  }
  var unidad=document.getElementById('gal-filtro-unidad')?document.getElementById('gal-filtro-unidad').value:'';
  var tipo=document.getElementById('gal-filtro-tipo')?document.getElementById('gal-filtro-tipo').value:'';
  var desde=document.getElementById('gal-filtro-desde')?document.getElementById('gal-filtro-desde').value:'';
  var hasta=document.getElementById('gal-filtro-hasta')?document.getElementById('gal-filtro-hasta').value:'';

  var body={action:'listar',limit:galeriaLimit,offset:galeriaOffset};
  if(unidad)body.unidad=unidad;
  if(tipo)body.tipo=tipo;
  if(desde)body.desde=desde;
  if(hasta)body.hasta=hasta;

  var el=document.getElementById('galeriaGrid');
  if(resetear&&el)el.innerHTML='<div class="gal-loading">Cargando fotos...</div>';

  fetch('galeria.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(function(r){return r.json();})
  .then(function(data){
    if(!data.ok){
      if(el)el.innerHTML='<div class="gal-empty">Error: '+(data.error||'No se pudieron cargar')+'</div>';
      return;
    }
    galeriaTotal=data.total;
    if(resetear)galeriaFotos=data.fotos;
    else galeriaFotos=galeriaFotos.concat(data.fotos);

    poblarFiltrosGaleria(data.unidades||[],data.tipos||[]);
    renderGaleria();
  })
  .catch(function(err){
    if(el)el.innerHTML='<div class="gal-empty">Sin conexión al servidor</div>';
  });
}

function poblarFiltrosGaleria(unidades,tipos){
  var selU=document.getElementById('gal-filtro-unidad');
  if(selU&&selU.options.length<=1){
    var h='<option value="">Todas las unidades</option>';
    unidades.forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
    selU.innerHTML=h;
  }
  var selT=document.getElementById('gal-filtro-tipo');
  if(selT&&selT.options.length<=1){
    var h='<option value="">Todos los tipos</option>';
    tipos.forEach(function(t){h+='<option value="'+t+'">'+t+'</option>';});
    selT.innerHTML=h;
  }
  // También poblar selector de comparativas y precache
  var selComp=document.getElementById('gal-comp-unidad');
  if(selComp&&selComp.options.length<=1){
    var h='<option value="">Selecciona unidad</option>';
    unidades.forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
    selComp.innerHTML=h;
  }
  var selPre=document.getElementById('gal-precache-unidad');
  if(selPre&&selPre.options.length<=1){
    var h='<option value="">Selecciona unidad</option>';
    unidades.forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
    selPre.innerHTML=h;
  }
  var info=document.getElementById('gal-info');
  if(info)info.textContent=galeriaTotal+' fotos en Cloudinary';
}

function renderGaleria(){
  var el=document.getElementById('galeriaGrid');
  if(!el)return;

  if(galeriaFotos.length===0){
    el.innerHTML='<div class="gal-empty">No hay fotos con los filtros seleccionados</div>';
    return;
  }

  var h='';
  var grupos={};
  galeriaFotos.forEach(function(f){
    var key=f.unidad||'Sin unidad';
    if(!grupos[key])grupos[key]=[];
    grupos[key].push(f);
  });

  var unidades=Object.keys(grupos).sort();
  unidades.forEach(function(unidad){
    var fotos=grupos[unidad];
    h+='<div class="gal-grupo">';
    h+='<div class="gal-grupo-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
    h+='<span>'+unidad+' <span class="gal-grupo-count">'+fotos.length+' fotos</span></span>';
    h+='<span class="gal-grupo-arrow">▼</span>';
    h+='</div>';
    h+='<div class="gal-grupo-grid">';
    fotos.forEach(function(f,idx){
      var globalIdx=galeriaFotos.indexOf(f);
      var thumbUrl=transformarURLCloudinary(f.cloudinary_url,'w_300,h_400,c_fill,q_auto:low');
      var selected=galeriaSeleccion.findIndex(function(s){return s.codigo===f.codigo;})!==-1;
      var tipoBg=f.tipo==='VP'?'#88d8b0':f.tipo==='EL'?'#2ecc71':'#fd9853';
      h+='<div class="gal-thumb'+(selected?' gal-selected':'')+'" data-idx="'+globalIdx+'" onclick="clickFotoGaleria('+globalIdx+',event)">';
      h+='<img src="'+thumbUrl+'" alt="'+f.codigo+'" loading="lazy">';
      h+='<div class="gal-thumb-info">';
      h+='<span class="gal-thumb-code">'+f.codigo+'</span>';
      h+='<span class="gal-thumb-tipo" style="background:'+tipoBg+'">'+f.tipo+'</span>';
      h+='</div>';
      if(galeriaModo==='comparar'){
        var selIdx=galeriaSeleccion.findIndex(function(s){return s.codigo===f.codigo;});
        if(selIdx!==-1){
          h+='<div class="gal-check">'+String.fromCharCode(9312+selIdx)+'</div>';
        }else{
          h+='<div class="gal-check-empty"></div>';
        }
      }
      h+='</div>';
    });
    h+='</div></div>';
  });

  if(galeriaFotos.length<galeriaTotal){
    h+='<div style="text-align:center;padding:16px"><button class="gal-btn-mas" onclick="cargarMasFotos()">Cargar más ('+galeriaFotos.length+'/'+galeriaTotal+')</button></div>';
  }

  el.innerHTML=h;
}

function transformarURLCloudinary(url,transformacion){
  if(!url||!transformacion)return url||'';
  var parts=url.split('/upload/');
  if(parts.length===2)return parts[0]+'/upload/'+transformacion+'/'+parts[1];
  return url;
}

function cargarMasFotos(){
  galeriaOffset+=galeriaLimit;
  cargarFotosGaleria(false);
}

function clickFotoGaleria(idx,event){
  if(galeriaModo==='comparar'){
    seleccionarFotoComparar(idx);
  }else{
    abrirLightboxGaleria(idx);
  }
}

// --- Lightbox ---
function abrirLightboxGaleria(idx){
  galeriaLbIndex=idx;
  mostrarLightboxGaleria();
  document.getElementById('galeriaLightbox').classList.add('show');
}

function mostrarLightboxGaleria(){
  if(galeriaLbIndex<0)galeriaLbIndex=galeriaFotos.length-1;
  if(galeriaLbIndex>=galeriaFotos.length)galeriaLbIndex=0;
  var f=galeriaFotos[galeriaLbIndex];
  var img=document.getElementById('galLbImg');
  var info=document.getElementById('galLbInfo');
  var url=transformarURLCloudinary(f.cloudinary_url,'w_1200,q_auto:good');
  img.src=url;
  img.style.display='block';
  var fecha=f.fecha_subida?f.fecha_subida.split(' ')[0]:'';
  info.textContent=f.codigo+' | '+f.tipo+' | '+f.unidad+(fecha?' | '+fecha:'')+' — '+(galeriaLbIndex+1)+'/'+galeriaFotos.length;
}

function cerrarLightboxGaleria(){
  document.getElementById('galeriaLightbox').classList.remove('show');
}

function navLightboxGaleria(dir){
  galeriaLbIndex+=dir;
  mostrarLightboxGaleria();
}

// --- Modo Comparar Manual ---
function toggleModoGaleria(){
  if(galeriaModo==='galeria'){
    galeriaModo='comparar';
    galeriaSeleccion=[];
    showToast('Selecciona 2 fotos para comparar','info');
  }else{
    galeriaModo='galeria';
    galeriaSeleccion=[];
    document.getElementById('galeriaCompResult').innerHTML='';
    document.getElementById('galeriaCompResult').style.display='none';
  }
  actualizarBtnModoGaleria();
  renderGaleria();
}

function actualizarBtnModoGaleria(){
  var btn=document.getElementById('gal-btn-modo');
  if(!btn)return;
  if(galeriaModo==='comparar'){
    btn.textContent='Cancelar comparación';
    btn.style.background='#e74c3c';
  }else{
    btn.textContent='Comparar fotos';
    btn.style.background='#1abc9c';
  }
}

function seleccionarFotoComparar(idx){
  var f=galeriaFotos[idx];
  var existIdx=galeriaSeleccion.findIndex(function(s){return s.codigo===f.codigo;});
  if(existIdx!==-1){
    galeriaSeleccion.splice(existIdx,1);
    renderGaleria();
    return;
  }
  if(galeriaSeleccion.length>=2){
    showToast('Ya tienes 2 fotos seleccionadas. Quita una primero.','warning');
    return;
  }
  galeriaSeleccion.push({codigo:f.codigo,url:f.cloudinary_url,unidad:f.unidad,tipo:f.tipo,fecha:f.fecha_subida});
  renderGaleria();

  if(galeriaSeleccion.length===2){
    renderComparadorGaleria();
  }
}

function renderComparadorGaleria(){
  var el=document.getElementById('galeriaCompResult');
  if(!el)return;
  el.style.display='block';

  var f1=galeriaSeleccion[0];
  var f2=galeriaSeleccion[1];
  var url1=transformarURLCloudinary(f1.url,'w_800,q_auto:good');
  var url2=transformarURLCloudinary(f2.url,'w_800,q_auto:good');

  var fecha1=f1.fecha?(f1.fecha.split(' ')[0]):'';
  var fecha2=f2.fecha?(f2.fecha.split(' ')[0]):'';

  var h='';
  h+='<div class="gal-comp-header">';
  h+='<h4>Comparación</h4>';
  h+='<div class="gal-comp-mode">';
  h+='<button class="active" onclick="setModoCompGaleria(\'slider\',this)">Slider</button>';
  h+='<button onclick="setModoCompGaleria(\'side\',this)">Lado a lado</button>';
  h+='</div>';
  h+='</div>';

  h+='<div id="galCompArea">';
  h+=renderSliderGaleria(url1,url2,f1,f2,fecha1,fecha2);
  h+='</div>';

  el.innerHTML=h;
  el.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(function(){initSliderGaleriaEvents();},100);
}

function setModoCompGaleria(modo,btn){
  var btns=btn.parentElement.querySelectorAll('button');
  btns.forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');

  var f1=galeriaSeleccion[0];
  var f2=galeriaSeleccion[1];
  var url1=transformarURLCloudinary(f1.url,'w_800,q_auto:good');
  var url2=transformarURLCloudinary(f2.url,'w_800,q_auto:good');
  var fecha1=f1.fecha?(f1.fecha.split(' ')[0]):'';
  var fecha2=f2.fecha?(f2.fecha.split(' ')[0]):'';

  var area=document.getElementById('galCompArea');
  if(modo==='slider'){
    area.innerHTML=renderSliderGaleria(url1,url2,f1,f2,fecha1,fecha2);
    setTimeout(function(){initSliderGaleriaEvents();},100);
  }else{
    area.innerHTML=renderSideGaleria(url1,url2,f1,f2,fecha1,fecha2);
  }
}

function renderSliderGaleria(url1,url2,f1,f2,fecha1,fecha2){
  var h='';
  h+='<div class="gal-comp-slider" id="galSliderArea" style="position:relative">';
  h+='<div style="position:relative;width:100%">';
  h+='<img src="'+url2+'" style="width:100%;display:block" id="galCompImgB">';
  h+='<div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden" id="galCompClip">';
  h+='<img src="'+url1+'" style="width:100%;display:block" id="galCompImgA">';
  h+='</div>';
  h+='<div class="comp-slider-line" id="galSliderLine" style="left:50%"><div class="comp-slider-handle">⟷</div></div>';
  h+='</div></div>';
  h+='<div class="gal-comp-labels">';
  h+='<span>◀ '+f1.codigo+'<br><small>'+fecha1+'</small></span>';
  h+='<span>'+f2.codigo+' ▶<br><small>'+fecha2+'</small></span>';
  h+='</div>';
  return h;
}

function renderSideGaleria(url1,url2,f1,f2,fecha1,fecha2){
  var h='';
  h+='<div class="gal-comp-side">';
  h+='<div class="gal-comp-side-img"><img src="'+url1+'"><div class="gal-comp-side-label">'+f1.codigo+'<br><small>'+f1.unidad+' | '+f1.tipo+' | '+fecha1+'</small></div></div>';
  h+='<div class="gal-comp-side-img"><img src="'+url2+'"><div class="gal-comp-side-label">'+f2.codigo+'<br><small>'+f2.unidad+' | '+f2.tipo+' | '+fecha2+'</small></div></div>';
  h+='</div>';
  return h;
}

function initSliderGaleriaEvents(){
  var area=document.getElementById('galSliderArea');
  if(!area)return;
  var dragging=false;

  function handleMove(clientX){
    var rect=area.getBoundingClientRect();
    var pct=Math.max(0,Math.min(100,((clientX-rect.left)/rect.width)*100));
    var clip=document.getElementById('galCompClip');
    var line=document.getElementById('galSliderLine');
    if(clip)clip.style.clipPath='inset(0 '+(100-pct)+'% 0 0)';
    if(line)line.style.left=pct+'%';
  }

  area.addEventListener('mousedown',function(e){dragging=true;handleMove(e.clientX);e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(dragging)handleMove(e.clientX);});
  document.addEventListener('mouseup',function(){dragging=false;});
  area.addEventListener('touchstart',function(e){dragging=true;handleMove(e.touches[0].clientX);},{passive:true});
  area.addEventListener('touchmove',function(e){if(dragging){handleMove(e.touches[0].clientX);e.preventDefault();}},{passive:false});
  area.addEventListener('touchend',function(){dragging=false;});

  handleMove(area.getBoundingClientRect().left+area.getBoundingClientRect().width/2);
}

function descargarFotoGaleria(){
  var f=galeriaFotos[galeriaLbIndex];
  if(!f)return;
  var a=document.createElement('a');
  a.href=f.cloudinary_url;
  a.download=f.codigo+'.jpg';
  a.target='_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// =============================================
// TAB 2: COMPARATIVAS W1/W2
// =============================================

function initComparativas(){
  // Cargar listado de unidades si no están cargados
  var sel=document.getElementById('gal-comp-unidad');
  if(sel&&sel.options.length<=1){
    fetch('galeria.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar',limit:1,offset:0})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok&&data.unidades){
        var h='<option value="">Selecciona unidad</option>';
        data.unidades.forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
        sel.innerHTML=h;
        // También poblar precache
        var selPre=document.getElementById('gal-precache-unidad');
        if(selPre&&selPre.options.length<=1)selPre.innerHTML=h;
      }
    }).catch(function(){});
  }
}

function cargarComparativas(){
  var unidad=document.getElementById('gal-comp-unidad').value;
  var el=document.getElementById('gal-comp-result');
  if(!unidad){el.innerHTML='<div class="gal-empty">Selecciona una unidad</div>';return;}
  el.innerHTML='<div class="gal-loading">Cargando fotos comparativas...</div>';

  fetch('galeria.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'comparativas',unidad:unidad})})
  .then(function(r){return r.json();})
  .then(function(data){
    if(!data.ok){el.innerHTML='<div class="gal-empty">Error: '+(data.error||'')+'</div>';return;}
    renderComparativas(data.visitas,data.unidad);
  })
  .catch(function(){el.innerHTML='<div class="gal-empty">Sin conexión al servidor</div>';});
}

function renderComparativas(visitas,unidad){
  var el=document.getElementById('gal-comp-result');
  if(!visitas||visitas.length===0){
    el.innerHTML='<div class="gal-empty">No hay fotos comparativas (W1/W2) para '+unidad+'</div>';
    return;
  }

  // Almacenar datos para acceso desde onclick sin problemas de escapado
  galeriaCompDatos=[];

  var h='<div class="gal-comp-info">'+visitas.length+' visita'+(visitas.length>1?'s':'')+' con fotos comparativas</div>';

  visitas.forEach(function(v,vIdx){
    var maxPairs=Math.max(v.W1.length,v.W2.length);
    var tipoBg=v.tipo==='VP'?'#88d8b0':v.tipo==='EL'?'#2ecc71':'#fd9853';

    h+='<div class="gal-comp-visita">';
    h+='<div class="gal-comp-visita-header">';
    h+='<span><strong>'+v.fecha+'</strong> <span class="gal-thumb-tipo" style="background:'+tipoBg+';padding:2px 8px;border-radius:4px;color:#fff;font-size:.75rem">'+v.tipo+'</span></span>';
    h+='<span class="gal-grupo-count">W1: '+v.W1.length+' | W2: '+v.W2.length+'</span>';
    h+='</div>';

    // Renderizar pares W1 vs W2
    for(var i=0;i<maxPairs;i++){
      var fw1=v.W1[i]||null;
      var fw2=v.W2[i]||null;
      var urlW1=fw1?transformarURLCloudinary(fw1.cloudinary_url,'w_400,h_533,c_fill,q_auto:low'):'';
      var urlW2=fw2?transformarURLCloudinary(fw2.cloudinary_url,'w_400,h_533,c_fill,q_auto:low'):'';

      h+='<div class="gal-comp-pair">';
      h+='<div class="gal-comp-pair-col">';
      h+='<div class="gal-comp-wp-label" style="background:#e74c3c">W1</div>';
      if(urlW1){
        var idxW1=galeriaCompDatos.length;
        galeriaCompDatos.push({codigo:fw1.codigo,url:fw1.cloudinary_url});
        h+='<img src="'+urlW1+'" class="gal-comp-pair-img" onclick="abrirLbComparativa('+idxW1+')">';
        h+='<div class="gal-comp-pair-code">'+fw1.codigo+'</div>';
      }else{
        h+='<div class="gal-comp-pair-empty">Sin foto W1</div>';
      }
      h+='</div>';

      h+='<div class="gal-comp-pair-col">';
      h+='<div class="gal-comp-wp-label" style="background:#9b59b6">W2</div>';
      if(urlW2){
        var idxW2=galeriaCompDatos.length;
        galeriaCompDatos.push({codigo:fw2.codigo,url:fw2.cloudinary_url});
        h+='<img src="'+urlW2+'" class="gal-comp-pair-img" onclick="abrirLbComparativa('+idxW2+')">';
        h+='<div class="gal-comp-pair-code">'+fw2.codigo+'</div>';
      }else{
        h+='<div class="gal-comp-pair-empty">Sin foto W2</div>';
      }
      h+='</div>';
      h+='</div>';

      // Botón comparar slider si ambas fotos existen
      if(fw1&&fw2){
        // Guardar índices del par para onclick limpio
        var pairIdx=galeriaCompDatos.length;
        galeriaCompDatos.push({tipo:'par',w1:{codigo:fw1.codigo,url:fw1.cloudinary_url},w2:{codigo:fw2.codigo,url:fw2.cloudinary_url}});
        h+='<div style="text-align:center;margin:-4px 0 12px"><button class="gal-btn-comp-pair" onclick="compararParPorIndice('+pairIdx+')">Comparar W1 vs W2</button></div>';
      }
    }

    // Si hay visitas previas, ofrecer comparar con visita anterior
    if(vIdx>0){
      var vPrev=visitas[vIdx-1];
      h+='<div style="text-align:center;margin:8px 0 4px"><button class="gal-btn-comp-cross" onclick="compararEntreVisitas('+vIdx+')">Comparar con visita anterior ('+vPrev.fecha+')</button></div>';
    }

    h+='</div>';
  });

  el.innerHTML=h;
  // Guardar visitas para comparación entre visitas
  el.dataset.visitas=JSON.stringify(visitas);
}

function compararParPorIndice(idx){
  var par=galeriaCompDatos[idx];
  if(!par||!par.w1||!par.w2)return;
  compararParW1W2(par.w1,par.w2);
}

function compararParW1W2(f1,f2){
  galeriaSeleccion=[
    {codigo:f1.codigo,url:f1.url,unidad:'',tipo:'',fecha:''},
    {codigo:f2.codigo,url:f2.url,unidad:'',tipo:'',fecha:''}
  ];
  var el=document.getElementById('gal-comp-slider-result');
  if(!el)return;
  el.style.display='block';

  var url1=transformarURLCloudinary(f1.url,'w_800,q_auto:good');
  var url2=transformarURLCloudinary(f2.url,'w_800,q_auto:good');

  var h='<div class="gal-comp-header">';
  h+='<h4>W1 vs W2</h4>';
  h+='<div class="gal-comp-mode">';
  h+='<button class="active" onclick="setModoCompComparativas(\'slider\',this)">Slider</button>';
  h+='<button onclick="setModoCompComparativas(\'side\',this)">Lado a lado</button>';
  h+='<button onclick="cerrarCompComparativas()" style="background:#e74c3c;color:#fff">✕</button>';
  h+='</div></div>';
  h+='<div id="galCompAreaComp">';
  h+=renderSliderGaleriaComp(url1,url2,f1.codigo,f2.codigo,'W1','W2');
  h+='</div>';

  el.innerHTML=h;
  el.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(function(){initSliderCompEvents();},100);
}

function compararEntreVisitas(vIdx){
  var el=document.getElementById('gal-comp-result');
  var visitas=JSON.parse(el.dataset.visitas||'[]');
  var vActual=visitas[vIdx];
  var vPrev=visitas[vIdx-1];
  if(!vActual||!vPrev)return;

  // Comparar W1 actual vs W1 anterior (o W2 vs W2)
  var fw1Actual=vActual.W1[0];
  var fw1Prev=vPrev.W1[0];
  if(fw1Actual&&fw1Prev){
    compararParW1W2(
      {codigo:fw1Prev.codigo,url:fw1Prev.cloudinary_url},
      {codigo:fw1Actual.codigo,url:fw1Actual.cloudinary_url}
    );
  }else{
    // Intentar con W2
    var fw2Actual=vActual.W2[0];
    var fw2Prev=vPrev.W2[0];
    if(fw2Actual&&fw2Prev){
      compararParW1W2(
        {codigo:fw2Prev.codigo,url:fw2Prev.cloudinary_url},
        {codigo:fw2Actual.codigo,url:fw2Actual.cloudinary_url}
      );
    }else{
      showToast('No hay fotos comparativas comunes entre ambas visitas','warning');
    }
  }
}

function renderSliderGaleriaComp(url1,url2,label1,label2,tag1,tag2){
  var h='';
  h+='<div class="gal-comp-slider" id="galSliderAreaComp" style="position:relative">';
  h+='<div style="position:relative;width:100%">';
  h+='<img src="'+url2+'" style="width:100%;display:block" id="galCompImgBComp">';
  h+='<div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden" id="galCompClipComp">';
  h+='<img src="'+url1+'" style="width:100%;display:block" id="galCompImgAComp">';
  h+='</div>';
  h+='<div class="comp-slider-line" id="galSliderLineComp" style="left:50%"><div class="comp-slider-handle">⟷</div></div>';
  h+='</div></div>';
  h+='<div class="gal-comp-labels">';
  h+='<span>◀ <strong style="color:#e74c3c">'+tag1+'</strong> '+label1+'</span>';
  h+='<span><strong style="color:#9b59b6">'+tag2+'</strong> '+label2+' ▶</span>';
  h+='</div>';
  return h;
}

function renderSideGaleriaComp(url1,url2,label1,label2,tag1,tag2){
  var h='';
  h+='<div class="gal-comp-side">';
  h+='<div class="gal-comp-side-img"><img src="'+url1+'"><div class="gal-comp-side-label"><strong style="color:#e74c3c">'+tag1+'</strong> '+label1+'</div></div>';
  h+='<div class="gal-comp-side-img"><img src="'+url2+'"><div class="gal-comp-side-label"><strong style="color:#9b59b6">'+tag2+'</strong> '+label2+'</div></div>';
  h+='</div>';
  return h;
}

function setModoCompComparativas(modo,btn){
  var btns=btn.parentElement.querySelectorAll('button');
  btns.forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');

  var f1=galeriaSeleccion[0];
  var f2=galeriaSeleccion[1];
  var url1=transformarURLCloudinary(f1.url,'w_800,q_auto:good');
  var url2=transformarURLCloudinary(f2.url,'w_800,q_auto:good');

  var area=document.getElementById('galCompAreaComp');
  if(modo==='slider'){
    area.innerHTML=renderSliderGaleriaComp(url1,url2,f1.codigo,f2.codigo,'W1','W2');
    setTimeout(function(){initSliderCompEvents();},100);
  }else{
    area.innerHTML=renderSideGaleriaComp(url1,url2,f1.codigo,f2.codigo,'W1','W2');
  }
}

function cerrarCompComparativas(){
  var el=document.getElementById('gal-comp-slider-result');
  if(el){el.innerHTML='';el.style.display='none';}
  galeriaSeleccion=[];
}

function initSliderCompEvents(){
  var area=document.getElementById('galSliderAreaComp');
  if(!area)return;
  var dragging=false;

  function handleMove(clientX){
    var rect=area.getBoundingClientRect();
    var pct=Math.max(0,Math.min(100,((clientX-rect.left)/rect.width)*100));
    var clip=document.getElementById('galCompClipComp');
    var line=document.getElementById('galSliderLineComp');
    if(clip)clip.style.clipPath='inset(0 '+(100-pct)+'% 0 0)';
    if(line)line.style.left=pct+'%';
  }

  area.addEventListener('mousedown',function(e){dragging=true;handleMove(e.clientX);e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(dragging)handleMove(e.clientX);});
  document.addEventListener('mouseup',function(){dragging=false;});
  area.addEventListener('touchstart',function(e){dragging=true;handleMove(e.touches[0].clientX);},{passive:true});
  area.addEventListener('touchmove',function(e){if(dragging){handleMove(e.touches[0].clientX);e.preventDefault();}},{passive:false});
  area.addEventListener('touchend',function(){dragging=false;});

  handleMove(area.getBoundingClientRect().left+area.getBoundingClientRect().width/2);
}

function abrirLbComparativa(idx){
  var dato=galeriaCompDatos[idx];
  if(!dato)return;
  var img=document.getElementById('galLbImg');
  var info=document.getElementById('galLbInfo');
  img.src=transformarURLCloudinary(dato.url,'w_1200,q_auto:good');
  img.style.display='block';
  info.textContent=dato.codigo||'Foto comparativa';
  document.getElementById('galeriaLightbox').classList.add('show');
}


// =============================================
// TAB 3: PRE-CACHÉ PARA VISITAS SIN COBERTURA
// =============================================

var precacheEnProgreso=false;

function initPrecache(){
  // Cargar unidades si no están
  var sel=document.getElementById('gal-precache-unidad');
  if(sel&&sel.options.length<=1){
    fetch('galeria.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar',limit:1,offset:0})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok&&data.unidades){
        var h='<option value="">Selecciona unidad</option>';
        data.unidades.forEach(function(u){h+='<option value="'+u+'">'+u+'</option>';});
        sel.innerHTML=h;
      }
    }).catch(function(){});
  }
  actualizarListaCacheadas();
}

function precachearUnidad(){
  var unidad=document.getElementById('gal-precache-unidad').value;
  if(!unidad){showToast('Selecciona una unidad','warning');return;}
  if(precacheEnProgreso){showToast('Ya hay una descarga en progreso','warning');return;}

  precacheEnProgreso=true;
  var progEl=document.getElementById('gal-precache-progress');
  var barEl=document.getElementById('gal-precache-bar');
  var txtEl=document.getElementById('gal-precache-text');
  progEl.style.display='block';
  barEl.style.width='0%';
  txtEl.textContent='Obteniendo lista de fotos...';

  fetch('galeria.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fotos_unidad',unidad:unidad})})
  .then(function(r){return r.json();})
  .then(function(data){
    if(!data.ok||!data.fotos||data.fotos.length===0){
      txtEl.textContent='No hay fotos comparativas para '+unidad;
      precacheEnProgreso=false;
      return;
    }
    txtEl.textContent='Descargando '+data.fotos.length+' fotos...';
    descargarFotosACache(data.fotos,unidad,0,barEl,txtEl);
  })
  .catch(function(err){
    txtEl.textContent='Error: sin conexión';
    precacheEnProgreso=false;
  });
}

function descargarFotosACache(fotos,unidad,idx,barEl,txtEl){
  if(idx>=fotos.length){
    barEl.style.width='100%';
    txtEl.textContent='Descargadas '+fotos.length+' fotos de '+unidad;
    precacheEnProgreso=false;
    showToast(fotos.length+' fotos cacheadas para '+unidad,'success');
    actualizarListaCacheadas();
    return;
  }

  var f=fotos[idx];
  var pct=Math.round(((idx+1)/fotos.length)*100);
  barEl.style.width=pct+'%';
  txtEl.textContent='Descargando '+(idx+1)+'/'+fotos.length+' — '+f.codigo;

  // Descargar thumbnail desde Cloudinary
  var thumbUrl=transformarURLCloudinary(f.cloudinary_url,'w_600,h_800,c_fill,q_auto:low');
  descargarImagenComoBase64(thumbUrl,function(base64){
    if(base64){
      guardarEnGaleriaCache(f.codigo,base64,unidad,f.tipo,function(){
        descargarFotosACache(fotos,unidad,idx+1,barEl,txtEl);
      });
    }else{
      // Seguir aunque falle una
      descargarFotosACache(fotos,unidad,idx+1,barEl,txtEl);
    }
  });
}

function descargarImagenComoBase64(url,callback){
  var img=new Image();
  img.crossOrigin='anonymous';
  img.onload=function(){
    try{
      var canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;
      canvas.height=img.naturalHeight;
      var ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      var base64=canvas.toDataURL('image/jpeg',0.7);
      callback(base64);
    }catch(e){
      console.error('Error canvas:',e);
      callback(null);
    }
  };
  img.onerror=function(){
    console.error('Error descarga:',url);
    callback(null);
  };
  img.src=url;
}

function guardarEnGaleriaCache(codigo,base64,unidad,tipo,callback){
  if(!fotosDB){callback();return;}
  try{
    var tx=fotosDB.transaction(['galeria_cache'],'readwrite');
    var store=tx.objectStore('galeria_cache');
    store.put({
      codigo:codigo,
      data:base64,
      unidad:unidad,
      tipo:tipo,
      fecha:Date.now()
    });
    tx.oncomplete=function(){callback();};
    tx.onerror=function(){callback();};
  }catch(e){callback();}
}

function actualizarListaCacheadas(){
  var el=document.getElementById('gal-precache-lista');
  if(!el)return;
  if(!fotosDB){el.innerHTML='<div class="gal-empty">IndexedDB no disponible</div>';return;}

  try{
    var tx=fotosDB.transaction(['galeria_cache'],'readonly');
    var store=tx.objectStore('galeria_cache');
    var req=store.getAll();
    req.onsuccess=function(){
      var fotos=req.result||[];
      if(fotos.length===0){
        el.innerHTML='<div class="gal-empty">No hay fotos pre-cacheadas</div>';
        return;
      }

      // Agrupar por unidad
      var grupos={};
      var ahora=Date.now();
      fotos.forEach(function(f){
        var key=f.unidad||'Sin unidad';
        if(!grupos[key])grupos[key]={fotos:[],total:0};
        grupos[key].fotos.push(f);
        grupos[key].total++;
      });

      var h='';
      Object.keys(grupos).sort().forEach(function(unidad){
        var g=grupos[unidad];
        // Calcular tiempo restante (3 días desde la más antigua)
        var masAntigua=Math.min.apply(null,g.fotos.map(function(f){return f.fecha;}));
        var expira=masAntigua+3*24*60*60*1000;
        var restante=expira-ahora;
        var diasRestantes=Math.max(0,Math.ceil(restante/(24*60*60*1000)));
        var horasRestantes=Math.max(0,Math.ceil(restante/(60*60*1000)));

        var tiempoTxt;
        if(diasRestantes>1)tiempoTxt=diasRestantes+' días';
        else if(horasRestantes>1)tiempoTxt=horasRestantes+' horas';
        else tiempoTxt='< 1 hora';

        h+='<div class="gal-precache-item">';
        h+='<div class="gal-precache-item-info">';
        h+='<strong>'+unidad+'</strong>';
        h+='<span>'+g.total+' fotos | Expira en '+tiempoTxt+'</span>';
        h+='</div>';
        h+='<div class="gal-precache-item-actions">';
        h+='<button class="gal-btn-ver-cache" onclick="verFotosCacheadas(\''+unidad+'\')">Ver</button>';
        h+='<button class="gal-btn-borrar-cache" onclick="borrarCacheUnidad(\''+unidad+'\')">Borrar</button>';
        h+='</div>';
        h+='</div>';
      });
      el.innerHTML=h;
    };
  }catch(e){
    el.innerHTML='<div class="gal-empty">Error leyendo caché</div>';
  }
}

function verFotosCacheadas(unidad){
  if(!fotosDB)return;
  try{
    var tx=fotosDB.transaction(['galeria_cache'],'readonly');
    var store=tx.objectStore('galeria_cache');
    var req=store.getAll();
    req.onsuccess=function(){
      var fotos=(req.result||[]).filter(function(f){return f.unidad===unidad;});
      if(fotos.length===0){showToast('No hay fotos cacheadas para '+unidad,'warning');return;}

      // Agrupar en W1 y W2
      var w1=[],w2=[],otros=[];
      fotos.forEach(function(f){
        if(f.codigo.indexOf('_W1_')!==-1)w1.push(f);
        else if(f.codigo.indexOf('_W2_')!==-1)w2.push(f);
        else otros.push(f);
      });

      var el=document.getElementById('gal-precache-vista');
      if(!el)return;
      var h='<div class="gal-comp-header"><h4>Fotos cacheadas: '+unidad+'</h4><button onclick="document.getElementById(\'gal-precache-vista\').innerHTML=\'\'" style="background:#e74c3c;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer">Cerrar</button></div>';

      // Mostrar pares W1/W2
      var maxPairs=Math.max(w1.length,w2.length);
      if(maxPairs>0){
        for(var i=0;i<maxPairs;i++){
          h+='<div class="gal-comp-pair">';
          h+='<div class="gal-comp-pair-col">';
          h+='<div class="gal-comp-wp-label" style="background:#e74c3c">W1</div>';
          if(w1[i]){
            h+='<img src="'+w1[i].data+'" class="gal-comp-pair-img">';
            h+='<div class="gal-comp-pair-code">'+w1[i].codigo+'</div>';
          }else{
            h+='<div class="gal-comp-pair-empty">--</div>';
          }
          h+='</div>';
          h+='<div class="gal-comp-pair-col">';
          h+='<div class="gal-comp-wp-label" style="background:#9b59b6">W2</div>';
          if(w2[i]){
            h+='<img src="'+w2[i].data+'" class="gal-comp-pair-img">';
            h+='<div class="gal-comp-pair-code">'+w2[i].codigo+'</div>';
          }else{
            h+='<div class="gal-comp-pair-empty">--</div>';
          }
          h+='</div></div>';
        }
      }

      if(otros.length>0){
        h+='<div class="gal-grupo-grid" style="margin-top:8px">';
        otros.forEach(function(f){
          h+='<div class="gal-thumb"><img src="'+f.data+'" alt="'+f.codigo+'"><div class="gal-thumb-info"><span class="gal-thumb-code">'+f.codigo+'</span></div></div>';
        });
        h+='</div>';
      }

      el.innerHTML=h;
      el.scrollIntoView({behavior:'smooth'});
    };
  }catch(e){}
}

function borrarCacheUnidad(unidad){
  if(!fotosDB)return;
  if(!confirm('¿Borrar las fotos cacheadas de '+unidad+'?'))return;

  try{
    var tx=fotosDB.transaction(['galeria_cache'],'readwrite');
    var store=tx.objectStore('galeria_cache');
    store.openCursor().onsuccess=function(e){
      var cursor=e.target.result;
      if(cursor){
        if(cursor.value.unidad===unidad)cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete=function(){
      showToast('Caché de '+unidad+' borrada','success');
      actualizarListaCacheadas();
      document.getElementById('gal-precache-vista').innerHTML='';
    };
  }catch(e){}
}

// --- Limpieza automática de caché (3 días) ---
function limpiarGaleriaCacheAntigua(){
  if(!fotosDB)return;
  var limite=Date.now()-3*24*60*60*1000; // 3 días
  try{
    var tx=fotosDB.transaction(['galeria_cache'],'readwrite');
    var store=tx.objectStore('galeria_cache');
    var borradas=0;
    store.openCursor().onsuccess=function(e){
      var cursor=e.target.result;
      if(cursor){
        if(cursor.value.fecha<limite){
          cursor.delete();
          borradas++;
        }
        cursor.continue();
      }
    };
    tx.oncomplete=function(){
      if(borradas>0)console.log('Galería cache: borradas '+borradas+' fotos >3 días');
    };
  }catch(e){}
}

// Ejecutar limpieza automática al cargar la app (esperar a que fotosDB esté lista)
function iniciarLimpiezaGaleriaCache(){
  if(typeof fotosDB!=='undefined'&&fotosDB){
    limpiarGaleriaCacheAntigua();
  }else{
    // Reintentar hasta que fotosDB esté lista
    setTimeout(iniciarLimpiezaGaleriaCache,3000);
  }
}
setTimeout(iniciarLimpiezaGaleriaCache,5000);
