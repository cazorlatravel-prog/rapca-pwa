var AUTH_URL='auth.php';
var DATOS_URL='datos.php';
var sesionActual=null; // {token, email, nombre, rol, id}
var FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSe8kPl5QErboQmrAJ6hSnbkiAJb3h9Mi6_Fntgws_Z1NWj1TQ/formResponse';
var UPLOAD_URL='upload.php';
var ENTRY={tipo:'entry.437432431',fecha:'entry.1468491774',zona:'entry.226003494',unidad:'entry.1028582203',transecto:'entry.1651846022',datos:'entry.1220105245'};
var PLANTAS=['Arbutus unedo','Asparagus acutifolius','Chamaerops humilis','Cistus sp.','Crataegus monogyna','Cytisus sp.','Daphne gnidium','Dittrichia viscosa','Foeniculum vulgare','Genista sp.','Halimium sp.','Helichrysum stoechas','Juncus spp.','Juniperus sp.','Lavandula latifolia','Myrtus communis','Olea europaea var. sylvestris','Phillyrea angustifolia','Phlomis purpurea','Pistacia lentiscus','Quercus coccifera','Quercus ilex','Quercus sp.','Retama sphaerocarpa','Rhamnus sp.','Rosa sp.','Rosmarinus officinalis','Rubus ulmifolius','Salvia rosmarinus','Spartium junceum','Thymus sp.','Ulex sp.'];
var transectoActual=1,isOnline=navigator.onLine,currentAutocomplete=null,editandoId=null;
var cameraStream=null,camaraTipo='',camaraSubtipo='',currentHeading=0;
var contadorFotosVP={},contadorFotosEV={},contadorFotosEL={};
var currentLat=null,currentLon=null,currentUTM=null,currentAlt=null,currentSpeed=null,currentAcc=null;
var deferredPrompt=null,mapTilesLoaded=[];
var mapaLeaflet=null,controlCapas=null,capasKML={},capasKMLRaw={},capasKMLSubcapas={},capasKMLLabels={},capasKMLEstilo={},marcadorPosicion=null,clusterGroup=null;
var syncEnProgreso=false,syncStats={total:0,ok:0,fail:0},fallosSubida=[];
var anotaciones=[],modoAnotacion=false;
var editandoGanaderoId=null,editandoInfraId=null;
var camposExtraGan=[],camposExtraInf=[];
var INFRA_CAMPOS_BASE=[
  {key:'provincia',label:'PROVINCIA',id:'inf-provincia'},
  {key:'idZona',label:'ID ZONA',id:'inf-idzona'},
  {key:'idUnidad',label:'ID UNIDAD',id:'inf-idunidad'},
  {key:'codInfoca',label:'COD INFOCA',id:'inf-codinfoca'},
  {key:'nombre',label:'NOMBRE',id:'inf-nombre'},
  {key:'superficie',label:'SUPERFICIE',id:'inf-superficie'},
  {key:'pagoMaximo',label:'PAGO MAXIMO',id:'inf-pagomax'},
  {key:'municipio',label:'MUNICIPIO',id:'inf-municipio'},
  {key:'pn',label:'PN',id:'inf-pn'},
  {key:'contrato',label:'CONTRATO',id:'inf-contrato'},
  {key:'vegetacion',label:'VEGETACION',id:'inf-vegetacion'},
  {key:'pendiente',label:'PENDIENTE',id:'inf-pendiente'},
  {key:'distancia',label:'DISTANCIA',id:'inf-distancia'}
];
var fotosDB=null;
var fotosCacheMemoria={}; // Cache en memoria como respaldo

// --- Forzar actualización (borrar SW + caches) ---
function forzarActualizacion(){
  if(!confirm('Se borrará la caché y se recargará la app. ¿Continuar?'))return;
  Promise.resolve()
  .then(function(){if('caches' in window)return caches.keys().then(function(k){return Promise.all(k.map(function(c){return caches.delete(c);}));});})
  .then(function(){if(navigator.serviceWorker)return navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister();});});})
  .then(function(){location.reload(true);});
}

// --- Auth local (funciona sin backend PHP) ---
function getUsuariosLocal(){var d=localStorage.getItem('rapca_usuarios_local');return d?JSON.parse(d):[];}
function guardarUsuariosLocal(lista){localStorage.setItem('rapca_usuarios_local',JSON.stringify(lista));}
function initUsuariosLocal(){
  var users=getUsuariosLocal();
  if(users.length===0){
    users.push({id:1,email:'rapcajaen@gmail.com',nombre:'Administrador',password:'Gallito9431%',rol:'admin',activo:1});
    guardarUsuariosLocal(users);
  }
  // Migrar admin antiguo a nuevas credenciales
  var oldAdmin=users.find(function(u){return u.email==='admin@rapca.com'&&u.rol==='admin';});
  if(oldAdmin){
    oldAdmin.email='rapcajaen@gmail.com';
    oldAdmin.password='Gallito9431%';
    oldAdmin.nombre='Administrador';
    guardarUsuariosLocal(users);
    console.log('Admin migrado a rapcajaen@gmail.com');
  }
  // Asegurar que existe el admin correcto
  var adminOk=users.find(function(u){return u.email==='rapcajaen@gmail.com'&&u.rol==='admin';});
  if(!adminOk){
    users.push({id:1,email:'rapcajaen@gmail.com',nombre:'Administrador',password:'Gallito9431%',rol:'admin',activo:1});
    guardarUsuariosLocal(users);
  }
}
function loginLocal(email,password){
  var users=getUsuariosLocal();
  var emailNorm=email.trim().toLowerCase();
  var passNorm=password.trim();
  var user=users.find(function(u){return u.email.toLowerCase()===emailNorm&&(u.password===passNorm||u.password===password)&&u.activo!==0;});
  if(user)return{ok:true,token:'local_'+Date.now(),usuario:{email:user.email,nombre:user.nombre,rol:user.rol,id:user.id}};
  return{ok:false,error:'Email o contraseña incorrectos'};
}
function crearUsuarioLocal(email,nombre,password,rol){
  var users=getUsuariosLocal();
  var emailNorm=email.trim().toLowerCase();
  var passNorm=password.trim();
  if(users.find(function(u){return u.email.toLowerCase()===emailNorm;}))return{ok:false,error:'Email ya existe'};
  users.push({id:Date.now(),email:emailNorm,nombre:nombre,password:passNorm,rol:rol||'operador',activo:1});
  guardarUsuariosLocal(users);
  return{ok:true};
}

// --- Migración de datos: EV → EI ---
function migrarRegistrosEVaEI(){
  var rs=getRegistros();
  var changed=false;
  rs.forEach(function(r){if(r.tipo==='EV'){r.tipo='EI';changed=true;}});
  if(changed){localStorage.setItem('rapca_registros',JSON.stringify(rs));console.log('Migrados registros EV→EI');}
}

// IndexedDB para fotos
function initFotosDB(){
  return new Promise(function(resolve,reject){
    if(!window.indexedDB){console.warn('IndexedDB no soportada');resolve();return;}
    var request=indexedDB.open('RAPCA_Fotos',4);
    request.onerror=function(e){console.error('Error IndexedDB:',e);resolve();};
    request.onsuccess=function(e){fotosDB=e.target.result;console.log('IndexedDB lista');resolve();};
    request.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('fotos')){
        db.createObjectStore('fotos',{keyPath:'codigo'});
        console.log('ObjectStore fotos creado');
      }
      if(!db.objectStoreNames.contains('subidas_pendientes')){
        db.createObjectStore('subidas_pendientes',{keyPath:'codigo'});
        console.log('ObjectStore subidas_pendientes creado');
      }
      if(!db.objectStoreNames.contains('capas_kml')){
        db.createObjectStore('capas_kml',{keyPath:'nombre'});
        console.log('ObjectStore capas_kml creado');
      }
      if(!db.objectStoreNames.contains('galeria_cache')){
        db.createObjectStore('galeria_cache',{keyPath:'codigo'});
        console.log('ObjectStore galeria_cache creado');
      }
    };
  });
}

function guardarFotoEnDB(codigo,dataUrl){
  // Siempre guardar en cache memoria
  fotosCacheMemoria[codigo]=dataUrl;
  
  return new Promise(function(resolve,reject){
    if(!fotosDB){console.warn('DB no lista, solo en memoria');resolve();return;}
    try{
      var tx=fotosDB.transaction(['fotos'],'readwrite');
      var store=tx.objectStore('fotos');
      var req=store.put({codigo:codigo,data:dataUrl,fecha:Date.now()});
      req.onsuccess=function(){console.log('Foto en DB:',codigo);resolve();};
      req.onerror=function(e){console.error('Error put:',e);resolve();};
    }catch(e){console.error('Error tx:',e);resolve();}
  });
}

function obtenerTodasLasFotos(){
  return new Promise(function(resolve){
    // Empezar con cache en memoria
    var result=Object.assign({},fotosCacheMemoria);
    
    if(!fotosDB){
      console.log('Usando solo cache memoria:',Object.keys(result).length,'fotos');
      resolve(result);
      return;
    }
    
    try{
      var tx=fotosDB.transaction(['fotos'],'readonly');
      var store=tx.objectStore('fotos');
      var request=store.getAll();
      request.onsuccess=function(){
        var dbFotos=request.result||[];
        console.log('Fotos en DB:',dbFotos.length);
        dbFotos.forEach(function(f){
          result[f.codigo]=f.data;
        });
        console.log('Total fotos disponibles:',Object.keys(result).length);
        resolve(result);
      };
      request.onerror=function(e){
        console.error('Error getAll:',e);
        resolve(result);
      };
    }catch(e){
      console.error('Error tx read:',e);
      resolve(result);
    }
  });
}

function limpiarFotosAntiguasDB(){
  if(!fotosDB)return;
  var limite=Date.now()-30*24*60*60*1000; // 30 días de retención
  try{
    var tx=fotosDB.transaction(['fotos'],'readwrite');
    var store=tx.objectStore('fotos');
    store.openCursor().onsuccess=function(e){
      var cursor=e.target.result;
      if(cursor){
        if(cursor.value.fecha<limite){cursor.delete();console.log('Foto >30 días borrada:',cursor.value.codigo);}
        cursor.continue();
      }
    };
  }catch(e){console.error('Error limpieza:',e);}
}

