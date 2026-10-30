import React,{useMemo,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Activity,ArrowDownRight,ArrowRight,Building2,CalendarClock,CheckCircle2,ChevronDown,Command,Filter,Flame,LayoutDashboard,Plus,Search,Settings2,ShieldCheck,Target,Users,Wallet,Workflow,X} from 'lucide-react'
import './workspace.css'
import {Upload,FileSpreadsheet,AlertCircle,Check,ShieldAlert} from 'lucide-react'
import {previewPhoneCsv} from './lib/phone-csv-preview.js'
import {normalizePhone} from './lib/phone-normalization.js'

function classifyImport(parsed,countryHint){
 const seen=new Set()
 const rows=parsed.rows.map(row=>{
  const result=normalizePhone(row.rawPhone,{countryHint})
  const duplicateInBatch=result.status==='valid'&&seen.has(result.normalized)
  if(result.status==='valid')seen.add(result.normalized)
  return {...row,...result,duplicateInBatch}
 })
 return { ...parsed, rows, counts:{valid:rows.filter(r=>r.status==='valid'&&!r.duplicateInBatch).length,duplicates:rows.filter(r=>r.duplicateInBatch).length,review:rows.filter(r=>r.status==='needs_review').length,invalid:rows.filter(r=>r.status==='invalid').length,incomplete:rows.filter(r=>r.status==='incomplete').length} }
}

const stages=['Signal','Intent','Qualified','Matched','Conversation','Inspection','Transaction']
const money=n=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(n||0))
function App(){
 const [leads,setLeads]=useState([])
 const [showForm,setShowForm]=useState(false)
 const [search,setSearch]=useState('')
 const [stageFilter,setStageFilter]=useState('All stages')
 const [form,setForm]=useState({name:'',phone:'',source:'Manual entry',budget:'',location:'',propertyType:'',timeline:'',notes:''})
 const [notice,setNotice]=useState('')
 const [importCountry,setImportCountry]=useState('')
 const [importFileName,setImportFileName]=useState('')
 const [importRaw,setImportRaw]=useState(null)
 const [importPreview,setImportPreview]=useState(null)
 const [importError,setImportError]=useState('')
 const [importReviewed,setImportReviewed]=useState(false)
 async function handleImportFile(event){
  const file=event.target.files?.[0]
  if(!file)return
  setImportError('');setImportPreview(null);setImportRaw(null);setImportReviewed(false)
  try{
   if(!file.name.toLowerCase().endsWith('.csv'))throw new Error('Please select a .csv file.')
   const parsed=previewPhoneCsv(await file.text())
   setImportFileName(file.name);setImportRaw(parsed);setImportPreview(classifyImport(parsed,importCountry))
  }catch(error){setImportError(error.message||'Unable to read this CSV file.');setImportFileName('')}
  event.target.value=''
 }
 function changeImportCountry(value){setImportCountry(value);if(importRaw){setImportPreview(classifyImport(importRaw,value));setImportReviewed(false)}}
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
   <a className="side-link" href="#pipeline"><Workflow size={17}/>Lead pipeline <span className="side-count">{leads.length}</span></a>\n   <a className="side-link" href="#lead-vault-import"><Upload size={17}/>Import contacts</a>
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
   <section id="lead-vault-import" className="import-panel">
    <div className="panel-head import-head"><div><div className="ws-eyebrow"><FileSpreadsheet size={14}/> LEAD VAULT · PHONE DATABASE</div><h2>Import contact records</h2><p>Upload a CSV, validate phone numbers and inspect duplicates before any database action.</p></div><div className="import-safety"><ShieldAlert size={15}/> Preview only · No database writes</div></div>
    <div className="import-controls">
     <label className="country-context">Country context <select value={importCountry} onChange={e=>changeImportCountry(e.target.value)}><option value="">Do not assume a country</option><option value="NG">Nigeria (+234)</option></select><small>Choose Nigeria only when the uploaded national-format numbers are known to be Nigerian. Numbers with + prefix are parsed internationally.</small></label>
     <label className="upload-drop"><input type="file" accept=".csv,text/csv" onChange={handleImportFile}/><Upload size={20}/><b>Choose CSV file</b><span>Maximum 5 MB · Up to 10,000 rows · Phone column required</span></label>
    </div>
    {importError&&<div className="import-error"><AlertCircle size={16}/>{importError}</div>}
    {importPreview&&<div className="import-results">
     <div className="import-file-line"><b>{importFileName}</b><span>{importPreview.totalRows.toLocaleString()} source rows</span></div>
     <div className="import-counts">
      <div><strong>{importPreview.counts.valid}</strong><span>Valid unique</span></div>
      <div><strong>{importPreview.counts.duplicates}</strong><span>Duplicates in file</span></div>
      <div><strong>{importPreview.counts.review}</strong><span>Needs review</span></div>
      <div><strong>{importPreview.counts.invalid}</strong><span>Invalid</span></div>
      <div><strong>{importPreview.counts.incomplete}</strong><span>Incomplete</span></div>
     </div>
     <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Row</th><th>Phone as supplied</th><th>Normalized number</th><th>Validation</th><th>Source / name</th></tr></thead><tbody>{importPreview.rows.slice(0,12).map(row=><tr key={row.sourceRowKey}><td>{row.rowNumber}</td><td>{row.rawPhone||'—'}</td><td>{row.normalized||'—'}</td><td><span className={'import-status status-'+(row.duplicateInBatch?'duplicate':row.status)}>{row.duplicateInBatch?'Duplicate in file':row.status.replace('_',' ')}</span>{row.reason&&<small>{row.reason.replaceAll('_',' ')}</small>}</td><td>{[row.suppliedName,row.sourceReference].filter(Boolean).join(' · ')||'—'}</td></tr>)}</tbody></table></div>
     {importPreview.rows.length>12&&<p className="import-more">Showing first 12 rows of {importPreview.rows.length.toLocaleString()}. All rows are included in the preview counts.</p>}
     {importPreview.ignoredEmailColumn&&<p className="import-note">An email column was detected but intentionally excluded from this phone-only import stage.</p>}
     <div className="import-review-foot"><span><AlertCircle size={15}/> Existing database duplicates cannot be checked until the DPF database is connected.</span><button className="secondary-action" onClick={()=>setImportReviewed(true)}><Check size={15}/> Mark preview reviewed</button></div>
     {importReviewed&&<div className="import-reviewed"><Check size={15}/> Preview reviewed in this browser session. No records were saved, merged, exported or contacted.</div>}
    </div>}
    {!importPreview&&!importError&&<div className="import-empty">Your import preview will appear here. Original phone values and source-row positions will be preserved for review.</div>}
   </section>
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
