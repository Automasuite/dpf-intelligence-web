import React,{useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {createClient} from '@supabase/supabase-js'
import {Search,MapPin,ShieldCheck,ArrowRight,SlidersHorizontal,Sparkles} from 'lucide-react'
import './styles.css'

const url=import.meta.env.VITE_SUPABASE_URL
const key=import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase=url&&key?createClient(url,key):null

function App(){
 const [heroSlide,setHeroSlide]=useState(0)
 const [properties,setProperties]=useState([]),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[location,setLocation]=useState('All locations')
 useEffect(()=>{const timer=setInterval(()=>setHeroSlide(s=>(s+1)%3),7000);return()=>clearInterval(timer)},[])
 useEffect(()=>{(async()=>{if(!supabase){setLoading(false);return} const {data,error}=await supabase.from('dpf_public_property_catalog').select('*').limit(100); if(!error)setProperties(data||[]); setLoading(false)})()},[])
 const filtered=properties.filter(p=>{const text=JSON.stringify(p).toLowerCase(); return text.includes(query.toLowerCase())&&(location==='All locations'||String(p.city||'').toLowerCase()===location.toLowerCase())})
 const locations=[...new Set(properties.map(p=>p.city).filter(Boolean))]
 return <div className="app">
  <header className="nav"><div className="brand"><img className="brand-logo" src="/dpf-logo.svg" alt="DPF Abuja Property Intelligence logo"/><div><b>Digital Property Finder</b><small>ABUJA PROPERTY INTELLIGENCE</small></div></div><nav><a href="#discover">Discover</a><a href="#developers">Developers</a><a href="#how">How it works</a></nav><button className="ghost">Talk to an advisor</button></header>
  <main>
   <section className="hero-carousel" aria-label="Abuja property intelligence highlights">
    <div className="hero-slides">
     <div className="hero-photo" key={heroSlide} style={{backgroundImage:'url('+['https://www.uil.unesco.org/sites/default/files/structured_data/lc0001/2477234_shutterstock_Tayvay_Abuja%25252C%252520Nigeria.jpg','https://citycancerchallenge.org/uploads/2023/08/DJI_0240-1024x646.png','https://www.unido.org/sites/default/files/styles/article_hero_image/public/2024-03/iStock-1341068644.jpg?itok=btcTgxOP'][heroSlide]+')'}} />
     <div className="hero-shade" />
     <div className="hero-content" key={'copy-'+heroSlide}>
      <div className="eyebrow"><Sparkles size={16}/>{['ABUJA • THE CAPITAL OF OPPORTUNITY','PROPERTY, WITH A WIDER VIEW','YOUR NEXT MOVE STARTS HERE'][heroSlide]}</div>
      <h1>{[
       <>Find your place in<br/><em>Abuja’s next chapter.</em></>,
       <>See beyond the<br/><em>listing.</em></>,
       <>Make your next<br/><em>move count.</em></>
      ][heroSlide]}</h1>
      <p>{[
       'A clearer way to discover property, compare opportunities, and move with confidence.',
       'Explore the details that matter: location, pricing signals, developer information, and buyer fit.',
       'From first search to a confident conversation, let relevant property intelligence guide your next step.'
      ][heroSlide]}</p>
      <div className="hero-actions"><button onClick={()=>document.getElementById('discover')?.scrollIntoView({behavior:'smooth'})}>Explore opportunities <ArrowRight size={16}/></button><a href="#how">How DPF works <span>↗</span></a></div>
      <div className="hero-proof"><span><ShieldCheck size={16}/> Evidence-led intelligence</span><span><MapPin size={16}/> Abuja & beyond</span></div>
     </div>
     <div className="floating-note"><span className="note-dot"/><small>{['THE CITY IN MOTION','PERSPECTIVE THAT MATTERS','BUILT AROUND YOUR GOALS'][heroSlide]}</small><strong>{['Opportunity, mapped.','More signal. Less noise.','Your brief. Your shortlist.'][heroSlide]}</strong><span className="note-detail">{['LOCAL KNOWLEDGE · CLEARER DECISIONS','COMPARE · VERIFY · DECIDE','SMART PROPERTY MATCH · BRIGHTER TOMORROW'][heroSlide]}</span></div>
     <div className="hero-bottom"><div className="hero-index"><b>0{heroSlide+1}</b><span>/ 03</span></div><div className="hero-progress">{[0,1,2].map(i=><button aria-label={'Show slide '+(i+1)} className={heroSlide===i?'active':''} onClick={()=>setHeroSlide(i)} key={i}/>)}</div><div className="hero-controls"><button aria-label="Previous slide" onClick={()=>setHeroSlide((heroSlide+2)%3)}>←</button><button aria-label="Next slide" onClick={()=>setHeroSlide((heroSlide+1)%3)}>→</button></div></div>
    </div>
    <div className="hero-search-wrap"><div className="hero-search-intro"><span className="kicker">START WITH WHAT MATTERS</span><strong>Your search. More intelligently.</strong></div>
     <div className="searchbox"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search location, project, property type..." /><select value={location} onChange={e=>setLocation(e.target.value)}><option>All locations</option>{locations.map(x=><option key={x}>{x}</option>)}</select><button onClick={()=>document.getElementById('discover')?.scrollIntoView({behavior:'smooth'})}>Explore</button></div>
    </div>
   </section>
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