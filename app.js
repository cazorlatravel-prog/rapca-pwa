var FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSe8kPl5QErboQmrAJ6hSnbkiAJb3h9Mi6_Fntgws_Z1NWj1TQ/formResponse';
var ENTRY={tipo:'entry.437432431',fecha:'entry.1468491774',zona:'entry.226003494',unidad:'entry.1028582203',transecto:'entry.1651846022',datos:'entry.1220105245'};
var PLANTAS=['Arbutus unedo','Asparagus acutifolius','Chamaerops humilis','Cistus sp.','Crataegus monogyna','Cytisus sp.','Daphne gnidium','Dittrichia viscosa','Foeniculum vulgare','Genista sp.','Halimium sp.','Helichrysum stoechas','Juncus spp.','Juniperus sp.','Lavandula latifolia','Myrtus communis','Olea europaea var. sylvestris','Phillyrea angustifolia','Phlomis purpurea','Pistacia lentiscus','Quercus coccifera','Quercus ilex','Quercus sp.','Retama sphaerocarpa','Rhamnus sp.','Rosa sp.','Rosmarinus officinalis','Rubus ulmifolius','Salvia rosmarinus','Spartium junceum','Thymus sp.','Ulex sp.'];
var transectoActual=1,isOnline=navigator.onLine,currentAutocomplete=null,editandoId=null;
var cameraStream=null,camaraTipo='',camaraSubtipo='',currentHeading=0;
var contadorFotosVP={},contadorFotosEV={};
var currentLat=null,currentLon=null,currentUTM=null;
var deferredPrompt=null,mapTilesLoaded=[];
var fotosDB=null;
var fotosCacheMemoria={}; // Cache en memoria como respaldo

// IndexedDB para fotos
function initFotosDB(){
  return new Promise(function(resolve,reject){
    if(!window.indexedDB){console.warn('IndexedDB no soportada');resolve();return;}
    var request=indexedDB.open('RAPCA_Fotos',1);
    request.onerror=function(e){console.error('Error IndexedDB:',e);resolve();};
    request.onsuccess=function(e){fotosDB=e.target.result;console.log('IndexedDB lista');resolve();};
    request.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('fotos')){
        db.createObjectStore('fotos',{keyPath:'codigo'});
        console.log('ObjectStore creado');
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
  var limite=Date.now()-5*24*60*60*1000;
  try{
    var tx=fotosDB.transaction(['fotos'],'readwrite');
    var store=tx.objectStore('fotos');
    store.openCursor().onsuccess=function(e){
      var cursor=e.target.result;
      if(cursor){
        if(cursor.value.fecha<limite){cursor.delete();console.log('Foto antigua borrada');}
        cursor.continue();
      }
    };
  }catch(e){console.error('Error limpieza:',e);}
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

function iniciarGeolocalizacion(){if(navigator.geolocation)navigator.geolocation.watchPosition(function(p){currentLat=p.coords.latitude;currentLon=p.coords.longitude;currentUTM=latLonToUTM(currentLat,currentLon);precargarMapTiles();},function(){},{enableHighAccuracy:true,maximumAge:5000});}
function latLonToUTM(lat,lon){var K0=0.9996,E=0.00669438,R=6378137,latRad=lat*Math.PI/180,lonRad=lon*Math.PI/180,zoneNum=Math.floor((lon+180)/6)+1;if(lat>=56&&lat<64&&lon>=3&&lon<12)zoneNum=32;var lonOrigin=(zoneNum-1)*6-180+3,N=R/Math.sqrt(1-E*Math.pow(Math.sin(latRad),2)),T=Math.pow(Math.tan(latRad),2),C=(E/(1-E))*Math.pow(Math.cos(latRad),2),A=Math.cos(latRad)*(lonRad-lonOrigin*Math.PI/180),M=R*((1-E/4-3*E*E/64)*latRad-(3*E/8+3*E*E/32)*Math.sin(2*latRad)+(15*E*E/256)*Math.sin(4*latRad)),easting=K0*N*(A+(1-T+C)*Math.pow(A,3)/6+(5-18*T+T*T)*Math.pow(A,5)/120)+500000,northing=K0*(M+N*Math.tan(latRad)*(A*A/2+(5-T+9*C+4*C*C)*Math.pow(A,4)/24));if(lat<0)northing+=10000000;var bands='CDEFGHJKLMNPQRSTUVWXX',bandIdx=Math.floor((lat+80)/8);return{zone:zoneNum,band:bands.charAt(Math.max(0,Math.min(20,bandIdx))),easting:Math.round(easting),northing:Math.round(northing)};}
function lon2tile(lon,zoom){return Math.floor((lon+180)/360*Math.pow(2,zoom));}
function lat2tile(lat,zoom){return Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*Math.pow(2,zoom));}
function precargarMapTiles(){if(!currentLat||!currentLon)return;var zoom=16,tileX=lon2tile(currentLon,zoom),tileY=lat2tile(currentLat,zoom);mapTilesLoaded=[];for(var dx=-1;dx<=1;dx++)for(var dy=-1;dy<=1;dy++){var img=new Image();img.crossOrigin='anonymous';img.src='https://a.tile.openstreetmap.org/'+zoom+'/'+(tileX+dx)+'/'+(tileY+dy)+'.png';mapTilesLoaded.push({img:img,dx:dx,dy:dy});}}
function salirApp(){guardarBorradores();showToast('Datos guardados','success');}
function actualizarZonaDesdeUnidad(tipo){var unidad=document.getElementById(tipo+'-unidad').value.trim();var zona='';if(unidad.length>2)zona=unidad.replace(/\d{1,2}$/,'');document.getElementById(tipo+'-zona').value=zona;}
function getContadorKey(u,t,s){return u+'_'+t+'_'+(s==='general'?'G':s);}

function inicializarContadoresDesdeEdicion(tipo,fotos,fc1,fc2){
  var unidad=document.getElementById(tipo.toLowerCase()+'-unidad').value.trim();
  var c=(tipo==='VP')?contadorFotosVP:contadorFotosEV;
  if(fotos){var arr=fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxG=0;arr.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxG)maxG=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'general')]=maxG;}
  if(fc1){var arr1=fc1.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxW1=0;arr1.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxW1)maxW1=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'W1')]=maxW1;}
  if(fc2){var arr2=fc2.split(',').map(function(x){return x.trim();}).filter(function(x){return x;});var maxW2=0;arr2.forEach(function(f){var m=f.match(/_(\d+)$/);if(m&&parseInt(m[1])>maxW2)maxW2=parseInt(m[1]);});c[getContadorKey(unidad,tipo,'W2')]=maxW2;}
  localStorage.setItem('rapca_contadores_'+tipo,JSON.stringify(c));
}