// --- Subida de fotos a la nube (Cloudinary) ---
function guardarSubidaPendiente(codigo,dataUrl,unidad,tipo){
  if(!fotosDB)return;
  try{var tx=fotosDB.transaction(['subidas_pendientes'],'readwrite');tx.objectStore('subidas_pendientes').put({codigo:codigo,data:dataUrl,unidad:unidad,tipo:tipo,fecha:Date.now()});tx.oncomplete=function(){actualizarContadorSubidas();};}catch(e){console.error('Error cola subida:',e);}
}
function eliminarSubidaPendiente(codigo){
  if(!fotosDB)return;
  try{var tx=fotosDB.transaction(['subidas_pendientes'],'readwrite');tx.objectStore('subidas_pendientes').delete(codigo);tx.oncomplete=function(){actualizarContadorSubidas();};}catch(e){}
}
function actualizarContadorSubidas(){
  if(!fotosDB)return;
  try{var tx=fotosDB.transaction(['subidas_pendientes'],'readonly');var req=tx.objectStore('subidas_pendientes').count();req.onsuccess=function(){var el=document.getElementById('uploadCount');if(el)el.textContent=req.result||0;};}catch(e){}
}
function procesarSubidasPendientes(){
  if(!fotosDB||!isOnline||syncEnProgreso)return;
  try{
    var tx=fotosDB.transaction(['subidas_pendientes'],'readonly');
    var req=tx.objectStore('subidas_pendientes').getAll();
    req.onsuccess=function(){
      var p=req.result||[];
      if(p.length===0)return;
      syncEnProgreso=true;
      syncStats={total:p.length,ok:0,fail:0};
      fallosSubida=[];
      mostrarProgreso();
      procesarColaSec(p,0);
    };
  }catch(e){console.error('Error procesando subidas:',e);}
}
function extraerErrorSubida(text){
  try{var j=JSON.parse(text);var msg=j.error||'Error desconocido';if(j.causa)msg+='. '+j.causa;if(j.cloudinary_msg)msg+='. Cloudinary: '+j.cloudinary_msg;if(j.diagnostico)msg+='. Memoria: '+j.diagnostico.memory_used_mb+'MB de '+j.diagnostico.memory_limit;return msg;}catch(e){return text.substring(0,200);}
}
function subirFotoNube(codigo,dataUrl,unidad,tipo){
  if(!isOnline)return;
  var payload=JSON.stringify({codigo:codigo,imagen:dataUrl,unidad:unidad,tipo:tipo});
  console.log('Subiendo '+codigo+' ('+Math.round(payload.length/1024)+'KB)');
  fetch(UPLOAD_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:payload}).then(function(res){if(!res.ok)return res.text().then(function(t){var msg=extraerErrorSubida(t);throw new Error('HTTP '+res.status+': '+msg);});return res.json();}).then(function(data){if(data.ok){eliminarSubidaPendiente(codigo);showToast('☁️ '+codigo,'success');}else throw new Error(data.error||'Error servidor');}).catch(function(err){console.error('Error subida '+codigo+':',err.message);showToast('⚠️ '+codigo+': '+err.message,'error');});
}
// Procesamiento secuencial de cola con reintentos
function procesarColaSec(lista,idx){
  if(idx>=lista.length||!isOnline){finalizarSync();return;}
  var item=lista[idx];
  actualizarProgreso();
  subirConReintentos(item.codigo,item.data,item.unidad,item.tipo,3,function(ok){
    if(ok)syncStats.ok++;else{syncStats.fail++;fallosSubida.push(item.codigo);}
    actualizarProgreso();
    setTimeout(function(){procesarColaSec(lista,idx+1);},800);
  });
}
function subirConReintentos(codigo,dataUrl,unidad,tipo,maxI,cb){
  var i=0;
  function intentar(){
    i++;
    console.log('Subida '+codigo+' intento '+i+'/'+maxI);
    fetch(UPLOAD_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo:codigo,imagen:dataUrl,unidad:unidad,tipo:tipo})}).then(function(r){if(!r.ok)return r.text().then(function(t){var msg=extraerErrorSubida(t);throw new Error('HTTP '+r.status+': '+msg);});return r.json();}).then(function(d){if(d.ok){eliminarSubidaPendiente(codigo);console.log('Subida OK: '+codigo+(d.url?' → '+d.url:''));cb(true);}else throw new Error(d.error||'Error servidor');}).catch(function(e){console.error('Intento '+i+'/'+maxI+' '+codigo+':',e.message);if(i<maxI&&isOnline)setTimeout(intentar,i*2000);else{showToast('❌ '+codigo+': '+e.message,'error');cb(false);}});
  }
  intentar();
}
function finalizarSync(){
  syncEnProgreso=false;
  setTimeout(ocultarProgreso,1500);
  actualizarContadorSubidas();
  if(syncStats.fail===0&&syncStats.ok>0){showToast('✅ '+syncStats.ok+' fotos subidas','success');cerrarAlertaSync();}
  else if(syncStats.fail>0){mostrarAlertaSync(syncStats.fail,syncStats.ok);notificarFalloAdmin(fallosSubida);}
}
// Barra de progreso en tiempo real
function mostrarProgreso(){var el=document.getElementById('syncProgress');if(el)el.classList.add('show');actualizarProgreso();}
function ocultarProgreso(){var el=document.getElementById('syncProgress');if(el)el.classList.remove('show');}
function actualizarProgreso(){
  var done=syncStats.ok+syncStats.fail,pct=syncStats.total>0?Math.round(done/syncStats.total*100):0;
  var t=document.getElementById('syncProgressText'),c=document.getElementById('syncProgressCount'),b=document.getElementById('syncProgressBar');
  if(t)t.textContent=syncStats.fail>0?'Subiendo fotos ('+syncStats.fail+' fallos)...':'Subiendo fotos...';
  if(c)c.textContent=done+'/'+syncStats.total;
  if(b)b.style.width=pct+'%';
}
// Alerta persistente de fallos
function mostrarAlertaSync(fallos,exitos){
  var el=document.getElementById('syncAlert'),txt=document.getElementById('syncAlertText');
  if(!el)return;
  var msg='⚠️ '+fallos+' foto'+(fallos>1?'s':'')+' no se pudieron subir';
  if(exitos>0)msg+=' ('+exitos+' OK)';
  if(txt)txt.textContent=msg;
  el.classList.add('show');
}
function cerrarAlertaSync(){var el=document.getElementById('syncAlert');if(el)el.classList.remove('show');}
// Notificación al administrador
function notificarFalloAdmin(codigos){
  if(!isOnline||codigos.length===0)return;
  fetch('notificar.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigos:codigos,error:'Fallo tras 3 reintentos por foto',dispositivo:navigator.userAgent})}).catch(function(){});
}

// --- Mapa de Visitas (Leaflet) ---
function initMapa(){
  if(mapaLeaflet)return;
  if(typeof L==='undefined'){showToast('Leaflet no cargado','error');return;}
  var osmLayer=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'});
  var ortofoto=L.tileLayer.wms('https://www.ign.es/wms-inspire/pnoa-ma',{layers:'OI.OrthoimageCoverage',format:'image/jpeg',transparent:false,maxZoom:20,attribution:'PNOA © IGN'});
  var topo=L.tileLayer.wms('https://www.ideandalucia.es/services/mta10r_2001/wms',{layers:'mta10r_2001',format:'image/png',transparent:false,maxZoom:20,attribution:'MTA 1:10.000 © Junta de Andalucía'});
  mapaLeaflet=L.map('mapa',{center:[37.8,-3.8],zoom:10,layers:[osmLayer]});
  controlCapas=L.control.layers({'OpenStreetMap':osmLayer,'Ortofoto PNOA':ortofoto,'Topográfico 1:10.000':topo},{},{collapsed:true}).addTo(mapaLeaflet);
  if(currentLat&&currentLon){
    marcadorPosicion=L.marker([currentLat,currentLon],{icon:L.divIcon({className:'',html:'<div style="background:#3498db;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(mapaLeaflet).bindPopup('Mi posición');
    mapaLeaflet.setView([currentLat,currentLon],14);
  }
  cargarCapasKMLGuardadas();
  // MarkerCluster
  if(typeof L.markerClusterGroup==='function'){
    clusterGroup=L.markerClusterGroup({maxClusterRadius:50,spiderfyOnMaxZoom:true});
    mapaLeaflet.addLayer(clusterGroup);
  }
  actualizarMarcadoresMapa();
  poblarFiltrosMapa();
  construirCapaComparativas();
}
function poblarFiltrosMapa(){
  var rs=getRegistrosUsuario();
  var ops={};
  rs.forEach(function(r){if(r.operador_nombre)ops[r.operador_email||r.operador_nombre]=r.operador_nombre;});
  var selOp=document.getElementById('mapa-filtro-operador');
  if(selOp){
    var h='<option value="">Operador</option>';
    Object.keys(ops).forEach(function(k){h+='<option value="'+k+'">'+ops[k]+'</option>';});
    selOp.innerHTML=h;
  }
}
function actualizarMarcadoresMapa(){
  if(!mapaLeaflet||!clusterGroup)return;
  clusterGroup.clearLayers();
  var filtroTipo=document.getElementById('mapa-filtro-tipo')?document.getElementById('mapa-filtro-tipo').value:'';
  var filtroOp=document.getElementById('mapa-filtro-operador')?document.getElementById('mapa-filtro-operador').value:'';
  var filtroDesde=document.getElementById('mapa-filtro-desde')?document.getElementById('mapa-filtro-desde').value:'';

  // Marcadores de registros (VP/EV) - solo los que tengan coordenadas guardadas
  if(filtroTipo!=='infra'){
    var rs=getRegistrosUsuario();
    if(filtroTipo)rs=rs.filter(function(r){return r.tipo===filtroTipo;});
    if(filtroOp)rs=rs.filter(function(r){return r.operador_email===filtroOp;});
    if(filtroDesde)rs=rs.filter(function(r){return r.fecha>=filtroDesde;});
    rs.forEach(function(r){
      if(!r.lat||!r.lon)return;
      var color=r.tipo==='VP'?'#88d8b0':r.tipo==='EL'?'#2ecc71':'#fd9853';
      var mk=L.marker([r.lat,r.lon],{icon:L.divIcon({className:'',html:'<div style="background:'+color+';width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]})});
      mk.bindPopup('<b>'+r.tipo+' '+r.unidad+'</b><br>'+r.fecha+(r.operador_nombre?'<br>'+r.operador_nombre:''));
      clusterGroup.addLayer(mk);
    });
  }

  // Marcadores de fotos comparativas (W1/W2) con etiqueta visible
  if(filtroTipo!=='infra'){
    var allRs=getRegistrosUsuario();
    if(filtroTipo)allRs=allRs.filter(function(r){return r.tipo===filtroTipo;});
    if(filtroOp)allRs=allRs.filter(function(r){return r.operador_email===filtroOp;});
    if(filtroDesde)allRs=allRs.filter(function(r){return r.fecha>=filtroDesde;});
    allRs.forEach(function(r){
      if(!r.lat||!r.lon)return;
      var d=r.datos||{};
      if(!d.fotosComp)return;
      d.fotosComp.forEach(function(fc){
        if(!fc.numero||!fc.waypoint)return;
        var codigos=fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});
        if(codigos.length===0)return;
        var labelText=r.unidad+' '+fc.waypoint;
        var mk=L.marker([r.lat,r.lon],{icon:L.divIcon({className:'mapa-marker-label',html:'<div class="marker-dot marker-comp"></div><div class="marker-etiqueta marker-etiqueta-comp">'+labelText+'</div>',iconSize:[0,0],iconAnchor:[0,8]})});
        mk.bindPopup('<b>📷 '+fc.waypoint+' — '+r.unidad+'</b><br>'+r.fecha+'<br>Fotos: '+codigos.join(', '));
        clusterGroup.addLayer(mk);
      });
    });
  }

  // Marcadores de infraestructuras con etiqueta ID Unidad visible
  if(!filtroTipo||filtroTipo==='infra'){
    var infras=getInfras();
    infras.forEach(function(inf){
      if(!inf.lat||!inf.lon)return;
      var allRegs=getRegistrosUsuario();
      var vpCount=0,elCount=0,eiCount=0,fotoCount=0;
      allRegs.forEach(function(r){
        if(r.unidad===inf.idUnidad){
          if(r.tipo==='VP')vpCount++;else if(r.tipo==='EL')elCount++;else eiCount++;
          var dd=r.datos||{};
          if(dd.fotos)fotoCount+=dd.fotos.split(',').filter(function(x){return x.trim();}).length;
          if(dd.fotosComp)dd.fotosComp.forEach(function(fc){if(fc.numero)fotoCount+=fc.numero.split(',').filter(function(x){return x.trim();}).length;});
        }
      });
      var idLabel=inf.idUnidad||'--';
      var mk=L.marker([parseFloat(inf.lat),parseFloat(inf.lon)],{icon:L.divIcon({className:'mapa-marker-label',html:'<div class="marker-dot marker-infra"></div><div class="marker-etiqueta marker-etiqueta-infra">'+idLabel+'</div>',iconSize:[0,0],iconAnchor:[0,8]})});
      mk.bindPopup('<b>'+idLabel+'</b><br>'+(inf.nombre||'')+'<br>'+(inf.municipio||'')+'<br><small>VP: '+vpCount+' | EL: '+elCount+' | EI: '+eiCount+' | Fotos: '+fotoCount+'</small>');
      clusterGroup.addLayer(mk);
    });
  }
}
function cargarArchivoMapa(file){
  if(!file)return;
  var ext=file.name.split('.').pop().toLowerCase();
  if(ext==='kml'){
    var reader=new FileReader();
    reader.onload=function(e){procesarKML(e.target.result,file.name);};
    reader.readAsText(file);
  }else if(ext==='kmz'){
    if(typeof JSZip==='undefined'){showToast('JSZip no cargado','error');return;}
    var reader=new FileReader();
    reader.onload=function(e){
      JSZip.loadAsync(e.target.result).then(function(zip){
        var kmlFile=null;
        zip.forEach(function(path,entry){if(path.match(/\.kml$/i)&&!kmlFile)kmlFile=entry;});
        if(kmlFile)return kmlFile.async('string');
        throw new Error('No hay KML dentro del KMZ');
      }).then(function(kmlText){procesarKML(kmlText,file.name);}).catch(function(err){showToast('Error KMZ: '+err.message,'error');});
    };
    reader.readAsArrayBuffer(file);
  }else{showToast('Formato no soportado','error');}
}
// --- Permisos de capas KML ---
var capaPermEditando=null;
function getPermisosCapas(){var d=localStorage.getItem('rapca_capas_permisos');return d?JSON.parse(d):{};}
function guardarPermisosCapas(p){localStorage.setItem('rapca_capas_permisos',JSON.stringify(p));}
function usuarioPuedeVerCapa(nombre){
  if(!sesionActual)return false;
  if(sesionActual.rol==='admin')return true;
  var permisos=getPermisosCapas();
  var p=permisos[nombre];
  if(!p)return false;
  if(p.todos)return true;
  if(p.operadores&&p.operadores.indexOf(sesionActual.email)!==-1)return true;
  return false;
}
function abrirModalCapasPerm(nombre){
  capaPermEditando=nombre;
  var permisos=getPermisosCapas();
  var p=permisos[nombre]||{todos:false,operadores:[]};
  var usuarios=getUsuariosLocal().filter(function(u){return u.activo!==0;});
  var modal=document.getElementById('modal-capas-perm');
  document.getElementById('modal-capas-titulo').textContent='Asignar: '+nombre;
  var html='<label class="todos-check'+(p.todos?' checked':'')+'"><input type="checkbox" id="capa-perm-todos" onchange="toggleCapaPermTodos(this)"'+(p.todos?' checked':'')+'>Todos los usuarios</label>';
  usuarios.forEach(function(u){
    var checked=p.todos||(p.operadores&&p.operadores.indexOf(u.email)!==-1);
    html+='<label class="capa-perm-user'+(checked?' checked':'')+'"><input type="checkbox" class="capa-perm-check" value="'+u.email+'"'+(checked?' checked':'')+(p.todos?' disabled':'')+' onchange="this.parentElement.classList.toggle(\'checked\',this.checked)">';
    html+=u.nombre+' <span style="color:#999;font-size:.75rem">('+u.email+')</span>';
    html+='<span style="margin-left:auto;font-size:.7rem;color:'+(u.rol==='admin'?'#8e44ad':'#555')+'">'+u.rol+'</span></label>';
  });
  document.getElementById('modal-capas-body').innerHTML=html;
  modal.classList.add('active');
}
function cerrarModalCapasPerm(){
  document.getElementById('modal-capas-perm').classList.remove('active');
  capaPermEditando=null;
}
function toggleCapaPermTodos(cb){
  var checks=document.querySelectorAll('.capa-perm-user input.capa-perm-check');
  for(var i=0;i<checks.length;i++){
    checks[i].disabled=cb.checked;
    if(cb.checked){checks[i].checked=true;checks[i].parentElement.classList.add('checked');}
  }
  cb.parentElement.classList.toggle('checked',cb.checked);
}
function guardarAsignacionCapa(){
  if(!capaPermEditando)return;
  var todos=document.getElementById('capa-perm-todos').checked;
  var ops=[];
  if(!todos){
    var checks=document.querySelectorAll('.capa-perm-user input.capa-perm-check:checked');
    for(var i=0;i<checks.length;i++)ops.push(checks[i].value);
  }
  var permisos=getPermisosCapas();
  permisos[capaPermEditando]={todos:todos,operadores:ops};
  guardarPermisosCapas(permisos);
  cerrarModalCapasPerm();
  actualizarListaCapas();
  showToast('Permisos actualizados','success');
}

function procesarKML(kmlText,nombre){
  if(!mapaLeaflet)initMapa();
  var resultado=parsearKML(kmlText);
  var layer=resultado.group;
  var subcapas=resultado.subcapas;
  var n=layer.getLayers().length;
  if(n===0){showToast('Sin elementos en '+nombre,'info');return;}
  layer.addTo(mapaLeaflet);
  capasKML[nombre]=layer;
  capasKMLRaw[nombre]=kmlText;
  capasKMLSubcapas[nombre]=subcapas;
  if(controlCapas)controlCapas.addOverlay(layer,nombre);
  mapaLeaflet.fitBounds(layer.getBounds(),{padding:[30,30]});
  // Si admin y no tiene permisos asignados, abrir modal
  if(sesionActual&&sesionActual.rol==='admin'){
    var permisos=getPermisosCapas();
    if(!permisos[nombre]){
      permisos[nombre]={todos:false,operadores:[]};
      guardarPermisosCapas(permisos);
      setTimeout(function(){abrirModalCapasPerm(nombre);},400);
    }
  }
  actualizarListaCapas();
  guardarCapasKMLLocal();guardarCapaKMLenDB(nombre,kmlText);
  showToast(nombre+': '+n+' elementos','success');
}
function parsearKML(kmlText){
  var parser=new DOMParser();
  var cleanKml=kmlText.replace(/xmlns="[^"]*"/g,'');
  var doc=parser.parseFromString(cleanKml,'text/xml');
  var layers=L.featureGroup();
  // Parsear estilos
  var estilos={};
  var styleEls=doc.querySelectorAll('Style');
  for(var i=0;i<styleEls.length;i++){
    var s=styleEls[i],id=s.getAttribute('id');
    if(!id)continue;
    estilos[id]={};
    var ls=s.querySelector('LineStyle'),ps=s.querySelector('PolyStyle'),is=s.querySelector('IconStyle');
    if(ls){var lc=ls.querySelector('color'),lw=ls.querySelector('width');if(lc)estilos[id].lineColor=kmlColorToHex(lc.textContent);if(lw)estilos[id].lineWidth=parseFloat(lw.textContent);}
    if(ps){var pc=ps.querySelector('color');if(pc)estilos[id].fillColor=kmlColorToHex(pc.textContent);}
    if(is){var ic=is.querySelector('color');if(ic)estilos[id].iconColor=kmlColorToHex(ic.textContent);}
  }
  // Parsear StyleMap
  var styleMaps=doc.querySelectorAll('StyleMap');
  for(var i=0;i<styleMaps.length;i++){
    var sm=styleMaps[i],smId=sm.getAttribute('id');
    if(!smId)continue;
    var pairs=sm.querySelectorAll('Pair');
    for(var j=0;j<pairs.length;j++){
      var key=pairs[j].querySelector('key'),url=pairs[j].querySelector('styleUrl');
      if(key&&key.textContent==='normal'&&url){var refId=url.textContent.replace('#','');if(estilos[refId])estilos[smId]=estilos[refId];}
    }
  }
  // Parsear placemarks
  var subcapas=[];
  var pms=doc.querySelectorAll('Placemark');
  for(var i=0;i<pms.length;i++){
    var pm=pms[i];
    var nameEl=pm.querySelector('name'),descEl=pm.querySelector('description');
    var nombre=nameEl?nameEl.textContent.trim():'';
    var desc=descEl?descEl.textContent.trim():'';
    var popup=nombre?'<b>'+nombre+'</b>':'';
    if(desc)popup+=(popup?'<br>':'')+desc;
    // Obtener estilo
    var styleUrl=pm.querySelector('styleUrl');
    var estilo={};
    if(styleUrl){var sid=styleUrl.textContent.replace('#','');estilo=estilos[sid]||{};}
    // Geometrías
    var point=pm.querySelector('Point');
    var line=pm.querySelector('LineString');
    var polygon=pm.querySelector('Polygon');
    var subLayer=null;
    var tipoGeo='';
    if(point){
      var coordsEl=point.querySelector('coordinates');
      if(coordsEl){
        var c=parseKMLCoord(coordsEl.textContent);
        var pColor=estilo.iconColor||'#2ecc71';
        var mk=L.marker([c[0][1],c[0][0]],{icon:L.divIcon({className:'kml-punto-icon',html:'<div style="background:'+pColor+';width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>'+(nombre?'<div class="kml-punto-label">'+nombre+'</div>':''),iconSize:[0,0],iconAnchor:[6,6]})});
        if(popup)mk.bindPopup(popup);
        subLayer=mk;tipoGeo='punto';
      }
    }
    if(line){
      var coordsEl=line.querySelector('coordinates');
      if(coordsEl){
        var coords=parseKMLCoord(coordsEl.textContent);
        var latlngs=coords.map(function(c){return[c[1],c[0]];});
        var opts={color:estilo.lineColor||'#3388ff',weight:estilo.lineWidth||4,opacity:0.85};
        var pl=L.polyline(latlngs,opts);
        if(popup)pl.bindPopup(popup);
        subLayer=pl;tipoGeo='linea';
      }
    }
    if(polygon){
      var outerCoords=polygon.querySelector('outerBoundaryIs coordinates');
      if(!outerCoords){var ob=polygon.querySelector('outerBoundaryIs');if(ob)outerCoords=ob.querySelector('coordinates');}
      if(outerCoords){
        var coords=parseKMLCoord(outerCoords.textContent);
        var latlngs=coords.map(function(c){return[c[1],c[0]];});
        var opts={color:estilo.lineColor||'#3388ff',weight:4,fillColor:estilo.fillColor||'#3388ff',fillOpacity:0.25,opacity:0.85};
        var pg=L.polygon(latlngs,opts);
        if(popup)pg.bindPopup(popup);
        subLayer=pg;tipoGeo='poligono';
      }
    }
    // Extraer ExtendedData (SimpleData, Data)
    var extData={};
    var simpleDataEls=pm.querySelectorAll('SimpleData');
    for(var j=0;j<simpleDataEls.length;j++){
      var sd=simpleDataEls[j],sdName=sd.getAttribute('name');
      if(sdName)extData[sdName]=sd.textContent.trim();
    }
    var dataEls=pm.querySelectorAll('ExtendedData > Data');
    for(var j=0;j<dataEls.length;j++){
      var d=dataEls[j],dName=d.getAttribute('name');
      if(dName){var valEl=d.querySelector('value');extData[dName]=valEl?valEl.textContent.trim():'';}
    }
    // Extraer coordenadas centrales
    var centroLat=null,centroLon=null;
    if(subLayer){
      if(subLayer.getLatLng){var ll=subLayer.getLatLng();centroLat=ll.lat;centroLon=ll.lng;}
      else if(subLayer.getBounds){try{var ct=subLayer.getBounds().getCenter();centroLat=ct.lat;centroLon=ct.lng;}catch(e){}}
    }
    if(subLayer){
      subLayer._kmlIdx=i;
      subLayer._kmlNombre=nombre;
      layers.addLayer(subLayer);
      subcapas.push({idx:i,nombre:nombre,desc:desc,tipo:tipoGeo,layer:subLayer,visible:true,extData:extData,lat:centroLat,lon:centroLon});
    }
  }
  return {group:layers,subcapas:subcapas};
}
function parseKMLCoord(text){
  return text.trim().split(/\s+/).filter(function(s){return s.length>0;}).map(function(c){var p=c.split(',');return[parseFloat(p[0]),parseFloat(p[1]),parseFloat(p[2]||0)];});
}
function kmlColorToHex(kc){
  kc=kc.trim();if(kc.length!==8)return'#3388ff';
  return'#'+kc.substr(6,2)+kc.substr(4,2)+kc.substr(2,2);
}
var capasExpandidas={};
function actualizarListaCapas(){
  var el=document.getElementById('capas-lista');if(!el)return;
  var html='';
  var esAdmin=sesionActual&&sesionActual.rol==='admin';
  var permisos=getPermisosCapas();
  Object.keys(capasKML).forEach(function(nombre){
    var subcapas=capasKMLSubcapas[nombre]||[];
    var totalSub=subcapas.length;
    var visibles=subcapas.filter(function(s){return s.visible;}).length;
    var nombreEsc=nombre.replace(/'/g,"\\'");
    var capaId=nombre.replace(/[^a-zA-Z0-9]/g,'_');
    var labelsActivas=capasKMLLabels[nombre]||false;
    var expandida=capasExpandidas[nombre]||false;

    html+='<div class="capa-bloque">';
    // Cabecera
    html+='<div class="capas-item">';
    html+='<span class="capa-toggle-expand" onclick="toggleExpandCapa(\''+nombreEsc+'\')">'+(expandida?'▼':'▶')+' '+nombre+' <span style="font-weight:normal;color:#666">('+visibles+'/'+totalSub+')</span></span>';
    html+='<div class="capas-actions">';
    html+='<button style="background:#3498db;font-size:.7rem;padding:3px 8px" onclick="zoomACapa(\''+nombreEsc+'\')" title="Zoom a toda la capa">🔍</button>';
    html+='<button style="background:#e67e22;font-size:.7rem;padding:3px 8px" onclick="abrirTablaAtributos(\''+nombreEsc+'\')" title="Tabla de atributos">📊</button>';
    var labelTitle=labelsActivas?(capasKMLCampoLabel[nombre]||'').replace('_nombre','Nombre'):'Etiquetas';
    html+='<button style="background:'+(labelsActivas?'#27ae60':'#95a5a6')+';font-size:.7rem;padding:3px 8px" onclick="toggleEtiquetasCapa(\''+nombreEsc+'\')" title="'+(labelsActivas?'Etiquetas: '+labelTitle+' (pulsa para quitar)':'Mostrar etiquetas')+'">🏷️'+(labelsActivas?' '+labelTitle:'')+'</button>';
    if(esAdmin){
      html+='<button class="btn-asignar" onclick="abrirModalCapasPerm(\''+nombreEsc+'\')" title="Asignar usuarios">👥</button>';
      html+='<button onclick="eliminarCapaMapa(\''+nombreEsc+'\')" title="Eliminar capa">✖</button>';
    }
    html+='</div>';
    if(esAdmin){
      var p=permisos[nombre];
      if(p){
        html+='<div class="capas-permisos">';
        if(p.todos){html+='<span class="badge-perm badge-todos">Todos</span>';}
        else if(p.operadores&&p.operadores.length>0){var usuarios=getUsuariosLocal();p.operadores.forEach(function(email){var u=usuarios.find(function(x){return x.email===email;});html+='<span class="badge-perm">'+(u?u.nombre:email)+'</span>';});}
        else{html+='<span class="badge-perm" style="background:#fde8e8;color:#e74c3c">Sin asignar</span>';}
        html+='</div>';
      }
    }
    html+='</div>';
    // Controles de estilo siempre visibles
    if(totalSub>0){
      var est=capasKMLEstilo[nombre]||{peso:4,opacidad:85};
      html+='<div class="capa-estilo-controls">';
      html+='<div class="capa-estilo-row"><label>✏️ Grosor <b id="capa-peso-val-'+capaId+'">'+est.peso+'px</b></label><input type="range" min="1" max="12" value="'+est.peso+'" oninput="cambiarEstiloCapa(\''+nombreEsc+'\',\'peso\',this.value);document.getElementById(\'capa-peso-val-'+capaId+'\').textContent=this.value+\'px\'"></div>';
      html+='<div class="capa-estilo-row"><label>👁️ Opacidad <b id="capa-opa-val-'+capaId+'">'+est.opacidad+'%</b></label><input type="range" min="5" max="100" step="5" value="'+est.opacidad+'" oninput="cambiarEstiloCapa(\''+nombreEsc+'\',\'opacidad\',this.value);document.getElementById(\'capa-opa-val-'+capaId+'\').textContent=this.value+\'%\'"></div>';
      html+='</div>';
    }

    // Tabla de subcapas
    html+='<div id="capa-tabla-'+capaId+'" style="display:'+(expandida?'block':'none')+'">';
    if(totalSub>0){
      // Selectores de campo para etiquetas y buscador
      var camposDisp=obtenerCamposDisponiblesCapa(nombre);
      if(camposDisp.length>0){
        var campoLabelActual=capasKMLCampoLabel[nombre]||'';
        var campoBuscarActual=capasKMLCampoBuscar[nombre]||'';
        html+='<div class="capa-campo-selectors">';
        // Selector de etiquetas
        html+='<div class="capa-campo-row"><label>🏷️ Etiquetas</label><select class="capa-campo-select" onchange="cambiarCampoEtiquetaCapa(\''+nombreEsc+'\',this.value)">';
        html+='<option value=""'+(campoLabelActual===''?' selected':'')+'>Sin etiquetas</option>';
        html+='<option value="_nombre"'+(campoLabelActual==='_nombre'?' selected':'')+'>Nombre del elemento</option>';
        camposDisp.forEach(function(c){
          html+='<option value="'+c.replace(/"/g,'&quot;')+'"'+(campoLabelActual===c?' selected':'')+'>'+c+'</option>';
        });
        html+='</select></div>';
        // Selector de buscador
        html+='<div class="capa-campo-row"><label>🔎 Buscador</label><select class="capa-campo-select" onchange="cambiarCampoBuscarCapa(\''+nombreEsc+'\',this.value)">';
        html+='<option value=""'+(campoBuscarActual===''?' selected':'')+'>Todos los campos</option>';
        html+='<option value="_nombre"'+(campoBuscarActual==='_nombre'?' selected':'')+'>Nombre del elemento</option>';
        camposDisp.forEach(function(c){
          html+='<option value="'+c.replace(/"/g,'&quot;')+'"'+(campoBuscarActual===c?' selected':'')+'>'+c+'</option>';
        });
        html+='</select></div>';
        html+='</div>';
      }
      // Buscador
      html+='<input type="text" class="capa-tabla-buscar" placeholder="Buscar en '+totalSub+' elementos..." oninput="filtrarTablaCapas(\''+nombreEsc+'\',this.value)">';
      // Tabla
      html+='<div class="capa-tabla-wrap"><table class="capa-tabla"><thead><tr>';
      html+='<th class="col-check"><input type="checkbox" title="Seleccionar todos" onchange="toggleTodasSubcapas(\''+nombreEsc+'\',this.checked)"'+(visibles===totalSub?' checked':'')+'></th>';
      html+='<th>Nombre</th><th class="col-tipo">Tipo</th><th class="col-acciones">Zoom</th>';
      html+='</tr></thead><tbody id="capa-tbody-'+capaId+'">';
      var iconos={punto:'📍',linea:'〰️',poligono:'⬡'};
      subcapas.forEach(function(sc,idx){
        var scNombre=obtenerNombreDisplaySC(sc,idx,nombre);
        // Generar texto de búsqueda según campo seleccionado
        var campoBusc=capasKMLCampoBuscar[nombre]||'';
        var textoBusq='';
        if(campoBusc==='_nombre'){textoBusq=(sc.nombre||'').toLowerCase();}
        else if(campoBusc&&sc.extData&&sc.extData[campoBusc]){textoBusq=String(sc.extData[campoBusc]).toLowerCase();}
        else{
          // Todos los campos: nombre + todos los extData
          textoBusq=(sc.nombre||'').toLowerCase();
          if(sc.extData){Object.keys(sc.extData).forEach(function(k){textoBusq+=' '+String(sc.extData[k]).toLowerCase();});}
        }
        html+='<tr class="'+(sc.visible?'':'fila-oculta')+'" data-nombre="'+scNombre.toLowerCase()+'" data-buscar="'+textoBusq.replace(/"/g,'&quot;')+'">';
        html+='<td class="col-check"><input type="checkbox"'+(sc.visible?' checked':'')+' onchange="toggleSubcapa(\''+nombreEsc+'\','+idx+',this.checked)"></td>';
        html+='<td class="col-nombre" title="'+(sc.desc||scNombre)+'">'+scNombre+'</td>';
        html+='<td class="col-tipo">'+(iconos[sc.tipo]||'')+'</td>';
        html+='<td class="col-acciones"><button class="btn-zoom" onclick="zoomASubcapa(\''+nombreEsc+'\','+idx+')">🔍 Ir</button></td>';
        html+='</tr>';
      });
      html+='</tbody></table></div>';
      // Footer
      html+='<div class="capa-tabla-footer"><span>'+visibles+' de '+totalSub+' visibles</span><span><button style="background:#3498db;color:#fff;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:.7rem" onclick="toggleTodasSubcapas(\''+nombreEsc+'\',true);actualizarListaCapas()">Mostrar todas</button> <button style="background:#95a5a6;color:#fff;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:.7rem" onclick="toggleTodasSubcapas(\''+nombreEsc+'\',false);actualizarListaCapas()">Ocultar todas</button></span></div>';
    }else{
      html+='<div style="padding:10px;text-align:center;color:#999;font-size:.8rem">Sin elementos</div>';
    }
    html+='</div>';
    html+='</div>';
  });
  el.innerHTML=html;
}
function toggleExpandCapa(nombre){
  capasExpandidas[nombre]=!capasExpandidas[nombre];
  actualizarListaCapas();
}
function cambiarEstiloCapa(nombre,prop,valor){
  if(!capasKMLEstilo[nombre])capasKMLEstilo[nombre]={peso:4,opacidad:85};
  var est=capasKMLEstilo[nombre];
  var v=parseInt(valor);
  if(prop==='peso')est.peso=v;
  else if(prop==='opacidad')est.opacidad=v;
  // Aplicar a todas las subcapas
  var subcapas=capasKMLSubcapas[nombre]||[];
  subcapas.forEach(function(sc){
    if(sc.tipo==='linea'||sc.tipo==='poligono'){
      var newStyle={weight:est.peso,opacity:est.opacidad/100};
      if(sc.tipo==='poligono')newStyle.fillOpacity=Math.max(0.05,est.opacidad/100-0.15);
      try{sc.layer.setStyle(newStyle);}catch(e){}
    }
  });
}
function filtrarTablaCapas(nombre,query){
  var capaId=nombre.replace(/[^a-zA-Z0-9]/g,'_');
  var tbody=document.getElementById('capa-tbody-'+capaId);
  if(!tbody)return;
  var q=query.toLowerCase().trim();
  var filas=tbody.querySelectorAll('tr');
  for(var i=0;i<filas.length;i++){
    var textoBuscar=filas[i].getAttribute('data-buscar')||filas[i].getAttribute('data-nombre')||'';
    filas[i].style.display=(!q||textoBuscar.indexOf(q)!==-1)?'':'none';
  }
}
function zoomACapa(nombre){
  if(!mapaLeaflet||!capasKML[nombre])return;
  try{mapaLeaflet.fitBounds(capasKML[nombre].getBounds(),{padding:[30,30]});}catch(e){}
}
function zoomASubcapa(nombre,idx){
  if(!mapaLeaflet)return;
  var subcapas=capasKMLSubcapas[nombre];
  if(!subcapas||!subcapas[idx])return;
  var sc=subcapas[idx];
  // Si está oculta, hacerla visible primero
  if(!sc.visible){
    capasKML[nombre].addLayer(sc.layer);
    sc.visible=true;
    actualizarListaCapas();
  }
  var lyr=sc.layer;
  if(lyr.getBounds){try{mapaLeaflet.fitBounds(lyr.getBounds(),{padding:[40,40]});}catch(e){}}
  else if(lyr.getLatLng){mapaLeaflet.setView(lyr.getLatLng(),16);}
  setTimeout(function(){try{lyr.openPopup();}catch(e){}},300);
}
function toggleSubcapa(nombre,idx,checked){
  if(!mapaLeaflet)return;
  var subcapas=capasKMLSubcapas[nombre];
  if(!subcapas||!subcapas[idx])return;
  var sc=subcapas[idx];
  if(checked&&!sc.visible){
    capasKML[nombre].addLayer(sc.layer);sc.visible=true;
  }else if(!checked&&sc.visible){
    capasKML[nombre].removeLayer(sc.layer);sc.visible=false;
  }
  actualizarListaCapas();
}
function toggleTodasSubcapas(nombre,mostrar){
  if(!mapaLeaflet)return;
  var subcapas=capasKMLSubcapas[nombre];
  if(!subcapas)return;
  subcapas.forEach(function(sc){
    if(mostrar&&!sc.visible){capasKML[nombre].addLayer(sc.layer);sc.visible=true;}
    else if(!mostrar&&sc.visible){capasKML[nombre].removeLayer(sc.layer);sc.visible=false;}
  });
}
function obtenerIdUnidadDesdeExtData(sc){
  // Buscar campo ID_Unidad (o variantes) en extData del KML
  if(!sc.extData)return '';
  var campos=['ID_Unidad','Id_Unidad','id_unidad','idUnidad','ID_UNIDAD','IdUnidad','IDUNIDAD','Id_unidad'];
  for(var i=0;i<campos.length;i++){
    if(sc.extData[campos[i]]&&String(sc.extData[campos[i]]).trim())return String(sc.extData[campos[i]]).trim();
  }
  // Buscar parcialmente (por si el campo contiene "unidad" en el nombre)
  var keys=Object.keys(sc.extData);
  for(var i=0;i<keys.length;i++){
    if(keys[i].toLowerCase().indexOf('unidad')!==-1&&String(sc.extData[keys[i]]).trim()){
      return String(sc.extData[keys[i]]).trim();
    }
  }
  return '';
}
function obtenerNombreDisplaySC(sc,idx,nombreCapa){
  // Obtener el mejor nombre para mostrar de una subcapa KML
  // 1. Si el usuario ya eligió un campo de etiqueta para esta capa, usar ese
  if(nombreCapa&&capasKMLCampoLabel[nombreCapa]){
    var campo=capasKMLCampoLabel[nombreCapa];
    if(campo==='_nombre'&&sc.nombre&&sc.nombre!=='0'&&sc.nombre.trim())return sc.nombre.trim();
    if(campo!=='_nombre'&&sc.extData&&sc.extData[campo]&&String(sc.extData[campo]).trim())return String(sc.extData[campo]).trim();
  }
  // 2. Intentar ID_Unidad
  var idU=obtenerIdUnidadDesdeExtData(sc);
  if(idU)return idU;
  // 3. Si sc.nombre es útil (no es "0", no vacío, no solo números cortos)
  if(sc.nombre&&sc.nombre.trim()&&!/^\d{1,2}$/.test(sc.nombre.trim()))return sc.nombre.trim();
  // 4. Buscar campos identificadores comunes en extData
  if(sc.extData){
    var camposId=['Name','NOMBRE','Nombre','nombre','name','ID','Id','id','CODIGO','Codigo','codigo','PARCELA','Parcela','parcela','REFERENCIA','Referencia','referencia','COTO','Coto','coto','DENOMINACION','Denominacion','denominacion','DESCRIPCION','Descripcion','descripcion','TITULO','Titulo','titulo'];
    for(var i=0;i<camposId.length;i++){
      if(sc.extData[camposId[i]]&&String(sc.extData[camposId[i]]).trim())return String(sc.extData[camposId[i]]).trim();
    }
    // 5. Usar el primer campo no vacío de extData
    var keys=Object.keys(sc.extData);
    for(var i=0;i<keys.length;i++){
      var v=String(sc.extData[keys[i]]).trim();
      if(v&&v.length>0&&v.length<=80)return v;
    }
  }
  // 6. Fallback
  return 'Elemento '+(idx+1);
}

var capasKMLCampoLabel={}; // Guardar qué campo se usa como etiqueta por capa
var capasKMLCampoBuscar={}; // Guardar qué campo se usa como buscador por capa

function toggleEtiquetasCapa(nombre){
  if(!mapaLeaflet)return;
  // Si ya hay etiquetas, quitarlas
  if(capasKMLLabels[nombre]){
    capasKMLLabels[nombre].forEach(function(lbl){mapaLeaflet.removeLayer(lbl);});
    delete capasKMLLabels[nombre];
    delete capasKMLCampoLabel[nombre];
    actualizarListaCapas();
    return;
  }
  // Recopilar campos disponibles en extData de la capa
  var subcapas=capasKMLSubcapas[nombre]||[];
  var camposSet={};
  subcapas.forEach(function(sc){
    if(sc.extData){
      Object.keys(sc.extData).forEach(function(k){
        // Solo mostrar campos que tengan algún valor no vacío
        if(String(sc.extData[k]).trim())camposSet[k]=true;
      });
    }
  });
  var campos=Object.keys(camposSet);
  // Si hay campos, mostrar selector; si no, usar nombre del placemark
  if(campos.length>0){
    mostrarSelectorCampoEtiqueta(nombre,campos);
  }else{
    aplicarEtiquetasCapa(nombre,'_nombre');
  }
}

function mostrarSelectorCampoEtiqueta(nombre,campos){
  // Crear overlay con selector de campo
  var overlay=document.getElementById('label-field-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='label-field-overlay';
    overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML='<div style="background:#fff;border-radius:10px;padding:20px;max-width:340px;width:90%;max-height:70vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,.3)"><div style="font-weight:bold;font-size:1.1rem;color:#1a3d2e;margin-bottom:12px">🏷️ Elegir campo para etiquetas</div><div id="label-field-list"></div><div style="margin-top:12px;display:flex;gap:8px"><button id="label-field-cancel" style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer">Cancelar</button></div></div>';
    document.body.appendChild(overlay);
  }
  var list=document.getElementById('label-field-list');
  var h='';
  // Opción "Nombre del elemento" (el <name> del KML)
  h+='<button class="label-field-btn" data-field="_nombre" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;border:1px solid #ddd;border-radius:6px;background:#f9f9f9;cursor:pointer;font-size:.9rem"><strong>Nombre del elemento</strong><br><span style="color:#888;font-size:.8rem">(campo &lt;name&gt; del KML)</span></button>';
  // Campos de ExtendedData
  campos.forEach(function(campo){
    // Mostrar ejemplo del primer valor
    var ejemplo='';
    var subcapas=capasKMLSubcapas[nombre]||[];
    for(var i=0;i<subcapas.length&&!ejemplo;i++){
      if(subcapas[i].extData&&subcapas[i].extData[campo])ejemplo=String(subcapas[i].extData[campo]).substring(0,40);
    }
    h+='<button class="label-field-btn" data-field="'+campo.replace(/"/g,'&quot;')+'" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;border:1px solid #ddd;border-radius:6px;background:#f9f9f9;cursor:pointer;font-size:.9rem"><strong>'+campo+'</strong>'+(ejemplo?'<br><span style="color:#888;font-size:.8rem">ej: '+ejemplo+'</span>':'')+'</button>';
  });
  list.innerHTML=h;
  overlay.style.display='flex';
  // Event listeners
  var btns=list.querySelectorAll('.label-field-btn');
  for(var i=0;i<btns.length;i++){
    btns[i].onclick=function(){
      var field=this.getAttribute('data-field');
      overlay.style.display='none';
      aplicarEtiquetasCapa(nombre,field);
    };
  }
  document.getElementById('label-field-cancel').onclick=function(){overlay.style.display='none';};
  overlay.onclick=function(e){if(e.target===overlay)overlay.style.display='none';};
}

function aplicarEtiquetasCapa(nombre,campo){
  var subcapas=capasKMLSubcapas[nombre]||[];
  var labels=[];
  capasKMLCampoLabel[nombre]=campo;
  subcapas.forEach(function(sc){
    if(!sc.visible)return;
    var lyr=sc.layer;
    var centro=null;
    if(lyr.getLatLng)centro=lyr.getLatLng();
    else if(lyr.getBounds)try{centro=lyr.getBounds().getCenter();}catch(e){}
    if(!centro)return;
    // Obtener texto según el campo seleccionado
    var textoLabel='';
    if(campo==='_nombre'){
      textoLabel=sc.nombre||'';
    }else{
      textoLabel=(sc.extData&&sc.extData[campo])?String(sc.extData[campo]).trim():'';
    }
    if(!textoLabel)return;
    var label=L.marker(centro,{icon:L.divIcon({className:'kml-label',html:'<span>'+textoLabel+'</span>',iconSize:[0,0],iconAnchor:[0,10]}),interactive:false,zIndexOffset:-100});
    label.addTo(mapaLeaflet);
    labels.push(label);
  });
  capasKMLLabels[nombre]=labels;
  actualizarListaCapas();
  if(labels.length===0)showToast('Sin elementos para etiquetar','info');
  else showToast('Etiquetas: '+campo.replace('_nombre','Nombre')+' ('+labels.length+')','success');
}
function obtenerCamposDisponiblesCapa(nombre){
  var subcapas=capasKMLSubcapas[nombre]||[];
  var camposSet={};
  subcapas.forEach(function(sc){
    if(sc.extData){
      Object.keys(sc.extData).forEach(function(k){
        if(String(sc.extData[k]).trim())camposSet[k]=true;
      });
    }
  });
  return Object.keys(camposSet);
}
function cambiarCampoEtiquetaCapa(nombre,campo){
  // Quitar etiquetas existentes si las hay
  if(capasKMLLabels[nombre]){
    capasKMLLabels[nombre].forEach(function(lbl){mapaLeaflet.removeLayer(lbl);});
    delete capasKMLLabels[nombre];
    delete capasKMLCampoLabel[nombre];
  }
  if(!campo){actualizarListaCapas();return;} // "Sin etiquetas"
  aplicarEtiquetasCapa(nombre,campo);
}
function cambiarCampoBuscarCapa(nombre,campo){
  capasKMLCampoBuscar[nombre]=campo||'';
  actualizarListaCapas();
}
function eliminarCapaMapa(nombre){
  if(capasKML[nombre]){
    mapaLeaflet.removeLayer(capasKML[nombre]);
    if(controlCapas)controlCapas.removeLayer(capasKML[nombre]);
    delete capasKML[nombre];delete capasKMLRaw[nombre];delete capasKMLSubcapas[nombre];delete capasKMLEstilo[nombre];delete capasKMLCampoBuscar[nombre];
    // Limpiar etiquetas
    if(capasKMLLabels[nombre]){capasKMLLabels[nombre].forEach(function(l){mapaLeaflet.removeLayer(l);});delete capasKMLLabels[nombre];}
    // Limpiar permisos
    var permisos=getPermisosCapas();
    delete permisos[nombre];
    guardarPermisosCapas(permisos);
    actualizarListaCapas();guardarCapasKMLLocal();eliminarCapaKMLdeDB(nombre);
    showToast('Capa eliminada','success');
  }
}
function limpiarCapasMapa(){
  if(Object.keys(capasKML).length===0){showToast('No hay capas','info');return;}
  if(!confirm('¿Eliminar todas las capas?'))return;
  Object.keys(capasKML).forEach(function(k){mapaLeaflet.removeLayer(capasKML[k]);if(controlCapas)controlCapas.removeLayer(capasKML[k]);});
  // Limpiar etiquetas
  Object.keys(capasKMLLabels).forEach(function(k){capasKMLLabels[k].forEach(function(l){mapaLeaflet.removeLayer(l);});});
  capasKML={};capasKMLRaw={};capasKMLSubcapas={};capasKMLLabels={};capasKMLEstilo={};
  guardarPermisosCapas({});
  actualizarListaCapas();guardarCapasKMLLocal();
  if(fotosDB){try{var tx=fotosDB.transaction(['capas_kml'],'readwrite');tx.objectStore('capas_kml').clear();}catch(e){}}
  showToast('Capas eliminadas','success');
}
function centrarEnMiPosicion(){
  if(!mapaLeaflet)initMapa();
  if(!currentLat||!currentLon){showToast('Sin señal GPS','error');return;}
  if(marcadorPosicion){marcadorPosicion.setLatLng([currentLat,currentLon]);}
  else{marcadorPosicion=L.marker([currentLat,currentLon],{icon:L.divIcon({className:'',html:'<div style="background:#3498db;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,.4)"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(mapaLeaflet).bindPopup('Mi posición');}
  mapaLeaflet.setView([currentLat,currentLon],16);
}

// --- Pantalla completa del mapa ---
var mapaFullscreen=false;
function toggleMapaFullscreen(){
  mapaFullscreen=!mapaFullscreen;
  if(mapaFullscreen){
    document.body.classList.add('mapa-fullscreen');
    // Sync filtro tipo
    var fs=document.getElementById('mapa-filtro-tipo-fs');
    if(fs)fs.value=document.getElementById('mapa-filtro-tipo')?document.getElementById('mapa-filtro-tipo').value:'';
  }else{
    document.body.classList.remove('mapa-fullscreen');
    document.getElementById('mapa-search-float').style.display='none';
  }
  // Leaflet necesita recalcular tamaño
  setTimeout(function(){if(mapaLeaflet)mapaLeaflet.invalidateSize();},100);
}
function toggleMapaSearchFS(){
  var el=document.getElementById('mapa-search-float');
  if(el.style.display==='block'){el.style.display='none';}
  else{el.style.display='block';document.getElementById('mapa-search-fs').focus();}
}

// --- Exportar Mapa PDF por Unidad ---
function abrirExportarMapaPDF(){
  var panel=document.getElementById('mapa-pdf-panel');
  var sel=document.getElementById('mapa-pdf-unidad');
  var h='<option value="">Selecciona unidad...</option>';
  // 1. Elementos de capas KML/KMZ cargadas
  var yaIncluidas={};
  Object.keys(capasKMLSubcapas).forEach(function(nombreCapa){
    var subcapas=capasKMLSubcapas[nombreCapa]||[];
    if(subcapas.length===0)return;
    h+='<optgroup label="📂 '+nombreCapa+'">';
    subcapas.forEach(function(sc,idx){
      var scNombre=obtenerNombreDisplaySC(sc,idx,nombreCapa);
      h+='<option value="kml_'+nombreCapa+'_'+idx+'">'+scNombre+'</option>';
      yaIncluidas[scNombre.toUpperCase()]=true;
      var idUnidadExt=obtenerIdUnidadDesdeExtData(sc);
      if(idUnidadExt)yaIncluidas[idUnidadExt.toUpperCase()]=true;
    });
    h+='</optgroup>';
  });
  // 2. Infraestructuras que no estén ya en KML
  var infras=getInfras();
  var infrasNoKML=infras.filter(function(inf){
    return !yaIncluidas[(inf.idUnidad||'').toUpperCase()];
  });
  if(infrasNoKML.length>0){
    h+='<optgroup label="🌳 Infraestructuras">';
    infrasNoKML.forEach(function(inf){
      h+='<option value="'+inf.id+'">'+(inf.idUnidad||'--')+' — '+(inf.nombre||'Sin nombre')+'</option>';
    });
    h+='</optgroup>';
  }
  // 3. Unidades de registros sin infraestructura ni KML
  var rs=getRegistrosUsuario();
  var unidadesYa={};
  infras.forEach(function(inf){if(inf.idUnidad)unidadesYa[inf.idUnidad.toUpperCase()]=true;});
  Object.keys(yaIncluidas).forEach(function(k){unidadesYa[k]=true;});
  var unidadesSueltas={};
  rs.forEach(function(r){
    if(r.unidad){var u=r.unidad.toUpperCase();if(!unidadesYa[u]&&!unidadesSueltas[u]){unidadesSueltas[u]=r.unidad;}}
  });
  if(Object.keys(unidadesSueltas).length>0){
    h+='<optgroup label="📂 Solo registros">';
    Object.keys(unidadesSueltas).forEach(function(u){
      h+='<option value="reg_'+u+'">'+unidadesSueltas[u]+'</option>';
    });
    h+='</optgroup>';
  }
  sel.innerHTML=h;
  panel.style.display='block';
}

function exportarMapaUnidadPDF(){
  var sel=document.getElementById('mapa-pdf-unidad');
  var val=sel.value;
  if(!val){showToast('Selecciona una unidad','error');return;}

  showLoading(true);
  var infra=null,unidadId='';
  var lat=null,lon=null;
  var kmlLayer=null; // Guardar referencia al layer KML para fitBounds

  if(val.indexOf('kml_')===0){
    // Elemento de capa KML — extraer nombre de capa e índice
    var parts=val.replace('kml_','');
    var lastUnderscore=parts.lastIndexOf('_');
    var nombreCapa=parts.substring(0,lastUnderscore);
    var idx=parseInt(parts.substring(lastUnderscore+1));
    var subcapas=capasKMLSubcapas[nombreCapa];
    if(subcapas&&subcapas[idx]){
      var sc=subcapas[idx];
      var scDisplay=obtenerNombreDisplaySC(sc,idx,nombreCapa);
      var idUnidadKML=obtenerIdUnidadDesdeExtData(sc);
      unidadId=scDisplay;
      kmlLayer=sc.layer;
      // Intentar vincular con infraestructura existente
      var infras=getInfras();
      var textosBusca=[scDisplay,idUnidadKML,(sc.nombre||'').trim()].filter(function(t){return t&&t.length>0;});
      // Eliminar duplicados
      var uniqueBusca={};textosBusca=textosBusca.filter(function(t){var k=t.toUpperCase();if(uniqueBusca[k])return false;uniqueBusca[k]=true;return true;});
      for(var t=0;t<textosBusca.length&&!infra;t++){
        var buscaNorm=textosBusca[t].toUpperCase();
        for(var i=0;i<infras.length;i++){
          var idU=(infras[i].idUnidad||'').trim().toUpperCase();
          if(idU&&(buscaNorm===idU||buscaNorm.indexOf(idU)!==-1||idU.indexOf(buscaNorm)!==-1)){
            infra=infras[i];unidadId=infra.idUnidad;break;
          }
        }
      }
      // Obtener coordenadas del centro del elemento KML
      if(sc.lat&&sc.lon){lat=sc.lat;lon=sc.lon;}
      else if(sc.layer){
        if(sc.layer.getLatLng){var ll=sc.layer.getLatLng();lat=ll.lat;lon=ll.lng;}
        else if(sc.layer.getBounds){try{var ct=sc.layer.getBounds().getCenter();lat=ct.lat;lon=ct.lng;}catch(e){}}
      }
    }
  }else if(val.indexOf('reg_')===0){
    unidadId=val.replace('reg_','');
  }else{
    var infras=getInfras();
    infra=infras.find(function(i){return i.id===parseInt(val)||i.id===val;});
    if(infra)unidadId=infra.idUnidad||'';
  }

  // Recopilar registros de esta unidad
  var rs=getRegistrosUsuario().filter(function(r){
    return r.unidad&&r.unidad.toUpperCase()===unidadId.toUpperCase();
  });
  var vpCount=0,elCount=0,eiCount=0;
  rs.forEach(function(r){if(r.tipo==='VP')vpCount++;else if(r.tipo==='EL')elCount++;else eiCount++;});

  // Centrar mapa en la unidad si tiene coordenadas
  if(!lat&&!lon){
    if(infra&&infra.lat&&infra.lon){lat=parseFloat(infra.lat);lon=parseFloat(infra.lon);}
    else{
      for(var i=0;i<rs.length;i++){if(rs[i].lat&&rs[i].lon){lat=rs[i].lat;lon=rs[i].lon;break;}}
    }
  }

  if(mapaLeaflet){
    // Si es un polígono/línea KML, ajustar la vista a sus bounds para que ocupe todo
    if(kmlLayer&&kmlLayer.getBounds){
      try{
        mapaLeaflet.fitBounds(kmlLayer.getBounds(),{padding:[20,20],animate:false});
      }catch(e){
        if(lat&&lon)mapaLeaflet.setView([lat,lon],15);
      }
    }else if(lat&&lon){
      mapaLeaflet.setView([lat,lon],15);
    }
    // Pasar extData del KML seleccionado para enriquecer el cajetín
    var kmlExtData=null;
    if(val.indexOf('kml_')===0){
      var _parts=val.replace('kml_','');var _lastU=_parts.lastIndexOf('_');
      var _nc=_parts.substring(0,_lastU);var _ix=parseInt(_parts.substring(_lastU+1));
      var _scs=capasKMLSubcapas[_nc];
      if(_scs&&_scs[_ix])kmlExtData=_scs[_ix].extData||null;
    }
    setTimeout(function(){capturarYGenerarPDF(infra,unidadId,lat,lon,kmlExtData);},800);
  }else{
    capturarYGenerarPDF(infra,unidadId,lat,lon,null);
  }
}

function capturarYGenerarPDF(infra,unidadId,lat,lon,kmlExtData){
  var mapaEl=document.getElementById('mapa');
  var zoom=mapaLeaflet?mapaLeaflet.getZoom():15;

  function generarConImagen(imgData){
    var html=generarHTMLMapaPDF(infra,unidadId,lat,lon,imgData,zoom,kmlExtData);
    var w=window.open('','_blank');
    if(!w){showToast('Permite ventanas emergentes para generar PDF','error');showLoading(false);return;}
    w.document.write(html);
    w.document.close();
    showLoading(false);
    document.getElementById('mapa-pdf-panel').style.display='none';
  }

  // Intentar capturar mapa con html2canvas
  if(typeof html2canvas!=='undefined'&&mapaEl){
    html2canvas(mapaEl,{useCORS:true,allowTaint:true,scale:2,logging:false}).then(function(canvas){
      generarConImagen(canvas.toDataURL('image/jpeg',0.90));
    }).catch(function(e){
      console.error('Error capturando mapa:',e);
      generarConImagen(null);
    });
  }else{
    generarConImagen(null);
  }
}

function calcularEscalaMapa(lat,zoom){
  // Resolución en metros/pixel a nivel del mar: 156543.03 * cos(lat) / 2^zoom
  var metrosPorPixel=156543.03*Math.cos(lat*Math.PI/180)/Math.pow(2,zoom);
  // A4 impreso a 96 DPI: ~190mm de ancho útil = ~718 pixels
  // Con scale:2 en html2canvas el mapa tiene más resolución, pero al imprimir
  // se ajusta al ancho de página. Estimamos ~718px de ancho visible en pantalla
  var anchoPxMapa=document.getElementById('mapa')?document.getElementById('mapa').offsetWidth:718;
  var anchoMetros=anchoPxMapa*metrosPorPixel;
  // Escala = anchoMetros / anchoReal en papel (0.19m para A4 con márgenes)
  var escalaNum=Math.round(anchoMetros/0.19);
  // Redondear a número "bonito"
  var bonitos=[500,1000,2000,2500,5000,10000,15000,20000,25000,50000,75000,100000,150000,200000,250000,500000];
  var mejor=escalaNum;
  for(var i=0;i<bonitos.length;i++){
    if(bonitos[i]>=escalaNum*0.7){mejor=bonitos[i];break;}
  }
  return '1:'+mejor.toLocaleString('es-ES');
}

function generarHTMLMapaPDF(infra,unidadId,lat,lon,imgData,zoom,kmlExtData){
  var fecha=new Date().toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'});
  var escala=(lat&&zoom)?calcularEscalaMapa(lat,zoom):'N/D';
  // Obtener datos del cajetín: prioridad infraestructura > extData del KML
  var ext=kmlExtData||{};
  function extVal(campos){
    for(var i=0;i<campos.length;i++){
      var keys=Object.keys(ext);
      for(var j=0;j<keys.length;j++){
        if(keys[j].toLowerCase().replace(/[_\s]/g,'')===campos[i].toLowerCase().replace(/[_\s]/g,'')&&String(ext[keys[j]]).trim()){
          return String(ext[keys[j]]).trim();
        }
      }
    }
    return '';
  }
  var monte=infra?(infra.nombre||''):extVal(['nombre','monte','name','NOMBRE','Monte']);
  var idZona=infra?(infra.idZona||''):extVal(['idZona','ID_Zona','Id_Zona','IDZONA','zona']);
  var municipio=infra?(infra.municipio||''):extVal(['municipio','Municipio','MUNICIPIO','municipios']);
  var superficie=infra?(infra.superficie||''):extVal(['superficie','Superficie','SUPERFICIE','sup','area','Area','hectareas','Hectareas','has']);

  var h='<!DOCTYPE html><html><head><meta charset="utf-8"><title>RAPCA — '+(unidadId||'Mapa')+'</title>';
  h+='<style>';
  h+='@page{size:A4 landscape;margin:0}';
  h+='*{margin:0;padding:0;box-sizing:border-box}';
  h+='html,body{width:100%;height:100%;overflow:hidden;font-family:Arial,Helvetica,sans-serif}';
  h+='.page{position:relative;width:297mm;height:210mm;overflow:hidden;background:#fff}';
  // Borde del plano
  h+='.marco{position:absolute;top:5mm;left:5mm;right:5mm;bottom:5mm;border:2px solid #1a3d2e}';
  // Mapa ocupa todo
  h+='.mapa-container{position:absolute;top:5mm;left:5mm;right:5mm;bottom:5mm;overflow:hidden}';
  h+='.mapa-container img{width:100%;height:100%;object-fit:cover}';
  // Sin mapa — fondo gris
  h+='.sin-mapa{width:100%;height:100%;background:#e8e8e8;display:flex;align-items:center;justify-content:center;color:#999;font-size:1.5rem}';
  // Título RAPCA arriba centrado
  h+='.titulo{position:absolute;top:7mm;left:50%;transform:translateX(-50%);background:rgba(26,61,46,0.92);color:#fff;padding:6px 28px;border-radius:6px;font-size:14pt;font-weight:bold;letter-spacing:2px;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3)}';
  // Cajetín abajo izquierda
  h+='.cajetin{position:absolute;bottom:8mm;left:8mm;background:rgba(255,255,255,0.95);border:2px solid #1a3d2e;border-radius:4px;padding:0;width:72mm;z-index:10;box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden}';
  h+='.cajetin-header{background:#1a3d2e;color:#fff;padding:5px 10px;font-size:9pt;font-weight:bold;letter-spacing:1px;text-align:center}';
  h+='.cajetin-body{padding:6px 10px}';
  h+='.cajetin-row{display:flex;border-bottom:1px solid #ddd;padding:3px 0;font-size:7.5pt;line-height:1.3}';
  h+='.cajetin-row:last-child{border-bottom:none}';
  h+='.cajetin-label{width:28mm;font-weight:bold;color:#1a3d2e;flex-shrink:0}';
  h+='.cajetin-value{flex:1;color:#333}';
  h+='.cajetin-escala{border-top:2px solid #1a3d2e;padding:5px 10px;text-align:center;font-size:8.5pt;font-weight:bold;color:#1a3d2e;background:#f0f7f0}';
  // Barra de escala gráfica abajo derecha
  h+='.escala-grafica{position:absolute;bottom:8mm;right:8mm;z-index:10;text-align:center}';
  h+='.escala-barra{display:flex;height:5mm;border:1px solid #333}';
  h+='.escala-seg{width:15mm;height:100%}.escala-seg.negro{background:#1a3d2e}.escala-seg.blanco{background:#fff}';
  h+='.escala-nums{display:flex;justify-content:space-between;font-size:6pt;color:#333;font-weight:bold;margin-top:1px;width:60mm}';
  h+='.escala-titulo{font-size:6.5pt;color:#555;margin-top:1px}';
  // Norte
  h+='.norte{position:absolute;top:7mm;right:8mm;z-index:10;text-align:center;font-size:10pt;font-weight:bold;color:#1a3d2e;background:rgba(255,255,255,0.9);border-radius:50%;width:14mm;height:14mm;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid #1a3d2e;box-shadow:0 2px 6px rgba(0,0,0,.2)}';
  h+='.norte-arrow{font-size:14pt;line-height:1}';
  h+='.norte-n{font-size:7pt;letter-spacing:1px}';
  // Print
  h+='@media print{html,body{width:297mm;height:210mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{page-break-after:avoid}}';
  h+='</style></head><body>';

  h+='<div class="page">';

  // Mapa como fondo completo
  h+='<div class="mapa-container">';
  if(imgData){
    h+='<img src="'+imgData+'" alt="Mapa">';
  }else{
    h+='<div class="sin-mapa">Sin captura de mapa disponible</div>';
  }
  h+='</div>';

  // Marco/borde
  h+='<div class="marco"></div>';

  // Título RAPCA
  h+='<div class="titulo">RAPCA</div>';

  // Norte
  h+='<div class="norte"><div class="norte-arrow">&#9650;</div><div class="norte-n">N</div></div>';

  // Cajetín con datos
  h+='<div class="cajetin">';
  h+='<div class="cajetin-header">RAPCA &mdash; EMA</div>';
  h+='<div class="cajetin-body">';
  h+='<div class="cajetin-row"><div class="cajetin-label">ID Zona</div><div class="cajetin-value">'+(idZona||'—')+'</div></div>';
  h+='<div class="cajetin-row"><div class="cajetin-label">ID Unidad</div><div class="cajetin-value">'+(unidadId||'—')+'</div></div>';
  h+='<div class="cajetin-row"><div class="cajetin-label">Monte</div><div class="cajetin-value">'+(monte||'—')+'</div></div>';
  h+='<div class="cajetin-row"><div class="cajetin-label">Municipio</div><div class="cajetin-value">'+(municipio||'—')+'</div></div>';
  h+='<div class="cajetin-row"><div class="cajetin-label">Superficie</div><div class="cajetin-value">'+(superficie?superficie+' ha':'—')+'</div></div>';
  h+='<div class="cajetin-row"><div class="cajetin-label">Fecha</div><div class="cajetin-value">'+fecha+'</div></div>';
  h+='</div>';
  h+='<div class="cajetin-escala">Escala aprox. '+escala+'</div>';
  h+='</div>';

  // Escala gráfica
  var metrosPorPx=156543.03*Math.cos((lat||37.8)*Math.PI/180)/Math.pow(2,zoom||15);
  // 15mm en papel ≈ cuántos metros reales (asumiendo 96dpi: 15mm ~ 57px en pantalla)
  var metrosPorSeg=metrosPorPx*57;
  // Redondear segmento a número bonito
  var segs=[50,100,200,250,500,1000,2000,5000,10000];
  var segMetros=metrosPorSeg;
  for(var si=0;si<segs.length;si++){if(segs[si]>=metrosPorSeg*0.5){segMetros=segs[si];break;}}
  var segLabel=segMetros>=1000?(segMetros/1000)+' km':segMetros+' m';
  var seg2=segMetros*2;var seg2Label=seg2>=1000?(seg2/1000)+' km':seg2+' m';
  var seg4=segMetros*4;var seg4Label=seg4>=1000?(seg4/1000)+' km':seg4+' m';

  h+='<div class="escala-grafica">';
  h+='<div class="escala-barra"><div class="escala-seg negro"></div><div class="escala-seg blanco"></div><div class="escala-seg negro"></div><div class="escala-seg blanco"></div></div>';
  h+='<div class="escala-nums"><span>0</span><span>'+segLabel+'</span><span>'+seg2Label+'</span><span>'+seg4Label+'</span></div>';
  h+='<div class="escala-titulo">Escala '+escala+'</div>';
  h+='</div>';

  h+='</div>'; // .page

  h+='<script>setTimeout(function(){window.print();},1200);<\/script>';
  h+='</body></html>';
  return h;
}

// --- Capa de puntos comparativos y buscador ---
var capaComparativas=null;
var puntosComparativos=[];

function construirCapaComparativas(){
  // Recopilar todos los puntos comparativos de todos los registros
  puntosComparativos=[];
  var rs=getRegistrosUsuario();
  rs.forEach(function(r){
    if(!r.lat||!r.lon)return;
    var d=r.datos||{};
    if(!d.fotosComp)return;
    d.fotosComp.forEach(function(fc){
      if(!fc.numero||!fc.waypoint)return;
      var codigos=fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});
      if(codigos.length===0)return;
      puntosComparativos.push({
        lat:r.lat,lon:r.lon,
        unidad:r.unidad||'--',
        waypoint:fc.waypoint,
        tipo:r.tipo,
        fecha:r.fecha,
        operador:r.operador_nombre||'',
        codigos:codigos
      });
    });
  });
  // Crear capa de Leaflet
  if(capaComparativas&&mapaLeaflet){
    mapaLeaflet.removeLayer(capaComparativas);
    if(controlCapas)controlCapas.removeLayer(capaComparativas);
  }
  if(!mapaLeaflet||puntosComparativos.length===0){capaComparativas=null;return;}
  capaComparativas=L.featureGroup();
  puntosComparativos.forEach(function(p){
    var esW1=p.waypoint==='W1';
    var color=esW1?'#e74c3c':'#9b59b6';
    var label=p.waypoint;
    var mk=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<div style="background:'+color+';width:26px;height:26px;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">'+label+'</div>',iconSize:[26,26],iconAnchor:[13,13]})});
    mk.bindPopup('<b>'+p.unidad+' — '+p.waypoint+'</b><br>'+p.tipo+' | '+p.fecha+(p.operador?'<br>'+p.operador:'')+'<br><small>Fotos: '+p.codigos.join(', ')+'</small>');
    capaComparativas.addLayer(mk);
  });
  capaComparativas.addTo(mapaLeaflet);
  if(controlCapas)controlCapas.addOverlay(capaComparativas,'Fotos Comparativas (W1/W2)');
}

function buscarEnMapa(query,resultsId){
  var container=document.getElementById(resultsId);
  if(!container)return;
  if(!query||query.length<1){container.classList.remove('show');container.innerHTML='';return;}
  query=query.toLowerCase();
  var resultados=[];
  // Buscar en puntos comparativos
  puntosComparativos.forEach(function(p){
    var texto=(p.unidad+' '+p.waypoint+' '+p.tipo+' '+p.fecha+' '+p.operador).toLowerCase();
    if(texto.indexOf(query)!==-1){
      resultados.push({tipo:'comp',label:p.unidad+' — '+p.waypoint,sub:p.tipo+' | '+p.fecha+(p.operador?' | '+p.operador:''),lat:p.lat,lon:p.lon,color:p.waypoint==='W1'?'#e74c3c':'#9b59b6',icon:p.waypoint});
    }
  });
  // Buscar en registros con coordenadas
  var rs=getRegistrosUsuario();
  rs.forEach(function(r){
    if(!r.lat||!r.lon)return;
    var texto=(r.unidad+' '+r.tipo+' '+r.fecha+' '+(r.operador_nombre||'')+' '+(r.zona||'')).toLowerCase();
    if(texto.indexOf(query)!==-1){
      var color=r.tipo==='VP'?'#88d8b0':r.tipo==='EL'?'#2ecc71':'#fd9853';
      resultados.push({tipo:'reg',label:r.tipo+' '+r.unidad,sub:r.fecha+(r.operador_nombre?' | '+r.operador_nombre:''),lat:r.lat,lon:r.lon,color:color,icon:r.tipo});
    }
  });
  // Buscar en infraestructuras con coordenadas
  var infras=getInfras();
  infras.forEach(function(inf){
    if(!inf.lat||!inf.lon)return;
    var texto=((inf.idUnidad||'')+' '+(inf.nombre||'')+' '+(inf.municipio||'')+' '+(inf.provincia||'')).toLowerCase();
    if(texto.indexOf(query)!==-1){
      resultados.push({tipo:'infra',label:inf.idUnidad||'--',sub:(inf.nombre||'')+(inf.municipio?' | '+inf.municipio:''),lat:parseFloat(inf.lat),lon:parseFloat(inf.lon),color:'#8e44ad',icon:'INF'});
    }
  });
  // Buscar en capas KML
  Object.keys(capasKMLSubcapas).forEach(function(nombreCapa){
    var subcapas=capasKMLSubcapas[nombreCapa]||[];
    var campoBusc=capasKMLCampoBuscar[nombreCapa]||'';
    subcapas.forEach(function(sc,idx){
      if(!sc.lat||!sc.lon||!sc.visible)return;
      var texto='';
      if(campoBusc==='_nombre'){texto=(sc.nombre||'').toLowerCase();}
      else if(campoBusc&&sc.extData&&sc.extData[campoBusc]){texto=String(sc.extData[campoBusc]).toLowerCase();}
      else{
        texto=(sc.nombre||'').toLowerCase();
        if(sc.extData){Object.keys(sc.extData).forEach(function(k){texto+=' '+String(sc.extData[k]).toLowerCase();});}
      }
      if(texto.indexOf(query)!==-1){
        var displayName=obtenerNombreDisplaySC(sc,idx,nombreCapa);
        resultados.push({tipo:'kml',label:displayName,sub:nombreCapa,lat:sc.lat,lon:sc.lon,color:'#e67e22',icon:'KML'});
      }
    });
  });
  // Limitar a 20 resultados
  resultados=resultados.slice(0,20);
  if(resultados.length===0){container.classList.remove('show');container.innerHTML='';return;}
  var html='';
  resultados.forEach(function(r,idx){
    html+='<div class="mapa-search-result" onclick="irAPuntoMapa('+r.lat+','+r.lon+',\''+resultsId+'\')">';
    html+='<div class="sr-icon" style="background:'+r.color+'">'+r.icon+'</div>';
    html+='<div class="sr-info"><div class="sr-title">'+r.label+'</div><div class="sr-sub">'+r.sub+'</div></div>';
    html+='</div>';
  });
  container.innerHTML=html;
  container.classList.add('show');
}

function buscarUnidadEnMapa(query,resultsId){
  var container=document.getElementById(resultsId);
  if(!container)return;
  if(!query||query.length<1){container.classList.remove('show');container.innerHTML='';return;}
  query=query.toLowerCase().trim();
  var resultados=[];
  // Buscar en capas KML por id_unidad
  Object.keys(capasKMLSubcapas).forEach(function(nombreCapa){
    var subcapas=capasKMLSubcapas[nombreCapa]||[];
    var nombreEsc=nombreCapa.replace(/'/g,"\\'");
    subcapas.forEach(function(sc,idx){
      var idU=obtenerIdUnidadDesdeExtData(sc)||sc.nombre||'';
      if(idU.toLowerCase().indexOf(query)!==-1){
        resultados.push({tipo:'kml',label:idU,sub:nombreCapa,color:'#e67e22',icon:'KML',capa:nombreEsc,idx:idx});
      }
    });
  });
  // Buscar en infraestructuras por idUnidad
  var infras=getInfras();
  infras.forEach(function(inf){
    var idU=(inf.idUnidad||'').toLowerCase();
    if(idU.indexOf(query)!==-1){
      var lat=parseFloat(inf.lat)||0,lon=parseFloat(inf.lon)||0;
      resultados.push({tipo:'infra',label:inf.idUnidad||'--',sub:inf.nombre||inf.municipio||'Infraestructura',color:'#8e44ad',icon:'INF',lat:lat,lon:lon});
    }
  });
  // Buscar en registros por unidad
  var rs=getRegistrosUsuario();
  rs.forEach(function(r){
    var unidad=(r.unidad||'').toLowerCase();
    if(unidad.indexOf(query)!==-1){
      var color=r.tipo==='VP'?'#88d8b0':r.tipo==='EL'?'#2ecc71':'#fd9853';
      resultados.push({tipo:'reg',label:r.tipo+' '+r.unidad,sub:r.fecha+(r.operador_nombre?' | '+r.operador_nombre:''),color:color,icon:r.tipo,lat:r.lat,lon:r.lon});
    }
  });
  // Limitar a 20 resultados
  resultados=resultados.slice(0,20);
  if(resultados.length===0){container.classList.remove('show');container.innerHTML='';return;}
  var html='';
  resultados.forEach(function(r){
    var onclick='';
    if(r.tipo==='kml'){
      onclick='zoomASubcapa(\''+r.capa+'\','+r.idx+');var c=document.getElementById(\''+resultsId+'\');if(c)c.classList.remove(\'show\')';
    }else{
      onclick='irAPuntoMapa('+r.lat+','+r.lon+',\''+resultsId+'\')';
    }
    html+='<div class="mapa-search-result" onclick="'+onclick+'">';
    html+='<div class="sr-icon" style="background:'+r.color+'">'+r.icon+'</div>';
    html+='<div class="sr-info"><div class="sr-title">'+r.label+'</div><div class="sr-sub">'+r.sub+'</div></div>';
    html+='</div>';
  });
  container.innerHTML=html;
  container.classList.add('show');
}

function irAPuntoMapa(lat,lon,resultsId){
  if(!mapaLeaflet)initMapa();
  mapaLeaflet.setView([lat,lon],17);
  // Cerrar resultados
  var container=document.getElementById(resultsId);
  if(container)container.classList.remove('show');
  // Flash visual en el punto
  var flash=L.circleMarker([lat,lon],{radius:20,color:'#3498db',fillColor:'#3498db',fillOpacity:0.3,weight:3}).addTo(mapaLeaflet);
  setTimeout(function(){mapaLeaflet.removeLayer(flash);},2000);
}

function guardarCapasKMLLocal(){
  try{localStorage.setItem('rapca_kml_capas',JSON.stringify(capasKMLRaw));}catch(e){console.warn('KML demasiado grande para localStorage');}
}
function cargarCapasKMLGuardadas(){
  // Primero cargar de localStorage
  var saved=localStorage.getItem('rapca_kml_capas');
  if(saved){
    try{var data=JSON.parse(saved);Object.keys(data).forEach(function(nombre){
      if(!usuarioPuedeVerCapa(nombre))return;
      var res=parsearKML(data[nombre]);
      if(res.group.getLayers().length>0){res.group.addTo(mapaLeaflet);capasKML[nombre]=res.group;capasKMLRaw[nombre]=data[nombre];capasKMLSubcapas[nombre]=res.subcapas;if(controlCapas)controlCapas.addOverlay(res.group,nombre);}
    });actualizarListaCapas();}catch(e){console.error('Error cargando KML guardados:',e);}
  }
  // Luego cargar de IndexedDB (más capas que pueden no caber en localStorage)
  cargarCapasKMLdesdeDB();
}

window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;mostrarBotonInstalar();});
window.addEventListener('appinstalled',function(){showToast('App instalada','success');deferredPrompt=null;var b=document.getElementById('installBtn');if(b)b.style.display='none';});
function mostrarBotonInstalar(){var b=document.getElementById('installBtn');if(b)b.style.display='block';}
function instalarApp(){if(!deferredPrompt){showToast('Usa menú del navegador','info');return;}deferredPrompt.prompt();deferredPrompt.userChoice.then(function(r){if(r.outcome==='accepted')showToast('Instalada','success');deferredPrompt=null;var b=document.getElementById('installBtn');if(b)b.style.display='none';});}

history.pushState(null,null,location.href);
window.onpopstate=function(){history.pushState(null,null,location.href);showToast('Usa Guardar y Salir','info');};
window.addEventListener('beforeunload',function(){guardarBorradores();});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')guardarBorradores();});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(function(){});

if(window.DeviceOrientationEvent){
  window.addEventListener('deviceorientationabsolute',function(e){if(e.alpha!==null)currentHeading=Math.round(360-e.alpha);},true);
  window.addEventListener('deviceorientation',function(e){if(e.webkitCompassHeading)currentHeading=Math.round(e.webkitCompassHeading);else if(e.alpha)currentHeading=Math.round(360-e.alpha);},true);
}

function iniciarGeolocalizacion(){if(navigator.geolocation)navigator.geolocation.watchPosition(function(p){currentLat=p.coords.latitude;currentLon=p.coords.longitude;currentAlt=p.coords.altitude;currentSpeed=p.coords.speed;currentAcc=p.coords.accuracy;currentUTM=latLonToUTM(currentLat,currentLon);precargarMapTiles();actualizarPanelGPS();},function(){},{enableHighAccuracy:true,maximumAge:3000,timeout:10000});}
function latLonToUTM(lat,lon){var K0=0.9996,E=0.00669438,R=6378137,latRad=lat*Math.PI/180,lonRad=lon*Math.PI/180,zoneNum=Math.floor((lon+180)/6)+1;if(lat>=56&&lat<64&&lon>=3&&lon<12)zoneNum=32;var lonOrigin=(zoneNum-1)*6-180+3,N=R/Math.sqrt(1-E*Math.pow(Math.sin(latRad),2)),T=Math.pow(Math.tan(latRad),2),C=(E/(1-E))*Math.pow(Math.cos(latRad),2),A=Math.cos(latRad)*(lonRad-lonOrigin*Math.PI/180),M=R*((1-E/4-3*E*E/64)*latRad-(3*E/8+3*E*E/32)*Math.sin(2*latRad)+(15*E*E/256)*Math.sin(4*latRad)),easting=K0*N*(A+(1-T+C)*Math.pow(A,3)/6+(5-18*T+T*T)*Math.pow(A,5)/120)+500000,northing=K0*(M+N*Math.tan(latRad)*(A*A/2+(5-T+9*C+4*C*C)*Math.pow(A,4)/24));if(lat<0)northing+=10000000;var bands='CDEFGHJKLMNPQRSTUVWXX',bandIdx=Math.floor((lat+80)/8);return{zone:zoneNum,band:bands.charAt(Math.max(0,Math.min(20,bandIdx))),easting:Math.round(easting),northing:Math.round(northing)};}
function lon2tile(lon,zoom){return Math.floor((lon+180)/360*Math.pow(2,zoom));}
function lat2tile(lat,zoom){return Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*Math.pow(2,zoom));}
function precargarMapTiles(){if(!currentLat||!currentLon)return;var zoom=16,tileX=lon2tile(currentLon,zoom),tileY=lat2tile(currentLat,zoom);mapTilesLoaded=[];for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var img=new Image();img.crossOrigin='anonymous';img.src='https://a.tile.openstreetmap.org/'+zoom+'/'+(tileX+dx)+'/'+(tileY+dy)+'.png';mapTilesLoaded.push({img:img,dx:dx,dy:dy});}}
function salirApp(){guardarBorradores();showToast('Datos guardados','success');}
function actualizarZonaDesdeUnidad(tipo){var unidad=document.getElementById(tipo+'-unidad').value.trim();var zona='';if(unidad.length>2)zona=unidad.replace(/\d{1,2}$/,'');document.getElementById(tipo+'-zona').value=zona;}
function getContadorKey(u,t,s){return u+'_'+t+'_'+(s==='general'?'G':s);}

function inicializarContadoresDesdeEdicion(tipo,fotos,fc1,fc2){
  var pre=(tipo==='VP')?'vp':(tipo==='EL')?'el':'ev';
  var unidad=document.getElementById(pre+'-unidad').value.trim();
  var c=getContadorObj(tipo);
  if(fotos){var arr=fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxG=0;arr.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxG)maxG=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'general')]=maxG;}
  if(fc1){var arr1=fc1.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxW1=0;arr1.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxW1)maxW1=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'W1')]=maxW1;}
  if(fc2){var arr2=fc2.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxW2=0;arr2.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxW2)maxW2=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'W2')]=maxW2;}
  localStorage.setItem(getContadorLSKey(tipo),JSON.stringify(c));
}

function getContadorObj(t){return(t==='VP')?contadorFotosVP:(t==='EL')?contadorFotosEL:contadorFotosEV;}
function getContadorLSKey(t){return'rapca_contadores_'+((t==='EI')?'EI':t);}
function getNextFotoNum(u,t,s){var c=getContadorObj(t),k=getContadorKey(u,t,s);if(!c[k])c[k]=0;c[k]++;localStorage.setItem(getContadorLSKey(t),JSON.stringify(c));return c[k];}
function generarCodigoFoto(u,t,s,n){return s==='general'?u+'_'+t+'_'+n:u+'_'+t+'_'+s+'_'+n;}

function abrirCamara(tipo,subtipo){
  var unidad=(tipo==='VP')?document.getElementById('vp-unidad').value.trim():(tipo==='EL')?document.getElementById('el-unidad').value.trim():document.getElementById('ev-unidad').value.trim();
  if(!unidad){showToast('Introduce Unidad','error');return;}
  camaraTipo=tipo;camaraSubtipo=subtipo;
  var num=getNextFotoNum(unidad,tipo,subtipo),codigo=generarCodigoFoto(unidad,tipo,subtipo,num);
  document.getElementById('cameraInfo').textContent=codigo;document.getElementById('overlayCode').textContent=codigo;
  document.getElementById('overlayCoords').textContent=currentLat?currentLat.toFixed(6)+', '+currentLon.toFixed(6):'GPS...';
  precargarMapTiles();
  if(currentLat&&currentLon){var url='https://www.openstreetmap.org/export/embed.html?bbox='+(currentLon-0.0015)+','+(currentLat-0.001)+','+(currentLon+0.0015)+','+(currentLat+0.001)+'&layer=mapnik&marker='+currentLat+','+currentLon;document.getElementById('mapContainer').innerHTML='<iframe src="'+url+'" style="width:140%;height:140%;border:0;pointer-events:none;margin:-20% 0 0 -20%"></iframe>';}
  document.getElementById('cameraModal').classList.add('show');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}}).then(function(s){cameraStream=s;document.getElementById('cameraVideo').srcObject=s;actualizarBrujula();}).catch(function(){showToast('Error cámara','error');cerrarCamara();});
}
function actualizarBrujula(){if(document.getElementById('cameraModal').classList.contains('show')){var d=['N','NE','E','SE','S','SO','O','NO'],i=Math.round(currentHeading/45)%8;document.getElementById('overlayCompass').textContent=d[i]+' '+currentHeading+'°';if(currentLat)document.getElementById('overlayCoords').textContent=currentLat.toFixed(6)+', '+currentLon.toFixed(6);requestAnimationFrame(actualizarBrujula);}}
function cerrarCamara(){document.getElementById('cameraModal').classList.remove('show');if(cameraStream){cameraStream.getTracks().forEach(function(t){t.stop();});cameraStream=null;}var u=(camaraTipo==='VP')?document.getElementById('vp-unidad').value.trim():(camaraTipo==='EL')?document.getElementById('el-unidad').value.trim():document.getElementById('ev-unidad').value.trim();var c=getContadorObj(camaraTipo);var k=getContadorKey(u,camaraTipo,camaraSubtipo);if(c[k]&&c[k]>0)c[k]--;localStorage.setItem(getContadorLSKey(camaraTipo),JSON.stringify(c));}

