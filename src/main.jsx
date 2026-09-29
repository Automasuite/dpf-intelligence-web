import React,{useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createClient} from '@supabase/supabase-js'
import {Search,MapPin,ShieldCheck,ArrowRight,SlidersHorizontal,Sparkles} from 'lucide-react'
import './styles.css'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=url&&key?createClient(url,key):null

function App(){
 const [properties,setProperties]=useState([]),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[location,setLocation]=useState('All locations')
 useEffect(()=>{(async()=>{if(!supabase){setLoading(false);return} const {data,error}=await supabase.from('dpf_public_property_catalog').select('*').limit(100); if(!error)setProperties(data||[]); setLoading(false)})()},[])
 const filtered=properties.filter(p=>{const text=JSON.stringify(p).toLowerCase(); return text.includes(query.toLowerCase())&&(location==='All locations'||String(p.city||'').toLowerCase()===location.toLowerCase())})
 const locations=[...new Set(properties.map(p=>p.city).filter(Boolean))]
 return <div className="app">
  <header className="nav"><div className="brand"><span className="mark">D</span><div><b>Digital Property Finder</b><small>PROPERTY INTELLIGENCE</small></div></div><nav><a href="#discover">Discover</a><a href="#developers">Developers</a><a href="#how">How it works</a></nav><button className="ghost">Talk to an advisor</button></header>
  <main>
   <section className="hero"><div className="eyebrow"><Sparkles size={15}/> Intelligence before investment</div><h1>Find property with<br/><em>clarity, not noise.</em></h1><p>DPF helps you discover credible property opportunities, understand the evidence behind them, and take the next step with confidence.</p>
   <div className="searchbox"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search location, project, property type..." /><select value={location} onChange={e=>setLocation(e.target.value)}><option>All locations</option>{locations.map(x=><option key={x}>{x}</option>)}</select><button onClick={()=>document.getElementById('discover')?.scrollIntoView({behavior:'smooth'})}>Explore</button></div>
   <div className="trust"><span><ShieldCheck size={17}/> Evidence-led</span><span><MapPin size={17}/> Abuja & beyond</span><span>Local + diaspora</span></div></div>
   <div className="hero-card"><div className="orb"></div><div className="signal">DPF INTELLIGENCE</div><strong>From signal<br/>to decision.</strong><p>Prices. Payment plans. Verification. Developer signals. Buyer fit.</p></div></section>
   <section id="discover" className="section"><div className="section-head"><div><span className="kicker">LIVE CATALOGUE</span><h2>Property intelligence</h2></div><span className="count">{loading?'Loading…':filtered.length+' opportunities'}</span></div>
   {!supabase&&<div className="notice">Connect Supabase using <code>.env.local</code> to load the live intelligence catalogue.</div>}
   {supabase&&loading?<div className="empty">Loading current property intelligence…</div>:filtered.length===0?<div className="empty">No matching public property records yet. Our intelligence database is being populated and verified.</div>:
   <div className="grid">{filtered.map(p=><article className="card" key={p.product_id||p.id}><div className="image"><span>{p.property_type||'PROPERTY'}</span><div className="code">{p.product_code}</div></div><div className="card-body"><div className="location"><MapPin size={14}/>{p.city||p.district||'Nigeria'}</div><h3>{p.product_name||p.name}</h3><p>{p.developer_name} · {p.development_name}</p>{p.current_price_amount&&<strong className="price">{p.currency||'NGN'} {Number(p.current_price_amount).toLocaleString()}</strong>}<button className="textbtn">View intelligence <ArrowRight size={15}/></button></div></article>)}</div>}
   </section>
   <section id="how" className="process"><span className="kicker">THE DPF DIFFERENCE</span><h2>Less searching. Better decisions.</h2><div className="steps"><div><b>01</b><h3>Tell us what matters</h3><p>Budget, location, purpose, timeline and payment preference.</p></div><div><b>02</b><h3>We reduce the noise</h3><p>Relevant opportunities are organized around your actual criteria.</p></div><div><b>03</b><h3>See the evidence</h3><p>Understand pricing, payment signals, verification and what still needs confirmation.</p></div></div></section>
  </main><footer><div><b>Digital Property Finder</b><p>Property intelligence, advisory, access and marketing.</p></div><span>Built around evidence. Designed for clarity.</span></footer>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>)