function getNextFotoNum(u,t,s){var c=(t==='VP')?contadorFotosVP:contadorFotosEV,k=getContadorKey(u,t,s);if(!c[k])c[k]=0;c[k]++;localStorage.setItem('rapca_contadores_'+t,JSON.stringify(c));return c[k];}
function generarCodigoFoto(u,t,s,n){return s==='general'?u+'_'+t+'_'+n:u+'_'+t+'_'+s+'_'+n;}

function abrirCamara(tipo,subtipo){
  var unidad=(tipo==='VP')?document.getElementById('vp-unidad').value.trim():document.getElementById('ev-unidad').value.trim();
  if(!unidad){showToast('Introduce Unidad','error');return;}
  camaraTipo=tipo;camaraSubtipo=subtipo;
  var num=getNextFotoNum(unidad,tipo,subtipo),codigo=generarCodigoFoto(unidad,tipo,subtipo,num);
  document.getElementById('cameraInfo').textContent=codigo;document.getElementById('overlayCode').textContent=codigo;
  document.getElementById('overlayCoords').textContent=currentUTM?currentUTM.zone+currentUTM.band+' '+currentUTM.easting+' '+currentUTM.northing:'GPS...';
  precargarMapTiles();
  if(currentLat&&currentLon){var url='https://www.openstreetmap.org/export/embed.html?bbox='+(currentLon-0.0015)+','+(currentLat-0.001)+','+(currentLon+0.0015)+','+(currentLat+0.001)+'&layer=mapnik&marker='+currentLat+','+currentLon;document.getElementById('mapContainer').innerHTML='<iframe src="'+url+'" style="width:140%;height:140%;border:0;pointer-events:none;margin:-20% 0 0 -20%"></iframe>';}
  document.getElementById('cameraModal').classList.add('show');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}}).then(function(s){cameraStream=s;document.getElementById('cameraVideo').srcObject=s;actualizarBrujula();}).catch(function(){showToast('Error cámara','error');cerrarCamara();});
}
function actualizarBrujula(){if(document.getElementById('cameraModal').classList.contains('show')){var d=['N','NE','E','SE','S','SO','O','NO'],i=Math.round(currentHeading/45)%8;document.getElementById('overlayCompass').textContent=d[i]+' '+currentHeading+'°';if(currentUTM)document.getElementById('overlayCoords').textContent=currentUTM.zone+currentUTM.band+' '+currentUTM.easting+' '+currentUTM.northing;requestAnimationFrame(actualizarBrujula);}}
function cerrarCamara(){document.getElementById('cameraModal').classList.remove('show');if(cameraStream){cameraStream.getTracks().forEach(function(t){t.stop();});cameraStream=null;}var u=(camaraTipo==='VP')?document.getElementById('vp-unidad').value.trim():document.getElementById('ev-unidad').value.trim(),c=(camaraTipo==='VP')?contadorFotosVP:contadorFotosEV,k=getContadorKey(u,camaraTipo,camaraSubtipo);if(c[k]&&c[k]>0)c[k]--;localStorage.setItem('rapca_contadores_'+camaraTipo,JSON.stringify(c));}

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
  var codigo=document.getElementById('overlayCode').textContent,latlon=currentLat?currentLat.toFixed(4)+'N '+Math.abs(currentLon).toFixed(4)+'W':'--';
  var fechaHoy=new Date(),fechaStr=fechaHoy.getDate().toString().padStart(2,'0')+'/'+(fechaHoy.getMonth()+1).toString().padStart(2,'0')+'/'+fechaHoy.getFullYear();
  ctx.textAlign='right';var textX=w-50,textY=h-450;
  ctx.shadowColor='rgba(0,0,0,0.8)';ctx.shadowBlur=10;ctx.shadowOffsetX=4;ctx.shadowOffsetY=4;
  ctx.fillStyle='#FFD700';ctx.font='bold 110px Arial';ctx.fillText('RAPCA EMA',textX,textY);textY+=130;
  ctx.fillStyle='#fff';ctx.font='bold 95px Arial';ctx.fillText(codigo,textX,textY);textY+=110;
  ctx.font='bold 75px Arial';ctx.fillText(fechaStr,textX,textY);textY+=100;
  ctx.font='bold 95px Arial';ctx.fillText(latlon,textX,textY);
  ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.textAlign='left';
  
  // Guardar miniatura PRIMERO (síncrono en memoria)
  var thumbCanvas=document.createElement('canvas');
  var thumbW=400,thumbH=533;
  thumbCanvas.width=thumbW;thumbCanvas.height=thumbH;
  var thumbCtx=thumbCanvas.getContext('2d');
  thumbCtx.drawImage(canvas,0,0,finalW,finalH,0,0,thumbW,thumbH);
  var thumbDataUrl=thumbCanvas.toDataURL('image/jpeg',0.50);
  
  // Guardar en memoria inmediatamente
  fotosCacheMemoria[codigo]=thumbDataUrl;
  console.log('Foto en memoria:',codigo,'Total:',Object.keys(fotosCacheMemoria).length);
  
  // Guardar en IndexedDB (async)
  guardarFotoEnDB(codigo,thumbDataUrl);
  
  // Guardar foto para descarga (alta calidad)
  canvas.toBlob(function(b){
    var l=document.createElement('a');l.href=URL.createObjectURL(b);l.download=codigo+'.jpg';l.click();
  },'image/jpeg',0.95);
  
  agregarFotoALista(codigo);
  showToast('📷 '+codigo,'success');
  document.getElementById('cameraModal').classList.remove('show');
  if(cameraStream){cameraStream.getTracks().forEach(function(t){t.stop();});cameraStream=null;}
}