function dibujarMapaEnCanvas(ctx,x,y,w,h){
  if(!currentLat||!currentLon||mapTilesLoaded.length===0){ctx.fillStyle='#d4e6d4';ctx.fillRect(x,y,w,h);ctx.fillStyle='#666';ctx.font='36px Arial';ctx.fillText('Mapa no disponible',x+w/2-180,y+h/2);return;}
  var zoom=16,tileSize=256,n=Math.pow(2,zoom),exactX=(currentLon+180)/360*n,exactY=(1-Math.log(Math.tan(currentLat*Math.PI/180)+1/Math.cos(currentLat*Math.PI/180))/Math.PI)/2*n,centerTileX=Math.floor(exactX),centerTileY=Math.floor(exactY),offsetX=(exactX-centerTileX)*tileSize,offsetY=(exactY-centerTileY)*tileSize;
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,15);ctx.clip();var tileScale=Math.max(w,h)/tileSize/1.5;var loaded=0;
  mapTilesLoaded.forEach(function(t){if(t.img.complete&&t.img.naturalWidth>0){var ts=tileSize*tileScale;ctx.drawImage(t.img,x+w/2+(t.dx*ts)-offsetX*tileScale,y+h/2+(t.dy*ts)-offsetY*tileScale,ts,ts);loaded++;}});
  if(loaded===0){ctx.fillStyle='#c8e6c9';ctx.fillRect(x,y,w,h);}
  var mx=x+w/2,my=y+h/2;ctx.fillStyle='#EA4335';ctx.beginPath();ctx.arc(mx,my-40,35,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(mx-30,my-40);ctx.lineTo(mx,my+25);ctx.lineTo(mx+30,my-40);ctx.fill();ctx.fillStyle='#B31412';ctx.beginPath();ctx.arc(mx,my-40,18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#EA4335';ctx.beginPath();ctx.arc(mx,my-40,10,0,Math.PI*2);ctx.fill();ctx.restore();
}

function capturarFoto(){
  var video=document.getElementById('cameraVideo'),canvas=document.getElementById('photoCanvas'),ctx=canvas.getContext('2d');
  var finalW=3060,finalH=4080;canvas.width=finalW;canvas.height=finalH;
  var vw=video.videoWidth,vh=video.videoHeight,scale=Math.max(finalW/vw,finalH/vh),sw=finalW/scale,sh=finalH/scale,sx=(vw-sw)/2,sy=(vh-sh)/2;
  ctx.drawImage(video,sx,sy,sw,sh,0,0,finalW,finalH);var w=finalW,h=finalH;
  var compassX=180,compassY=200,compassR=150;
  ctx.strokeStyle='rgba(100,100,100,0.9)';ctx.lineWidth=12;ctx.beginPath();ctx.arc(compassX,compassY,compassR,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(50,50,50,0.7)';ctx.beginPath();ctx.arc(compassX,compassY,compassR-6,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.fillText('N',compassX,compassY-compassR+55);ctx.fillText('S',compassX,compassY+compassR-25);
  ctx.fillStyle='#aaa';ctx.fillText('E',compassX+compassR-45,compassY+15);ctx.fillText('W',compassX-compassR+45,compassY+15);
  var angleRad=(currentHeading-90)*Math.PI/180;ctx.save();ctx.translate(compassX,compassY);ctx.rotate(angleRad);
  ctx.fillStyle='#00BCD4';ctx.beginPath();ctx.moveTo(0,-compassR+40);ctx.lineTo(-20,20);ctx.lineTo(20,20);ctx.closePath();ctx.fill();
  ctx.fillStyle='#666';ctx.beginPath();ctx.moveTo(0,compassR-40);ctx.lineTo(-15,-15);ctx.lineTo(15,-15);ctx.closePath();ctx.fill();ctx.restore();
  ctx.fillStyle='#888';ctx.beginPath();ctx.arc(compassX,compassY,15,0,Math.PI*2);ctx.fill();
  var mapW=714,mapH=969,mapX=30,mapY=h-mapH-30;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(mapX,mapY,mapW,mapH,20);ctx.fill();ctx.strokeStyle='#333';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(mapX,mapY,mapW,mapH,20);ctx.stroke();
  dibujarMapaEnCanvas(ctx,mapX+8,mapY+8,mapW-16,mapH-16);
  var codigo=document.getElementById('overlayCode').textContent,latlon=currentLat?currentLat.toFixed(6)+', '+currentLon.toFixed(6):'--';
  var fechaHoy=new Date(),fechaStr=fechaHoy.getDate().toString().padStart(2,'0')+'/'+(fechaHoy.getMonth()+1).toString().padStart(2,'0')+'/'+fechaHoy.getFullYear();
  ctx.textAlign='right';var textX=w-50,textY=h-450;
  ctx.shadowColor='rgba(0,0,0,0.8)';ctx.shadowBlur=10;ctx.shadowOffsetX=4;ctx.shadowOffsetY=4;
  ctx.fillStyle='#FFD700';ctx.font='bold 110px Arial';ctx.fillText('RAPCA EMA',textX,textY);textY+=130;
  ctx.fillStyle='#fff';ctx.font='bold 95px Arial';ctx.fillText(codigo,textX,textY);textY+=110;
  ctx.font='bold 75px Arial';ctx.fillText(fechaStr,textX,textY);textY+=100;
  ctx.font='bold 95px Arial';ctx.fillText(latlon,textX,textY);
  ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.textAlign='left';
  
  // Mostrar vista previa con opciones de anotar, repetir o aceptar
  mostrarVistaPrevia();
}

// --- Vista Previa y Anotaciones en Foto ---
function mostrarVistaPrevia(){
  document.getElementById('cameraModal').classList.remove('show');
  anotaciones=[];modoAnotacion=false;
  document.getElementById('previewTools').classList.remove('show');
  var btn=document.getElementById('btnAnotar');btn.textContent='🔴 Anotar';btn.classList.remove('active');
  document.querySelector('.btn-preview.accept').textContent='✅ Aceptar';
  document.getElementById('previewModal').classList.add('show');
  requestAnimationFrame(function(){requestAnimationFrame(function(){dibujarVistaPrevia();});});
}
function dibujarVistaPrevia(){
  var src=document.getElementById('photoCanvas');
  var prev=document.getElementById('previewCanvas');
  var container=document.getElementById('previewContainer');
  var cW=container.clientWidth||300,cH=container.clientHeight||400;
  var aspect=3/4,pW,pH;
  if(cW/cH>aspect){pH=cH;pW=Math.round(pH*aspect);}
  else{pW=cW;pH=Math.round(pW/aspect);}
  prev.width=pW;prev.height=pH;
  var ctx=prev.getContext('2d');
  ctx.drawImage(src,0,0,3060,4080,0,0,pW,pH);
  var s=pW/3060;
  for(var i=0;i<anotaciones.length;i++){
    var a=anotaciones[i],ax=a.x*s,ay=a.y*s,ar=a.radio*s;
    ctx.strokeStyle='#FF0000';ctx.lineWidth=Math.max(2,ar*0.1);
    ctx.beginPath();ctx.arc(ax,ay,ar,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(255,0,0,0.15)';ctx.fill();
    ctx.fillStyle='#FF0000';ctx.font='bold '+Math.max(12,Math.round(ar*0.6))+'px Arial';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(''+(i+1),ax,ay);
  }
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
  var btnA=document.querySelector('.btn-preview.accept');
  if(btnA)btnA.textContent=anotaciones.length>0?'✅ Aceptar ('+anotaciones.length+')':'✅ Aceptar';
}
function toggleAnotacion(){
  modoAnotacion=!modoAnotacion;
  var btn=document.getElementById('btnAnotar'),tools=document.getElementById('previewTools');
  if(modoAnotacion){btn.textContent='✖ Cerrar';btn.classList.add('active');tools.classList.add('show');}
  else{btn.textContent='🔴 Anotar';btn.classList.remove('active');tools.classList.remove('show');}
  requestAnimationFrame(function(){dibujarVistaPrevia();});
}
function deshacerAnotacion(){
  if(anotaciones.length===0){showToast('Sin anotaciones','info');return;}
  anotaciones.pop();dibujarVistaPrevia();showToast('Anotación eliminada','info');
}
function repetirFoto(){
  document.getElementById('previewModal').classList.remove('show');
  anotaciones=[];modoAnotacion=false;
  document.getElementById('cameraModal').classList.add('show');
  if(cameraStream){actualizarBrujula();}
  else{navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}}).then(function(s){cameraStream=s;document.getElementById('cameraVideo').srcObject=s;actualizarBrujula();}).catch(function(){showToast('Error cámara','error');cerrarCamara();});}
}
function aceptarFoto(){
  var canvas=document.getElementById('photoCanvas'),ctx=canvas.getContext('2d');
  var codigo=document.getElementById('overlayCode').textContent;
  if(anotaciones.length>0)dibujarAnotacionesEnCanvas(ctx,canvas.width,canvas.height);
  document.getElementById('previewModal').classList.remove('show');
  if(cameraStream){cameraStream.getTracks().forEach(function(t){t.stop();});cameraStream=null;}
  var thumbCanvas=document.createElement('canvas'),thumbW=400,thumbH=533;
  thumbCanvas.width=thumbW;thumbCanvas.height=thumbH;
  thumbCanvas.getContext('2d').drawImage(canvas,0,0,3060,4080,0,0,thumbW,thumbH);
  var thumbDataUrl=thumbCanvas.toDataURL('image/jpeg',0.50);
  fotosCacheMemoria[codigo]=thumbDataUrl;
  guardarFotoEnDB(codigo,thumbDataUrl);
  canvas.toBlob(function(b){var l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=codigo+'.jpg';l.click();},'image/jpeg',0.95);
  var upCanvas=document.createElement('canvas');upCanvas.width=1530;upCanvas.height=2040;
  upCanvas.getContext('2d').drawImage(canvas,0,0,3060,4080,0,0,1530,2040);
  var upData=upCanvas.toDataURL('image/jpeg',0.85);
  var upUnidad=(camaraTipo==='VP')?document.getElementById('vp-unidad').value.trim():(camaraTipo==='EL')?document.getElementById('el-unidad').value.trim():document.getElementById('ev-unidad').value.trim();
  guardarSubidaPendiente(codigo,upData,upUnidad,camaraTipo);
  if(isOnline)subirFotoNube(codigo,upData,upUnidad,camaraTipo);
  agregarFotoALista(codigo);
  showToast(isOnline?'📷☁️ '+codigo:'📷 '+codigo+' (offline)','success');
  anotaciones=[];modoAnotacion=false;
}
function dibujarAnotacionesEnCanvas(ctx,w,h){
  for(var i=0;i<anotaciones.length;i++){
    var a=anotaciones[i];
    ctx.strokeStyle='#FF0000';ctx.lineWidth=Math.max(8,a.radio*0.12);
    ctx.beginPath();ctx.arc(a.x,a.y,a.radio,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(255,0,0,0.12)';ctx.fill();
    ctx.fillStyle='#FF0000';ctx.font='bold '+Math.max(40,Math.round(a.radio*0.7))+'px Arial';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(0,0,0,0.6)';ctx.shadowBlur=6;
    ctx.fillText(''+(i+1),a.x,a.y);
  }
  ctx.shadowColor='transparent';ctx.shadowBlur=0;
  var bannerH=75+anotaciones.length*55;
  ctx.fillStyle='rgba(180,0,0,0.85)';
  ctx.beginPath();ctx.roundRect(20,20,w-40,bannerH,20);ctx.fill();
  ctx.fillStyle='#FFD700';ctx.font='bold 55px Arial';
  ctx.textAlign='left';ctx.textBaseline='top';
  ctx.fillText('⚠ ANOTACIONES:',50,35);
  ctx.fillStyle='#fff';ctx.font='42px Arial';
  for(var i=0;i<anotaciones.length;i++){
    ctx.fillText((i+1)+'. '+(anotaciones[i].texto||'Punto señalado'),50,90+i*55);
  }
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function initPreviewListeners(){
  var prev=document.getElementById('previewCanvas');
  function handleTap(cx,cy){
    if(!modoAnotacion)return;
    var rect=prev.getBoundingClientRect();
    var fullX=(cx-rect.left)*(3060/rect.width);
    var fullY=(cy-rect.top)*(4080/rect.height);
    var radio=parseInt(document.getElementById('circleSize').value)||200;
    var texto=document.getElementById('annotationText').value.trim();
    anotaciones.push({x:fullX,y:fullY,radio:radio,texto:texto});
    document.getElementById('annotationText').value='';
    dibujarVistaPrevia();
    showToast('Punto '+anotaciones.length+' marcado','success');
  }
  prev.addEventListener('click',function(e){handleTap(e.clientX,e.clientY);});
  prev.addEventListener('touchstart',function(e){if(!modoAnotacion)return;e.preventDefault();var t=e.touches[0];handleTap(t.clientX,t.clientY);},{passive:false});
}

function agregarFotoALista(c){var lId,iId,pre=(camaraTipo==='VP')?'vp':(camaraTipo==='EL')?'el':'ev';if(camaraSubtipo==='general'){lId=pre+'-fotos-lista';iId=pre+'-fotos';}else if(camaraSubtipo==='W1'){lId=pre+'-fc1-lista';iId=pre+'-fc1';}else{lId=pre+'-fc2-lista';iId=pre+'-fc2';}document.getElementById(lId).innerHTML+='<span class="foto-tag">'+c+'</span>';var inp=document.getElementById(iId);inp.value=inp.value?(inp.value+', '+c):c;}

// --- Autenticación y Sesiones ---
function iniciarSesion(){
  var email=document.getElementById('login-email').value.trim().toLowerCase();
  var pass=document.getElementById('login-password').value.trim();
  if(!email||!pass){mostrarErrorLogin('Email y contraseña requeridos');return;}
  var btn=document.getElementById('btnLogin');btn.textContent='Entrando...';btn.disabled=true;
  // Servidor primero cuando hay conexión
  if(isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email:email,password:pass})})
    .then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.json();
    })
    .then(function(data){
      btn.textContent='Entrar';btn.disabled=false;
      if(data.ok){
        // Guardar usuario en local para futuros logins offline
        var users=getUsuariosLocal();
        var existing=users.find(function(u){return u.email.toLowerCase()===email;});
        if(existing){existing.id=data.usuario.id;existing.nombre=data.usuario.nombre;existing.password=pass;existing.rol=data.usuario.rol;existing.activo=1;}
        else{users.push({id:data.usuario.id,email:email,nombre:data.usuario.nombre,password:pass,rol:data.usuario.rol,activo:1});}
        guardarUsuariosLocal(users);
        sesionActual={token:data.token,email:data.usuario.email,nombre:data.usuario.nombre,rol:data.usuario.rol,id:data.usuario.id};
        localStorage.setItem('rapca_sesion',JSON.stringify(sesionActual));
        ocultarLoginMostrarApp();
        // Sincronizar lista de usuarios del servidor al local
        sincronizarUsuariosDesdeServidor();
      }else{mostrarErrorLogin(data.error||'Email o contraseña incorrectos');}
    })
    .catch(function(e){
      // Sin servidor: intentar login local
      btn.textContent='Entrar';btn.disabled=false;
      var resultLocal=loginLocal(email,pass);
      if(resultLocal.ok){
        sesionActual={token:resultLocal.token,email:resultLocal.usuario.email,nombre:resultLocal.usuario.nombre,rol:resultLocal.usuario.rol,id:resultLocal.usuario.id};
        localStorage.setItem('rapca_sesion',JSON.stringify(sesionActual));
        ocultarLoginMostrarApp();
      }else{mostrarErrorLogin('Sin conexión al servidor y cuenta no encontrada en este dispositivo');}
    });
  }else{
    // Sin conexión: login local
    var resultLocal=loginLocal(email,pass);
    btn.textContent='Entrar';btn.disabled=false;
    if(resultLocal.ok){
      sesionActual={token:resultLocal.token,email:resultLocal.usuario.email,nombre:resultLocal.usuario.nombre,rol:resultLocal.usuario.rol,id:resultLocal.usuario.id};
      localStorage.setItem('rapca_sesion',JSON.stringify(sesionActual));
      ocultarLoginMostrarApp();
    }else{mostrarErrorLogin('Sin conexión. Cuenta no encontrada en este dispositivo');}
  }
}
function mostrarErrorLogin(msg){var el=document.getElementById('loginError');el.textContent=msg;el.classList.add('show');}
function validarSesion(){
  var saved=localStorage.getItem('rapca_sesion');
  if(!saved)return;
  sesionActual=JSON.parse(saved);
  // Si es token local, validar directamente
  if(sesionActual.token&&sesionActual.token.indexOf('local_')===0){ocultarLoginMostrarApp();return;}
  if(!isOnline){ocultarLoginMostrarApp();return;}
  fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'validar',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(data.ok){sesionActual.nombre=data.usuario.nombre;sesionActual.rol=data.usuario.rol;localStorage.setItem('rapca_sesion',JSON.stringify(sesionActual));ocultarLoginMostrarApp();}
    else{localStorage.removeItem('rapca_sesion');sesionActual=null;document.getElementById('loginOverlay').classList.remove('hidden');}
  })
  .catch(function(){ocultarLoginMostrarApp();}); // Sin servidor: usar sesión guardada
}
function cerrarSesion(){
  if(sesionActual&&sesionActual.token&&isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout',token:sesionActual.token})}).catch(function(){});
  }
  localStorage.removeItem('rapca_sesion');sesionActual=null;
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('userBar').style.display='none';
  document.body.classList.remove('admin-visible');
}
function ocultarLoginMostrarApp(){
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('userBar').style.display='flex';
  document.getElementById('userName').textContent=sesionActual.nombre||sesionActual.email;
  document.getElementById('userRole').textContent=sesionActual.rol==='admin'?'Admin':'Operador';
  if(sesionActual.rol==='admin'){document.body.classList.add('admin-visible');}
  else{document.body.classList.remove('admin-visible');}
  initApp();
}
// --- Gestión de Usuarios (Admin) ---
function crearUsuario(){
  if(!sesionActual||sesionActual.rol!=='admin')return;
  var email=document.getElementById('admin-nuevo-email').value.trim();
  var nombre=document.getElementById('admin-nuevo-nombre').value.trim();
  var pass=document.getElementById('admin-nuevo-pass').value.trim();
  var rol=document.getElementById('admin-nuevo-rol').value;
  if(!email||!nombre||!pass){showToast('Todos los campos son obligatorios','error');return;}
  if(isOnline){
    // Servidor primero
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'crear_usuario',token:sesionActual.token,nuevo_email:email,nuevo_nombre:nombre,nuevo_password:pass,nuevo_rol:rol})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok){
        // Guardar en local con ID del servidor
        var users=getUsuariosLocal();
        if(!users.find(function(u){return u.email.toLowerCase()===email.toLowerCase();})){
          users.push({id:data.id,email:email.toLowerCase(),nombre:nombre,password:pass,rol:rol||'operador',activo:1});
          guardarUsuariosLocal(users);
        }
        document.getElementById('admin-nuevo-email').value='';document.getElementById('admin-nuevo-nombre').value='';document.getElementById('admin-nuevo-pass').value='';
        cargarListaUsuarios();
        showToast('Usuario creado en servidor','success');
      }else{showToast(data.error||'Error del servidor','error');}
    })
    .catch(function(){
      // Fallback local si servidor falla
      var localResult=crearUsuarioLocal(email,nombre,pass,rol);
      if(!localResult.ok){showToast(localResult.error||'Error','error');return;}
      document.getElementById('admin-nuevo-email').value='';document.getElementById('admin-nuevo-nombre').value='';document.getElementById('admin-nuevo-pass').value='';
      cargarListaUsuarios();
      showToast('Usuario creado solo en este dispositivo (sin conexión al servidor)','warning');
    });
  }else{
    var localResult=crearUsuarioLocal(email,nombre,pass,rol);
    if(!localResult.ok){showToast(localResult.error||'Error','error');return;}
    document.getElementById('admin-nuevo-email').value='';document.getElementById('admin-nuevo-nombre').value='';document.getElementById('admin-nuevo-pass').value='';
    cargarListaUsuarios();
    showToast('Usuario creado solo en este dispositivo (sin conexión)','warning');
  }
}
function cargarListaUsuarios(){
  if(!sesionActual||sesionActual.rol!=='admin')return;
  function renderUsuarios(usuarios){
    var el=document.getElementById('listaUsuarios');if(!el)return;
    var filtro=document.getElementById('admin-filtro-email');
    if(filtro){
      var opts='<option value="">-- Todos --</option>';
      usuarios.forEach(function(u){opts+='<option value="'+u.email+'">'+u.nombre+' ('+u.email+')</option>';});
      filtro.innerHTML=opts;
    }
    var h='';
    usuarios.forEach(function(u){
      var activo=u.activo==1||u.activo===undefined;
      h+='<div class="user-card'+(activo?'':' inactive')+'">';
      h+='<div class="uc-info"><div class="uc-name">'+u.nombre+'</div><div class="uc-email">'+u.email+'</div><span class="uc-role'+(u.rol==='admin'?' admin':'')+'">'+u.rol+'</span></div>';
      h+='<div class="uc-actions">';
      h+='<button style="background:#f39c12" onclick="cambiarPasswordUsuario('+u.id+')">🔑</button>';
      h+='<button style="background:'+(activo?'#e74c3c':'#27ae60')+'" onclick="toggleUsuario('+u.id+')">'+(activo?'⏸':'▶')+'</button>';
      h+='<button style="background:#c0392b" onclick="eliminarUsuario('+u.id+',\''+u.email.replace(/'/g,"\\'")+'\')">🗑️</button>';
      h+='</div></div>';
    });
    el.innerHTML=h;
  }
  if(isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar_usuarios',token:sesionActual.token})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok){
        // Actualizar caché local con datos del servidor
        guardarUsuariosLocal(data.usuarios.map(function(u){
          // Mantener password local si existe (el servidor no la devuelve)
          var local=getUsuariosLocal().find(function(l){return l.email===u.email;});
          return{id:u.id,email:u.email,nombre:u.nombre,rol:u.rol,activo:u.activo,password:local?local.password:''};
        }));
        renderUsuarios(data.usuarios);
      }else{renderUsuarios(getUsuariosLocal());}
    })
    .catch(function(){renderUsuarios(getUsuariosLocal());});
  }else{renderUsuarios(getUsuariosLocal());}
}
function toggleUsuario(id){
  if(isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'toggle_usuario',token:sesionActual.token,usuario_id:id})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok){showToast('Estado cambiado en servidor','success');cargarListaUsuarios();}
      else{showToast(data.error||'Error','error');}
    })
    .catch(function(){
      // Fallback local
      var users=getUsuariosLocal();
      users.forEach(function(u){if(u.id===id)u.activo=u.activo?0:1;});
      guardarUsuariosLocal(users);
      cargarListaUsuarios();showToast('Estado cambiado (solo local)','warning');
    });
  }else{
    var users=getUsuariosLocal();
    users.forEach(function(u){if(u.id===id)u.activo=u.activo?0:1;});
    guardarUsuariosLocal(users);
    cargarListaUsuarios();showToast('Estado cambiado (solo local, sin conexión)','warning');
  }
}
function cambiarPasswordUsuario(id){
  var nueva=prompt('Nueva contraseña:');
  if(!nueva||!nueva.trim())return;
  if(isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cambiar_password',token:sesionActual.token,usuario_id:id,nueva_password:nueva.trim()})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok){
        var users=getUsuariosLocal();
        users.forEach(function(u){if(u.id===id)u.password=nueva.trim();});
        guardarUsuariosLocal(users);
        showToast('Contraseña cambiada en servidor','success');
      }else{showToast(data.error||'Error','error');}
    })
    .catch(function(){
      var users=getUsuariosLocal();
      users.forEach(function(u){if(u.id===id)u.password=nueva.trim();});
      guardarUsuariosLocal(users);
      showToast('Contraseña cambiada (solo local)','warning');
    });
  }else{
    var users=getUsuariosLocal();
    users.forEach(function(u){if(u.id===id)u.password=nueva.trim();});
    guardarUsuariosLocal(users);
    showToast('Contraseña cambiada (solo local, sin conexión)','warning');
  }
}
function eliminarUsuario(id,email){
  if(!confirm('¿Eliminar usuario '+email+'? Se perderán sus sesiones.'))return;
  if(isOnline){
    fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'eliminar_usuario',token:sesionActual.token,usuario_id:id})})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.ok){
        guardarUsuariosLocal(getUsuariosLocal().filter(function(u){return u.id!==id;}));
        cargarListaUsuarios();showToast('Usuario eliminado del servidor','success');
      }else{showToast(data.error||'Error','error');}
    })
    .catch(function(){
      guardarUsuariosLocal(getUsuariosLocal().filter(function(u){return u.id!==id;}));
      cargarListaUsuarios();showToast('Usuario eliminado (solo local)','warning');
    });
  }else{
    guardarUsuariosLocal(getUsuariosLocal().filter(function(u){return u.id!==id;}));
    cargarListaUsuarios();showToast('Usuario eliminado (solo local, sin conexión)','warning');
  }
}
// --- Registros del Servidor (Admin) ---
function cargarRegistrosServidor(){
  if(!sesionActual||sesionActual.rol!=='admin'||!isOnline)return;
  var filtro=document.getElementById('admin-filtro-email');
  var email=filtro?filtro.value:'';
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar',token:sesionActual.token,filtro_email:email})})
  .then(function(r){return r.json();})
  .then(function(data){
    if(!data.ok)return;
    var el=document.getElementById('listaRegistrosServidor');if(!el)return;
    if(data.registros.length===0){el.innerHTML='<p style="text-align:center;color:#888;padding:15px">Sin registros en servidor</p>';return;}
    var h='<p style="font-size:.85rem;color:#666;margin-bottom:10px">'+data.registros.length+' registros</p>';
    data.registros.slice(0,100).forEach(function(r){
      h+='<div class="record-item"><span class="tipo '+r.tipo.toLowerCase()+'">'+r.tipo+'</span> <strong>'+r.zona+'>'+r.unidad+'</strong>'+(r.transecto?' ('+r.transecto+')':'');
      h+='<div class="info">'+r.fecha+' | '+(r.usuario_nombre||r.usuario_email)+'</div></div>';
    });
    el.innerHTML=h;
  }).catch(function(){});
}
// --- Sincronizar registro al servidor ---
// --- Helper: verificar si tenemos token de servidor válido ---
function tieneTokenServidor(){
  return sesionActual&&sesionActual.token&&sesionActual.token.indexOf('local_')!==0;
}

