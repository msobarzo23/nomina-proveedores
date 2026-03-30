import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, Plus, Download, Mail, Copy, Check, Trash2, Settings, Users,
  FileText, AlertCircle, X, Upload, RefreshCw,
  Building2, UserPlus, ClipboardList, Eye, Cloud, CloudOff,
  Loader2, XCircle
} from "lucide-react";

const COMPANY_DEFAULTS = {
  rutEmpresa: "883971000", ctaCargo: "206388064", tipoServicio: "005003",
  medioRespaldo: "CAT_CSH_CONTRACT_ACCOUNT", descripcion: "PAGO PROVEEDORES",
  glosaCuentaCargo: "nomina", glosaCuentaAbono: "nomina",
  tipoCuentaCargo: "CAT_CSH_CCTE", emailNotificacion: "finanzas@transportesbello.com",
};
const EMAIL_DEFAULTS = {
  para: "lbello@transportesbello.com", cc: "contabilidad@transportesbello.com",
  saludo: "Tio Luis", firma: "Saludos,\nFinanzas\nTransportes Bello e Hijos Ltda.",
};
const MAX_TRANSFER = 7000000;
const BANK_MAP = {
  1:{code:"001",name:"Banco de Chile"},9:{code:"009",name:"Banco Internacional"},
  12:{code:"012",name:"Banco del Estado"},14:{code:"014",name:"Scotiabank"},
  16:{code:"016",name:"BCI"},27:{code:"027",name:"Corpbanca"},
  28:{code:"028",name:"Banco Bice"},31:{code:"031",name:"HSBC"},
  37:{code:"037",name:"Banco Santander"},39:{code:"039",name:"Banco Itaú"},
  49:{code:"049",name:"Banco Security"},51:{code:"051",name:"Banco Falabella"},
  53:{code:"053",name:"Banco Ripley"},55:{code:"055",name:"Banco Monex"},
};
const ACCT_MAP = {"Cuenta Corriente":"CAT_CSH_CCTE","Cuenta Vista":"CAT_CSH_CVIS","Cuenta de Ahorro":"CAT_CSH_CAHORRO"};
const ACCT_LIST = ["Cuenta Corriente","Cuenta Vista","Cuenta de Ahorro"];
const BANK_LIST = Object.entries(BANK_MAP).map(([k,v])=>({id:Number(k),...v})).sort((a,b)=>a.name.localeCompare(b.name));

const formatCLP = (n) => "$" + Number(n).toLocaleString("es-CL");
const formatRut = (r) => { const c=String(r).replace(/[^0-9kK]/g,""); if(c.length<2)return c; return c.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,".")+"-"+c.slice(-1).toUpperCase(); };
const cleanRut = (r) => String(r).replace(/[^0-9kK]/g,"").toUpperCase();
const validateRut = (r) => { const c=cleanRut(r); if(c.length<2)return false; const b=c.slice(0,-1),d=c.slice(-1); let s=0,m=2; for(let i=b.length-1;i>=0;i--){s+=parseInt(b[i])*m;m=m===7?2:m+1;} const e=11-(s%11); return d===(e===11?"0":e===10?"K":String(e)); };
const padBank = (c) => String(c).padStart(3,"0");
const todayStr = () => { const d=new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };
const splitAmount = (a) => { const n=Number(a); if(n<=MAX_TRANSFER)return[n]; const p=[]; let r=n; while(r>MAX_TRANSFER){p.push(MAX_TRANSFER);r-=MAX_TRANSFER;} if(r>0)p.push(r); return p; };

const SETTINGS_KEY = "nomina_cfg_v2", CACHE_KEY = "nomina_sup_cache";
const loadSettings = () => { try{const s=localStorage.getItem(SETTINGS_KEY);if(s)return{...COMPANY_DEFAULTS,...EMAIL_DEFAULTS,googleSheetsUrl:"",...JSON.parse(s)};}catch{} return{...COMPANY_DEFAULTS,...EMAIL_DEFAULTS,googleSheetsUrl:""}; };
const saveSettings = (s) => { try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}catch{} };
const loadCache = () => { try{const s=localStorage.getItem(CACHE_KEY);if(s)return JSON.parse(s);}catch{} return[]; };
const saveCache = (s) => { try{localStorage.setItem(CACHE_KEY,JSON.stringify(s));}catch{} };

const api = {
  async list(url){ const r=await fetch(url+"?action=list"); const d=await r.json(); if(d.error)throw new Error(d.error); return Array.isArray(d)?d:[]; },
  async add(url,sup){ const r=await fetch(url,{method:"POST",body:JSON.stringify({action:"add",...sup}),redirect:"follow"}); return await r.json(); },
  async del(url,rut){ const r=await fetch(url,{method:"POST",body:JSON.stringify({action:"delete",rut}),redirect:"follow"}); return await r.json(); },
};

