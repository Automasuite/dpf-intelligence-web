import React,{useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Activity,ArrowDownRight,ArrowRight,Building2,CalendarClock,CheckCircle2,ChevronDown,Command,Filter,Flame,LayoutDashboard,Plus,Search,Settings2,ShieldCheck,Target,Users,Wallet,Workflow,X} from 'lucide-react'
import './workspace.css'

const stages=['Signal','Intent','Qualified','Matched','Conversation','Inspection','Transaction']
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(n||0))
function App(){
 const [leads,setLeads]=useState([])
 const [showForm,setShowForm]=useState(false)
 const [search,setSearch]=useState('')
 const [stageFilter,setStageFilter]=useState('All stages')
 const [form,setForm]=useState({name:'',phone:'',source:'Manual entry',budget:'',location:'',propertyType:'',timeline:'',notes:''})
 const [notice,setNotice]=useState('')
 const visible=useMemo(()=>leads.filter(l=>(l.name+' '+l.phone+' '+l.location+' '+l.propertyType).toLowerCase().includes(search.toLowerCase())&&(stageFilter==='All stages'||l.stage===stageFilter)),[leads,search,stageFilter])
 const count=stage=>leads.filter(l=>l.stage===stage).length
 const update=(key,value)=>setForm(f=>({...f,[key]:value}))
 function addLead(e){e.preventDefault();if(!form.name.trim()||!form.phone.trim())return;setLeads(prev=>[{...form,id:Date.now(),stage:'Signal',created:new Date().toLocaleDateString('en-NG'),score:form.budget?62:35},...prev]);setForm({name:'',phone:'',source:'Manual entry',budget:'',location:'',propertyType:'',timeline:'',notes:''});setShowForm(false);setNotice('Lead added to this browser session. Connect the CRM database to save it permanently.');setTimeout(()=>setNotice(''),6000)}
 function moveLead(id,stage){setLeads(prev=>prev.map(l=>l.id===id?{...l,stage}:l))}
 return <div className="workspace">
  <aside className="sidebar">
   <a className="ws-brand" href="/"><span className="ws-monogram">DPF</span><span><b>Digital Property Finder</b><small>INTELLIGENCE SYSTEM</small></span></a>
   <div className="side-label">WORKSPACE</div>
   <a className="side-link selected" href="#overview"><LayoutDashboard size={17}/>Overview</a>
   <a className="side-link" href="#pipeline"><Workflow size={17}/>Lead pipeline <span className="side-count">{leads.length}</span></a>
   <a className="side-link" href="#followups"><CalendarClock size={17}/>Follow-ups</a>
   <a className="side-link" href="#matching"><Building2 size={17}/>Property matching</a>
   <div className="side-label">INTELLIGENCE</div>
   <a className="side-link" href="#signals"><Activity size={17}/>Signal discovery</a>
   <a className="side-link" href="#qualification"><Target size={17}/>Buyer qualification</a>
   <div className="sidebar-bottom"><div className="security-pill"><ShieldCheck size={16}/><span><b>Human-controlled</b><small>Actions require approval</small></span></div><a className="side-link" href="/"><ArrowRight size={16}/>Back to public site</a></div>
  </aside>
  <main className="ws-main">
   <header className="ws-topbar"><div className="crumb">DPF <span>/</span> Intelligence workspace</div><div className="top-actions"><span className="environment"><i/>Prototype environment</span><button className="icon-button" aria-label="Settings"><Settings2 size={18}/></button><div className="avatar">TO</div></div></header>
   <section id="overview" className="ws-page-head"><div><div className="ws-eyebrow"><Command size={14}/> SIGNAL-TO-DEAL OPERATING SYSTEM</div><h1>Lead intelligence <em>workspace.</em></h1><p>Turn market signals into qualified conversations, relevant matches and real property transactions.</p></div><button className="primary-action" onClick={()=>setShowForm(true)}><Plus size={17}/> Add a lead</button></section>
   <div className="prototype-alert"><Activity size={17}/><span><b>Prototype workspace</b> — lead records currently live only in this browser session. CRM persistence, live agent routing and external outreach are not connected yet.</span></div>
   {notice&&<div className="ws-notice"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
   <section className="metric-grid">
    <article className="metric-card"><div className="metric-top"><span>Total leads</span><Users size={17}/></div><strong>{leads.length}</strong><small>{leads.length?'Captured in this session':'Awaiting first verified lead'}</small></article>
    <article className="metric-card"><div className="metric-top"><span>High-intent leads</span><Flame size={17}/></div><strong>{leads.filter(l=>['Qualified','Matched','Conversation','Inspection'].includes(l.stage)).length}</strong><small>Qualified through human review</small></article>
    <article className="metric-card"><div className="metric-top"><span>Pipeline value</span><Wallet size={17}/></div><strong>{money(leads.reduce((s,l)=>s+Number(l.budget||0),0))}</strong><small>Buyer-stated budgets only</small></article>
    <article className="metric-card"><div className="metric-top"><span>Next actions due</span><CalendarClock size={17}/></div><strong>0</strong><small>Follow-up scheduler not connected</small></article>
   </section>
   <section id="pipeline" className="pipeline-panel">
    <div className="panel-head"><div><div className="ws-eyebrow">LIVE WORKFLOW</div><h2>Signal-to-deal pipeline</h2><p>Move each lead forward only when there is evidence for the next stage.</p></div><div className="pipeline-tools"><label className="ws-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search leads"/></label><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option>All stages</option>{stages.map(s=><option key={s}>{s}</option>)}</select><button className="secondary-action" onClick={()=>setShowForm(true)}><Plus size={15}/> Add</button></div></div>
    <div className="pipeline-columns">{stages.map((stage,i)=><div className="pipeline-column" key={stage}><div className="column-title"><span className={'stage-dot dot-'+i}/><b>{stage}</b><span>{count(stage)}</span></div>{visible.filter(l=>l.stage===stage).map(l=><article className="lead-card" key={l.id}><div className="lead-card-top"><span className="lead-source">{l.source}</span><button aria-label="Remove lead" onClick={()=>setLeads(prev=>prev.filter(x=>x.id!==l.id))}><X size={13}/></button></div><b className="lead-name">{l.name}</b><span className="lead-detail">{l.phone}</span><span className="lead-detail">{[l.location,l.propertyType].filter(Boolean).join(' · ')||'Buyer requirements not yet captured'}</span>{l.budget&&<strong className="lead-budget">{money(l.budget)}</strong>}<div className="lead-card-foot"><span><span className="score-dot"/> {l.score} signal score</span><span>{l.created}</span></div><label className="move-label">Move stage <ChevronDown size={12}/><select value={l.stage} onChange={e=>moveLead(l.id,e.target.value)}>{stages.map(s=><option key={s}>{s}</option>)}</select></label></article>)}{visible.filter(l=>l.stage===stage).length===0&&<div className="column-empty">{stage==='Signal'?'Capture a lead or record a market signal.':'Leads move here when the next step is evidenced.'}</div>}</div>)}</div>
   </section>
   <section className="bottom-grid">
    <article id="followups" className="utility-panel"><div className="utility-icon"><CalendarClock size={18}/></div><div><h3>Follow-up queue</h3><p>No follow-up tasks have been scheduled. Once CRM and calendar integrations are enabled, this area will surface overdue and upcoming actions.</p><span className="status-chip">Integration pending</span></div></article>
    <article id="matching" className="utility-panel"><div className="utility-icon"><Building2 size={18}/></div><div><h3>Property match engine</h3><p>Match buyer budget, location, purpose, timeline and payment preference against verified inventory. No match is presented as verified until its source is checked.</p><span className="status-chip">Inventory connection pending</span></div></article>
   </section>
   <section id="signals" className="principle-strip"><div className="principle-symbol"><ArrowDownRight size={22}/></div><div><b>Diagnose before you prescribe.</b><p>Discover the buyer's signal, understand intent and risk, then recommend only when there is a genuine fit.</p></div><div className="principle-flow">SIGNAL <span>→</span> INTENT <span>→</span> QUALIFY <span>→</span> MATCH <span>→</span> GUIDE</div></section>
   <footer className="ws-footer"><span>DPF Abuja Property Intelligence</span><span>Evidence-led decisions · Human-approved actions · Audit-ready by design</span></footer>
  </main>
  {showForm&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowForm(false)}}><form className="lead-modal" onSubmit={addLead}><div className="modal-heading"><div><span className="ws-eyebrow">MANUAL LEAD CAPTURE</span><h2>Add a lead</h2><p>Capture what is known. Leave uncertain details blank.</p></div><button type="button" className="icon-button" onClick={()=>setShowForm(false)} aria-label="Close"><X size={18}/></button></div><div className="form-grid"><label>Full name *<input required value={form.name} onChange={e=>update('name',e.target.value)} placeholder="Buyer or contact name"/></label><label>Phone / WhatsApp *<input required value={form.phone} onChange={e=>update('phone',e.target.value)} placeholder="+234…"/></label><label>Budget (₦)<input type="number" min="0" value={form.budget} onChange={e=>update('budget',e.target.value)} placeholder="Buyer-stated budget"/></label><label>Preferred location<input value={form.location} onChange={e=>update('location',e.target.value)} placeholder="e.g. Lokogoma, Abuja"/></label><label>Property type<input value={form.propertyType} onChange={e=>update('propertyType',e.target.value)} placeholder="Land, apartment, house…"/></label><label>Buying timeline<select value={form.timeline} onChange={e=>update('timeline',e.target.value)}><option value="">Not yet established</option><option>Immediate (0–30 days)</option><option>1–3 months</option><option>3–6 months</option><option>Researching / later</option></select></label><label>Lead source<select value={form.source} onChange={e=>update('source',e.target.value)}><option>Manual entry</option><option>WhatsApp</option><option>Facebook</option><option>Instagram</option><option>Website enquiry</option><option>Referral</option><option>Public listing</option><option>Agent router</option></select></label><label className="wide-field">Notes / unresolved questions<textarea value={form.notes} onChange={e=>update('notes',e.target.value)} placeholder="Need, motivation, concerns, next question…"/></label></div><div className="modal-foot"><span>Saved to session only until database connection is added.</span><button type="button" className="secondary-action" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary-action" type="submit"><Plus size={15}/> Capture lead</button></div></form></div>}
 </div>
}
createRoot(document.getElementById('root')).render(<App/>)