function sincronizarRegistroServidor(registro){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar',token:sesionActual.token,registro:registro})})
  .then(function(r){if(!r.ok)console.warn('Error sync registro al servidor: HTTP '+r.status);return r.json();})
  .then(function(d){if(!d.ok)console.warn('Error sync registro:',d.error);})
  .catch(function(e){console.warn('Error red sync registro:',e);});
}
// --- Sincronizar infraestructura al servidor ---
function sincronizarInfraServidor(infra){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_infra',token:sesionActual.token,infra:infra})})
  .then(function(r){if(!r.ok)console.warn('Error sync infra al servidor: HTTP '+r.status);return r.json();})
  .then(function(d){if(!d.ok)console.warn('Error sync infra:',d.error);})
  .catch(function(e){console.warn('Error red sync infra:',e);});
}

// === SINCRONIZACIÓN BIDIRECCIONAL (servidor ↔ local) ===

function sincronizarDesdeServidor(){
  if(!sesionActual||!isOnline)return;
  // Si tenemos token local, intentar re-autenticar con el servidor primero
  if(!tieneTokenServidor()){
    console.warn('Token local detectado — intentando obtener token de servidor...');
    // Buscar credenciales locales del usuario actual
    var users=getUsuariosLocal();
    var currentUser=users.find(function(u){return u.email.toLowerCase()===sesionActual.email.toLowerCase();});
    if(currentUser&&currentUser.password){
      fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email:sesionActual.email,password:currentUser.password})})
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.ok){
          sesionActual.token=data.token;
          sesionActual.id=data.usuario.id;
          localStorage.setItem('rapca_sesion',JSON.stringify(sesionActual));
          console.log('Token de servidor obtenido — sincronizando...');
          ejecutarSincronizacion();
        }else{
          console.warn('No se pudo obtener token del servidor: '+(data.error||''));
        }
      })
      .catch(function(e){console.warn('Servidor no disponible para re-auth:',e);});
    }
    return;
  }
  ejecutarSincronizacion();
}