const genTXT = (pays,sups,cfg) => {
  const recs=[];
  pays.forEach(p=>{const s=sups.find(x=>cleanRut(x.rut)===cleanRut(p.rut));if(!s)return;
    splitAmount(p.monto).forEach(amt=>recs.push({
      rut:cleanRut(s.rut),nombre:s.nombre.substring(0,250).trim(),email:cfg.emailNotificacion,
      met:"CAT_CSH_TRANSFER",banco:padBank(s.codigoBanco),tipo:ACCT_MAP[s.tipoCuenta]||"CAT_CSH_CCTE",
      cta:String(s.numeroCuenta),monto:amt,suc:String(s.codigoBanco)==="39"?"001":"",glosa:p.detalle.substring(0,100)
    }));
  });
  const sum=recs.reduce((s,r)=>s+r.monto,0);
  const hdr=[cfg.rutEmpresa,recs.length,sum,cfg.tipoServicio,cfg.medioRespaldo,cfg.ctaCargo,cfg.descripcion,cfg.glosaCuentaCargo,cfg.glosaCuentaAbono].join(",");
  const lines=recs.map(r=>[r.rut,r.nombre,r.email,r.met,r.banco,r.tipo,r.cta,"","","",r.monto,cfg.tipoCuentaCargo,cfg.ctaCargo,r.suc,"",r.glosa,cfg.glosaCuentaCargo,cfg.glosaCuentaAbono].join(","));
  return[hdr,...lines].join("\n");
};

const genEmail = (pays,sups,cfg) => {
  const total=pays.reduce((s,p)=>s+p.monto,0);
  let t=`${cfg.saludo}\n\nAdjunto detalle de nómina para su autorización:\n\nNÓMINA PAGOS ${todayStr()}\n\n`;
  pays.forEach(p=>{const s=sups.find(x=>cleanRut(x.rut)===cleanRut(p.rut));t+=`• ${s?.nombre||p.rut}\n  ${p.detalle}\n  Monto: ${formatCLP(p.monto)}\n\n`;});
  return t+`─────────────────────────────\nTOTAL: ${formatCLP(total)}\n\n${cfg.firma}`;
};

const genEmailHTML = (pays,sups,cfg) => {
  const total=pays.reduce((s,p)=>s+p.monto,0);
  const rows=pays.map(p=>{const s=sups.find(x=>cleanRut(x.rut)===cleanRut(p.rut));return`<tr><td style="padding:6px 10px;border:1px solid #bbb;font-size:13px">${s?.nombre||p.rut}</td><td style="padding:6px 10px;border:1px solid #bbb;font-size:13px">${p.detalle}</td><td style="padding:6px 10px;border:1px solid #bbb;text-align:right;font-size:13px">$ ${Number(p.monto).toLocaleString("es-CL")}</td></tr>`;}).join("");
  return`<div style="font-family:Arial,sans-serif"><p>${cfg.saludo}</p><p>Adjunto detalle de nómina para su autorización:</p><table style="border-collapse:collapse;width:100%;margin:12px 0"><tr style="background:#1a1a1a;color:#fff"><td style="padding:8px 10px;font-weight:bold;font-size:14px" colspan="2">NOMINA PAGOS</td><td style="padding:8px 10px;text-align:right;font-size:14px;color:#fff">${todayStr()}</td></tr><tr style="background:#333;color:#fff"><td style="padding:6px 10px;font-weight:bold;font-size:13px">Proveedor</td><td style="padding:6px 10px;font-weight:bold;font-size:13px">DETALLE</td><td style="padding:6px 10px;font-weight:bold;text-align:right;font-size:13px">Monto</td></tr>${rows}<tr style="background:#1a1a1a;color:#fff"><td style="padding:8px 10px;font-size:14px" colspan="2"><strong>Total</strong></td><td style="padding:8px 10px;text-align:right;font-weight:bold;font-size:14px">$ ${Number(total).toLocaleString("es-CL")}</td></tr></table><p>${cfg.firma.replace(/\n/g,"<br>")}</p></div>`;
};

const parseCSV = (text) => {
  const lines=text.split("\n").filter(l=>l.trim()); if(lines.length<2)return[];
  return lines.slice(1).map(line=>{const c=line.split(",").map(x=>x.trim().replace(/^"|"$/g,"")); if(c.length<7||!c[0])return null;
    return{rut:cleanRut(c[0]),nombre:(c[1]||"").replace(/^\n/,"").trim(),medioPago:c[2]||"Abono en Cuenta",codigoBanco:Number(c[3])||1,tipoCuenta:c[4]||"Cuenta Corriente",numeroCuenta:String(c[5]||""),email:(c[6]||"").trim()};
  }).filter(Boolean);
};

