// --- Timeline de Inspecciones ---
var lbFotos=[],lbIndex=0;

function initTimeline(){
  poblarFiltrosTimeline();
  actualizarTimeline();
}

function poblarFiltrosTimeline(){
  var rs=getRegistrosUsuario();
  var ops={},unids={};
  rs.forEach(function(r){
    if(r.operador_nombre)ops[r.operador_email||r.operador_nombre]=r.operador_nombre;
    if(r.unidad)unids[r.unidad]=true;
  });
  var selOp=document.getElementById('tl-filtro-operador');
  if(selOp){
    var h='<option value="">Operador</option>';
    Object.keys(ops).forEach(function(k){h+='<option value="'+k+'">'+ops[k]+'</option>';});
    selOp.innerHTML=h;
  }
  var selUn=document.getElementById('tl-filtro-unidad');
  if(selUn){
    var h='<option value="">Unidad</option>';
    Object.keys(unids).sort().forEach(function(k){h+='<option value="'+k+'">'+k+'</option>';});
    selUn.innerHTML=h;
  }
}

function actualizarTimeline(){
  var rs=getRegistrosUsuario();
  var operador=document.getElementById('tl-filtro-operador')?document.getElementById('tl-filtro-operador').value:'';
  var unidad=document.getElementById('tl-filtro-unidad')?document.getElementById('tl-filtro-unidad').value:'';
  var tipo=document.getElementById('tl-filtro-tipo')?document.getElementById('tl-filtro-tipo').value:'';
  var desde=document.getElementById('tl-desde')?document.getElementById('tl-desde').value:'';
  var hasta=document.getElementById('tl-hasta')?document.getElementById('tl-hasta').value:'';

  if(operador)rs=rs.filter(function(r){return r.operador_email===operador;});
  if(unidad)rs=rs.filter(function(r){return r.unidad===unidad;});
  if(tipo)rs=rs.filter(function(r){return r.tipo===tipo;});
  if(desde)rs=rs.filter(function(r){return r.fecha>=desde;});
  if(hasta)rs=rs.filter(function(r){return r.fecha<=hasta;});

  rs.sort(function(a,b){return(b.id||0)-(a.id||0);});

  var el=document.getElementById('timelineList');
  if(!el)return;

  if(rs.length===0){
    el.innerHTML='<p style="text-align:center;color:#888;padding:20px">Sin inspecciones</p>';
    return;
  }

  var h='<p style="font-size:.8rem;color:#888;margin-bottom:10px">'+rs.length+' inspecciones</p>';
  rs.slice(0,100).forEach(function(r){
    var d=r.datos||{};
    h+='<div class="tl-item'+(r.tipo==='EV'?' ev':'')+'">';
    var tipoBg=r.tipo==='VP'?'background:#d4edda;color:#155724':r.tipo==='EL'?'background:#d5f5e3;color:#196f3d':'background:#ffe5cc;color:#8a4500';
    h+='<div class="tl-head"><div><span class="tipo" style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.7rem;font-weight:bold;'+tipoBg+'">'+r.tipo+'</span> <strong>'+r.zona+' > '+r.unidad+'</strong>'+(r.transecto?' ('+r.transecto+')':'')+'</div><div class="tl-date">'+r.fecha+'</div></div>';
    h+='<div class="tl-body">';
    if(r.operador_nombre)h+='<span style="color:#3498db">'+r.operador_nombre+'</span> | ';
    h+=(r.enviado?'✅ Enviado':'⏳ Pendiente');
    // Resumen de datos
    if(r.tipo==='EI'&&d.plantasMedia)h+=' | Plantas: '+d.plantasMedia;
    if(r.tipo==='EI'&&d.palatablesMedia)h+=' | Palat: '+d.palatablesMedia;
    if(d.pastoreo){
      var pStr=d.pastoreo.filter(function(x){return x;}).join('/');
      if(pStr)h+=' | Past: '+pStr;
    }
    if(d.matorral&&d.matorral.volumen)h+=' | Vol: '+d.matorral.volumen+' m³/ha';
    if(d.observaciones)h+='<br><em style="color:#888">'+d.observaciones.substring(0,100)+(d.observaciones.length>100?'...':'')+'</em>';
    h+='</div>';

    // Fotos
    var fotosArr=obtenerFotosDeRegistro(r);
    if(fotosArr.length>0){
      h+='<div class="tl-photos">';
      fotosArr.forEach(function(f,idx){
        var thumb=fotosCacheMemoria[f.codigo]||'';
        h+='<div class="tl-thumb" onclick="abrirLightbox('+r.id+','+idx+')">';
        if(thumb)h+='<img src="'+thumb+'" alt="'+f.codigo+'">';
        else h+='<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.2rem">📷</div>';
        h+='</div>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  el.innerHTML=h;
}

function obtenerFotosDeRegistro(r){
  var fotos=[];
  var d=r.datos||{};
  if(d.fotos){
    d.fotos.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){
      fotos.push({codigo:c,tipo:'general'});
    });
  }
  if(d.fotosComp){
    d.fotosComp.forEach(function(fc){
      if(fc.numero){
        fc.numero.split(',').map(function(x){return x.trim();}).filter(function(x){return x;}).forEach(function(c){
          fotos.push({codigo:c,tipo:fc.waypoint||'comp'});
        });
      }
    });
  }
  return fotos;
}

// --- Lightbox ---
function abrirLightbox(registroId,fotoIdx){
  var rs=getRegistros();
  var r=rs.find(function(x){return x.id===registroId;});
  if(!r)return;
  lbFotos=obtenerFotosDeRegistro(r);
  if(lbFotos.length===0)return;
  lbIndex=fotoIdx||0;
  mostrarFotoLightbox();
  document.getElementById('lightbox').classList.add('show');
}

function mostrarFotoLightbox(){
  if(lbIndex<0)lbIndex=lbFotos.length-1;
  if(lbIndex>=lbFotos.length)lbIndex=0;
  var f=lbFotos[lbIndex];
  var img=document.getElementById('lbImg');
  var info=document.getElementById('lbInfo');
  var src=fotosCacheMemoria[f.codigo]||'';
  if(src){img.src=src;img.style.display='block';}
  else{img.src='';img.style.display='none';}
  info.textContent=f.codigo+' ('+f.tipo+') — '+(lbIndex+1)+'/'+lbFotos.length;
}

function cerrarLightbox(){
  document.getElementById('lightbox').classList.remove('show');
  lbFotos=[];
}

function navLightbox(dir){
  lbIndex+=dir;
  mostrarFotoLightbox();
}