function ejecutarSincronizacion(){
  console.log('Iniciando sincronización desde servidor...');
  sincronizarUsuariosDesdeServidor();
  // Descargar datos del servidor → local
  sincronizarRegistrosDesdeServidor();
  sincronizarInfrasDesdeServidor();
  sincronizarGanaderosDesdeServidor();
  sincronizarCamposDesdeServidor();
  // Subir datos locales → servidor
  sincronizarRegistrosAlServidor();
  sincronizarInfrasAlServidor();
  sincronizarGanaderosAlServidor();
  sincronizarCamposAlServidor();
}

// --- Cargar registros del servidor y mezclar con locales ---
function sincronizarRegistrosDesdeServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(!data.ok||!data.registros)return;
    var locales=getRegistros();
    var idsLocales={};
    locales.forEach(function(r){idsLocales[r.id]=true;});
    var nuevos=0;
    data.registros.forEach(function(rs){
      var regId=parseInt(rs.registro_id)||rs.registro_id;
      if(!idsLocales[regId]){
        // Este registro no existe en local — añadirlo
        var reg={id:regId,tipo:rs.tipo,fecha:rs.fecha,zona:rs.zona,unidad:rs.unidad,transecto:rs.transecto||'',datos:rs.datos||{},enviado:true,lat:rs.lat?parseFloat(rs.lat):null,lon:rs.lon?parseFloat(rs.lon):null,operador_email:rs.usuario_email||'',operador_nombre:rs.usuario_nombre||''};
        locales.push(reg);
        nuevos++;
      }
    });
    if(nuevos>0){
      localStorage.setItem('rapca_registros',JSON.stringify(locales));
      updatePendingCount();loadPanel();
      showToast('Recuperados '+nuevos+' registros del servidor','success');
      console.log('Sincronización: '+nuevos+' registros nuevos del servidor');
    }else{
      console.log('Sincronización: registros al día');
    }
  })
  .catch(function(e){console.error('Error sincronizando registros:',e);});
}

// --- Cargar infraestructuras del servidor y mezclar con locales ---
function sincronizarInfrasDesdeServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar_infras',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(!data.ok||!data.infras)return;
    var locales=getInfras();
    var idsLocales={};
    locales.forEach(function(inf){idsLocales[inf.id]=true;});
    var nuevas=0;
    data.infras.forEach(function(si){
      var infId=parseInt(si.infra_id)||si.infra_id;
      if(!idsLocales[infId]){
        var inf={id:infId,provincia:si.provincia||'',idZona:si.idZona||'',idUnidad:si.idUnidad||'',codInfoca:si.codInfoca||'',nombre:si.nombre||'',superficie:si.superficie||'',pagoMaximo:si.pagoMaximo||'',municipio:si.municipio||'',pn:si.pn||'',contrato:si.contrato||'',vegetacion:si.vegetacion||'',pendiente:si.pendiente||'',distancia:si.distancia||'',lat:si.lat||null,lon:si.lon||null,extras:si.extras||{}};
        locales.push(inf);
        nuevas++;
      }
    });
    if(nuevas>0){
      guardarInfras(locales);
      showToast('Recuperadas '+nuevas+' infraestructuras del servidor','success');
      console.log('Sincronización: '+nuevas+' infraestructuras nuevas del servidor');
    }else{
      console.log('Sincronización: infraestructuras al día');
    }
  })
  .catch(function(e){console.error('Error sincronizando infraestructuras:',e);});
}

// --- Subir registros locales que el servidor no tiene ---
function sincronizarRegistrosAlServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  var locales=getRegistros();
  if(locales.length===0)return;
  var enviados=0;
  locales.forEach(function(r,idx){
    setTimeout(function(){
      fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar',token:sesionActual.token,registro:r})})
      .then(function(res){return res.json();})
      .then(function(d){if(d.ok)enviados++;})
      .catch(function(){});
    },idx*200);
  });
}

// --- Subir infraestructuras locales al servidor ---
function sincronizarInfrasAlServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  var locales=getInfras();
  if(locales.length===0)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_infras_lote',token:sesionActual.token,infras:locales})})
  .then(function(r){return r.json();})
  .then(function(d){if(d.ok)console.log('Infraestructuras subidas al servidor: '+d.guardadas);})
  .catch(function(){});
}

// --- Sincronizar ganadero individual al servidor ---
function sincronizarGanaderoServidor(ganadero){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_ganadero',token:sesionActual.token,ganadero:ganadero})})
  .then(function(r){if(!r.ok)console.warn('Error sync ganadero: HTTP '+r.status);})
  .catch(function(e){console.warn('Error red sync ganadero:',e);});
}

// --- Subir todos los ganaderos locales al servidor ---
function sincronizarGanaderosAlServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  var locales=getGanaderos();
  if(locales.length===0)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_ganaderos_lote',token:sesionActual.token,ganaderos:locales})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(d){if(d.ok)console.log('Ganaderos subidos al servidor: '+d.guardados);})
  .catch(function(e){console.warn('Error sync ganaderos al servidor:',e);});
}

// --- Cargar ganaderos del servidor y mezclar con locales ---
function sincronizarGanaderosDesdeServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar_ganaderos',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(!data.ok||!data.ganaderos)return;
    var locales=getGanaderos();
    var idsLocales={};
    locales.forEach(function(g){idsLocales[g.id]=true;});
    var nuevos=0;
    data.ganaderos.forEach(function(sg){
      var gId=parseInt(sg.ganadero_id)||sg.ganadero_id;
      if(!idsLocales[gId]){
        locales.push({id:gId,idGanadero:sg.idGanadero||'',zonas:sg.zonas||'',nombre:sg.nombre||'',direccion:sg.direccion||'',telefono:sg.telefono||'',email:sg.email||'',observaciones:sg.observaciones||'',extras:sg.extras||{}});
        nuevos++;
      }
    });
    if(nuevos>0){
      guardarGanaderos(locales);
      showToast('Recuperados '+nuevos+' ganaderos del servidor','success');
      console.log('Sincronización: '+nuevos+' ganaderos nuevos del servidor');
    }else{
      console.log('Sincronización: ganaderos al día');
    }
  })
  .catch(function(e){console.error('Error sincronizando ganaderos:',e);});
}

// --- Sincronizar campos personalizados al servidor ---
function sincronizarCamposAlServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  if(camposExtraGan.length>0){
    fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_campos',token:sesionActual.token,tipo:'ganadero',campos:camposExtraGan})}).catch(function(e){console.warn('Error sync campos ganadero:',e);});
  }
  if(camposExtraInf.length>0){
    fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'guardar_campos',token:sesionActual.token,tipo:'infra',campos:camposExtraInf})}).catch(function(e){console.warn('Error sync campos infra:',e);});
  }
}

// --- Cargar campos personalizados del servidor ---
function sincronizarCamposDesdeServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar_campos',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(!data.ok||!data.campos)return;
    var cambios=false;
    // Campos de ganadero: mezclar (unión de local + servidor)
    if(data.campos.ganadero&&data.campos.ganadero.length>0){
      data.campos.ganadero.forEach(function(c){
        if(camposExtraGan.indexOf(c)===-1){camposExtraGan.push(c);cambios=true;}
      });
      if(cambios){localStorage.setItem('rapca_campos_ganadero',JSON.stringify(camposExtraGan));renderCamposExtraGan();}
    }
    // Campos de infra: mezclar
    var cambiosInf=false;
    if(data.campos.infra&&data.campos.infra.length>0){
      data.campos.infra.forEach(function(c){
        if(camposExtraInf.indexOf(c)===-1){camposExtraInf.push(c);cambiosInf=true;}
      });
      if(cambiosInf){localStorage.setItem('rapca_campos_infra',JSON.stringify(camposExtraInf));renderCamposExtraInf();}
    }
    if(cambios||cambiosInf)console.log('Campos personalizados sincronizados del servidor');
  })
  .catch(function(e){console.error('Error sincronizando campos:',e);});
}

// --- Sincronizar usuarios bidireccional (admin) ---
function sincronizarUsuariosDesdeServidor(){
  if(!tieneTokenServidor()||!isOnline)return;
  if(sesionActual.rol!=='admin')return;
  fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'listar_usuarios',token:sesionActual.token})})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(data){
    if(!data.ok||!data.usuarios)return;
    var locales=getUsuariosLocal();
    var emailsServidor={};
    data.usuarios.forEach(function(su){emailsServidor[su.email.toLowerCase()]=true;});
    var emailsLocales={};
    locales.forEach(function(u){emailsLocales[u.email.toLowerCase()]=true;});
    // 1. Descargar: añadir al local usuarios que solo están en servidor
    var nuevosLocal=0;
    data.usuarios.forEach(function(su){
      if(!emailsLocales[su.email.toLowerCase()]){
        locales.push({id:su.id,email:su.email,nombre:su.nombre,password:'',rol:su.rol,activo:su.activo});
        nuevosLocal++;
      }
    });
    if(nuevosLocal>0){
      guardarUsuariosLocal(locales);
      console.log('Sincronización: '+nuevosLocal+' usuarios nuevos del servidor');
    }
    // 2. Subir: enviar al servidor usuarios que solo están en local
    var pendientes=locales.filter(function(u){
      return u.email&&!emailsServidor[u.email.toLowerCase()];
    });
    if(pendientes.length>0){
      fetch(AUTH_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync_usuarios',token:sesionActual.token,usuarios:pendientes})})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok&&d.creados>0)console.log('Usuarios subidos al servidor: '+d.creados);})
      .catch(function(){});
    }
  })
  .catch(function(e){console.warn('No se pudieron sincronizar usuarios:',e);});
}

document.addEventListener('DOMContentLoaded',function(){
  // Inicializar usuarios locales y migrar datos
  initUsuariosLocal();
  migrarRegistrosEVaEI();
  // Comprobar sesión antes de iniciar app
  var saved=localStorage.getItem('rapca_sesion');
  if(saved){
    sesionActual=JSON.parse(saved);
    if(isOnline){validarSesion();}
    else{ocultarLoginMostrarApp();}
  }
  // Si no hay sesión, se muestra el login overlay automáticamente
  // Permitir Enter en login
  document.getElementById('login-password').addEventListener('keydown',function(e){if(e.key==='Enter')iniciarSesion();});
  document.getElementById('login-email').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('login-password').focus();});
});

function initApp(){
  // Solicitar almacenamiento persistente para que el navegador NO borre datos
  if(navigator.storage&&navigator.storage.persist){
    navigator.storage.persist().then(function(granted){
      console.log('Almacenamiento persistente:',granted?'CONCEDIDO':'denegado');
    });
  }
  initFotosDB().then(function(){
    console.log('DB iniciada, fotos en memoria:',Object.keys(fotosCacheMemoria).length);
    limpiarFotosAntiguasDB();
    actualizarContadorSubidas();
    procesarSubidasPendientes();
  });
  // Escuchar actualizaciones del Service Worker
  if(navigator.serviceWorker){
    navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.type==='SW_UPDATED'){
        showToast('App actualizada ('+e.data.version+'). Tus datos están seguros.','success');
      }
    });
  }
  var t=new Date().toISOString().split('T')[0];document.getElementById('vp-fecha').value=t;document.getElementById('ev-fecha').value=t;document.getElementById('el-fecha').value=t;
  var cVP=localStorage.getItem('rapca_contadores_VP'),cEI=localStorage.getItem('rapca_contadores_EI'),cEV=localStorage.getItem('rapca_contadores_EV'),cEL=localStorage.getItem('rapca_contadores_EL');if(cVP)contadorFotosVP=JSON.parse(cVP);if(cEI)contadorFotosEV=JSON.parse(cEI);else if(cEV)contadorFotosEV=JSON.parse(cEV);if(cEL)contadorFotosEL=JSON.parse(cEL);
  generarPlantas();generarPalatables();generarHerbaceas();updateSyncStatus();updatePendingCount();loadPanel();cargarBorradores();iniciarGeolocalizacion();initPreviewListeners();initCamposExtra();
  window.addEventListener('online',function(){isOnline=true;updateSyncStatus();procesarSubidasPendientes();});window.addEventListener('offline',function(){isOnline=false;updateSyncStatus();});
  document.addEventListener('click',function(e){if(!e.target.closest('.autocomplete-wrapper'))document.querySelectorAll('.autocomplete-list').forEach(function(l){l.classList.remove('show');});if(!e.target.closest('.mapa-search-bar')&&!e.target.closest('.mapa-search-float')){document.querySelectorAll('.mapa-search-results').forEach(function(r){r.classList.remove('show');});}});
  if(window.matchMedia('(display-mode: standalone)').matches){var b=document.getElementById('installBtn');if(b)b.style.display='none';}
  // Cargar listas de admin si es admin
  if(sesionActual&&sesionActual.rol==='admin'&&isOnline){cargarListaUsuarios();sincronizarUsuariosDesdeServidor();}
  // Sincronizar datos con el servidor (recuperar registros e infraestructuras)
  sincronizarDesdeServidor();
}

