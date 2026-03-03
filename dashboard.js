// --- Dashboard con Métricas ---
var dashChartActividad=null,dashChartTipos=null;

function initDashboard(){
  poblarFiltrosDashboard();
  actualizarDashboard();
}

function poblarFiltrosDashboard(){
  var rs=getRegistros(),infras=getInfras();
  var zonas={},provs={},munis={},pns={},ops={};
  rs.forEach(function(r){
    if(r.zona)zonas[r.zona]=true;
    if(r.operador_nombre)ops[r.operador_email||r.operador_nombre]=r.operador_nombre;
  });
  infras.forEach(function(i){
    if(i.idZona)zonas[i.idZona]=true;
    if(i.provincia)provs[i.provincia]=true;
    if(i.municipio)munis[i.municipio]=true;
    if(i.pn)pns[i.pn]=true;
  });
  poblarSelect('dash-filtro-zona',zonas,'Zona');
  poblarSelect('dash-filtro-provincia',provs,'Provincia');
  poblarSelect('dash-filtro-municipio',munis,'Municipio');
  poblarSelect('dash-filtro-pn',pns,'PN');
  var selOp=document.getElementById('dash-filtro-usuario');
  if(selOp){
    var h='<option value="">Operador</option>';
    Object.keys(ops).forEach(function(k){h+='<option value="'+k+'">'+ops[k]+'</option>';});
    selOp.innerHTML=h;
  }
}

function poblarSelect(id,obj,label){
  var el=document.getElementById(id);if(!el)return;
  var h='<option value="">'+label+'</option>';
  Object.keys(obj).sort().forEach(function(k){h+='<option value="'+k+'">'+k+'</option>';});
  el.innerHTML=h;
}

function actualizarDashboard(){
  var rs=filtrarRegistrosDash();
  var infras=filtrarInfrasDash();
  var totalVP=0,totalEL=0,totalEI=0;
  rs.forEach(function(r){if(r.tipo==='VP')totalVP++;else if(r.tipo==='EL')totalEL++;else totalEI++;});
  var operadores={};
  rs.forEach(function(r){if(r.operador_email)operadores[r.operador_email]=true;});
  var pendientes=rs.filter(function(r){return!r.enviado;}).length;
  var total=totalVP+totalEL+totalEI;

  var el=document.getElementById('dashMetrics');
  if(el){
    el.innerHTML=
      '<div class="metric-card green"><div class="mv">'+total+'</div><div class="ml">Inspecciones</div></div>'+
      '<div class="metric-card"><div class="mv">'+totalVP+'</div><div class="ml">Visitas Previas</div></div>'+
      '<div class="metric-card" style="border-top-color:#2ecc71"><div class="mv">'+totalEL+'</div><div class="ml">Eval. Ligera</div></div>'+
      '<div class="metric-card orange"><div class="mv">'+totalEI+'</div><div class="ml">Eval. Intensa</div></div>'+
      '<div class="metric-card blue"><div class="mv">'+Object.keys(operadores).length+'</div><div class="ml">Operadores</div></div>'+
      '<div class="metric-card purple"><div class="mv">'+infras.length+'</div><div class="ml">Infraestructuras</div></div>'+
      '<div class="metric-card red"><div class="mv">'+pendientes+'</div><div class="ml">Pendientes</div></div>';
  }

  renderChartActividad(rs);
  renderChartTipos(totalVP,totalEL,totalEI);
  renderAlertasDash(rs);
}

function filtrarRegistrosDash(){
  var rs=getRegistros();
  var zona=document.getElementById('dash-filtro-zona')?document.getElementById('dash-filtro-zona').value:'';
  var usuario=document.getElementById('dash-filtro-usuario')?document.getElementById('dash-filtro-usuario').value:'';
  // Filtrar por provincia/municipio/pn usando infras como referencia
  var provincia=document.getElementById('dash-filtro-provincia')?document.getElementById('dash-filtro-provincia').value:'';
  var municipio=document.getElementById('dash-filtro-municipio')?document.getElementById('dash-filtro-municipio').value:'';
  var pn=document.getElementById('dash-filtro-pn')?document.getElementById('dash-filtro-pn').value:'';

  if(zona)rs=rs.filter(function(r){return r.zona===zona;});
  if(usuario)rs=rs.filter(function(r){return r.operador_email===usuario;});

  // Filtro por infra (provincia/municipio/pn)
  if(provincia||municipio||pn){
    var infras=getInfras();
    var unidadesValidas={};
    infras.forEach(function(i){
      var ok=true;
      if(provincia&&i.provincia!==provincia)ok=false;
      if(municipio&&i.municipio!==municipio)ok=false;
      if(pn&&i.pn!==pn)ok=false;
      if(ok&&i.idUnidad)unidadesValidas[i.idUnidad]=true;
    });
    rs=rs.filter(function(r){return unidadesValidas[r.unidad];});
  }
  return rs;
}