function SupSearch({suppliers,onSelect,placeholder}){
  const[q,setQ]=useState("");const[open,setOpen]=useState(false);const ref=useRef(null);
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
  const fil=useMemo(()=>{if(!q||q.length<1)return[];const words=norm(q).split(" ").filter(w=>w);return suppliers.filter(s=>{const n=norm(s.nombre);return words.every(w=>n.includes(w))||cleanRut(s.rut).includes(cleanRut(q));}).slice(0,15);},[q,suppliers]);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(<div ref={ref} className="ssrc"><div style={{position:"relative"}}><Search size={16} className="sico"/><input type="text" value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} placeholder={placeholder} className="inp" style={{paddingLeft:38}}/></div>
    {open&&fil.length>0&&<div className="dd">{fil.map((s,i)=><div key={i} className="ddi" onClick={()=>{onSelect(s);setQ(s.nombre);setOpen(false);}}><div><div className="tp" style={{fontSize:13,fontWeight:500}}>{s.nombre}</div><div className="tm" style={{fontSize:11,marginTop:2}}>{formatRut(s.rut)} · {BANK_MAP[s.codigoBanco]?.name||`Banco ${s.codigoBanco}`} · {s.tipoCuenta}</div></div><div className="tm" style={{fontSize:11}}>Cta: {s.numeroCuenta}</div></div>)}</div>}
  </div>);
}