function opcionesNota(){return'<option value="">-</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option>';}
function actualizarEstadisticasPlantas(){var c=0,s=0;for(var i=1;i<=10;i++)for(var n=1;n<=10;n++){var v=document.getElementById('ev-planta'+i+'-n'+n).value;if(v!==''){c++;s+=parseInt(v);}}document.getElementById('contadorPlantas').textContent=c;document.getElementById('mediaPlantas').textContent=c>0?'x̄ '+(s/c).toFixed(1):'x̄ -';}
function actualizarEstadisticasPalatables(){var cT=0,sT=0;for(var i=1;i<=3;i++){var c=0,s=0;for(var n=1;n<=15;n++){var v=document.getElementById('ev-palatable'+i+'-n'+n).value;if(v!==''){c++;s+=parseInt(v);cT++;sT+=parseInt(v);}}var el=document.getElementById('media-palatable'+i);if(el)el.textContent=c>0?'Media: '+(s/c).toFixed(1):'';}document.getElementById('mediaPalatables').textContent=cT>0?'x̄ '+(sT/cT).toFixed(1):'x̄ -';}
function actualizarMediaHerbaceas(){var c=0,s=0;for(var i=1;i<=7;i++){var v=document.getElementById('ev-herb'+i).value;if(v!==''){c++;s+=parseInt(v);}}document.getElementById('mediaHerbaceas').textContent=c>0?'x̄ '+(s/c).toFixed(1):'x̄ -';}
function generarPlantas(){var c=document.getElementById('ev-plantas-section'),h='';for(var i=1;i<=10;i++){h+='<div class="planta-box"><div class="planta-header"><span class="planta-num">'+i+'</span><div class="autocomplete-wrapper" style="flex:1"><input type="text" id="ev-planta'+i+'" placeholder="Planta..." autocomplete="off" onfocus="showAutocomplete(this)" oninput="filterAutocomplete(this)"><div class="autocomplete-list" id="ac-ev-planta'+i+'"></div></div></div><div class="notas-grid">';for(var n=1;n<=10;n++)h+='<div class="nota-item"><label>'+n+'</label><select id="ev-planta'+i+'-n'+n+'" onchange="actualizarEstadisticasPlantas()">'+opcionesNota()+'</select></div>';h+='</div></div>';}c.innerHTML=h;}
function generarPalatables(){var c=document.getElementById('ev-palatables-section'),h='';for(var i=1;i<=3;i++){h+='<div class="palatable-box"><div class="autocomplete-wrapper"><label>Planta '+i+'</label><input type="text" id="ev-palatable'+i+'" placeholder="Planta..." autocomplete="off" onfocus="showAutocomplete(this)" oninput="filterAutocomplete(this)"><div class="autocomplete-list" id="ac-ev-palatable'+i+'"></div></div><div class="notas-grid">';for(var n=1;n<=15;n++)h+='<div class="nota-item"><label>'+n+'</label><select id="ev-palatable'+i+'-n'+n+'" onchange="actualizarEstadisticasPalatables()">'+opcionesNota()+'</select></div>';h+='</div><div class="planta-media" id="media-palatable'+i+'"></div></div>';}c.innerHTML=h;}
function generarHerbaceas(){var c=document.getElementById('ev-herb'),h='';for(var i=1;i<=7;i++)h+='<div class="herb-item"><label>H'+i+'</label><select id="ev-herb'+i+'" onchange="actualizarMediaHerbaceas()">'+opcionesNota()+'</select></div>';c.innerHTML=h;}
function calcularVolumenMatorral(cobMedia,altMedia){if(!cobMedia||!altMedia||isNaN(cobMedia)||isNaN(altMedia))return null;return((cobMedia/100)*(altMedia/100)*10000).toFixed(1);}
function actualizarResumenMatorral(){var c1=parseFloat(document.getElementById('ev-mat1cob').value)||0,c2=parseFloat(document.getElementById('ev-mat2cob').value)||0,a1=parseFloat(document.getElementById('ev-mat1alt').value)||0,a2=parseFloat(document.getElementById('ev-mat2alt').value)||0,e1=document.getElementById('ev-mat1esp').value.trim(),e2=document.getElementById('ev-mat2esp').value.trim();var hC=document.getElementById('ev-mat1cob').value!==''||document.getElementById('ev-mat2cob').value!=='',hA=document.getElementById('ev-mat1alt').value!==''||document.getElementById('ev-mat2alt').value!=='';var mC='-',mA='-',vol='-';if(hC){var nC=(document.getElementById('ev-mat1cob').value!==''?1:0)+(document.getElementById('ev-mat2cob').value!==''?1:0);mC=((c1+c2)/nC).toFixed(1);}if(hA){var nA=(document.getElementById('ev-mat1alt').value!==''?1:0)+(document.getElementById('ev-mat2alt').value!==''?1:0);mA=((a1+a2)/nA).toFixed(1);}if(mC!=='-'&&mA!=='-')vol=calcularVolumenMatorral(parseFloat(mC),parseFloat(mA));document.getElementById('mediaCob').textContent=mC;document.getElementById('mediaAlt').textContent=mA;document.getElementById('volumenMatorral').textContent=vol;var esp=[];if(e1)esp.push(e1);if(e2&&e2!==e1)esp.push(e2);document.getElementById('especiesMatorral').textContent='Especies: '+(esp.length>0?esp.join(', '):'-');}
function showAutocomplete(i){var l=document.getElementById('ac-'+i.id);if(!l)return;currentAutocomplete={input:i,list:l};renderAutocompleteList(i.value);l.classList.add('show');}
function filterAutocomplete(i){if(currentAutocomplete&&currentAutocomplete.input===i)renderAutocompleteList(i.value);}
function renderAutocompleteList(f){if(!currentAutocomplete)return;var l=currentAutocomplete.list,fL=f.toLowerCase(),h='';PLANTAS.filter(function(p){return p.toLowerCase().indexOf(fL)!==-1;}).forEach(function(p){h+='<div class="autocomplete-item" onclick="selectAutocomplete(\''+p.replace(/'/g,"\\'")+'\')">'+p+'</div>';});l.innerHTML=h||'<div class="autocomplete-item" style="color:#999">Sin resultados</div>';}
function selectAutocomplete(v){if(currentAutocomplete){currentAutocomplete.input.value=v;currentAutocomplete.list.classList.remove('show');actualizarResumenMatorral();currentAutocomplete=null;}}
function showPage(p){var pages=['menu','vp','el','ev','mapa','ganadero','infra','panel','dashboard','timeline','comparador','galeria'];document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active');});document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});document.getElementById('page-'+p).classList.add('active');var idx=pages.indexOf(p);if(idx>=0)document.querySelectorAll('.nav-btn')[idx].classList.add('active');if(p==='panel')loadPanel();if(p==='mapa'){setTimeout(function(){initMapa();if(mapaLeaflet)mapaLeaflet.invalidateSize();},100);}if(p==='ganadero')cargarListaGanaderos();if(p==='infra')cargarListaInfra();if(p==='dashboard'&&typeof initDashboard==='function')initDashboard();if(p==='timeline'&&typeof initTimeline==='function')initTimeline();if(p==='comparador'&&typeof initComparador==='function')initComparador();if(p==='galeria'&&typeof initGaleria==='function')initGaleria();window.scrollTo(0,0);}
function toggleSection(id){document.getElementById(id).classList.toggle('open');}
function setTransecto(n){transectoActual=n;document.querySelectorAll('.transecto-btn').forEach(function(b,i){b.classList.toggle('active',i===n-1);});document.getElementById('btnGuardarEV').textContent='💾 Guardar EI - T'+n;}
function guardarBorradores(){localStorage.setItem('rapca_borrador_vp',JSON.stringify(obtenerDatosVP()));localStorage.setItem('rapca_borrador_ev',JSON.stringify(obtenerDatosEV()));localStorage.setItem('rapca_borrador_el',JSON.stringify(obtenerDatosEL()));}
function cargarBorradores(){try{var bVP=localStorage.getItem('rapca_borrador_vp');if(bVP)cargarDatosVP(JSON.parse(bVP));var bEV=localStorage.getItem('rapca_borrador_ev');if(bEV)cargarDatosEV(JSON.parse(bEV));var bEL=localStorage.getItem('rapca_borrador_el');if(bEL)cargarDatosEL(JSON.parse(bEL));}catch(e){}}
function obtenerDatosVP(){return{fecha:document.getElementById('vp-fecha').value,zona:document.getElementById('vp-zona').value,unidad:document.getElementById('vp-unidad').value,past1:document.getElementById('vp-past1').value,past2:document.getElementById('vp-past2').value,past3:document.getElementById('vp-past3').value,senal:document.getElementById('vp-senal').value,veredas:document.getElementById('vp-veredas').value,cagarrutas:document.getElementById('vp-cagarrutas').value,fotos:document.getElementById('vp-fotos').value,fc1:document.getElementById('vp-fc1').value,fc2:document.getElementById('vp-fc2').value,obs:document.getElementById('vp-obs').value};}
function cargarDatosVP(d){if(d.fecha)document.getElementById('vp-fecha').value=d.fecha;if(d.zona)document.getElementById('vp-zona').value=d.zona;if(d.unidad)document.getElementById('vp-unidad').value=d.unidad;if(d.past1)document.getElementById('vp-past1').value=d.past1;if(d.past2)document.getElementById('vp-past2').value=d.past2;if(d.past3)document.getElementById('vp-past3').value=d.past3;if(d.senal)document.getElementById('vp-senal').value=d.senal;if(d.veredas)document.getElementById('vp-veredas').value=d.veredas;if(d.cagarrutas)document.getElementById('vp-cagarrutas').value=d.cagarrutas;if(d.fotos){document.getElementById('vp-fotos').value=d.fotos;actualizarListaFotos('vp-fotos-lista',d.fotos);}if(d.fc1){document.getElementById('vp-fc1').value=d.fc1;actualizarListaFotos('vp-fc1-lista',d.fc1);}if(d.fc2){document.getElementById('vp-fc2').value=d.fc2;actualizarListaFotos('vp-fc2-lista',d.fc2);}if(d.obs)document.getElementById('vp-obs').value=d.obs;}
function obtenerDatosEV(){var d={fecha:document.getElementById('ev-fecha').value,zona:document.getElementById('ev-zona').value,unidad:document.getElementById('ev-unidad').value,transecto:transectoActual,plantas:[],palatables:[],past1:document.getElementById('ev-past1').value,past2:document.getElementById('ev-past2').value,past3:document.getElementById('ev-past3').value,herbaceas:[],mat1cob:document.getElementById('ev-mat1cob').value,mat1alt:document.getElementById('ev-mat1alt').value,mat1esp:document.getElementById('ev-mat1esp').value,mat2cob:document.getElementById('ev-mat2cob').value,mat2alt:document.getElementById('ev-mat2alt').value,mat2esp:document.getElementById('ev-mat2esp').value,fotos:document.getElementById('ev-fotos').value,fc1:document.getElementById('ev-fc1').value,fc2:document.getElementById('ev-fc2').value,obs:document.getElementById('ev-obs').value};for(var i=1;i<=10;i++){var p={nombre:document.getElementById('ev-planta'+i).value,notas:[]};for(var n=1;n<=10;n++)p.notas.push(document.getElementById('ev-planta'+i+'-n'+n).value);d.plantas.push(p);}for(var i=1;i<=3;i++){var p={nombre:document.getElementById('ev-palatable'+i).value,notas:[]};for(var n=1;n<=15;n++)p.notas.push(document.getElementById('ev-palatable'+i+'-n'+n).value);d.palatables.push(p);}for(var i=1;i<=7;i++)d.herbaceas.push(document.getElementById('ev-herb'+i).value);return d;}
function cargarDatosEV(d){if(d.fecha)document.getElementById('ev-fecha').value=d.fecha;if(d.zona)document.getElementById('ev-zona').value=d.zona;if(d.unidad)document.getElementById('ev-unidad').value=d.unidad;if(d.transecto)setTransecto(d.transecto);if(d.plantas)for(var i=0;i<d.plantas.length&&i<10;i++){document.getElementById('ev-planta'+(i+1)).value=d.plantas[i].nombre||'';for(var n=0;n<d.plantas[i].notas.length&&n<10;n++)document.getElementById('ev-planta'+(i+1)+'-n'+(n+1)).value=d.plantas[i].notas[n]||'';}if(d.palatables)for(var i=0;i<d.palatables.length&&i<3;i++){document.getElementById('ev-palatable'+(i+1)).value=d.palatables[i].nombre||'';for(var n=0;n<d.palatables[i].notas.length&&n<15;n++)document.getElementById('ev-palatable'+(i+1)+'-n'+(n+1)).value=d.palatables[i].notas[n]||'';}if(d.past1)document.getElementById('ev-past1').value=d.past1;if(d.past2)document.getElementById('ev-past2').value=d.past2;if(d.past3)document.getElementById('ev-past3').value=d.past3;if(d.herbaceas)for(var i=0;i<7;i++)document.getElementById('ev-herb'+(i+1)).value=d.herbaceas[i]||'';if(d.mat1cob)document.getElementById('ev-mat1cob').value=d.mat1cob;if(d.mat1alt)document.getElementById('ev-mat1alt').value=d.mat1alt;if(d.mat1esp)document.getElementById('ev-mat1esp').value=d.mat1esp;if(d.mat2cob)document.getElementById('ev-mat2cob').value=d.mat2cob;if(d.mat2alt)document.getElementById('ev-mat2alt').value=d.mat2alt;if(d.mat2esp)document.getElementById('ev-mat2esp').value=d.mat2esp;if(d.fotos){document.getElementById('ev-fotos').value=d.fotos;actualizarListaFotos('ev-fotos-lista',d.fotos);}if(d.fc1){document.getElementById('ev-fc1').value=d.fc1;actualizarListaFotos('ev-fc1-lista',d.fc1);}if(d.fc2){document.getElementById('ev-fc2').value=d.fc2;actualizarListaFotos('ev-fc2-lista',d.fc2);}if(d.obs)document.getElementById('ev-obs').value=d.obs;actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();}
function actualizarListaFotos(lId,f){var l=document.getElementById(lId);if(!l||!f)return;l.innerHTML=f.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).map(function(x){return'<span class="foto-tag">'+x+'</span>';}).join('');}
function limpiarFormularioVP(){var t=new Date().toISOString().split('T')[0];document.getElementById('vp-fecha').value=t;document.getElementById('vp-zona').value='';document.getElementById('vp-unidad').value='';['vp-past1','vp-past2','vp-past3','vp-senal','vp-veredas','vp-cagarrutas','vp-fotos','vp-fc1','vp-fc2','vp-obs'].forEach(function(id){document.getElementById(id).value='';});['vp-fotos-lista','vp-fc1-lista','vp-fc2-lista'].forEach(function(id){document.getElementById(id).innerHTML='';});contadorFotosVP={};localStorage.setItem('rapca_contadores_VP',JSON.stringify(contadorFotosVP));localStorage.removeItem('rapca_borrador_vp');}
// --- EL (Evaluación Ligera) --- Mismos campos que VP
function obtenerDatosEL(){return{fecha:document.getElementById('el-fecha').value,zona:document.getElementById('el-zona').value,unidad:document.getElementById('el-unidad').value,past1:document.getElementById('el-past1').value,past2:document.getElementById('el-past2').value,past3:document.getElementById('el-past3').value,senal:document.getElementById('el-senal').value,veredas:document.getElementById('el-veredas').value,cagarrutas:document.getElementById('el-cagarrutas').value,fotos:document.getElementById('el-fotos').value,fc1:document.getElementById('el-fc1').value,fc2:document.getElementById('el-fc2').value,obs:document.getElementById('el-obs').value};}
function cargarDatosEL(d){if(d.fecha)document.getElementById('el-fecha').value=d.fecha;if(d.zona)document.getElementById('el-zona').value=d.zona;if(d.unidad)document.getElementById('el-unidad').value=d.unidad;if(d.past1)document.getElementById('el-past1').value=d.past1;if(d.past2)document.getElementById('el-past2').value=d.past2;if(d.past3)document.getElementById('el-past3').value=d.past3;if(d.senal)document.getElementById('el-senal').value=d.senal;if(d.veredas)document.getElementById('el-veredas').value=d.veredas;if(d.cagarrutas)document.getElementById('el-cagarrutas').value=d.cagarrutas;if(d.fotos){document.getElementById('el-fotos').value=d.fotos;actualizarListaFotos('el-fotos-lista',d.fotos);}if(d.fc1){document.getElementById('el-fc1').value=d.fc1;actualizarListaFotos('el-fc1-lista',d.fc1);}if(d.fc2){document.getElementById('el-fc2').value=d.fc2;actualizarListaFotos('el-fc2-lista',d.fc2);}if(d.obs)document.getElementById('el-obs').value=d.obs;}
function guardarEL(){var z=document.getElementById('el-zona').value.trim(),u=document.getElementById('el-unidad').value.trim();if(!z||!u){showToast('Zona y Unidad obligatorios','error');return;}var d={pastoreo:[document.getElementById('el-past1').value,document.getElementById('el-past2').value,document.getElementById('el-past3').value],observacionPastoreo:{senal:document.getElementById('el-senal').value,veredas:document.getElementById('el-veredas').value,cagarrutas:document.getElementById('el-cagarrutas').value},fotos:document.getElementById('el-fotos').value,fotosComp:[{numero:document.getElementById('el-fc1').value,waypoint:'W1'},{numero:document.getElementById('el-fc2').value,waypoint:'W2'}],observaciones:document.getElementById('el-obs').value};var r={id:editandoId||Date.now(),tipo:'EL',fecha:document.getElementById('el-fecha').value,zona:z,unidad:u,transecto:'',datos:d,enviado:false,lat:currentLat,lon:currentLon};if(sesionActual){r.operador_email=sesionActual.email;r.operador_nombre=sesionActual.nombre;}if(editandoId){actualizarRegistro(r);editandoId=null;}else guardarLocal(r);showToast('EL guardado','success');limpiarFormularioEL();if(isOnline){enviarRegistro(r);sincronizarRegistroServidor(r);}}
function limpiarFormularioEL(){var t=new Date().toISOString().split('T')[0];document.getElementById('el-fecha').value=t;document.getElementById('el-zona').value='';document.getElementById('el-unidad').value='';['el-past1','el-past2','el-past3','el-senal','el-veredas','el-cagarrutas','el-fotos','el-fc1','el-fc2','el-obs'].forEach(function(id){document.getElementById(id).value='';});['el-fotos-lista','el-fc1-lista','el-fc2-lista'].forEach(function(id){document.getElementById(id).innerHTML='';});contadorFotosEL={};localStorage.setItem('rapca_contadores_EL',JSON.stringify(contadorFotosEL));localStorage.removeItem('rapca_borrador_el');}
function limpiarFormularioEV(c){if(c){var t=new Date().toISOString().split('T')[0];document.getElementById('ev-fecha').value=t;document.getElementById('ev-zona').value='';document.getElementById('ev-unidad').value='';setTransecto(1);contadorFotosEV={};localStorage.setItem('rapca_contadores_EI',JSON.stringify(contadorFotosEV));localStorage.removeItem('rapca_borrador_ev');}for(var i=1;i<=10;i++){document.getElementById('ev-planta'+i).value='';for(var n=1;n<=10;n++)document.getElementById('ev-planta'+i+'-n'+n).value='';}for(var i=1;i<=3;i++){document.getElementById('ev-palatable'+i).value='';for(var n=1;n<=15;n++)document.getElementById('ev-palatable'+i+'-n'+n).value='';var el=document.getElementById('media-palatable'+i);if(el)el.textContent='';}for(var i=1;i<=7;i++)document.getElementById('ev-herb'+i).value='';['ev-past1','ev-past2','ev-past3','ev-mat1cob','ev-mat1alt','ev-mat1esp','ev-mat2cob','ev-mat2alt','ev-mat2esp','ev-fotos','ev-fc1','ev-fc2','ev-obs'].forEach(function(id){document.getElementById(id).value='';});['ev-fotos-lista','ev-fc1-lista','ev-fc2-lista'].forEach(function(id){document.getElementById(id).innerHTML='';});actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();window.scrollTo(0,0);}
function guardarVP(){var z=document.getElementById('vp-zona').value.trim(),u=document.getElementById('vp-unidad').value.trim();if(!z||!u){showToast('Zona y Unidad obligatorios','error');return;}var d={pastoreo:[document.getElementById('vp-past1').value,document.getElementById('vp-past2').value,document.getElementById('vp-past3').value],observacionPastoreo:{senal:document.getElementById('vp-senal').value,veredas:document.getElementById('vp-veredas').value,cagarrutas:document.getElementById('vp-cagarrutas').value},fotos:document.getElementById('vp-fotos').value,fotosComp:[{numero:document.getElementById('vp-fc1').value,waypoint:'W1'},{numero:document.getElementById('vp-fc2').value,waypoint:'W2'}],observaciones:document.getElementById('vp-obs').value};var r={id:editandoId||Date.now(),tipo:'VP',fecha:document.getElementById('vp-fecha').value,zona:z,unidad:u,transecto:'',datos:d,enviado:false,lat:currentLat,lon:currentLon};if(sesionActual){r.operador_email=sesionActual.email;r.operador_nombre=sesionActual.nombre;}if(editandoId){actualizarRegistro(r);editandoId=null;}else guardarLocal(r);showToast('VP guardado','success');limpiarFormularioVP();if(isOnline){enviarRegistro(r);sincronizarRegistroServidor(r);}}
function guardarEV(){var z=document.getElementById('ev-zona').value.trim(),u=document.getElementById('ev-unidad').value.trim();if(!z||!u){showToast('Zona y Unidad obligatorios','error');return;}var pl=[];for(var i=1;i<=10;i++){var nt=[],c=0,s=0;for(var n=1;n<=10;n++){var v=document.getElementById('ev-planta'+i+'-n'+n).value;nt.push(v);if(v!==''){c++;s+=parseInt(v);}}pl.push({nombre:document.getElementById('ev-planta'+i).value,notas:nt,media:c>0?(s/c).toFixed(2):''});}var pa=[],paTC=0,paTS=0;for(var i=1;i<=3;i++){var nt=[],c=0,s=0;for(var n=1;n<=15;n++){var v=document.getElementById('ev-palatable'+i+'-n'+n).value;nt.push(v);if(v!==''){c++;s+=parseInt(v);paTC++;paTS+=parseInt(v);}}pa.push({nombre:document.getElementById('ev-palatable'+i).value,notas:nt,media:c>0?(s/c).toFixed(2):''});}var hb=[];for(var i=1;i<=7;i++)hb.push(document.getElementById('ev-herb'+i).value);var c1=parseFloat(document.getElementById('ev-mat1cob').value)||0,c2=parseFloat(document.getElementById('ev-mat2cob').value)||0,a1=parseFloat(document.getElementById('ev-mat1alt').value)||0,a2=parseFloat(document.getElementById('ev-mat2alt').value)||0;var nC=(document.getElementById('ev-mat1cob').value!==''?1:0)+(document.getElementById('ev-mat2cob').value!==''?1:0),nA=(document.getElementById('ev-mat1alt').value!==''?1:0)+(document.getElementById('ev-mat2alt').value!==''?1:0);var mediaCob=nC>0?((c1+c2)/nC).toFixed(1):'',mediaAlt=nA>0?((a1+a2)/nA).toFixed(1):'',volumen=calcularVolumenMatorral(parseFloat(mediaCob),parseFloat(mediaAlt))||'';var pC=0,pS=0;for(var i=1;i<=10;i++)for(var n=1;n<=10;n++){var v=document.getElementById('ev-planta'+i+'-n'+n).value;if(v!==''){pC++;pS+=parseInt(v);}}var hC=0,hS=0;for(var i=1;i<=7;i++){var v=document.getElementById('ev-herb'+i).value;if(v!==''){hC++;hS+=parseInt(v);}}var d={plantas:pl,plantasMedia:pC>0?(pS/pC).toFixed(2):'',palatables:pa,palatablesMedia:paTC>0?(paTS/paTC).toFixed(2):'',pastoreo:[document.getElementById('ev-past1').value,document.getElementById('ev-past2').value,document.getElementById('ev-past3').value],herbaceas:hb,herbaceasMedia:hC>0?(hS/hC).toFixed(2):'',matorral:{punto1:{cobertura:document.getElementById('ev-mat1cob').value,altura:document.getElementById('ev-mat1alt').value,especie:document.getElementById('ev-mat1esp').value},punto2:{cobertura:document.getElementById('ev-mat2cob').value,altura:document.getElementById('ev-mat2alt').value,especie:document.getElementById('ev-mat2esp').value},mediaCob:mediaCob,mediaAlt:mediaAlt,volumen:volumen},fotos:document.getElementById('ev-fotos').value,fotosComp:[{numero:document.getElementById('ev-fc1').value,waypoint:'W1'},{numero:document.getElementById('ev-fc2').value,waypoint:'W2'}],observaciones:document.getElementById('ev-obs').value};var r={id:editandoId||Date.now(),tipo:'EI',fecha:document.getElementById('ev-fecha').value,zona:z,unidad:u,transecto:'T'+transectoActual,datos:d,enviado:false,lat:currentLat,lon:currentLon};if(sesionActual){r.operador_email=sesionActual.email;r.operador_nombre=sesionActual.nombre;}if(editandoId){actualizarRegistro(r);editandoId=null;}else guardarLocal(r);showToast('EI T'+transectoActual+' guardado','success');if(transectoActual>=3){limpiarFormularioEV(true);showToast('Unidad completada','info');}else{limpiarFormularioEV(false);setTransecto(transectoActual+1);}if(isOnline){enviarRegistro(r);sincronizarRegistroServidor(r);}}
function getRegistros(){var d=localStorage.getItem('rapca_registros');return d?JSON.parse(d):[];}
function getRegistrosUsuario(){var rs=getRegistros();if(sesionActual&&sesionActual.rol!=='admin'){rs=rs.filter(function(r){return r.operador_email===sesionActual.email;});}return rs;}
function guardarLocal(r){var rs=getRegistros();rs.push(r);localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();if(mapaLeaflet)construirCapaComparativas();}
function actualizarRegistro(r){var rs=getRegistros();for(var i=0;i<rs.length;i++)if(rs[i].id===r.id){rs[i]=r;break;}localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();loadPanel();if(mapaLeaflet)construirCapaComparativas();}
function marcarEnviado(id){var rs=getRegistros();for(var i=0;i<rs.length;i++)if(rs[i].id===id){rs[i].enviado=true;break;}localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();loadPanel();}
function updatePendingCount(){var rs=getRegistrosUsuario(),p=rs.filter(function(x){return!x.enviado;}).length;document.getElementById('pendingCount').textContent=p;var b=document.getElementById('pendingBadge');b.style.display=p>0?'inline':'none';b.textContent=p;}
function enviarRegistro(r){showLoading(true);var fd=new URLSearchParams();fd.append(ENTRY.tipo,r.tipo);fd.append(ENTRY.fecha,r.fecha);fd.append(ENTRY.zona,r.zona);fd.append(ENTRY.unidad,r.unidad);fd.append(ENTRY.transecto,r.transecto||'');fd.append(ENTRY.datos,JSON.stringify(r.datos));fetch(FORM_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()}).then(function(){showLoading(false);marcarEnviado(r.id);showToast('Enviado','success');}).catch(function(){showLoading(false);showToast('Guardado local','info');});}
function syncPending(){var pend=getRegistrosUsuario().filter(function(r){return!r.enviado;});if(pend.length===0){showToast('Sin pendientes','info');return;}if(!isOnline){showToast('Sin conexión','error');return;}showLoading(true);var total=pend.length,env=0;pend.forEach(function(r,idx){setTimeout(function(){var fd=new URLSearchParams();fd.append(ENTRY.tipo,r.tipo);fd.append(ENTRY.fecha,r.fecha);fd.append(ENTRY.zona,r.zona);fd.append(ENTRY.unidad,r.unidad);fd.append(ENTRY.transecto,r.transecto||'');fd.append(ENTRY.datos,JSON.stringify(r.datos));fetch(FORM_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()}).then(function(){marcarEnviado(r.id);sincronizarRegistroServidor(r);env++;if(env===total){showLoading(false);showToast(total+' sincronizados','success');}}).catch(function(){env++;if(env===total)showLoading(false);});},idx*600);});}
function loadPanel(){var rs=getRegistrosUsuario(),h='';if(rs.length===0)h='<p style="text-align:center;color:#888;padding:20px">No hay registros</p>';else rs.slice().reverse().forEach(function(r){var opInfo=r.operador_nombre?' | '+r.operador_nombre:'';var tipoCls=r.tipo==='VP'?'vp':r.tipo==='EL'?'el':'ei';h+='<div class="record-item"><span class="tipo '+tipoCls+'">'+r.tipo+'</span> <strong>'+r.zona+'>'+r.unidad+'</strong>'+(r.transecto?' ('+r.transecto+')':'')+'<div class="info">'+r.fecha+' | '+(r.enviado?'✅ Enviado':'⏳ Pendiente')+opInfo+'</div><div class="actions"><button class="btn-small edit" onclick="editarRegistro('+r.id+')">✏️</button><button class="btn-small pdf" onclick="exportarPDF('+r.id+')">📄</button><button class="btn-small delete" onclick="eliminarRegistro('+r.id+')">🗑️</button></div></div>';});document.getElementById('panelList').innerHTML=h;}
function editarRegistro(id){var rs=getRegistros(),r=rs.find(function(x){return x.id===id;});if(!r)return;editandoId=id;if(r.tipo==='VP'||r.tipo==='EL'){var pre=(r.tipo==='VP')?'vp':'el';document.getElementById(pre+'-fecha').value=r.fecha;document.getElementById(pre+'-zona').value=r.zona;document.getElementById(pre+'-unidad').value=r.unidad;var d=r.datos;if(d.pastoreo){document.getElementById(pre+'-past1').value=d.pastoreo[0]||'';document.getElementById(pre+'-past2').value=d.pastoreo[1]||'';document.getElementById(pre+'-past3').value=d.pastoreo[2]||'';}if(d.observacionPastoreo){document.getElementById(pre+'-senal').value=d.observacionPastoreo.senal||'';document.getElementById(pre+'-veredas').value=d.observacionPastoreo.veredas||'';document.getElementById(pre+'-cagarrutas').value=d.observacionPastoreo.cagarrutas||'';}if(d.fotos){document.getElementById(pre+'-fotos').value=d.fotos;actualizarListaFotos(pre+'-fotos-lista',d.fotos);}var fc1Val=d.fotosComp&&d.fotosComp[0]?d.fotosComp[0].numero:'',fc2Val=d.fotosComp&&d.fotosComp[1]?d.fotosComp[1].numero:'';if(fc1Val){document.getElementById(pre+'-fc1').value=fc1Val;actualizarListaFotos(pre+'-fc1-lista',fc1Val);}if(fc2Val){document.getElementById(pre+'-fc2').value=fc2Val;actualizarListaFotos(pre+'-fc2-lista',fc2Val);}document.getElementById(pre+'-obs').value=d.observaciones||'';inicializarContadoresDesdeEdicion(r.tipo,d.fotos,fc1Val,fc2Val);showPage(r.tipo==='VP'?'vp':'el');showToast('Editando '+r.tipo,'info');}else{document.getElementById('ev-fecha').value=r.fecha;document.getElementById('ev-zona').value=r.zona;document.getElementById('ev-unidad').value=r.unidad;setTransecto(parseInt((r.transecto||'T1').replace('T',''))||1);var d=r.datos;if(d.plantas)for(var i=0;i<d.plantas.length&&i<10;i++){document.getElementById('ev-planta'+(i+1)).value=d.plantas[i].nombre||'';for(var n=0;n<d.plantas[i].notas.length&&n<10;n++)document.getElementById('ev-planta'+(i+1)+'-n'+(n+1)).value=d.plantas[i].notas[n]||'';}if(d.palatables)for(var i=0;i<d.palatables.length&&i<3;i++){document.getElementById('ev-palatable'+(i+1)).value=d.palatables[i].nombre||'';for(var n=0;n<d.palatables[i].notas.length&&n<15;n++)document.getElementById('ev-palatable'+(i+1)+'-n'+(n+1)).value=d.palatables[i].notas[n]||'';}if(d.pastoreo){document.getElementById('ev-past1').value=d.pastoreo[0]||'';document.getElementById('ev-past2').value=d.pastoreo[1]||'';document.getElementById('ev-past3').value=d.pastoreo[2]||'';}if(d.herbaceas)for(var i=0;i<7;i++)document.getElementById('ev-herb'+(i+1)).value=d.herbaceas[i]||'';if(d.matorral){document.getElementById('ev-mat1cob').value=d.matorral.punto1?d.matorral.punto1.cobertura:'';document.getElementById('ev-mat1alt').value=d.matorral.punto1?d.matorral.punto1.altura:'';document.getElementById('ev-mat1esp').value=d.matorral.punto1?d.matorral.punto1.especie:'';document.getElementById('ev-mat2cob').value=d.matorral.punto2?d.matorral.punto2.cobertura:'';document.getElementById('ev-mat2alt').value=d.matorral.punto2?d.matorral.punto2.altura:'';document.getElementById('ev-mat2esp').value=d.matorral.punto2?d.matorral.punto2.especie:'';}if(d.fotos){document.getElementById('ev-fotos').value=d.fotos;actualizarListaFotos('ev-fotos-lista',d.fotos);}var fc1Val=d.fotosComp&&d.fotosComp[0]?d.fotosComp[0].numero:'',fc2Val=d.fotosComp&&d.fotosComp[1]?d.fotosComp[1].numero:'';if(fc1Val){document.getElementById('ev-fc1').value=fc1Val;actualizarListaFotos('ev-fc1-lista',fc1Val);}if(fc2Val){document.getElementById('ev-fc2').value=fc2Val;actualizarListaFotos('ev-fc2-lista',fc2Val);}document.getElementById('ev-obs').value=d.observaciones||'';inicializarContadoresDesdeEdicion('EI',d.fotos,fc1Val,fc2Val);actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();showPage('ev');showToast('Editando EI','info');}}
function eliminarRegistro(id){if(confirm('¿Eliminar?')){localStorage.setItem('rapca_registros',JSON.stringify(getRegistros().filter(function(r){return r.id!==id;})));updatePendingCount();loadPanel();showToast('Eliminado','info');if(sesionActual&&sesionActual.token&&isOnline){fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'eliminar',token:sesionActual.token,registro_id:id})}).catch(function(){});}}}
function borrarTodo(){if(!confirm('¿Borrar TODO?'))return;if(sesionActual&&sesionActual.rol!=='admin'){var rs=getRegistros().filter(function(r){return r.operador_email!==sesionActual.email;});localStorage.setItem('rapca_registros',JSON.stringify(rs));}else{localStorage.removeItem('rapca_registros');}updatePendingCount();loadPanel();showToast('Borrados','info');}

