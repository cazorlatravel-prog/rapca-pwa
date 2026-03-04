// --- Galería de Fotos Cloudinary ---
var galeriaFotos=[];
var galeriaTotal=0;
var galeriaOffset=0;
var galeriaLimit=60;
var galeriaSeleccion=[]; // Para modo comparador: [{codigo,url}, ...]
var galeriaModo='galeria'; // 'galeria' o 'comparar'
var galeriaLbIndex=0;

function initGaleria(){
  galeriaSeleccion=[];
  galeriaModo='galeria';
  actualizarBtnModoGaleria();
  cargarFotosGaleria(true);
}

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

    // Poblar filtros
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
  // Agrupar por unidad
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

  // Botón cargar más
  if(galeriaFotos.length<galeriaTotal){
    h+='<div style="text-align:center;padding:16px"><button class="gal-btn-mas" onclick="cargarMasFotos()">Cargar más ('+galeriaFotos.length+'/'+galeriaTotal+')</button></div>';
  }

  el.innerHTML=h;
}

function transformarURLCloudinary(url,transformacion){
  // Insertar transformación en URL de Cloudinary
  // https://res.cloudinary.com/cloud/image/upload/v123/rapca/...
  // -> https://res.cloudinary.com/cloud/image/upload/w_300,h_400.../v123/rapca/...
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
  // Usar transformación de calidad media para lightbox
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

// --- Modo Comparar ---
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

  // Slider por defecto
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

  // Inicializar al 50%
  handleMove(area.getBoundingClientRect().left+area.getBoundingClientRect().width/2);
}

function descargarFotoGaleria(){
  var f=galeriaFotos[galeriaLbIndex];
  if(!f)return;
  var url=f.cloudinary_url;
  var a=document.createElement('a');
  a.href=url;
  a.download=f.codigo+'.jpg';
  a.target='_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