export default function App(){
  const[tab,setTab]=useState("nomina");
  const[sups,setSups]=useState(()=>loadCache());
  const[pays,setPays]=useState([]);
  const[cfg,setCfg]=useState(()=>loadSettings());
  const[conn,setConn]=useState(false);
  const[syncing,setSyncing]=useState(false);
  const[syncErr,setSyncErr]=useState("");
  const[sel,setSel]=useState(null);
  const[monto,setMonto]=useState("");
  const[det,setDet]=useState("");
  const[showAdd,setShowAdd]=useState(false);
  const[ns,setNs]=useState({rut:"",nombre:"",codigoBanco:1,tipoCuenta:"Cuenta Corriente",numeroCuenta:"",email:""});
  const[supQ,setSupQ]=useState("");
  const[msg,setMsg]=useState({t:"",x:""});
  const[adding,setAdding]=useState(false);
  const[copied,setCopied]=useState(false);
  const[showTxt,setShowTxt]=useState(false);
  const[showMail,setShowMail]=useState(false);
  const fref=useRef(null);
  const[importing,setImporting]=useState(false);

  useEffect(()=>{saveSettings(cfg);},[cfg]);

  const refresh=useCallback(async()=>{
    if(!cfg.googleSheetsUrl){setConn(false);return;}
    setSyncing(true);setSyncErr("");
    try{const d=await api.list(cfg.googleSheetsUrl);setSups(d);saveCache(d);setConn(true);}
    catch(e){setSyncErr(e.message);setConn(false);const c=loadCache();if(c.length>0&&sups.length===0)setSups(c);}
    finally{setSyncing(false);}
  },[cfg.googleSheetsUrl]);

  useEffect(()=>{if(cfg.googleSheetsUrl)refresh();},[cfg.googleSheetsUrl]);

  const addPay=()=>{if(!sel||!monto||!det)return;const m=Number(String(monto).replace(/\D/g,""));if(m<=0)return;setPays(p=>[...p,{rut:sel.rut,detalle:det.toUpperCase(),monto:m}]);setSel(null);setMonto("");setDet("");};
  const rmPay=(i)=>setPays(p=>p.filter((_,j)=>j!==i));
  const totalP=useMemo(()=>pays.reduce((s,p)=>s+p.monto,0),[pays]);
  const totalR=useMemo(()=>pays.reduce((s,p)=>s+splitAmount(p.monto).length,0),[pays]);

  const dlTXT=()=>{if(!pays.length)return;const t=genTXT(pays,sups,cfg);const b=new Blob([t],{type:"text/plain;charset=utf-8"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;const d=new Date();a.download=`nomina_prov_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.txt`;a.click();URL.revokeObjectURL(u);};
  const cpEmail=()=>{if(!pays.length)return;const html=genEmailHTML(pays,sups,cfg);const plain=genEmail(pays,sups,cfg);try{navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([plain],{type:"text/plain"})})]).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});}catch(e){navigator.clipboard.writeText(plain).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});}};

  const addSup=async()=>{
    setMsg({t:"",x:""});const rut=cleanRut(ns.rut);
    if(!rut||rut.length<2){setMsg({t:"e",x:"Ingresa un RUT válido"});return;}
    if(!validateRut(rut)){setMsg({t:"e",x:"RUT inválido (dígito verificador)"});return;}
    if(!ns.nombre.trim()){setMsg({t:"e",x:"Ingresa el nombre"});return;}
    if(!ns.numeroCuenta.trim()){setMsg({t:"e",x:"Ingresa N° de cuenta"});return;}
    const sd={rut,nombre:ns.nombre.toUpperCase().trim(),medioPago:"Abono en Cuenta",codigoBanco:Number(ns.codigoBanco),tipoCuenta:ns.tipoCuenta,numeroCuenta:ns.numeroCuenta.trim(),email:ns.email.trim()};
    if(conn&&cfg.googleSheetsUrl){
      setAdding(true);
      try{const r=await api.add(cfg.googleSheetsUrl,sd);
        if(!r.success){if(r.error==="RUT_DUPLICADO"){const e=r.existing;setMsg({t:"e",x:`⚠️ RUT ya existe: ${e.nombre} — ${BANK_MAP[e.codigoBanco]?.name||""} ${e.tipoCuenta} Cta: ${e.numeroCuenta}`});}else{setMsg({t:"e",x:r.error||"Error"});}setAdding(false);return;}
        await refresh();setMsg({t:"s",x:`✓ ${sd.nombre} guardado en Google Sheets`});
      }catch(e){setMsg({t:"e",x:`Error: ${e.message}`});setAdding(false);return;}
      setAdding(false);
    }else{
      const ex=sups.find(s=>cleanRut(s.rut)===rut);
      if(ex){setMsg({t:"e",x:`⚠️ RUT ya existe: ${ex.nombre} — ${BANK_MAP[ex.codigoBanco]?.name||""} Cta: ${ex.numeroCuenta}`});return;}
      const u=[...sups,sd];setSups(u);saveCache(u);setMsg({t:"s",x:`✓ ${sd.nombre} agregado (local)`});
    }
    setNs({rut:"",nombre:"",codigoBanco:1,tipoCuenta:"Cuenta Corriente",numeroCuenta:"",email:""});
    setTimeout(()=>setMsg({t:"",x:""}),4000);
  };

  const impCSV=async(e)=>{const f=e.target.files?.[0];if(!f)return;setImporting(true);const text=await f.text();const imp=parseCSV(text);e.target.value="";
    if(!imp.length){alert("No se encontraron registros");setImporting(false);return;}
    if(conn&&cfg.googleSheetsUrl){let a=0,d=0,er=0;for(const s of imp){try{const r=await api.add(cfg.googleSheetsUrl,s);if(r.success)a++;else if(r.error==="RUT_DUPLICADO")d++;else er++;}catch{er++;}}await refresh();alert(`✓ Nuevos: ${a}\n⊘ Duplicados: ${d}${er?`\n✗ Errores: ${er}`:""}`);
    }else{const nw=imp.filter(i=>!sups.find(s=>cleanRut(s.rut)===cleanRut(i.rut)));const d=imp.length-nw.length;const u=[...sups,...nw];setSups(u);saveCache(u);alert(`Importados: ${nw.length} nuevos${d?` · ${d} duplicados ignorados`:""}`);
    }setImporting(false);};

  const delSup=async(rut)=>{const s=sups.find(x=>cleanRut(x.rut)===cleanRut(rut));if(!confirm(`¿Eliminar a ${s?.nombre||rut}?`))return;
    if(conn&&cfg.googleSheetsUrl){try{await api.del(cfg.googleSheetsUrl,rut);await refresh();}catch(e){alert("Error: "+e.message);}}
    else{const u=sups.filter(x=>cleanRut(x.rut)!==cleanRut(rut));setSups(u);saveCache(u);}};

  const filtSups=useMemo(()=>{if(!supQ||supQ.length<2)return sups.slice(0,50);const q=supQ.toLowerCase();return sups.filter(s=>s.nombre.toLowerCase().includes(q)||cleanRut(s.rut).includes(cleanRut(supQ)));},[supQ,sups]);

  const tabData=[{id:"nomina",label:"Nómina",Icon:ClipboardList},{id:"proveedores",label:"Proveedores",Icon:Users},{id:"config",label:"Configuración",Icon:Settings}];

  return(
    <div className="root">
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        .root{min-height:100vh;background:#0B1120;font-family:'Inter','SF Pro Display',-apple-system,sans-serif;color:#E2E8F0}
        .inp{width:100%;padding:10px 12px;background:#1A2236;border:1px solid #2D3A50;border-radius:8px;color:#E2E8F0;font-size:14px;outline:none}
        .inp:focus{border-color:#4A6FA5}.inp::placeholder{color:#4A5568}
        select.inp{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B9AAF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
        select.inp option{background:#1A2236;color:#E2E8F0}textarea.inp{resize:vertical}
        .lbl{color:#8B9AAF;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;display:block}
        .tp{color:#E2E8F0}.tm{color:#6B7A94}.ta{color:#E8952F}.tg{color:#4ADE80}
        .bp{background:linear-gradient(135deg,#E8952F,#D4800A);color:#0E1525;border:none;border-radius:8px;padding:10px 20px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .15s}
        .bp:hover{filter:brightness(1.1)}.bp:disabled{opacity:.4;cursor:not-allowed}
        .bs{background:#1E2A40;color:#C9D5E8;border:1px solid #2D3A50;border-radius:8px;padding:10px 16px;font-weight:500;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all .15s}
        .bs:hover{background:#253048}
        .ssrc{position:relative;flex:1}.sico{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#8B9AAF;pointer-events:none;z-index:1}
        .dd{position:absolute;top:100%;left:0;right:0;z-index:50;background:#1A2236;border:1px solid #2D3A50;border-radius:8px;margin-top:4px;max-height:280px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.5)}
        .ddi{padding:10px 14px;cursor:pointer;border-bottom:1px solid #1E2A40;display:flex;justify-content:space-between;align-items:center}.ddi:hover{background:#253048}
        .cd{background:#0F1729;border-radius:10px;padding:18px;border:1px solid #1E2A40;margin-bottom:18px}
        .cdt{font-size:13px;font-weight:600;color:#E8952F;margin-bottom:14px}
        .pr{background:#141C2E;border-radius:8px;padding:12px 16px;margin-bottom:8px;border:1px solid #1E2A40}
        .sb{display:flex;align-items:center;gap:6px;padding:4px 12px;background:#141C2E;border:1px solid #1E2A40;border-radius:20px;font-size:11px;color:#8B9AAF;cursor:pointer;transition:all .15s}
        .sb:hover{background:#1E2A40}
        .me{background:#2D1515;border:1px solid #5C2020;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#FCA5A5;font-size:13px;display:flex;align-items:flex-start;gap:8px}
        .ms{background:#0F2D1B;border:1px solid #1A5C2E;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#86EFAC;font-size:13px}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
        .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px}
        @keyframes sp{to{transform:rotate(360deg)}}.spn{animation:sp 1s linear infinite}
        .tb{background:transparent;border:1px solid transparent;border-radius:8px 8px 0 0;padding:10px 18px;color:#6B7A94;font-weight:400;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px}
        .tba{background:#141C2E;border-color:#1E2A40;border-bottom-color:#141C2E;color:#E8952F;font-weight:600}
        .bdg{font-size:10px;padding:1px 6px;border-radius:10px;font-weight:600}
        .es{text-align:center;padding:40px;color:#4A5568;border:2px dashed #1E2A40;border-radius:10px}
        .ib{background:none;border:none;color:#4A5568;cursor:pointer;padding:6px;display:flex;align-items:center}.ib:hover{color:#EF4444}
        @media(max-width:640px){.g2,.g3{grid-template-columns:1fr}}
      `}</style>

      <div style={{background:"linear-gradient(180deg,#111B2E,#0B1120)",borderBottom:"1px solid #1E2A40",padding:"16px 24px"}}>
        <div style={{maxWidth:960,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{background:"#E8952F",color:"#0E1525",fontWeight:800,fontSize:12,padding:"5px 10px",borderRadius:6}}>ITAÚ</div>
            <div><div style={{fontSize:20,fontWeight:700}}><span style={{fontStyle:"italic"}}>Procesador de </span><span style={{color:"#E8952F",fontWeight:800}}>Nómina</span></div>
            <div style={{fontSize:11,color:"#6B7A94",marginTop:1}}>Proveedores · TXT oficial para portal banco</div></div>
          </div>
          <div className="sb" onClick={refresh} title={conn?"Conectado a Google Sheets":"Sin conexión"}>
            {syncing?<Loader2 size={13} className="spn"/>:conn?<Cloud size={13} style={{color:"#4ADE80"}}/>:<CloudOff size={13} style={{color:"#F59E0B"}}/>}
            <span>{syncing?"Sincronizando...":conn?`${sups.length} proveedores`:`Local · ${sups.length}`}</span>
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px",display:"flex",gap:2,marginTop:16}}>
        {tabData.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`tb ${tab===t.id?"tba":""}`}>
          <t.Icon size={15}/>{t.label}
          {t.id==="proveedores"&&<span className="bdg" style={{background:tab===t.id?"#2D1F0E":"#1A2236",color:tab===t.id?"#E8952F":"#6B7A94"}}>{sups.length}</span>}
        </button>)}
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px 40px"}}>
        <div style={{background:"#141C2E",border:"1px solid #1E2A40",borderRadius:"0 8px 8px 8px",padding:24}}>

          {tab==="nomina"&&<div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <h2 style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:8}}><FileText size={18} color="#E8952F"/>Nómina del {todayStr()}</h2>
              {pays.length>0&&<button className="bs" style={{padding:"6px 12px",fontSize:12}} onClick={()=>{if(confirm("¿Limpiar?"))setPays([]);}}><Trash2 size={13}/>Limpiar</button>}
            </div>

            <div className="cd">
              <div style={{marginBottom:14}}><label className="lbl">Proveedor</label>
                <SupSearch suppliers={sups} onSelect={setSel} placeholder="Buscar proveedor por nombre o RUT..."/>
                {sel&&<div style={{marginTop:8,padding:"8px 12px",background:"#1A2236",borderRadius:6,border:"1px solid #253048",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><span className="tg" style={{fontSize:12,fontWeight:600}}>✓ </span><span style={{fontSize:13}}>{sel.nombre}</span>
                  <span className="tm" style={{fontSize:11,marginLeft:8}}>{formatRut(sel.rut)} · {BANK_MAP[sel.codigoBanco]?.name} · Cta {sel.numeroCuenta}</span></div>
                  <button onClick={()=>setSel(null)} style={{background:"none",border:"none",color:"#6B7A94",cursor:"pointer"}}><X size={14}/></button>
                </div>}
              </div>
              <div className="g2">
                <div><label className="lbl">Monto ($)</label>
                  <input type="text" value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))} placeholder="0" className="inp" style={{fontVariantNumeric:"tabular-nums",fontWeight:600}}
                    onBlur={()=>{if(monto)setMonto(Number(monto).toLocaleString("es-CL"));}} onFocus={()=>setMonto(String(monto).replace(/\D/g,""))}/>
                  {monto&&Number(String(monto).replace(/\D/g,""))>MAX_TRANSFER&&<div style={{color:"#F59E0B",fontSize:11,marginTop:4,display:"flex",alignItems:"center",gap:4}}><AlertCircle size={12}/>Split en {splitAmount(Number(String(monto).replace(/\D/g,""))).length} transf.</div>}
                </div>
                <div><label className="lbl">Detalle / Glosa</label>
                  <input type="text" value={det} onChange={e=>setDet(e.target.value)} placeholder="Ej: TRABAJOS POZO ALMONTE F/2186" className="inp" onKeyDown={e=>{if(e.key==="Enter")addPay();}}/>
                </div>
              </div>
              <button className="bp" onClick={addPay} disabled={!sel||!monto||!det} style={{width:"100%",justifyContent:"center"}}><Plus size={16}/>Agregar a Nómina</button>
            </div>

            {pays.length===0?<div className="es"><ClipboardList size={32} style={{marginBottom:8,opacity:.4}}/><div style={{fontSize:14}}>No hay pagos</div><div style={{fontSize:12,marginTop:4}}>Busca un proveedor para comenzar</div></div>
            :<>
              {pays.map((p,i)=>{const s=sups.find(x=>cleanRut(x.rut)===cleanRut(p.rut));const sp=splitAmount(p.monto);return(
                <div key={i} className="pr"><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <span style={{fontWeight:600,fontSize:14}}>{s?.nombre||p.rut}</span>
                    {sp.length>1&&<span className="bdg" style={{background:"#2D1F0E",color:"#F59E0B"}}>SPLIT {sp.length}x</span>}
                  </div><div className="tm" style={{fontSize:12}}>{p.detalle}</div>
                  {sp.length>1&&<div style={{color:"#4A5568",fontSize:11,marginTop:4}}>Dividido: {sp.map(formatCLP).join(" + ")}</div>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span className="tg" style={{fontWeight:700,fontSize:15,fontVariantNumeric:"tabular-nums"}}>{formatCLP(p.monto)}</span>
                    <button className="ib" onClick={()=>rmPay(i)}><Trash2 size={15}/></button>
                  </div>
                </div></div>);})}

              <div style={{background:"#0F1729",borderRadius:10,padding:16,border:"1px solid #253048",marginTop:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div className="tm" style={{fontSize:12}}>{pays.length} pagos · {totalR} registros TXT</div>
                <div style={{textAlign:"right"}}><div className="tm" style={{fontSize:11}}>TOTAL NÓMINA</div>
                  <div className="tg" style={{fontSize:22,fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{formatCLP(totalP)}</div>
                </div>
              </div>

              <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                <button className="bp" onClick={dlTXT} style={{flex:1,justifyContent:"center"}}><Download size={16}/>Descargar TXT</button>
                <button className="bs" onClick={cpEmail} style={{flex:1,justifyContent:"center"}}>{copied?<Check size={16} style={{color:"#4ADE80"}}/>:<Copy size={16}/>}{copied?"¡Copiado!":"Copiar Correo"}</button>
                <button className="bs" onClick={()=>setShowTxt(!showTxt)}><Eye size={16}/>TXT</button>
                <button className="bs" onClick={()=>setShowMail(!showMail)}><Mail size={16}/>Email</button>
              </div>
              {showTxt&&<div className="cd" style={{marginTop:14,marginBottom:0}}><div className="cdt">Vista previa TXT:</div><pre style={{color:"#8B9AAF",fontSize:11,whiteSpace:"pre-wrap",wordBreak:"break-all",lineHeight:1.6}}>{genTXT(pays,sups,cfg)}</pre></div>}
              {showMail&&<div className="cd" style={{marginTop:14,marginBottom:0}}><div className="cdt">Correo:</div><div className="tm" style={{fontSize:12,marginBottom:2}}>Para: {cfg.para}</div><div className="tm" style={{fontSize:12,marginBottom:8}}>CC: {cfg.cc}</div><div style={{background:"#fff",borderRadius:6,padding:16}} dangerouslySetInnerHTML={{__html:genEmailHTML(pays,sups,cfg)}}/></div>}
            </>}
          </div>}

          {tab==="proveedores"&&<div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <h2 style={{fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
                <Users size={18} color="#E8952F"/>Proveedores {conn&&<Cloud size={14} style={{color:"#4ADE80"}}/>}
              </h2>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>setShowAdd(!showAdd)} className={showAdd?"bp":"bs"} style={{padding:"8px 14px",fontSize:12}}><UserPlus size={14}/>Nuevo</button>
                <button onClick={()=>fref.current?.click()} className="bs" style={{padding:"8px 14px",fontSize:12}} disabled={importing}>{importing?<Loader2 size={14} className="spn"/>:<Upload size={14}/>}Importar CSV</button>
                <input ref={fref} type="file" accept=".csv,.txt" onChange={impCSV} style={{display:"none"}}/>
                <button onClick={refresh} className="bs" style={{padding:"8px 14px",fontSize:12}} disabled={syncing||!cfg.googleSheetsUrl}><RefreshCw size={14} className={syncing?"spn":""}/>Refrescar</button>
              </div>
            </div>
            {syncErr&&<div className="me" style={{marginBottom:14}}><XCircle size={16} style={{flexShrink:0,marginTop:1}}/><div>Error: {syncErr}. Usando caché ({sups.length}).</div></div>}

            {showAdd&&<div className="cd">
              <div className="cdt">Agregar Nuevo Proveedor{conn&&<span style={{fontWeight:400,color:"#4ADE80",fontSize:11,marginLeft:8}}>→ Google Sheets</span>}</div>
              {msg.t==="e"&&<div className="me"><AlertCircle size={16} style={{flexShrink:0,marginTop:1}}/>{msg.x}</div>}
              {msg.t==="s"&&<div className="ms">{msg.x}</div>}
              <div className="g2">
                <div><label className="lbl">RUT</label><input type="text" value={ns.rut} onChange={e=>setNs({...ns,rut:e.target.value})} placeholder="Ej: 761234567" className="inp"/>
                  {ns.rut.length>=2&&<div style={{color:validateRut(ns.rut)?"#4ADE80":"#EF4444",fontSize:11,marginTop:4}}>{validateRut(ns.rut)?`✓ ${formatRut(ns.rut)}`:"✗ RUT inválido"}</div>}
                </div>
                <div><label className="lbl">Nombre Beneficiario</label><input type="text" value={ns.nombre} onChange={e=>setNs({...ns,nombre:e.target.value})} placeholder="EMPRESA XYZ SPA" className="inp"/></div>
              </div>
              <div className="g3">
                <div><label className="lbl">Banco</label><select value={ns.codigoBanco} onChange={e=>setNs({...ns,codigoBanco:Number(e.target.value)})} className="inp">{BANK_LIST.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                <div><label className="lbl">Tipo de Cuenta</label><select value={ns.tipoCuenta} onChange={e=>setNs({...ns,tipoCuenta:e.target.value})} className="inp">{ACCT_LIST.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="lbl">N° de Cuenta</label><input type="text" value={ns.numeroCuenta} onChange={e=>setNs({...ns,numeroCuenta:e.target.value})} placeholder="Sin guiones" className="inp"/></div>
              </div>
              <div style={{marginBottom:14}}><label className="lbl">Email (opcional)</label><input type="email" value={ns.email} onChange={e=>setNs({...ns,email:e.target.value})} placeholder="correo@ejemplo.cl" className="inp" style={{maxWidth:350}}/></div>
              <button className="bp" onClick={addSup} disabled={adding}>{adding?<Loader2 size={16} className="spn"/>:<UserPlus size={16}/>}{adding?"Guardando...":"Agregar Proveedor"}</button>
            </div>}

            <div style={{position:"relative",marginBottom:16}}><Search size={16} className="sico"/><input type="text" value={supQ} onChange={e=>setSupQ(e.target.value)} placeholder="Filtrar por nombre o RUT..." className="inp" style={{paddingLeft:38}}/></div>

            <div style={{maxHeight:500,overflowY:"auto"}}>
              {filtSups.length===0?<div className="es" style={{padding:30}}>No se encontraron proveedores</div>
              :filtSups.map((s,i)=><div key={i} style={{padding:"10px 14px",borderBottom:"1px solid #1A2236",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{s.nombre}</div>
                  <div className="tm" style={{fontSize:11,marginTop:2}}>{formatRut(s.rut)} · {BANK_MAP[s.codigoBanco]?.name||`Cod ${s.codigoBanco}`} · {s.tipoCuenta} · Cta: {s.numeroCuenta}{s.email&&` · ${s.email}`}</div>
                </div><button className="ib" onClick={()=>delSup(s.rut)}><Trash2 size={14}/></button>
              </div>)}
              {!supQ&&sups.length>50&&<div style={{textAlign:"center",padding:12,color:"#4A5568",fontSize:12}}>Mostrando 50 de {sups.length} · Usa el buscador</div>}
            </div>
          </div>}

          {tab==="config"&&<div>
            <h2 style={{fontSize:16,fontWeight:700,marginBottom:20,display:"flex",alignItems:"center",gap:8}}><Settings size={18} color="#E8952F"/>Configuración</h2>

            <div className="cd" style={{borderColor:conn?"#1A5C2E":"#2D3A50"}}>
              <div className="cdt" style={{display:"flex",alignItems:"center",gap:8}}>{conn?<Cloud size={16} style={{color:"#4ADE80"}}/>:<CloudOff size={16}/>}Conexión Google Sheets{conn&&<span style={{color:"#4ADE80",fontWeight:400,fontSize:11}}>· Conectado</span>}</div>
              <div style={{marginBottom:14}}><label className="lbl">URL del Apps Script (Web App)</label>
                <input type="text" value={cfg.googleSheetsUrl||""} onChange={e=>setCfg({...cfg,googleSheetsUrl:e.target.value.trim()})} placeholder="https://script.google.com/macros/s/xxxxx/exec" className="inp"/>
                <div className="tm" style={{fontSize:11,marginTop:4,lineHeight:1.5}}>Pega la URL del Apps Script de tu Google Sheet. Sin URL, funciona en modo local.</div>
              </div>
              {cfg.googleSheetsUrl&&<button className="bs" onClick={refresh} disabled={syncing} style={{fontSize:12}}>{syncing?<Loader2 size={14} className="spn"/>:<RefreshCw size={14}/>}Probar conexión</button>}
              {syncErr&&<div className="me" style={{marginTop:10}}><XCircle size={14}/>{syncErr}</div>}
            </div>

            <div className="cd">
              <div className="cdt">⚙ Datos Empresa</div>
              <div className="g2">
                <div><label className="lbl">RUT Empresa</label><input value={cfg.rutEmpresa} onChange={e=>setCfg({...cfg,rutEmpresa:e.target.value})} className="inp"/></div>
                <div><label className="lbl">N° Cuenta Cargo</label><input value={cfg.ctaCargo} onChange={e=>setCfg({...cfg,ctaCargo:e.target.value})} className="inp"/></div>
              </div>
              <div className="g2">
                <div><label className="lbl">Tipo de Servicio</label><input value={cfg.tipoServicio} readOnly className="inp" style={{opacity:.6}}/><div className="tm" style={{fontSize:11,marginTop:2}}>005003 – Pago de Proveedores</div></div>
                <div><label className="lbl">Descripción Cabecera</label><input value={cfg.descripcion} onChange={e=>setCfg({...cfg,descripcion:e.target.value})} className="inp"/></div>
              </div>
              <div className="g3">
                <div><label className="lbl">Medio Respaldo</label><input value={cfg.medioRespaldo} readOnly className="inp" style={{opacity:.6,fontSize:11}}/></div>
                <div><label className="lbl">Glosa Cta Origen</label><input value={cfg.glosaCuentaCargo} onChange={e=>setCfg({...cfg,glosaCuentaCargo:e.target.value})} className="inp"/></div>
                <div><label className="lbl">Glosa Cta Destino</label><input value={cfg.glosaCuentaAbono} onChange={e=>setCfg({...cfg,glosaCuentaAbono:e.target.value})} className="inp"/></div>
              </div>
              <div><label className="lbl">Email Notificación</label><input value={cfg.emailNotificacion} onChange={e=>setCfg({...cfg,emailNotificacion:e.target.value})} className="inp" style={{maxWidth:350}}/><div className="tm" style={{fontSize:11,marginTop:2}}>Va en cada registro TXT para recibir comprobantes</div></div>
            </div>

            <div className="cd">
              <div className="cdt">✉ Correo de Autorización</div>
              <div className="g2">
                <div><label className="lbl">Para</label><input value={cfg.para} onChange={e=>setCfg({...cfg,para:e.target.value})} className="inp"/></div>
                <div><label className="lbl">CC</label><input value={cfg.cc} onChange={e=>setCfg({...cfg,cc:e.target.value})} className="inp"/></div>
              </div>
              <div className="g2">
                <div><label className="lbl">Saludo</label><input value={cfg.saludo} onChange={e=>setCfg({...cfg,saludo:e.target.value})} className="inp"/></div>
                <div><label className="lbl">Firma</label><textarea value={cfg.firma} onChange={e=>setCfg({...cfg,firma:e.target.value})} rows={3} className="inp"/></div>
              </div>
            </div>
          </div>}

        </div>
      </div>
    </div>
  );
}