// Generar HTML con fotos reales
function generarHTMLRegistroConFotos(r,fotos){
  var d=r.datos;
  console.log('Generando PDF con',Object.keys(fotos).length,'fotos disponibles');
  
  var coordStr=(r.lat&&r.lon)?r.lat.toFixed(6)+', '+r.lon.toFixed(6):'--';
  var opStr=r.operador_nombre||'--';
  var h='<div style="font-family:Arial;max-width:800px;margin:0 auto;padding:20px"><div style="background:linear-gradient(135deg,#1a3d2e,#2d5a3d);color:#fff;padding:25px;border-radius:12px;margin-bottom:20px;text-align:center"><h1 style="margin:0;font-size:2em">🌿 RAPCA EMA</h1><h2 style="margin:10px 0 0;font-weight:normal;font-size:1.3em">'+r.tipo+' - '+r.zona+' > '+r.unidad+(r.transecto?' ('+r.transecto+')':'')+'</h2><p style="margin:8px 0 0;font-size:.9em;opacity:.8">'+opStr+'</p></div><div style="background:#f5f5f0;padding:15px;border-radius:8px;margin-bottom:15px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><span><strong>📅</strong> '+r.fecha+'</span><span><strong>📍</strong> '+coordStr+'</span><span><strong>✅</strong> '+(r.enviado?'Enviado':'Pendiente')+'</span></div>';
  
  if(d.pastoreo)h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">🐄 Pastoreo</h3><p>P1: '+(d.pastoreo[0]||'-')+' | P2: '+(d.pastoreo[1]||'-')+' | P3: '+(d.pastoreo[2]||'-')+'</p></div>';
  if(d.observacionPastoreo)h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">👁️ Observación Estado</h3><p>Señal: '+(d.observacionPastoreo.senal||'-')+' | Veredas: '+(d.observacionPastoreo.veredas||'-')+' | Cagarrutas: '+(d.observacionPastoreo.cagarrutas||'-')+'</p></div>';
  
  if(d.plantas){
    h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">🌱 Plantas (Media: '+(d.plantasMedia||'-')+')</h3>';
    d.plantas.forEach(function(p,i){if(p.nombre||p.notas.some(function(x){return x!=='';}))h+='<p><strong>'+(p.nombre||'P'+(i+1))+'</strong>: '+p.notas.join(', ')+' (M:'+(p.media||'-')+')</p>';});
    h+='</div>';
  }
  
  if(d.palatables){
    var hay=d.palatables.some(function(p){return p.nombre||p.notas.some(function(x){return x!=='';});});
    if(hay){
      h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">🌿 Palatables (Media: '+(d.palatablesMedia||'-')+')</h3>';
      d.palatables.forEach(function(p,i){if(p.nombre||p.notas.some(function(x){return x!=='';}))h+='<p><strong>'+(p.nombre||'Pal'+(i+1))+'</strong>: '+p.notas.join(', ')+' (M:'+(p.media||'-')+')</p>';});
      h+='</div>';
    }
  }
  
  if(d.herbaceas)h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">🌾 Herbáceas (Media: '+(d.herbaceasMedia||'-')+')</h3><p>'+d.herbaceas.map(function(x,i){return'H'+(i+1)+':'+(x||'-');}).join(' | ')+'</p></div>';
  
  if(d.matorral)h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">🌲 Matorral</h3><p>Pt1: Cob '+(d.matorral.punto1.cobertura||'-')+'%, Alt '+(d.matorral.punto1.altura||'-')+'cm, '+(d.matorral.punto1.especie||'-')+'</p><p>Pt2: Cob '+(d.matorral.punto2.cobertura||'-')+'%, Alt '+(d.matorral.punto2.altura||'-')+'cm, '+(d.matorral.punto2.especie||'-')+'</p><p><strong>Medias:</strong> Cob '+(d.matorral.mediaCob||'-')+'% | Alt '+(d.matorral.mediaAlt||'-')+'cm | <strong style="color:#27ae60">Vol: '+(d.matorral.volumen||'-')+' m³/ha</strong></p></div>';
  
  // Fotos comparativas en 2 columnas (proporción 3:4 vertical)
  if(d.fotosComp&&(d.fotosComp[0].numero||d.fotosComp[1].numero)){
    h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">📷 Fotos Comparativas</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">';
    [0,1].forEach(function(idx){
      var wp=idx===0?'W1':'W2';
      if(d.fotosComp[idx].numero){
        d.fotosComp[idx].numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(f){
          var imgSrc=fotos[f];
          h+='<div style="text-align:center;background:#f9f9f9;padding:10px;border-radius:8px;border:1px solid #eee">';
          h+='<div style="position:relative;width:100%;padding-bottom:133.33%;background:#f0f0f0;border-radius:6px;margin-bottom:8px;overflow:hidden">';
          if(imgSrc){
            h+='<img src="'+imgSrc+'" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain">';
          }else{
            h+='<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ddd"><span style="font-size:2em;color:#999">📷</span></div>';
          }
          h+='</div>';
          h+='<div style="font-weight:bold;color:#1a3d2e;font-size:0.85em">'+f+'</div><div style="font-size:0.75em;color:#666">'+wp+'</div></div>';
        });
      }
    });
    h+='</div></div>';
  }
  
  // Fotos varias en 3 columnas (proporción 3:4 vertical)
  if(d.fotos){
    var fotosArr=d.fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});
    if(fotosArr.length>0){
      h+='<div style="background:#fff;border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">📷 Fotos Varias ('+fotosArr.length+')</h3><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
      fotosArr.forEach(function(f){
        var imgSrc=fotos[f];
        h+='<div style="text-align:center;background:#f9f9f9;padding:8px;border-radius:6px;border:1px solid #eee">';
        h+='<div style="position:relative;width:100%;padding-bottom:133.33%;background:#f0f0f0;border-radius:4px;margin-bottom:6px;overflow:hidden">';
        if(imgSrc){
          h+='<img src="'+imgSrc+'" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain">';
        }else{
          h+='<div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#ddd"><span style="font-size:1.5em;color:#999">📷</span></div>';
        }
        h+='</div>';
        h+='<div style="font-weight:bold;color:#1a3d2e;font-size:0.7em;word-break:break-all">'+f+'</div></div>';
      });
      h+='</div></div>';
    }
  }
  
  if(d.observaciones)h+='<div style="background:#fffbcc;border:1px solid #f0e68c;padding:15px;border-radius:8px;margin-bottom:15px"><h3 style="color:#1a3d2e;margin-top:0">📝 Observaciones</h3><p>'+d.observaciones+'</p></div>';
  h+='<div style="text-align:center;color:#888;font-size:.8em;margin-top:30px;padding-top:15px;border-top:1px solid #eee">RAPCA EMA - '+new Date().toLocaleString('es-ES')+'</div></div>';
  return h;
}

async function exportarPDF(id){
  showLoading(true);
  var rs=getRegistros(),r=rs.find(function(x){return x.id===id;});
  if(!r){showLoading(false);return;}
  
  // Obtener fotos ANTES de generar HTML
  var fotos=await obtenerTodasLasFotos();
  console.log('Fotos para PDF:',Object.keys(fotos));
  
  var html=generarHTMLRegistroConFotos(r,fotos);
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><title>RAPCA '+r.tipo+' '+r.unidad+'</title><style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}img{max-width:100%;height:auto;}}</style></head><body>'+html+'<script>setTimeout(function(){window.print();},1000);<\/script></body></html>');
  w.document.close();
  showLoading(false);
}

async function exportarTodosPDF(){
  var rs=getRegistrosUsuario();
  if(rs.length===0){showToast('Sin registros','info');return;}
  showLoading(true);
  
  var fotos=await obtenerTodasLasFotos();
  console.log('Fotos para PDF múltiple:',Object.keys(fotos));
  
  var w=window.open('','_blank');
  var h='<!DOCTYPE html><html><head><title>RAPCA</title><style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}img{max-width:100%;height:auto;}.pb{page-break-after:always}}</style></head><body>';
  for(var i=0;i<rs.length;i++){
    h+=generarHTMLRegistroConFotos(rs[i],fotos);
    if(i<rs.length-1)h+='<div class="pb"></div>';
  }
  h+='<script>setTimeout(function(){window.print();},1000);<\/script></body></html>';
  w.document.write(h);
  w.document.close();
  showLoading(false);
}

function updateSyncStatus(){var e=document.getElementById('syncStatus');e.textContent=isOnline?'Online':'Offline';e.className='sync-status '+(isOnline?'online':'offline');}
function showLoading(s){document.getElementById('loading').classList.toggle('show',s);}
function showToast(m,t){var e=document.getElementById('toast');e.textContent=m;e.className='toast show '+(t||'info');setTimeout(function(){e.classList.remove('show');},3000);}

// --- Ganaderos ---
function initCamposExtra(){
  var g=localStorage.getItem('rapca_campos_ganadero');
  var i=localStorage.getItem('rapca_campos_infra');
  if(g)camposExtraGan=JSON.parse(g);
  if(i)camposExtraInf=JSON.parse(i);
  renderCamposExtraGan();renderCamposExtraInf();
}
function getGanaderos(){var d=localStorage.getItem('rapca_ganaderos');return d?JSON.parse(d):[];}
function guardarGanaderos(lista){localStorage.setItem('rapca_ganaderos',JSON.stringify(lista));}
function guardarGanadero(){
  var idG=document.getElementById('gan-id').value.trim();
  if(!idG){showToast('ID Ganadero obligatorio','error');return;}
  var r={id:editandoGanaderoId||Date.now(),idGanadero:idG,zonas:document.getElementById('gan-zonas').value.trim(),nombre:document.getElementById('gan-nombre').value.trim(),direccion:document.getElementById('gan-direccion').value.trim(),telefono:document.getElementById('gan-telefono').value.trim(),email:document.getElementById('gan-email').value.trim(),observaciones:document.getElementById('gan-obs').value.trim(),extras:{}};
  camposExtraGan.forEach(function(c){var el=document.getElementById('gan-extra-'+c.replace(/\s/g,'_'));if(el)r.extras[c]=el.value.trim();});
  var lista=getGanaderos();
  if(editandoGanaderoId){for(var i=0;i<lista.length;i++)if(lista[i].id===editandoGanaderoId){lista[i]=r;break;}editandoGanaderoId=null;}
  else{lista.push(r);}
  guardarGanaderos(lista);showToast('Ganadero guardado','success');limpiarFormGanadero();cargarListaGanaderos();
  sincronizarGanaderoServidor(r);
}
function limpiarFormGanadero(){
  editandoGanaderoId=null;
  ['gan-id','gan-zonas','gan-nombre','gan-direccion','gan-telefono','gan-email','gan-obs'].forEach(function(id){document.getElementById(id).value='';});
  camposExtraGan.forEach(function(c){var el=document.getElementById('gan-extra-'+c.replace(/\s/g,'_'));if(el)el.value='';});
}
function cargarListaGanaderos(){
  var lista=getGanaderos(),buscar=document.getElementById('gan-buscar')?document.getElementById('gan-buscar').value.toLowerCase():'';
  var el=document.getElementById('ganaderoList');if(!el)return;
  var cnt=document.getElementById('ganaderoCount');
  var filtrados=buscar?lista.filter(function(r){return(r.idGanadero+' '+r.nombre+' '+r.zonas).toLowerCase().indexOf(buscar)!==-1;}):lista;
  if(cnt)cnt.textContent=filtrados.length;
  if(filtrados.length===0){el.innerHTML='<p style="text-align:center;color:#888;padding:15px">Sin ganaderos</p>';return;}
  var h='';
  filtrados.forEach(function(r){
    h+='<div class="record-card ganadero"><div class="rc-title">'+r.idGanadero+' — '+(r.nombre||'Sin nombre')+'</div>';
    h+='<div class="rc-info">';
    if(r.zonas)h+='Zonas: '+r.zonas+'<br>';
    if(r.telefono)h+='Tel: '+r.telefono;
    if(r.email)h+=(r.telefono?' | ':'')+r.email;
    h+='</div>';
    h+='<div class="rc-actions"><button class="btn-small edit" onclick="editarGanadero('+r.id+')">✏️</button><button class="btn-small delete" onclick="eliminarGanadero('+r.id+')">🗑️</button></div></div>';
  });
  el.innerHTML=h;
}
function editarGanadero(id){
  var lista=getGanaderos(),r=lista.find(function(x){return x.id===id;});
  if(!r)return;editandoGanaderoId=id;
  document.getElementById('gan-id').value=r.idGanadero||'';
  document.getElementById('gan-zonas').value=r.zonas||'';
  document.getElementById('gan-nombre').value=r.nombre||'';
  document.getElementById('gan-direccion').value=r.direccion||'';
  document.getElementById('gan-telefono').value=r.telefono||'';
  document.getElementById('gan-email').value=r.email||'';
  document.getElementById('gan-obs').value=r.observaciones||'';
  if(r.extras)camposExtraGan.forEach(function(c){var el=document.getElementById('gan-extra-'+c.replace(/\s/g,'_'));if(el)el.value=r.extras[c]||'';});
  window.scrollTo(0,0);showToast('Editando ganadero','info');
}
function eliminarGanadero(id){
  if(!confirm('¿Eliminar ganadero?'))return;
  guardarGanaderos(getGanaderos().filter(function(r){return r.id!==id;}));
  cargarListaGanaderos();showToast('Eliminado','info');
  if(sesionActual&&sesionActual.token&&isOnline){
    fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'eliminar_ganadero',token:sesionActual.token,ganadero_id:id})}).catch(function(){});
  }
}
function agregarCampoGanadero(){
  var nombre=prompt('Nombre del nuevo campo:');
  if(!nombre||!nombre.trim())return;nombre=nombre.trim();
  if(camposExtraGan.indexOf(nombre)!==-1){showToast('Campo ya existe','error');return;}
  camposExtraGan.push(nombre);localStorage.setItem('rapca_campos_ganadero',JSON.stringify(camposExtraGan));renderCamposExtraGan();
  sincronizarCamposAlServidor();
}
function eliminarCampoGan(nombre){
  if(!confirm('¿Eliminar campo "'+nombre+'"?'))return;
  camposExtraGan=camposExtraGan.filter(function(c){return c!==nombre;});
  localStorage.setItem('rapca_campos_ganadero',JSON.stringify(camposExtraGan));renderCamposExtraGan();
  sincronizarCamposAlServidor();
}
function renderCamposExtraGan(){
  var el=document.getElementById('gan-campos-extra');if(!el)return;
  var h='';
  camposExtraGan.forEach(function(c){
    var safeId='gan-extra-'+c.replace(/\s/g,'_');
    h+='<div class="campo-extra"><div class="form-group"><label>'+c+'</label><input type="text" id="'+safeId+'"></div><button class="btn-remove" onclick="eliminarCampoGan(\''+c.replace(/'/g,"\\'")+'\')">✖</button></div>';
  });
  el.innerHTML=h;
}

// --- Infraestructuras ---
function getInfras(){var d=localStorage.getItem('rapca_infraestructuras');return d?JSON.parse(d):[];}
function guardarInfras(lista){localStorage.setItem('rapca_infraestructuras',JSON.stringify(lista));}
function guardarInfra(){
  var r={id:editandoInfraId||Date.now(),extras:{}};
  INFRA_CAMPOS_BASE.forEach(function(c){r[c.key]=document.getElementById(c.id).value.trim();});
  camposExtraInf.forEach(function(c){var el=document.getElementById('inf-extra-'+c.replace(/\s/g,'_'));if(el)r.extras[c]=el.value.trim();});
  if(!r.idUnidad&&!r.nombre){showToast('ID Unidad o Nombre obligatorio','error');return;}
  var lista=getInfras();
  if(editandoInfraId){for(var i=0;i<lista.length;i++)if(lista[i].id===editandoInfraId){lista[i]=r;break;}editandoInfraId=null;}
  else{lista.push(r);}
  guardarInfras(lista);showToast('Infraestructura guardada','success');limpiarFormInfra();cargarListaInfra();
  sincronizarInfraServidor(r);
}
function limpiarFormInfra(){
  editandoInfraId=null;
  INFRA_CAMPOS_BASE.forEach(function(c){document.getElementById(c.id).value='';});
  camposExtraInf.forEach(function(c){var el=document.getElementById('inf-extra-'+c.replace(/\s/g,'_'));if(el)el.value='';});
}
function cargarListaInfra(){
  var lista=getInfras(),buscar=document.getElementById('inf-buscar')?document.getElementById('inf-buscar').value.toLowerCase():'';
  var el=document.getElementById('infraList');if(!el)return;
  var cnt=document.getElementById('infraCount');
  var filtrados=buscar?lista.filter(function(r){return(r.provincia+' '+r.idZona+' '+r.idUnidad+' '+r.nombre+' '+r.municipio).toLowerCase().indexOf(buscar)!==-1;}):lista;
  if(cnt)cnt.textContent=filtrados.length;
  if(filtrados.length===0){el.innerHTML='<p style="text-align:center;color:#888;padding:15px">Sin infraestructuras</p>';return;}
  var h='';
  // Pre-calcular indicadores de estado
  var allRegs=getRegistrosUsuario();
  var statsMap={};
  allRegs.forEach(function(reg){
    if(!reg.unidad)return;
    if(!statsMap[reg.unidad])statsMap[reg.unidad]={vp:0,el:0,ei:0,fotos:0};
    if(reg.tipo==='VP')statsMap[reg.unidad].vp++;else if(reg.tipo==='EL')statsMap[reg.unidad].el++;else statsMap[reg.unidad].ei++;
    var dd=reg.datos||{};
    if(dd.fotos)statsMap[reg.unidad].fotos+=dd.fotos.split(',').filter(function(x){return x.trim();}).length;
    if(dd.fotosComp)dd.fotosComp.forEach(function(fc){if(fc.numero)statsMap[reg.unidad].fotos+=fc.numero.split(',').filter(function(x){return x.trim();}).length;});
  });
  filtrados.slice(0,50).forEach(function(r){
    var st=statsMap[r.idUnidad]||{vp:0,el:0,ei:0,fotos:0};
    h+='<div class="record-card infra"><div class="rc-title">'+(r.idUnidad||'--')+' — '+(r.nombre||'Sin nombre')+'</div>';
    h+='<div class="rc-info">'+(r.municipio||'-')+' | '+(r.provincia||'-')+' | Zona: '+(r.idZona||'-')+'</div>';
    if(st.vp>0||st.el>0||st.ei>0||st.fotos>0){
      h+='<div class="state-badges">';
      if(st.vp>0)h+='<span class="state-badge vp-badge">VP:'+st.vp+'</span>';
      if(st.el>0)h+='<span class="state-badge el-badge">EL:'+st.el+'</span>';
      if(st.ei>0)h+='<span class="state-badge ev-badge">EI:'+st.ei+'</span>';
      if(st.fotos>0)h+='<span class="state-badge foto-badge">📷'+st.fotos+'</span>';
      h+='</div>';
    }
    h+='<div class="rc-actions"><button class="btn-small edit" onclick="editarInfra('+r.id+')">✏️</button><button class="btn-small" style="background:#e67e22;color:#fff" onclick="descargarZIPUnidad(\''+((r.idUnidad||'').replace(/'/g,"\\'"))+'\')">📦</button><button class="btn-small delete" onclick="eliminarInfra('+r.id+')">🗑️</button></div></div>';
  });
  if(filtrados.length>50)h+='<p style="text-align:center;color:#888;padding:10px">Mostrando 50 de '+filtrados.length+'</p>';
  el.innerHTML=h;
}
function editarInfra(id){
  var lista=getInfras(),r=lista.find(function(x){return x.id===id;});
  if(!r)return;editandoInfraId=id;
  INFRA_CAMPOS_BASE.forEach(function(c){document.getElementById(c.id).value=r[c.key]||'';});
  if(r.extras)camposExtraInf.forEach(function(c){var el=document.getElementById('inf-extra-'+c.replace(/\s/g,'_'));if(el)el.value=r.extras[c]||'';});
  window.scrollTo(0,0);showToast('Editando infraestructura','info');
}
function eliminarInfra(id){
  if(!confirm('¿Eliminar infraestructura?'))return;
  guardarInfras(getInfras().filter(function(r){return r.id!==id;}));
  cargarListaInfra();showToast('Eliminado','info');
  if(sesionActual&&sesionActual.token&&isOnline){
    fetch(DATOS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'eliminar_infra',token:sesionActual.token,infra_id:id})}).catch(function(){});
  }
}
function agregarCampoInfra(){
  var nombre=prompt('Nombre del nuevo campo:');
  if(!nombre||!nombre.trim())return;nombre=nombre.trim();
  if(camposExtraInf.indexOf(nombre)!==-1){showToast('Campo ya existe','error');return;}
  camposExtraInf.push(nombre);localStorage.setItem('rapca_campos_infra',JSON.stringify(camposExtraInf));renderCamposExtraInf();
  sincronizarCamposAlServidor();
}
function eliminarCampoInf(nombre){
  if(!confirm('¿Eliminar campo "'+nombre+'"?'))return;
  camposExtraInf=camposExtraInf.filter(function(c){return c!==nombre;});
  localStorage.setItem('rapca_campos_infra',JSON.stringify(camposExtraInf));renderCamposExtraInf();
  sincronizarCamposAlServidor();
}
function renderCamposExtraInf(){
  var el=document.getElementById('inf-campos-extra');if(!el)return;
  var h='';
  camposExtraInf.forEach(function(c){
    var safeId='inf-extra-'+c.replace(/\s/g,'_');
    h+='<div class="campo-extra"><div class="form-group"><label>'+c+'</label><input type="text" id="'+safeId+'"></div><button class="btn-remove" onclick="eliminarCampoInf(\''+c.replace(/'/g,"\\'")+'\')">✖</button></div>';
  });
  el.innerHTML=h;
}

// --- Excel Import/Export (Infraestructuras) ---
function importarExcel(file){
  if(!file)return;
  if(typeof XLSX==='undefined'){showToast('Librería Excel no cargada','error');return;}
  showLoading(true);
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'array'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var datos=XLSX.utils.sheet_to_json(ws,{defval:''});
      if(datos.length===0){showLoading(false);showToast('Excel vacío','error');return;}
      var headerMap={};
      INFRA_CAMPOS_BASE.forEach(function(c){headerMap[c.label.toUpperCase()]=c.key;});
      var lista=getInfras();
      var nuevos=0,actualizados=0;
      datos.forEach(function(row){
        var r={id:Date.now()+Math.floor(Math.random()*10000),extras:{}};
        Object.keys(row).forEach(function(k){
          var ku=k.toUpperCase().trim();
          var mapped=headerMap[ku];
          if(mapped){r[mapped]=String(row[k]).trim();}
          else{r.extras[k.trim()]=String(row[k]).trim();if(camposExtraInf.indexOf(k.trim())===-1)camposExtraInf.push(k.trim());}
        });
        if(r.idUnidad){
          var idx=lista.findIndex(function(x){return x.idUnidad===r.idUnidad;});
          if(idx!==-1){var oldId=lista[idx].id;Object.assign(lista[idx],r);lista[idx].id=oldId;actualizados++;}
          else{lista.push(r);nuevos++;}
        }else{lista.push(r);nuevos++;}
      });
      guardarInfras(lista);
      localStorage.setItem('rapca_campos_infra',JSON.stringify(camposExtraInf));
      renderCamposExtraInf();cargarListaInfra();showLoading(false);
      showToast(nuevos+' nuevas, '+actualizados+' actualizadas','success');
      sincronizarInfrasAlServidor();sincronizarCamposAlServidor();
    }catch(err){showLoading(false);showToast('Error: '+err.message,'error');console.error('Error importando Excel:',err);}
  };
  reader.readAsArrayBuffer(file);
}
function exportarExcel(){
  if(typeof XLSX==='undefined'){showToast('Librería Excel no cargada','error');return;}
  var lista=getInfras();
  if(lista.length===0){showToast('Sin datos para exportar','info');return;}
  var headers=INFRA_CAMPOS_BASE.map(function(c){return c.label;});
  var allExtras={};
  lista.forEach(function(r){if(r.extras)Object.keys(r.extras).forEach(function(k){allExtras[k]=true;});});
  var extraKeys=Object.keys(allExtras);
  headers=headers.concat(extraKeys);
  var rows=lista.map(function(r){
    var row={};
    INFRA_CAMPOS_BASE.forEach(function(c){row[c.label]=r[c.key]||'';});
    extraKeys.forEach(function(k){row[k]=(r.extras&&r.extras[k])||'';});
    return row;
  });
  var ws=XLSX.utils.json_to_sheet(rows,{header:headers});
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Infraestructuras');
  XLSX.writeFile(wb,'RAPCA_Infraestructuras.xlsx');
  showToast('Exportado '+lista.length+' registros','success');
}

// --- Búsqueda Global (Ctrl+K) ---
var filtroBusqueda='';
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();abrirBusqueda();}
  if(e.key==='Escape'){if(mapaFullscreen){toggleMapaFullscreen();}else{cerrarBusqueda();}}
});
function abrirBusqueda(){
  document.getElementById('searchOverlay').classList.add('show');
  var inp=document.getElementById('searchInput');
  inp.value='';inp.focus();
  filtroBusqueda='';
  document.querySelectorAll('.search-filters button').forEach(function(b,i){b.classList.toggle('active',i===0);});
  document.getElementById('searchResults').innerHTML='<p style="text-align:center;color:#888;padding:30px;font-size:.9rem">Escribe para buscar...</p>';
}
function cerrarBusqueda(){document.getElementById('searchOverlay').classList.remove('show');}
function setFiltroBusqueda(f){
  filtroBusqueda=f;
  document.querySelectorAll('.search-filters button').forEach(function(b){
    var tipo=b.textContent.toLowerCase().trim();
    b.classList.toggle('active',(f===''&&tipo==='todo')||(f==='infra'&&tipo==='infra')||(f==='registro'&&tipo==='registros')||(f==='operador'&&tipo==='operadores'));
  });
  ejecutarBusqueda();
}
function ejecutarBusqueda(){
  var q=document.getElementById('searchInput').value.trim().toLowerCase();
  var el=document.getElementById('searchResults');
  if(q.length<2){el.innerHTML='<p style="text-align:center;color:#888;padding:30px;font-size:.9rem">Escribe al menos 2 caracteres...</p>';return;}
  var resultados=[];
  // Buscar infraestructuras
  if(!filtroBusqueda||filtroBusqueda==='infra'){
    getInfras().forEach(function(inf){
      var texto=(inf.idUnidad+' '+inf.nombre+' '+inf.municipio+' '+inf.provincia+' '+inf.idZona+' '+(inf.pn||'')).toLowerCase();
      if(texto.indexOf(q)!==-1)resultados.push({tipo:'infra',titulo:(inf.idUnidad||'--')+' — '+(inf.nombre||'Sin nombre'),sub:(inf.municipio||'-')+' | '+(inf.provincia||'-')+' | Zona: '+(inf.idZona||'-'),id:inf.id});
    });
  }
  // Buscar registros
  if(!filtroBusqueda||filtroBusqueda==='registro'){
    getRegistrosUsuario().forEach(function(r){
      var texto=(r.tipo+' '+r.zona+' '+r.unidad+' '+r.fecha+' '+(r.operador_nombre||'')+' '+(r.datos.observaciones||'')).toLowerCase();
      if(texto.indexOf(q)!==-1)resultados.push({tipo:'registro',titulo:r.tipo+' '+r.zona+' > '+r.unidad+(r.transecto?' ('+r.transecto+')':''),sub:r.fecha+' | '+(r.operador_nombre||'--')+' | '+(r.enviado?'Enviado':'Pendiente'),id:r.id,regTipo:r.tipo});
    });
  }
  // Buscar operadores
  if(!filtroBusqueda||filtroBusqueda==='operador'){
    var ops={};
    getRegistrosUsuario().forEach(function(r){
      if(r.operador_nombre&&!ops[r.operador_email||r.operador_nombre]){
        var texto=(r.operador_nombre+' '+(r.operador_email||'')).toLowerCase();
        if(texto.indexOf(q)!==-1){ops[r.operador_email||r.operador_nombre]=true;resultados.push({tipo:'operador',titulo:r.operador_nombre,sub:r.operador_email||'--',email:r.operador_email});}
      }
    });
  }
  if(resultados.length===0){el.innerHTML='<p style="text-align:center;color:#888;padding:30px;font-size:.9rem">Sin resultados para "'+q+'"</p>';return;}
  var h='';
  resultados.slice(0,30).forEach(function(r){
    var icon=r.tipo==='infra'?'infra':r.tipo==='registro'?'registro':'operador';
    var emoji=r.tipo==='infra'?'🌳':r.tipo==='registro'?(r.regTipo==='VP'?'🔍':'📊'):'👤';
    h+='<div class="search-result-item" onclick="irAResultado(\''+r.tipo+'\','+JSON.stringify(r.id||'').replace(/"/g,'&quot;')+')">';
    h+='<div class="sr-icon '+icon+'">'+emoji+'</div>';
    h+='<div><div class="sr-title">'+r.titulo+'</div><div class="sr-sub">'+r.sub+'</div></div></div>';
  });
  if(resultados.length>30)h+='<p style="text-align:center;color:#888;padding:10px;font-size:.8rem">'+resultados.length+' resultados (mostrando 30)</p>';
  el.innerHTML=h;
}
function irAResultado(tipo,id){
  cerrarBusqueda();
  if(tipo==='infra'){showPage('infra');if(id)editarInfra(id);}
  else if(tipo==='registro'){showPage('panel');}
  else if(tipo==='operador'){showPage('dashboard');}
}

// --- Descarga Masiva ZIP ---
async function descargarZIPUnidad(unidad){
  if(typeof JSZip==='undefined'){showToast('JSZip no cargado','error');return;}
  showLoading(true);
  var fotos=await obtenerTodasLasFotos();
  var rs=getRegistros().filter(function(r){return r.unidad===unidad;});
  var zip=new JSZip();
  var count=0;
  rs.forEach(function(r){
    var d=r.datos||{};
    var codigos=[];
    if(d.fotos)d.fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){codigos.push(c);});
    if(d.fotosComp)d.fotosComp.forEach(function(fc){if(fc.numero)fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){codigos.push(c);});});
    codigos.forEach(function(c){
      var src=fotos[c];
      if(src){
        var base64=src.split(',')[1];
        if(base64){
          var folder=r.fecha+'_'+r.tipo+(r.transecto?'_'+r.transecto:'');
          zip.file(folder+'/'+c+'.jpg',base64,{base64:true});
          count++;
        }
      }
    });
  });
  if(count===0){showLoading(false);showToast('Sin fotos para '+unidad,'info');return;}
  zip.generateAsync({type:'blob'}).then(function(blob){
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RAPCA_'+unidad+'_fotos.zip';a.click();
    showLoading(false);showToast(count+' fotos descargadas','success');
  }).catch(function(e){showLoading(false);showToast('Error ZIP: '+e.message,'error');});
}
async function descargarZIPTodas(){
  if(typeof JSZip==='undefined'){showToast('JSZip no cargado','error');return;}
  var rs=getRegistrosUsuario();
  if(rs.length===0){showToast('Sin registros','info');return;}
  showLoading(true);
  var fotos=await obtenerTodasLasFotos();
  var zip=new JSZip();
  var count=0;
  rs.forEach(function(r){
    var d=r.datos||{};
    var codigos=[];
    if(d.fotos)d.fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){codigos.push(c);});
    if(d.fotosComp)d.fotosComp.forEach(function(fc){if(fc.numero)fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){codigos.push(c);});});
    codigos.forEach(function(c){
      var src=fotos[c];
      if(src){
        var base64=src.split(',')[1];
        if(base64){
          var folder=r.unidad+'/'+r.fecha+'_'+r.tipo+(r.transecto?'_'+r.transecto:'');
          zip.file(folder+'/'+c+'.jpg',base64,{base64:true});
          count++;
        }
      }
    });
  });
  if(count===0){showLoading(false);showToast('Sin fotos disponibles','info');return;}
  zip.generateAsync({type:'blob'}).then(function(blob){
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RAPCA_todas_fotos.zip';a.click();
    showLoading(false);showToast(count+' fotos en ZIP','success');
  }).catch(function(e){showLoading(false);showToast('Error ZIP: '+e.message,'error');});
}