function filtrarInfrasDash(){
  var infras=getInfras();
  var provincia=document.getElementById('dash-filtro-provincia')?document.getElementById('dash-filtro-provincia').value:'';
  var municipio=document.getElementById('dash-filtro-municipio')?document.getElementById('dash-filtro-municipio').value:'';
  var pn=document.getElementById('dash-filtro-pn')?document.getElementById('dash-filtro-pn').value:'';
  var zona=document.getElementById('dash-filtro-zona')?document.getElementById('dash-filtro-zona').value:'';
  if(provincia)infras=infras.filter(function(i){return i.provincia===provincia;});
  if(municipio)infras=infras.filter(function(i){return i.municipio===municipio;});
  if(pn)infras=infras.filter(function(i){return i.pn===pn;});
  if(zona)infras=infras.filter(function(i){return i.idZona===zona;});
  return infras;
}

function renderChartActividad(rs){
  if(typeof Chart==='undefined')return;
  var dias={};
  rs.forEach(function(r){
    var d=r.fecha||'sin fecha';
    if(!dias[d])dias[d]={vp:0,el:0,ei:0};
    if(r.tipo==='VP')dias[d].vp++;else if(r.tipo==='EL')dias[d].el++;else dias[d].ei++;
  });
  var labels=Object.keys(dias).sort().slice(-30);
  var dataVP=labels.map(function(d){return dias[d].vp;});
  var dataEL=labels.map(function(d){return dias[d].el;});
  var dataEI=labels.map(function(d){return dias[d].ei;});
  var shortLabels=labels.map(function(d){var p=d.split('-');return p.length===3?p[2]+'/'+p[1]:d;});

  var ctx=document.getElementById('chartActividad');
  if(!ctx)return;
  if(dashChartActividad){dashChartActividad.destroy();}
  dashChartActividad=new Chart(ctx,{
    type:'bar',
    data:{
      labels:shortLabels,
      datasets:[
        {label:'VP',data:dataVP,backgroundColor:'rgba(136,216,176,0.7)',borderColor:'#88d8b0',borderWidth:1},
        {label:'EL',data:dataEL,backgroundColor:'rgba(46,204,113,0.7)',borderColor:'#2ecc71',borderWidth:1},
        {label:'EI',data:dataEI,backgroundColor:'rgba(253,152,83,0.7)',borderColor:'#fd9853',borderWidth:1}
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{position:'top',labels:{font:{size:11}}},title:{display:true,text:'Actividad (últimos 30 días)',font:{size:14}}},
      scales:{x:{stacked:true,ticks:{font:{size:9}}},y:{stacked:true,beginAtZero:true,ticks:{stepSize:1}}}
    }
  });
}

function renderChartTipos(vp,el,ei){
  if(typeof Chart==='undefined')return;
  var ctx=document.getElementById('chartTipos');
  if(!ctx)return;
  if(dashChartTipos){dashChartTipos.destroy();}
  dashChartTipos=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:['Visita Previa','Eval. Ligera','Eval. Intensa'],
      datasets:[{data:[vp,el,ei],backgroundColor:['#88d8b0','#2ecc71','#fd9853'],borderWidth:2,borderColor:'#fff'}]
    },
    options:{
      responsive:true,
      plugins:{legend:{position:'bottom',labels:{font:{size:12}}},title:{display:true,text:'Distribución por Tipo',font:{size:14}}}
    }
  });
}

function renderAlertasDash(rs){
  var el=document.getElementById('dashAlertasList');if(!el)return;
  var h='';
  var pendientes=rs.filter(function(r){return!r.enviado;});
  if(pendientes.length>0){
    h+='<div style="background:#fff3cd;padding:10px;border-radius:8px;margin-bottom:8px;font-size:.85rem">⏳ <strong>'+pendientes.length+'</strong> registro'+(pendientes.length>1?'s':'')+' pendiente'+(pendientes.length>1?'s':'')+' de sincronizar</div>';
  }
  // Unidades sin EI
  var unidadesVP={},unidadesEI={};
  rs.forEach(function(r){
    if(r.tipo==='VP')unidadesVP[r.unidad]=true;
    if(r.tipo==='EI')unidadesEI[r.unidad]=true;
  });
  var sinEI=Object.keys(unidadesVP).filter(function(u){return!unidadesEI[u];});
  if(sinEI.length>0){
    h+='<div style="background:#fce4ec;padding:10px;border-radius:8px;margin-bottom:8px;font-size:.85rem">🔍 <strong>'+sinEI.length+'</strong> unidad'+(sinEI.length>1?'es':'')+' con VP pero sin EI: '+sinEI.slice(0,5).join(', ')+(sinEI.length>5?' ...':'')+'</div>';
  }
  if(!h)h='<p style="color:#888;font-size:.85rem;text-align:center">Sin alertas</p>';
  el.innerHTML=h;
}