function agregarFotoALista(c){var lId,iId;if(camaraTipo==='VP'){if(camaraSubtipo==='general'){lId='vp-fotos-lista';iId='vp-fotos';}else if(camaraSubtipo==='W1'){lId='vp-fc1-lista';iId='vp-fc1';}else{lId='vp-fc2-lista';iId='vp-fc2';}}else{if(camaraSubtipo==='general'){lId='ev-fotos-lista';iId='ev-fotos';}else if(camaraSubtipo==='W1'){lId='ev-fc1-lista';iId='ev-fc1';}else{lId='ev-fc2-lista';iId='ev-fc2';}}document.getElementById(lId).innerHTML+='<span class="foto-tag">'+c+'</span>';var inp=document.getElementById(iId);inp.value=inp.value?(inp.value+', '+c):c;}

document.addEventListener('DOMContentLoaded',function(){
  initFotosDB().then(function(){
    console.log('DB iniciada, fotos en memoria:',Object.keys(fotosCacheMemoria).length);
    limpiarFotosAntiguasDB();
  });
  var t=new Date().toISOString().split('T')[0];document.getElementById('vp-fecha').value=t;document.getElementById('ev-fecha').value=t;
  var cVP=localStorage.getItem('rapca_contadores_VP'),cEV=localStorage.getItem('rapca_contadores_EV');if(cVP)contadorFotosVP=JSON.parse(cVP);if(cEV)contadorFotosEV=JSON.parse(cEV);
  generarPlantas();generarPalatables();generarHerbaceas();updateSyncStatus();updatePendingCount();loadPanel();cargarBorradores();iniciarGeolocalizacion();
  window.addEventListener('online',function(){isOnline=true;updateSyncStatus();});window.addEventListener('offline',function(){isOnline=false;updateSyncStatus();});
  document.addEventListener('click',function(e){if(!e.target.closest('.autocomplete-wrapper'))document.querySelectorAll('.autocomplete-list').forEach(function(l){l.classList.remove('show');});});
  if(window.matchMedia('(display-mode: standalone)').matches){var b=document.getElementById('installBtn');if(b)b.style.display='none';}
});

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
function showPage(p){document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active');});document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});document.getElementById('page-'+p).classList.add('active');document.querySelectorAll('.nav-btn')[['menu','vp','ev','panel'].indexOf(p)].classList.add('active');if(p==='panel')loadPanel();window.scrollTo(0,0);}
function toggleSection(id){document.getElementById(id).classList.toggle('open');}
function setTransecto(n){transectoActual=n;document.querySelectorAll('.transecto-btn').forEach(function(b,i){b.classList.toggle('active',i===n-1);});document.getElementById('btnGuardarEV').textContent='💾 Guardar EV - T'+n;}
function guardarBorradores(){localStorage.setItem('rapca_borrador_vp',JSON.stringify(obtenerDatosVP()));localStorage.setItem('rapca_borrador_ev',JSON.stringify(obtenerDatosEV()));}
function cargarBorradores(){try{var bVP=localStorage.getItem('rapca_borrador_vp');if(bVP)cargarDatosVP(JSON.parse(bVP));var bEV=localStorage.getItem('rapca_borrador_ev');if(bEV)cargarDatosEV(JSON.parse(bEV));}catch(e){}}
function obtenerDatosVP(){return{fecha:document.getElementById('vp-fecha').value,zona:document.getElementById('vp-zona').value,unidad:document.getElementById('vp-unidad').value,past1:document.getElementById('vp-past1').value,past2:document.getElementById('vp-past2').value,past3:document.getElementById('vp-past3').value,senal:document.getElementById('vp-senal').value,veredas:document.getElementById('vp-veredas').value,cagarrutas:document.getElementById('vp-cagarrutas').value,fotos:document.getElementById('vp-fotos').value,fc1:document.getElementById('vp-fc1').value,fc2:document.getElementById('vp-fc2').value,obs:document.getElementById('vp-obs').value};}
function cargarDatosVP(d){if(d.fecha)document.getElementById('vp-fecha').value=d.fecha;if(d.zona)document.getElementById('vp-zona').value=d.zona;if(d.unidad)document.getElementById('vp-unidad').value=d.unidad;if(d.past1)document.getElementById('vp-past1').value=d.past1;if(d.past2)document.getElementById('vp-past2').value=d.past2;if(d.past3)document.getElementById('vp-past3').value=d.past3;if(d.senal)document.getElementById('vp-senal').value=d.senal;if(d.veredas)document.getElementById('vp-veredas').value=d.veredas;if(d.cagarrutas)document.getElementById('vp-cagarrutas').value=d.cagarrutas;if(d.fotos){document.getElementById('vp-fotos').value=d.fotos;actualizarListaFotos('vp-fotos-lista',d.fotos);}if(d.fc1){document.getElementById('vp-fc1').value=d.fc1;actualizarListaFotos('vp-fc1-lista',d.fc1);}if(d.fc2){document.getElementById('vp-fc2').value=d.fc2;actualizarListaFotos('vp-fc2-lista',d.fc2);}if(d.obs)document.getElementById('vp-obs').value=d.obs;}
function obtenerDatosEV(){var d={fecha:document.getElementById('ev-fecha').value,zona:document.getElementById('ev-zona').value,unidad:document.getElementById('ev-unidad').value,transecto:transectoActual,plantas:[],palatables:[],past1:document.getElementById('ev-past1').value,past2:document.getElementById('ev-past2').value,past3:document.getElementById('ev-past3').value,herbaceas:[],mat1cob:document.getElementById('ev-mat1cob').value,mat1alt:document.getElementById('ev-mat1alt').value,mat1esp:document.getElementById('ev-mat1esp').value,mat2cob:document.getElementById('ev-mat2cob').value,mat2alt:document.getElementById('ev-mat2alt').value,mat2esp:document.getElementById('ev-mat2esp').value,fotos:document.getElementById('ev-fotos').value,fc1:document.getElementById('ev-fc1').value,fc2:document.getElementById('ev-fc2').value,obs:document.getElementById('ev-obs').value};for(var i=1;i<=10;i++){var p={nombre:document.getElementById('ev-planta'+i).value,notas:[]};for(var n=1;n<=10;n++)p.notas.push(document.getElementById('ev-planta'+i+'-n'+n).value);d.plantas.push(p);}for(var i=1;i<=3;i++){var p={nombre:document.getElementById('ev-palatable'+i).value,notas:[]};for(var n=1;n<=15;n++)p.notas.push(document.getElementById('ev-palatable'+i+'-n'+n).value);d.palatables.push(p);}for(var i=1;i<=7;i++)d.herbaceas.push(document.getElementById('ev-herb'+i).value);return d;}
function cargarDatosEV(d){if(d.fecha)document.getElementById('ev-fecha').value=d.fecha;if(d.zona)document.getElementById('ev-zona').value=d.zona;if(d.unidad)document.getElementById('ev-unidad').value=d.unidad;if(d.transecto)setTransecto(d.transecto);if(d.plantas)for(var i=0;i<d.plantas.length&&i<10;i++){document.getElementById('ev-planta'+(i+1)).value=d.plantas[i].nombre||'';for(var n=0;n<d.plantas[i].notas.length&&n<10;n++)document.getElementById('ev-planta'+(i+1)+'-n'+(n+1)).value=d.plantas[i].notas[n]||'';}if(d.palatables)for(var i=0;i<d.palatables.length&&i<3;i++){document.getElementById('ev-palatable'+(i+1)).value=d.palatables[i].nombre||'';for(var n=0;n<d.palatables[i].notas.length&&n<15;n++)document.getElementById('ev-palatable'+(i+1)+'-n'+(n+1)).value=d.palatables[i].notas[n]||'';}if(d.past1)document.getElementById('ev-past1').value=d.past1;if(d.past2)document.getElementById('ev-past2').value=d.past2;if(d.past3)document.getElementById('ev-past3').value=d.past3;if(d.herbaceas)for(var i=0;i<7;i++)document.getElementById('ev-herb'+(i+1)).value=d.herbaceas[i]||'';if(d.mat1cob)document.getElementById('ev-mat1cob').value=d.mat1cob;if(d.mat1alt)document.getElementById('ev-mat1alt').value=d.mat1alt;if(d.mat1esp)document.getElementById('ev-mat1esp').value=d.mat1esp;if(d.mat2cob)document.getElementById('ev-mat2cob').value=d.mat2cob;if(d.mat2alt)document.getElementById('ev-mat2alt').value=d.mat2alt;if(d.mat2esp)document.getElementById('ev-mat2esp').value=d.mat2esp;if(d.fotos){document.getElementById('ev-fotos').value=d.fotos;actualizarListaFotos('ev-fotos-lista',d.fotos);}if(d.fc1){document.getElementById('ev-fc1').value=d.fc1;actualizarListaFotos('ev-fc1-lista',d.fc1);}if(d.fc2){document.getElementById('ev-fc2').value=d.fc2;actualizarListaFotos('ev-fc2-lista',d.fc2);}if(d.obs)document.getElementById('ev-obs').value=d.obs;actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();}
function actualizarListaFotos(lId,f){var l=document.getElementById(lId);if(!l||!f)return;l.innerHTML=f.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).map(function(x){return'<span class="foto-tag">'+x+'</span>';}).join('');}
function limpiarFormularioVP(){var t=new Date().toISOString().split('T')[0];document.getElementById('vp-fecha').value=t;document.getElementById('vp-zona').value='';document.getElementById('vp-unidad').value='';['vp-past1','vp-past2','vp-past3','vp-senal','vp-veredas','vp-cagarrutas','vp-fotos','vp-fc1','vp-fc2','vp-obs'].forEach(function(id){document.getElementById(id).value='';});['vp-fotos-lista','vp-fc1-lista','vp-fc2-lista'].forEach(function(id){document.getElementById(id).innerHTML='';});contadorFotosVP={};localStorage.setItem('rapca_contadores_VP',JSON.stringify(contadorFotosVP));localStorage.removeItem('rapca_borrador_vp');}
function limpiarFormularioEV(c){if(c){var t=new Date().toISOString().split('T')[0];document.getElementById('ev-fecha').value=t;document.getElementById('ev-zona').value='';document.getElementById('ev-unidad').value='';setTransecto(1);contadorFotosEV={};localStorage.setItem('rapca_contadores_EV',JSON.stringify(contadorFotosEV));localStorage.removeItem('rapca_borrador_ev');}for(var i=1;i<=10;i++){document.getElementById('ev-planta'+i).value='';for(var n=1;n<=10;n++)document.getElementById('ev-planta'+i+'-n'+n).value='';}for(var i=1;i<=3;i++){document.getElementById('ev-palatable'+i).value='';for(var n=1;n<=15;n++)document.getElementById('ev-palatable'+i+'-n'+n).value='';var el=document.getElementById('media-palatable'+i);if(el)el.textContent='';}for(var i=1;i<=7;i++)document.getElementById('ev-herb'+i).value='';['ev-past1','ev-past2','ev-past3','ev-mat1cob','ev-mat1alt','ev-mat1esp','ev-mat2cob','ev-mat2alt','ev-mat2esp','ev-fotos','ev-fc1','ev-fc2','ev-obs'].forEach(function(id){document.getElementById(id).value='';});['ev-fotos-lista','ev-fc1-lista','ev-fc2-lista'].forEach(function(id){document.getElementById(id).innerHTML='';});actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();window.scrollTo(0,0);}
function guardarVP(){var z=document.getElementById('vp-zona').value.trim(),u=document.getElementById('vp-unidad').value.trim();if(!z||!u){showToast('Zona y Unidad obligatorios','error');return;}var d={pastoreo:[document.getElementById('vp-past1').value,document.getElementById('vp-past2').value,document.getElementById('vp-past3').value],observacionPastoreo:{senal:document.getElementById('vp-senal').value,veredas:document.getElementById('vp-veredas').value,cagarrutas:document.getElementById('vp-cagarrutas').value},fotos:document.getElementById('vp-fotos').value,fotosComp:[{numero:document.getElementById('vp-fc1').value,waypoint:'W1'},{numero:document.getElementById('vp-fc2').value,waypoint:'W2'}],observaciones:document.getElementById('vp-obs').value};var r={id:editandoId||Date.now(),tipo:'VP',fecha:document.getElementById('vp-fecha').value,zona:z,unidad:u,transecto:'',datos:d,enviado:false};if(editandoId){actualizarRegistro(r);editandoId=null;}else guardarLocal(r);showToast('VP guardado','success');limpiarFormularioVP();if(isOnline)enviarRegistro(r);}
function guardarEV(){var z=document.getElementById('ev-zona').value.trim(),u=document.getElementById('ev-unidad').value.trim();if(!z||!u){showToast('Zona y Unidad obligatorios','error');return;}var pl=[];for(var i=1;i<=10;i++){var nt=[],c=0,s=0;for(var n=1;n<=10;n++){var v=document.getElementById('ev-planta'+i+'-n'+n).value;nt.push(v);if(v!==''){c++;s+=parseInt(v);}}pl.push({nombre:document.getElementById('ev-planta'+i).value,notas:nt,media:c>0?(s/c).toFixed(2):''});}var pa=[],paTC=0,paTS=0;for(var i=1;i<=3;i++){var nt=[],c=0,s=0;for(var n=1;n<=15;n++){var v=document.getElementById('ev-palatable'+i+'-n'+n).value;nt.push(v);if(v!==''){c++;s+=parseInt(v);paTC++;paTS+=parseInt(v);}}pa.push({nombre:document.getElementById('ev-palatable'+i).value,notas:nt,media:c>0?(s/c).toFixed(2):''});}var hb=[];for(var i=1;i<=7;i++)hb.push(document.getElementById('ev-herb'+i).value);var c1=parseFloat(document.getElementById('ev-mat1cob').value)||0,c2=parseFloat(document.getElementById('ev-mat2cob').value)||0,a1=parseFloat(document.getElementById('ev-mat1alt').value)||0,a2=parseFloat(document.getElementById('ev-mat2alt').value)||0;var nC=(document.getElementById('ev-mat1cob').value!==''?1:0)+(document.getElementById('ev-mat2cob').value!==''?1:0),nA=(document.getElementById('ev-mat1alt').value!==''?1:0)+(document.getElementById('ev-mat2alt').value!==''?1:0);var mediaCob=nC>0?((c1+c2)/nC).toFixed(1):'',mediaAlt=nA>0?((a1+a2)/nA).toFixed(1):'',volumen=calcularVolumenMatorral(parseFloat(mediaCob),parseFloat(mediaAlt))||'';var pC=0,pS=0;for(var i=1;i<=10;i++)for(var n=1;n<=10;n++){var v=document.getElementById('ev-planta'+i+'-n'+n).value;if(v!==''){pC++;pS+=parseInt(v);}}var hC=0,hS=0;for(var i=1;i<=7;i++){var v=document.getElementById('ev-herb'+i).value;if(v!==''){hC++;hS+=parseInt(v);}}var d={plantas:pl,plantasMedia:pC>0?(pS/pC).toFixed(2):'',palatables:pa,palatablesMedia:paTC>0?(paTS/paTC).toFixed(2):'',pastoreo:[document.getElementById('ev-past1').value,document.getElementById('ev-past2').value,document.getElementById('ev-past3').value],herbaceas:hb,herbaceasMedia:hC>0?(hS/hC).toFixed(2):'',matorral:{punto1:{cobertura:document.getElementById('ev-mat1cob').value,altura:document.getElementById('ev-mat1alt').value,especie:document.getElementById('ev-mat1esp').value},punto2:{cobertura:document.getElementById('ev-mat2cob').value,altura:document.getElementById('ev-mat2alt').value,especie:document.getElementById('ev-mat2esp').value},mediaCob:mediaCob,mediaAlt:mediaAlt,volumen:volumen},fotos:document.getElementById('ev-fotos').value,fotosComp:[{numero:document.getElementById('ev-fc1').value,waypoint:'W1'},{numero:document.getElementById('ev-fc2').value,waypoint:'W2'}],observaciones:document.getElementById('ev-obs').value};var r={id:editandoId||Date.now(),tipo:'EV',fecha:document.getElementById('ev-fecha').value,zona:z,unidad:u,transecto:'T'+transectoActual,datos:d,enviado:false};if(editandoId){actualizarRegistro(r);editandoId=null;}else guardarLocal(r);showToast('EV T'+transectoActual+' guardado','success');if(transectoActual>=3){limpiarFormularioEV(true);showToast('Unidad completada','info');}else{limpiarFormularioEV(false);setTransecto(transectoActual+1);}if(isOnline)enviarRegistro(r);}
function getRegistros(){var d=localStorage.getItem('rapca_registros');return d?JSON.parse(d):[];}
function guardarLocal(r){var rs=getRegistros();rs.push(r);localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();}
function actualizarRegistro(r){var rs=getRegistros();for(var i=0;i<rs.length;i++)if(rs[i].id===r.id){rs[i]=r;break;}localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();loadPanel();}
function marcarEnviado(id){var rs=getRegistros();for(var i=0;i<rs.length;i++)if(rs[i].id===id){rs[i].enviado=true;break;}localStorage.setItem('rapca_registros',JSON.stringify(rs));updatePendingCount();loadPanel();}
function updatePendingCount(){var rs=getRegistros(),p=rs.filter(function(x){return!x.enviado;}).length;document.getElementById('pendingCount').textContent=p;var b=document.getElementById('pendingBadge');b.style.display=p>0?'inline':'none';b.textContent=p;}
function enviarRegistro(r){showLoading(true);var fd=new URLSearchParams();fd.append(ENTRY.tipo,r.tipo);fd.append(ENTRY.fecha,r.fecha);fd.append(ENTRY.zona,r.zona);fd.append(ENTRY.unidad,r.unidad);fd.append(ENTRY.transecto,r.transecto||'');fd.append(ENTRY.datos,JSON.stringify(r.datos));fetch(FORM_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()}).then(function(){showLoading(false);marcarEnviado(r.id);showToast('Enviado','success');}).catch(function(){showLoading(false);showToast('Guardado local','info');});}
function syncPending(){var pend=getRegistros().filter(function(r){return!r.enviado;});if(pend.length===0){showToast('Sin pendientes','info');return;}if(!isOnline){showToast('Sin conexión','error');return;}showLoading(true);var total=pend.length,env=0;pend.forEach(function(r,idx){setTimeout(function(){var fd=new URLSearchParams();fd.append(ENTRY.tipo,r.tipo);fd.append(ENTRY.fecha,r.fecha);fd.append(ENTRY.zona,r.zona);fd.append(ENTRY.unidad,r.unidad);fd.append(ENTRY.transecto,r.transecto||'');fd.append(ENTRY.datos,JSON.stringify(r.datos));fetch(FORM_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fd.toString()}).then(function(){marcarEnviado(r.id);env++;if(env===total){showLoading(false);showToast(total+' sincronizados','success');}}).catch(function(){env++;if(env===total)showLoading(false);});},idx*600);});}
function loadPanel(){var rs=getRegistros(),h='';if(rs.length===0)h='<p style="text-align:center;color:#888;padding:20px">No hay registros</p>';else rs.slice().reverse().forEach(function(r){h+='<div class="record-item"><span class="tipo '+r.tipo.toLowerCase()+'">'+r.tipo+'</span> <strong>'+r.zona+'>'+r.unidad+'</strong>'+(r.transecto?' ('+r.transecto+')':'')+'<div class="info">'+r.fecha+' | '+(r.enviado?'✅ Enviado':'⏳ Pendiente')+'</div><div class="actions"><button class="btn-small edit" onclick="editarRegistro('+r.id+')">✏️</button><button class="btn-small pdf" onclick="exportarPDF('+r.id+')">📄</button><button class="btn-small delete" onclick="eliminarRegistro('+r.id+')">🗑️</button></div></div>';});document.getElementById('panelList').innerHTML=h;}
function editarRegistro(id){var rs=getRegistros(),r=rs.find(function(x){return x.id===id;});if(!r)return;editandoId=id;if(r.tipo==='VP'){document.getElementById('vp-fecha').value=r.fecha;document.getElementById('vp-zona').value=r.zona;document.getElementById('vp-unidad').value=r.unidad;var d=r.datos;if(d.pastoreo){document.getElementById('vp-past1').value=d.pastoreo[0]||'';document.getElementById('vp-past2').value=d.pastoreo[1]||'';document.getElementById('vp-past3').value=d.pastoreo[2]||'';}if(d.observacionPastoreo){document.getElementById('vp-senal').value=d.observacionPastoreo.senal||'';document.getElementById('vp-veredas').value=d.observacionPastoreo.veredas||'';document.getElementById('vp-cagarrutas').value=d.observacionPastoreo.cagarrutas||'';}if(d.fotos){document.getElementById('vp-fotos').value=d.fotos;actualizarListaFotos('vp-fotos-lista',d.fotos);}var fc1Val=d.fotosComp&&d.fotosComp[0]?d.fotosComp[0].numero:'',fc2Val=d.fotosComp&&d.fotosComp[1]?d.fotosComp[1].numero:'';if(fc1Val){document.getElementById('vp-fc1').value=fc1Val;actualizarListaFotos('vp-fc1-lista',fc1Val);}if(fc2Val){document.getElementById('vp-fc2').value=fc2Val;actualizarListaFotos('vp-fc2-lista',fc2Val);}document.getElementById('vp-obs').value=d.observaciones||'';inicializarContadoresDesdeEdicion('VP',d.fotos,fc1Val,fc2Val);showPage('vp');showToast('Editando VP','info');}else{document.getElementById('ev-fecha').value=r.fecha;document.getElementById('ev-zona').value=r.zona;document.getElementById('ev-unidad').value=r.unidad;setTransecto(parseInt(r.transecto.replace('T',''))||1);var d=r.datos;if(d.plantas)for(var i=0;i<d.plantas.length&&i<10;i++){document.getElementById('ev-planta'+(i+1)).value=d.plantas[i].nombre||'';for(var n=0;n<d.plantas[i].notas.length&&n<10;n++)document.getElementById('ev-planta'+(i+1)+'-n'+(n+1)).value=d.plantas[i].notas[n]||'';}if(d.palatables)for(var i=0;i<d.palatables.length&&i<3;i++){document.getElementById('ev-palatable'+(i+1)).value=d.palatables[i].nombre||'';for(var n=0;n<d.palatables[i].notas.length&&n<15;n++)document.getElementById('ev-palatable'+(i+1)+'-n'+(n+1)).value=d.palatables[i].notas[n]||'';}if(d.pastoreo){document.getElementById('ev-past1').value=d.pastoreo[0]||'';document.getElementById('ev-past2').value=d.pastoreo[1]||'';document.getElementById('ev-past3').value=d.pastoreo[2]||'';}if(d.herbaceas)for(var i=0;i<7;i++)document.getElementById('ev-herb'+(i+1)).value=d.herbaceas[i]||'';if(d.matorral){document.getElementById('ev-mat1cob').value=d.matorral.punto1?d.matorral.punto1.cobertura:'';document.getElementById('ev-mat1alt').value=d.matorral.punto1?d.matorral.punto1.altura:'';document.getElementById('ev-mat1esp').value=d.matorral.punto1?d.matorral.punto1.especie:'';document.getElementById('ev-mat2cob').value=d.matorral.punto2?d.matorral.punto2.cobertura:'';document.getElementById('ev-mat2alt').value=d.matorral.punto2?d.matorral.punto2.altura:'';document.getElementById('ev-mat2esp').value=d.matorral.punto2?d.matorral.punto2.especie:'';}if(d.fotos){document.getElementById('ev-fotos').value=d.fotos;actualizarListaFotos('ev-fotos-lista',d.fotos);}var fc1Val=d.fotosComp&&d.fotosComp[0]?d.fotosComp[0].numero:'',fc2Val=d.fotosComp&&d.fotosComp[1]?d.fotosComp[1].numero:'';if(fc1Val){document.getElementById('ev-fc1').value=fc1Val;actualizarListaFotos('ev-fc1-lista',fc1Val);}if(fc2Val){document.getElementById('ev-fc2').value=fc2Val;actualizarListaFotos('ev-fc2-lista',fc2Val);}document.getElementById('ev-obs').value=d.observaciones||'';inicializarContadoresDesdeEdicion('EV',d.fotos,fc1Val,fc2Val);actualizarEstadisticasPlantas();actualizarEstadisticasPalatables();actualizarMediaHerbaceas();actualizarResumenMatorral();showPage('ev');showToast('Editando EV','info');}}
function eliminarRegistro(id){if(confirm('¿Eliminar?')){localStorage.setItem('rapca_registros',JSON.stringify(getRegistros().filter(function(r){return r.id!==id;})));updatePendingCount();loadPanel();showToast('Eliminado','info');}}
function borrarTodo(){if(confirm('¿Borrar TODO?')){localStorage.removeItem('rapca_registros');updatePendingCount();loadPanel();showToast('Borrados','info');}}

// Generar HTML con fotos reales
function generarHTMLRegistroConFotos(r,fotos){
  var d=r.datos;
  console.log('Generando PDF con',Object.keys(fotos).length,'fotos disponibles');
  
  var h='<div style="font-family:Arial;max-width:800px;margin:0 auto;padding:20px"><div style="background:linear-gradient(135deg,#1a3d2e,#2d5a3d);color:#fff;padding:25px;border-radius:12px;margin-bottom:20px;text-align:center"><h1 style="margin:0;font-size:2em">🌿 RAPCA EMA</h1><h2 style="margin:10px 0 0;font-weight:normal;font-size:1.3em">'+r.tipo+' - '+r.zona+' > '+r.unidad+(r.transecto?' ('+r.transecto+')':'')+'</h2></div><div style="background:#f5f5f0;padding:15px;border-radius:8px;margin-bottom:15px"><strong>📅</strong> '+r.fecha+'</div>';
  
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
  var rs=getRegistros();
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