// --- Exportar KML desde registros ---
function exportarKML(){
  var rs=getRegistros().filter(function(r){return r.lat&&r.lon;});
  var infras=getInfras().filter(function(i){return i.lat&&i.lon;});
  if(rs.length===0&&infras.length===0){showToast('Sin datos con coordenadas','info');return;}
  var kml='<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>RAPCA Campo</name>\n';
  // Estilos
  kml+='<Style id="vp"><IconStyle><color>ff88d8b0</color><scale>1</scale></IconStyle></Style>\n';
  kml+='<Style id="ev"><IconStyle><color>fffd9853</color><scale>1</scale></IconStyle></Style>\n';
  kml+='<Style id="infra"><IconStyle><color>ff8e44ad</color><scale>1</scale></IconStyle></Style>\n';
  // Registros
  rs.forEach(function(r){
    kml+='<Placemark>\n<name>'+r.tipo+' '+r.unidad+'</name>\n';
    kml+='<description>'+r.fecha+(r.operador_nombre?' - '+r.operador_nombre:'')+(r.transecto?' ('+r.transecto+')':'')+'</description>\n';
    kml+='<styleUrl>#'+r.tipo.toLowerCase()+'</styleUrl>\n';
    kml+='<Point><coordinates>'+r.lon+','+r.lat+',0</coordinates></Point>\n';
    kml+='</Placemark>\n';
  });
  // Infraestructuras
  infras.forEach(function(i){
    kml+='<Placemark>\n<name>'+(i.idUnidad||'--')+'</name>\n';
    kml+='<description>'+(i.nombre||'')+(i.municipio?' - '+i.municipio:'')+'</description>\n';
    kml+='<styleUrl>#infra</styleUrl>\n';
    kml+='<Point><coordinates>'+i.lon+','+i.lat+',0</coordinates></Point>\n';
    kml+='</Placemark>\n';
  });
  kml+='</Document>\n</kml>';
  var blob=new Blob([kml],{type:'application/vnd.google-earth.kml+xml'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RAPCA_Campo.kml';a.click();
  showToast('KML exportado','success');
}

// --- KML/KMZ Persistence en IndexedDB ---
function guardarCapaKMLenDB(nombre,kmlText){
  if(!fotosDB)return;
  try{
    var tx=fotosDB.transaction(['capas_kml'],'readwrite');
    tx.objectStore('capas_kml').put({nombre:nombre,data:kmlText,fecha:Date.now()});
  }catch(e){console.error('Error guardando KML en DB:',e);}
}
function eliminarCapaKMLdeDB(nombre){
  if(!fotosDB)return;
  try{
    var tx=fotosDB.transaction(['capas_kml'],'readwrite');
    tx.objectStore('capas_kml').delete(nombre);
  }catch(e){}
}
function cargarCapasKMLdesdeDB(){
  if(!fotosDB)return;
  try{
    var tx=fotosDB.transaction(['capas_kml'],'readonly');
    var req=tx.objectStore('capas_kml').getAll();
    req.onsuccess=function(){
      var capas=req.result||[];
      capas.forEach(function(c){
        if(!capasKML[c.nombre]&&usuarioPuedeVerCapa(c.nombre)){
          var res=parsearKML(c.data);
          if(res.group.getLayers().length>0){
            res.group.addTo(mapaLeaflet);capasKML[c.nombre]=res.group;capasKMLRaw[c.nombre]=c.data;capasKMLSubcapas[c.nombre]=res.subcapas;
            if(controlCapas)controlCapas.addOverlay(res.group,c.nombre);
          }
        }
      });
      actualizarListaCapas();
    };
  }catch(e){console.error('Error cargando KML de DB:',e);}
}

// =========================================================================
// === HERRAMIENTAS GPS (estilo OruxMaps) ===
// =========================================================================

// --- Variables globales GPS tools ---
var medicionActiva=false,medicionPuntos=[],medicionPolyline=null,medicionMarkers=[];
var waypointsPendiente=null,waypointsGuardados=[];var waypointsLayer=null;
var gpsInfoVisible=false,seguirGPS=false;

// --- Panel GPS en tiempo real ---
function toggleGPSInfo(){
  gpsInfoVisible=!gpsInfoVisible;
  var p=document.getElementById('gps-info-panel');
  if(p)p.classList.toggle('show',gpsInfoVisible);
}
function actualizarPanelGPS(){
  if(!gpsInfoVisible)return;
  var setEl=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
  if(currentLat!==null){
    setEl('gps-lat',currentLat.toFixed(6));
    setEl('gps-lon',currentLon.toFixed(6));
    setEl('gps-alt',currentAlt!==null?Math.round(currentAlt):'--');
    setEl('gps-speed',currentSpeed!==null?(currentSpeed*3.6).toFixed(1):'--');
    setEl('gps-acc',currentAcc!==null?Math.round(currentAcc):'--');
    setEl('gps-heading',currentHeading||'--');
    var signal=currentAcc?currentAcc<5?'Excelente':currentAcc<15?'Buena':currentAcc<30?'Normal':'Baja':'--';
    setEl('gps-signal',signal);
    if(currentUTM)setEl('gps-utm',currentUTM.zone+currentUTM.band+' '+currentUTM.easting+' '+currentUTM.northing);
    // Panel flotante (fullscreen)
    setEl('gps-f-speed',currentSpeed!==null?(currentSpeed*3.6).toFixed(1)+'km/h':'--');
    setEl('gps-f-alt',currentAlt!==null?Math.round(currentAlt)+'m':'--');
    if(currentUTM)setEl('gps-f-utm',currentUTM.zone+currentUTM.band+' '+currentUTM.easting);
  }
  // Actualizar marcador posición en mapa
  if(mapaLeaflet&&currentLat&&currentLon){
    if(marcadorPosicion)marcadorPosicion.setLatLng([currentLat,currentLon]);
    if(seguirGPS)mapaLeaflet.setView([currentLat,currentLon]);
  }
}


// --- Fórmula Haversine para distancia entre 2 puntos ---
function distanciaHaversine(lat1,lon1,lat2,lon2){
  var R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}


// --- Herramienta de medición de distancia ---
function toggleMedicion(){
  medicionActiva=!medicionActiva;
  var btn=document.getElementById('btnMeasure');
  var info=document.getElementById('measure-info');
  if(medicionActiva){
    btn.classList.add('active');
    info.classList.add('show');
    document.getElementById('measure-text').textContent='Toca el mapa para medir distancia';
    if(mapaLeaflet){
      mapaLeaflet.getContainer().style.cursor='crosshair';
      mapaLeaflet.on('click',medicionClick);
    }
  }else{
    btn.classList.remove('active');
    info.classList.remove('show');
    limpiarMedicion();
    if(mapaLeaflet){
      mapaLeaflet.getContainer().style.cursor='';
      mapaLeaflet.off('click',medicionClick);
    }
  }
}
function medicionClick(e){
  if(!medicionActiva)return;
  var pt={lat:e.latlng.lat,lon:e.latlng.lng};
  medicionPuntos.push(pt);
  // Añadir marcador
  var mk=L.circleMarker([pt.lat,pt.lon],{radius:6,color:'#2980b9',fillColor:'#3498db',fillOpacity:1,weight:2}).addTo(mapaLeaflet);
  mk.bindPopup('Punto '+medicionPuntos.length);
  medicionMarkers.push(mk);
  // Actualizar línea
  if(medicionPolyline)mapaLeaflet.removeLayer(medicionPolyline);
  if(medicionPuntos.length>1){
    var latlngs=medicionPuntos.map(function(p){return[p.lat,p.lon];});
    medicionPolyline=L.polyline(latlngs,{color:'#3498db',weight:3,dashArray:'6,6',opacity:0.8}).addTo(mapaLeaflet);
  }
  // Calcular distancia total
  var dist=0;
  for(var i=1;i<medicionPuntos.length;i++){
    dist+=distanciaHaversine(medicionPuntos[i-1].lat,medicionPuntos[i-1].lon,medicionPuntos[i].lat,medicionPuntos[i].lon);
  }
  var texto=medicionPuntos.length+' puntos | ';
  if(dist<1)texto+=Math.round(dist*1000)+' m';
  else texto+=dist.toFixed(2)+' km';
  // Si hay 3+ puntos, calcular área aproximada
  if(medicionPuntos.length>=3){
    var area=calcularAreaPoligono(medicionPuntos);
    if(area<10000)texto+=' | '+Math.round(area)+' m²';
    else texto+=' | '+(area/10000).toFixed(2)+' ha';
  }
  document.getElementById('measure-text').textContent=texto;
}
function limpiarMedicion(){
  medicionPuntos=[];
  if(medicionPolyline&&mapaLeaflet)mapaLeaflet.removeLayer(medicionPolyline);
  medicionPolyline=null;
  medicionMarkers.forEach(function(m){if(mapaLeaflet)mapaLeaflet.removeLayer(m);});
  medicionMarkers=[];
  var t=document.getElementById('measure-text');if(t)t.textContent='Toca el mapa para medir distancia';
}
function calcularAreaPoligono(pts){
  // Fórmula Shoelace con conversión a metros
  var n=pts.length,area=0;
  for(var i=0;i<n;i++){
    var j=(i+1)%n;
    var xi=pts[i].lon*111320*Math.cos(pts[i].lat*Math.PI/180);
    var yi=pts[i].lat*110540;
    var xj=pts[j].lon*111320*Math.cos(pts[j].lat*Math.PI/180);
    var yj=pts[j].lat*110540;
    area+=xi*yj-xj*yi;
  }
  return Math.abs(area/2);
}

// --- Waypoints ---
function crearWaypoint(){
  if(!currentLat||!currentLon){showToast('Sin señal GPS','error');return;}
  waypointsPendiente={lat:currentLat,lon:currentLon,alt:currentAlt};
  document.getElementById('wp-nombre').value='';
  document.getElementById('wp-notas').value='';
  document.getElementById('wp-coords').textContent=currentLat.toFixed(6)+', '+currentLon.toFixed(6)+(currentUTM?' | UTM '+currentUTM.zone+currentUTM.band+' '+currentUTM.easting+' '+currentUTM.northing:'');
  document.getElementById('wp-form-overlay').classList.add('show');
  document.getElementById('wp-nombre').focus();
}
function cerrarFormWaypoint(){
  document.getElementById('wp-form-overlay').classList.remove('show');
  waypointsPendiente=null;
}
function guardarWaypoint(){
  if(!waypointsPendiente)return;
  var nombre=document.getElementById('wp-nombre').value.trim()||'WP '+Date.now();
  var notas=document.getElementById('wp-notas').value.trim();
  var wp={id:Date.now(),nombre:nombre,notas:notas,lat:waypointsPendiente.lat,lon:waypointsPendiente.lon,alt:waypointsPendiente.alt,fecha:new Date().toISOString(),operador:sesionActual?sesionActual.nombre:''};
  var wps=getWaypoints();
  wps.push(wp);
  localStorage.setItem('rapca_waypoints',JSON.stringify(wps));
  cerrarFormWaypoint();
  // Añadir al mapa
  agregarWaypointAlMapa(wp);
  showToast('Waypoint: '+nombre,'success');
}
function getWaypoints(){var d=localStorage.getItem('rapca_waypoints');return d?JSON.parse(d):[];}
function agregarWaypointAlMapa(wp){
  if(!mapaLeaflet)return;
  var mk=L.marker([wp.lat,wp.lon],{icon:L.divIcon({className:'',html:'<div style="background:#8e44ad;width:24px;height:24px;border-radius:50% 50% 50% 0;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:10px;font-weight:bold">📌</span></div>',iconSize:[24,24],iconAnchor:[4,24]})}).addTo(mapaLeaflet);
  mk.bindPopup('<b>📌 '+wp.nombre+'</b>'+(wp.notas?'<br>'+wp.notas:'')+'<br><small>'+wp.lat.toFixed(6)+', '+wp.lon.toFixed(6)+(wp.alt!==null?' | '+Math.round(wp.alt)+'m':'')+'</small><br><small>'+new Date(wp.fecha).toLocaleString('es-ES')+(wp.operador?' | '+wp.operador:'')+'</small><br><button onclick="eliminarWaypoint('+wp.id+')" style="background:#e74c3c;color:#fff;border:none;padding:4px 10px;border-radius:4px;margin-top:4px;cursor:pointer;font-size:.75rem">Eliminar</button>');
}
function cargarWaypointsEnMapa(){
  var wps=getWaypoints();
  wps.forEach(function(wp){agregarWaypointAlMapa(wp);});
}
function eliminarWaypoint(id){
  var wps=getWaypoints().filter(function(w){return w.id!==id;});
  localStorage.setItem('rapca_waypoints',JSON.stringify(wps));
  showToast('Waypoint eliminado','info');
  // Recargar marcadores
  if(mapaLeaflet)actualizarMarcadoresMapa();
}

// --- Exportar GPX (waypoints) ---
function exportarGPX(){
  var wps=getWaypoints();
  if(wps.length===0){showToast('Sin waypoints para exportar','error');return;}
  var gpx='<?xml version="1.0" encoding="UTF-8"?>\n';
  gpx+='<gpx version="1.1" creator="RAPCA Campo" xmlns="http://www.topografix.com/GPX/1/1">\n';
  gpx+='<metadata><name>RAPCA Export</name><time>'+new Date().toISOString()+'</time></metadata>\n';
  wps.forEach(function(wp){
    gpx+='<wpt lat="'+wp.lat+'" lon="'+wp.lon+'">';
    if(wp.alt!==null)gpx+='<ele>'+wp.alt+'</ele>';
    gpx+='<time>'+wp.fecha+'</time>';
    gpx+='<name>'+escapeXML(wp.nombre)+'</name>';
    if(wp.notas)gpx+='<desc>'+escapeXML(wp.notas)+'</desc>';
    gpx+='</wpt>\n';
  });
  gpx+='</gpx>';
  var blob=new Blob([gpx],{type:'application/gpx+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download='rapca_waypoints_'+new Date().toISOString().split('T')[0]+'.gpx';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('GPX exportado','success');
}
function escapeXML(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// --- Importar GPX ---
function importarGPX(file){
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var parser=new DOMParser();
      var doc=parser.parseFromString(e.target.result,'text/xml');
      if(!mapaLeaflet)initMapa();
      var importados=0;
      // Importar waypoints
      var wptEls=doc.querySelectorAll('wpt');
      var wps=getWaypoints();
      for(var i=0;i<wptEls.length;i++){
        var w=wptEls[i];
        var lat=parseFloat(w.getAttribute('lat')),lon=parseFloat(w.getAttribute('lon'));
        var nameEl=w.querySelector('name'),descEl=w.querySelector('desc'),eleEl=w.querySelector('ele'),timeEl=w.querySelector('time');
        var wp={id:Date.now()+i,nombre:nameEl?nameEl.textContent:'WP importado',notas:descEl?descEl.textContent:'',lat:lat,lon:lon,alt:eleEl?parseFloat(eleEl.textContent):null,fecha:timeEl?timeEl.textContent:new Date().toISOString(),operador:sesionActual?sesionActual.nombre:''};
        wps.push(wp);agregarWaypointAlMapa(wp);importados++;
      }
      localStorage.setItem('rapca_waypoints',JSON.stringify(wps));
      showToast(importados+' waypoints importados de GPX','success');
    }catch(err){showToast('Error GPX: '+err.message,'error');console.error(err);}
  };
  reader.readAsText(file);
}


// --- Cargar waypoints al inicializar mapa ---
var _origInitMapa=initMapa;
initMapa=function(){
  _origInitMapa();
  cargarWaypointsEnMapa();
};

// =========================================================================
// === TABLA DE ATRIBUTOS (estilo QGIS) ===
// =========================================================================
var attrTableCapaActual='';
var attrTableDatos=[];
var attrTableColumnas=[];
var attrTableOrden={col:'',asc:true};

function abrirTablaAtributos(nombreCapa){
  var subcapas=capasKMLSubcapas[nombreCapa];
  if(!subcapas||subcapas.length===0){showToast('Sin elementos en esta capa','info');return;}
  attrTableCapaActual=nombreCapa;
  // Recopilar todas las columnas disponibles
  var colSet={};
  subcapas.forEach(function(sc){
    if(sc.extData){Object.keys(sc.extData).forEach(function(k){colSet[k]=true;});}
  });
  var extraCols=Object.keys(colSet);
  // Columnas fijas + extras de ExtendedData
  attrTableColumnas=['Nombre','Tipo','Lat','Lon'];
  if(extraCols.length>0)attrTableColumnas=attrTableColumnas.concat(extraCols);
  else attrTableColumnas.push('Descripción');
  // Preparar datos
  attrTableDatos=subcapas.map(function(sc,idx){
    var fila={_idx:idx,_visible:sc.visible};
    fila['Nombre']=obtenerNombreDisplaySC(sc,idx,nombre);
    fila['Tipo']=sc.tipo;
    fila['Lat']=sc.lat!==null?sc.lat.toFixed(6):'';
    fila['Lon']=sc.lon!==null?sc.lon.toFixed(6):'';
    fila['Descripción']=sc.desc||'';
    if(sc.extData){Object.keys(sc.extData).forEach(function(k){fila[k]=sc.extData[k];});}
    return fila;
  });
  attrTableOrden={col:'',asc:true};
  document.getElementById('attr-table-titulo').textContent='📊 '+nombreCapa+' ('+subcapas.length+')';
  document.getElementById('attr-table-buscar').value='';
  renderTablaAtributos();
  document.getElementById('attr-table-overlay').classList.add('show');
}

function cerrarTablaAtributos(){
  document.getElementById('attr-table-overlay').classList.remove('show');
  attrTableCapaActual='';
}

function renderTablaAtributos(){
  var thead=document.getElementById('attr-table-head');
  var tbody=document.getElementById('attr-table-body');
  var filtro=document.getElementById('attr-table-buscar').value.toLowerCase();
  // Filtrar
  var datos=attrTableDatos;
  if(filtro){
    datos=datos.filter(function(f){
      for(var i=0;i<attrTableColumnas.length;i++){
        var v=f[attrTableColumnas[i]];
        if(v&&String(v).toLowerCase().indexOf(filtro)>=0)return true;
      }
      return false;
    });
  }
  // Ordenar
  if(attrTableOrden.col){
    var col=attrTableOrden.col,asc=attrTableOrden.asc;
    datos=datos.slice().sort(function(a,b){
      var va=a[col]||'',vb=b[col]||'';
      var na=parseFloat(va),nb=parseFloat(vb);
      if(!isNaN(na)&&!isNaN(nb))return asc?na-nb:nb-na;
      return asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  }
  // Renderizar cabecera
  var iconos={punto:'📍',linea:'〰️',poligono:'⬡'};
  var nombreCapaEsc=attrTableCapaActual.replace(/'/g,"\\'");
  var h='<tr>';
  h+='<th style="width:50px;text-align:center">Ir</th>';
  attrTableColumnas.forEach(function(col){
    var cls='';
    if(attrTableOrden.col===col)cls=attrTableOrden.asc?' sorted-asc':' sorted-desc';
    h+='<th class="'+cls+'" onclick="ordenarTablaAtributos(\''+col.replace(/'/g,"\\'")+'\')" title="Ordenar por '+col+'">'+col+'<span class="sort-arrow"></span></th>';
  });
  h+='</tr>';
  thead.innerHTML=h;
  // Renderizar filas
  h='';
  datos.forEach(function(fila){
    h+='<tr onclick="seleccionarFilaAtributos('+fila._idx+')" data-idx="'+fila._idx+'">';
    h+='<td style="text-align:center"><button class="btn-zoom" style="font-size:.7rem;padding:2px 6px" onclick="event.stopPropagation();irASubcapaDesdeAttr(\''+nombreCapaEsc+'\','+fila._idx+')" title="Ver en mapa">📍 Ir</button></td>';
    attrTableColumnas.forEach(function(col){
      var v=fila[col]||'';
      if(col==='Tipo')h+='<td class="attr-tipo-cell">'+(iconos[v]||v)+'</td>';
      else if(col==='Lat'||col==='Lon')h+='<td class="attr-coord">'+v+'</td>';
      else h+='<td title="'+String(v).replace(/"/g,'&quot;')+'">'+v+'</td>';
    });
    h+='</tr>';
  });
  tbody.innerHTML=h;
  document.getElementById('attr-table-count').textContent=datos.length+' de '+attrTableDatos.length+' elementos';
}

function filtrarTablaAtributos(){renderTablaAtributos();}

function ordenarTablaAtributos(col){
  if(attrTableOrden.col===col)attrTableOrden.asc=!attrTableOrden.asc;
  else{attrTableOrden.col=col;attrTableOrden.asc=true;}
  renderTablaAtributos();
}

function irASubcapaDesdeAttr(nombreCapa,idx){
  // Cerrar tabla de atributos y hacer zoom al elemento en el mapa
  cerrarTablaAtributos();
  var subcapas=capasKMLSubcapas[nombreCapa];
  if(!subcapas||!subcapas[idx])return;
  var sc=subcapas[idx];
  if(!sc.layer)return;
  if(sc.layer.getLatLng){
    mapaLeaflet.setView(sc.layer.getLatLng(),17);
    sc.layer.openPopup();
  }else if(sc.layer.getBounds){
    try{mapaLeaflet.fitBounds(sc.layer.getBounds(),{padding:[30,30]});sc.layer.openPopup();}catch(e){}
  }
  // Flash visual
  var lat=sc.lat,lon=sc.lon;
  if(lat&&lon){
    var flash=L.circleMarker([lat,lon],{radius:25,color:'#e74c3c',fillColor:'#e74c3c',fillOpacity:0.3,weight:3}).addTo(mapaLeaflet);
    setTimeout(function(){mapaLeaflet.removeLayer(flash);},2500);
  }
}

function seleccionarFilaAtributos(idx){
  // Resaltar fila
  var rows=document.querySelectorAll('#attr-table-body tr');
  for(var i=0;i<rows.length;i++){rows[i].classList.remove('attr-selected');}
  var row=document.querySelector('#attr-table-body tr[data-idx="'+idx+'"]');
  if(row)row.classList.add('attr-selected');
  // Zoom al elemento en el mapa
  var subcapas=capasKMLSubcapas[attrTableCapaActual];
  if(!subcapas||!subcapas[idx])return;
  var sc=subcapas[idx];
  if(!sc.layer)return;
  if(sc.layer.getLatLng){
    mapaLeaflet.setView(sc.layer.getLatLng(),16);
    sc.layer.openPopup();
  }else if(sc.layer.getBounds){
    try{mapaLeaflet.fitBounds(sc.layer.getBounds(),{padding:[30,30]});sc.layer.openPopup();}catch(e){}
  }
}

function exportarTablaCSV(){
  if(attrTableDatos.length===0){showToast('Sin datos','info');return;}
  var sep=';';
  var csv=attrTableColumnas.join(sep)+'\n';
  attrTableDatos.forEach(function(fila){
    var row=attrTableColumnas.map(function(col){
      var v=String(fila[col]||'').replace(/"/g,'""');
      return '"'+v+'"';
    });
    csv+=row.join(sep)+'\n';
  });
  var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=attrTableCapaActual.replace(/[^a-zA-Z0-9_.-]/g,'_')+'_atributos.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('CSV exportado','success');
}

// =========================================================================
// === CAPAS WMS/WMTS ADICIONALES (estilo QGIS) ===
// =========================================================================
var WMS_CAPAS=[
  {id:'catastro',nombre:'Catastro',desc:'Parcelas catastrales (Sede Electrónica Catastro)',
   url:'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx',
   layers:'Catastro',format:'image/png',transparent:true,maxZoom:20,attribution:'© Catastro'},
  {id:'siose',nombre:'SIOSE Ocupación Suelo',desc:'Usos del suelo España (IGN)',
   url:'https://servicios.idee.es/wms-inspire/ocupacion-suelo',
   layers:'LC.LandCoverSurfaces',format:'image/png',transparent:true,maxZoom:19,attribution:'SIOSE © IGN'},
  {id:'mtn25',nombre:'MTN 1:25.000',desc:'Mapa topográfico nacional (IGN)',
   url:'https://www.ign.es/wms-inspire/mapa-raster',
   layers:'mtn_rasterizado',format:'image/jpeg',transparent:false,maxZoom:20,attribution:'MTN25 © IGN'},
  {id:'lidar',nombre:'LiDAR / MDT Relieve',desc:'Modelo digital del terreno sombreado (IGN)',
   url:'https://www.ign.es/wms-inspire/mdt',
   layers:'EL.GridCoverage',format:'image/png',transparent:true,maxZoom:20,attribution:'MDT © IGN'},
  {id:'hidro',nombre:'Hidrografía',desc:'Red hidrográfica España (IGN)',
   url:'https://servicios.idee.es/wms-inspire/hidrografia',
   layers:'HY.PhysicalWaters.Waterbodies',format:'image/png',transparent:true,maxZoom:19,attribution:'Hidrografía © IGN'},
  {id:'geologia',nombre:'Mapa Geológico',desc:'Geología IGME 1:1.000.000',
   url:'https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_Geologico_1M/MapServer/WMSServer',
   layers:'0,1,2',format:'image/png',transparent:true,maxZoom:18,attribution:'© IGME'},
  {id:'rediam_veg',nombre:'REDIAM Vegetación',desc:'Mapa de vegetación Andalucía',
   url:'https://www.ideandalucia.es/services/toporaster10/wms',
   layers:'toporaster10',format:'image/png',transparent:false,maxZoom:20,attribution:'© REDIAM'},
  {id:'pnoa_historico',nombre:'PNOA Histórico 2004-06',desc:'Ortofoto histórica España (IGN)',
   url:'https://www.ign.es/wms/pnoa-historico',
   layers:'PNOA2004',format:'image/jpeg',transparent:false,maxZoom:20,attribution:'PNOA Hist. © IGN'}
];
var wmsLayersActivos={};

function toggleWMSPanel(){
  var panel=document.getElementById('wms-panel');
  panel.classList.toggle('show');
  if(panel.classList.contains('show'))renderWMSList();
}

function renderWMSList(){
  var el=document.getElementById('wms-layers-list');
  if(!el)return;
  var h='';
  WMS_CAPAS.forEach(function(capa){
    var activo=!!wmsLayersActivos[capa.id];
    h+='<div class="wms-layer-item">';
    h+='<input type="checkbox" id="wms-cb-'+capa.id+'"'+(activo?' checked':'')+' onchange="toggleWMSLayer(\''+capa.id+'\',this.checked)">';
    h+='<div class="wms-info"><div class="wms-name">'+capa.nombre+'</div><div class="wms-desc">'+capa.desc+'</div></div>';
    h+='</div>';
  });
  el.innerHTML=h;
}

function toggleWMSLayer(id,activar){
  if(!mapaLeaflet)initMapa();
  var capa=WMS_CAPAS.find(function(c){return c.id===id;});
  if(!capa)return;
  if(activar){
    // Crear y añadir capa WMS
    var layer=L.tileLayer.wms(capa.url,{
      layers:capa.layers,format:capa.format,transparent:capa.transparent,
      maxZoom:capa.maxZoom,attribution:capa.attribution,opacity:0.7
    });
    layer.addTo(mapaLeaflet);
    if(controlCapas)controlCapas.addOverlay(layer,capa.nombre);
    wmsLayersActivos[id]=layer;
  }else{
    // Quitar capa
    if(wmsLayersActivos[id]){
      mapaLeaflet.removeLayer(wmsLayersActivos[id]);
      if(controlCapas)controlCapas.removeLayer(wmsLayersActivos[id]);
      delete wmsLayersActivos[id];
    }
  }
  // Guardar estado
  var estado={};
  Object.keys(wmsLayersActivos).forEach(function(k){estado[k]=true;});
  localStorage.setItem('rapca_wms_activos',JSON.stringify(estado));
}

function cargarWMSGuardados(){
  var saved=localStorage.getItem('rapca_wms_activos');
  if(!saved)return;
  try{
    var estado=JSON.parse(saved);
    Object.keys(estado).forEach(function(id){
      if(estado[id])toggleWMSLayer(id,true);
    });
  }catch(e){}
}

// Monkey-patch initMapa para cargar WMS guardados
var _origInitMapa2=initMapa;
initMapa=function(){
  _origInitMapa2();
  cargarWMSGuardados();
};
