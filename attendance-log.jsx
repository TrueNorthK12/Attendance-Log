import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Legend
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTRIES_KEY = "atlog-v5-entries";
const NOTES_KEY   = "atlog-v5-notes";
const META_KEY    = "atlog-v5-meta";

// Aesthetic muted palette
const PEOPLE = {
  Matthew: { color: "#5b87a6", role: "You",        accent: "#deeaf2" },
  Joseph:  { color: "#9c6e8c", role: "Your Boss",  accent: "#f2e8f0" },
  Tonia:   { color: "#7a9e7e", role: "Co-worker",  accent: "#e6f2e7" },
  Walt:    { color: "#c4956a", role: "CEO",         accent: "#f7ede0" },
};

const STATUS = {
  ontime:  { label: "On Time", color: "#5b87a6", bg: "#deeaf2" },
  tardy:   { label: "Tardy",   color: "#c4956a", bg: "#f7ede0" },
  unknown: { label: "Unknown", color: "#a8a5a0", bg: "#f2f1ef" },
};

const pc  = n => (PEOPLE[n] || { color: "#a8a5a0" }).color;
const pac = n => (PEOPLE[n] || { accent: "#f2f1ef" }).accent;
const pr  = n => (PEOPLE[n] || { role: "" }).role;

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_ENTRIES = [
  { id:"1",  date:"2026-03-20", person:"Matthew", arrival:"8:24", eta:"" },
  { id:"2",  date:"2026-03-20", person:"Joseph",  arrival:"8:52", eta:"" },
  { id:"3",  date:"2026-03-20", person:"Tonia",   arrival:"",     eta:"9:00" },
  { id:"4",  date:"2026-03-23", person:"Matthew", arrival:"8:23", eta:"" },
  { id:"5",  date:"2026-03-23", person:"Joseph",  arrival:"8:20", eta:"" },
  { id:"6",  date:"2026-03-23", person:"Tonia",   arrival:"8:51", eta:"" },
  { id:"7",  date:"2026-03-23", person:"Walt",    arrival:"8:42", eta:"" },
  { id:"8",  date:"2026-03-24", person:"Matthew", arrival:"8:32", eta:"" },
  { id:"9",  date:"2026-03-24", person:"Tonia",   arrival:"",     eta:"8:45" },
  { id:"10", date:"2026-03-24", person:"Joseph",  arrival:"",     eta:"" },
  { id:"11", date:"2026-03-25", person:"Matthew", arrival:"8:29", eta:"" },
  { id:"12", date:"2026-03-25", person:"Tonia",   arrival:"8:52", eta:"" },
  { id:"13", date:"2026-03-25", person:"Joseph",  arrival:"",     eta:"8:30" },
];

const SEED_NOTES = {
  "2026-03-20": { event: "Email sent re-emphasizing ~8:30 AM arrival expectations", notes: "Tonia's message received at ~9:00 AM indicating she was in transit" },
  "2026-03-24": { event: "", notes: "Tonia present prior to Matthew's arrival. Joseph working from alternate location." },
  "2026-03-25": { event: "Meeting held; arrival expectation formally stated as 8:00 AM", notes: "Joseph present prior to Matthew's arrival." },
};

const SEED_META = { offerLetter: "8:00 AM", verbal: "8:15–8:30 AM", observed: "~8:30 AM", threshold: "8:30" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toMins   = t => { if (!t) return null; const [h,m] = t.split(":").map(Number); return h*60+m; };
const fromMins = m => { if (m == null) return null; return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`; };
const fmt12    = t => { if (!t) return null; const [h,m] = t.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; };
const fmtDate  = s => { if (!s) return ""; const [y,m,d] = s.split("-"); return new Date(+y,+m-1,+d).toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); };
const fmtShort = s => { if (!s) return ""; const [y,m,d] = s.split("-"); return new Date(+y,+m-1,+d).toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
const monthKey = s => s.slice(0,7);
const fmtMonth = mk => { const [y,m] = mk.split("-"); return new Date(+y,+m-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"}); };
const uid      = () => Math.random().toString(36).slice(2)+Date.now();
const dl = (name, content, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content],{type})); a.download = name; a.click(); };

function weekStart(s) {
  const [y,m,d] = s.split("-").map(Number);
  const dt = new Date(y,m-1,d);
  const day = dt.getDay();
  dt.setDate(dt.getDate()+(day===0?-6:1-day));
  return dt.toISOString().slice(0,10);
}
function weekLabel(ws) {
  const [y,m,d] = ws.split("-").map(Number);
  const s = new Date(y,m-1,d), e = new Date(y,m-1,d+6);
  return `${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${e.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
}
function groupByDate(entries) {
  const map = {};
  entries.forEach(e => { if (!map[e.date]) map[e.date]=[]; map[e.date].push(e); });
  return Object.entries(map).sort(([a],[b])=>a.localeCompare(b));
}
function groupByWeek(entries) {
  const map = {};
  entries.forEach(e => { const ws=weekStart(e.date); if (!map[ws]) map[ws]={}; if (!map[ws][e.date]) map[ws][e.date]=[]; map[ws][e.date].push(e); });
  return Object.entries(map).sort(([a],[b])=>a.localeCompare(b))
    .map(([ws,dates])=>[ws,Object.entries(dates).sort(([a],[b])=>a.localeCompare(b))]);
}

// ─── Metrics (person-only) ────────────────────────────────────────────────────

function calcPersonMetrics(entries, thresh) {
  const threshMins = toMins(thresh);
  const map = {};
  entries.forEach(e => {
    if (!map[e.person]) map[e.person] = { onTime:0, tardy:0, unknown:0, times:[], entries:[] };
    const p = map[e.person];
    p.entries.push(e);
    const mins = toMins(e.arrival);
    if (mins === null) p.unknown++;
    else if (mins <= threshMins) p.onTime++;
    else p.tardy++;
    if (mins !== null) p.times.push({ date:e.date, mins });
  });
  Object.entries(map).forEach(([name,p]) => {
    p.total    = p.entries.length;
    const mArr = p.times.map(t=>t.mins);
    p.avgMins  = mArr.length ? Math.round(mArr.reduce((a,b)=>a+b,0)/mArr.length) : null;
    p.earliestMins = mArr.length ? Math.min(...mArr) : null;
    p.latestMins   = mArr.length ? Math.max(...mArr) : null;
    p.onTimePct    = p.total > 0 ? Math.round((p.onTime/p.total)*100) : 0;
    if (p.times.length >= 2) {
      const s = [...p.times].sort((a,b)=>a.date.localeCompare(b.date));
      const h = Math.floor(s.length/2);
      const a1 = s.slice(0,h).map(t=>t.mins).reduce((a,b)=>a+b,0)/h;
      const a2 = s.slice(h).map(t=>t.mins).reduce((a,b)=>a+b,0)/(s.length-h);
      p.trend = a2-a1;
    } else { p.trend = 0; }
    p.color  = pc(name);
    p.accent = pac(name);
    p.role   = pr(name);
  });
  return map;
}

// ─── App ─────────────────────────────────────────────────────────────────────

const TABS = ["Dashboard","Log","Timeline","Export"];

export default function App() {
  const [entries,   setEntries]   = useState(SEED_ENTRIES);
  const [notes,     setNotes]     = useState(SEED_NOTES);
  const [meta,      setMeta]      = useState(SEED_META);
  const [tab,       setTab]       = useState("Dashboard");
  const [fMonth,    setFMonth]    = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [eForm,     setEForm]     = useState({ date:new Date().toISOString().slice(0,10), person:"Matthew", arrival:"", eta:"" });
  const [nForm,     setNForm]     = useState({ date:"", event:"", notes:"" });
  const [editId,    setEditId]    = useState(null);
  const [showEF,    setShowEF]    = useState(false);
  const [showNF,    setShowNF]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const tRef = useRef(null);

  useEffect(()=>{ try{ const e=localStorage.getItem(ENTRIES_KEY); if(e) setEntries(JSON.parse(e)); const n=localStorage.getItem(NOTES_KEY); if(n) setNotes(JSON.parse(n)); const m=localStorage.getItem(META_KEY); if(m) setMeta(JSON.parse(m)); }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem(ENTRIES_KEY,JSON.stringify(entries)); }catch{} },[entries]);
  useEffect(()=>{ try{ localStorage.setItem(NOTES_KEY,JSON.stringify(notes)); }catch{} },[notes]);
  useEffect(()=>{ try{ localStorage.setItem(META_KEY,JSON.stringify(meta)); }catch{} },[meta]);

  const showToast = (msg, type="ok") => { clearTimeout(tRef.current); setToast({msg,type}); tRef.current=setTimeout(()=>setToast(null),2600); };

  const filtered   = useMemo(()=>fMonth==="all"?entries:entries.filter(e=>monthKey(e.date)===fMonth),[entries,fMonth]);
  const months     = useMemo(()=>[...new Set(entries.map(e=>monthKey(e.date)))].sort(),[entries]);
  const personM    = useMemo(()=>calcPersonMetrics(filtered,meta.threshold),[filtered,meta.threshold]);
  const weekGroups = useMemo(()=>groupByWeek(filtered),[filtered]);
  const threshMins = toMins(meta.threshold);

  const entryStatus = e => { const m=toMins(e.arrival); if(m===null) return "unknown"; return m<=threshMins?"ontime":"tardy"; };

  function saveEntry() {
    if (!eForm.date||!eForm.person) { showToast("Date and person required.","err"); return; }
    if (editId) { setEntries(p=>p.map(e=>e.id===editId?{...eForm,id:editId}:e)); setEditId(null); showToast("Updated."); }
    else { setEntries(p=>[...p,{...eForm,id:uid()}]); showToast("Logged."); }
    setEForm(p=>({...p,arrival:"",eta:""})); setShowEF(false);
  }
  function deleteEntry(id) { setEntries(p=>p.filter(e=>e.id!==id)); showToast("Removed.","err"); }
  function startEdit(e) { setEForm({date:e.date,person:e.person,arrival:e.arrival||"",eta:e.eta||""}); setEditId(e.id); setShowEF(true); setTab("Log"); }
  function openNote(date) { const dn=notes[date]||{event:"",notes:""}; setNForm({date,event:dn.event||"",notes:dn.notes||""}); setShowNF(true); }
  function saveNote() { if(!nForm.date){showToast("Pick a date.","err");return;} setNotes(p=>({...p,[nForm.date]:{event:nForm.event,notes:nForm.notes}})); showToast("Note saved."); setShowNF(false); setNForm({date:"",event:"",notes:""}); }
  const toggleWeek = ws => setCollapsed(p=>({...p,[ws]:!p[ws]}));

  const periodLabel = fMonth==="all" ? "All Time" : fmtMonth(fMonth);

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.badge}>CONFIDENTIAL</div>
          <h1 style={S.title}>Attendance Log</h1>
          <p style={S.subtitle}>Professional arrival time documentation</p>
        </div>
        <div style={{display:"flex",gap:28}}>
          {[["Days",[...new Set(entries.map(e=>e.date))].length],["Entries",entries.length],["People",[...new Set(entries.map(e=>e.person))].length]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:"bold",color:"#2a2520",lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",color:"#b5b0a8",marginTop:4}}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {TABS.map(t=>(
          <button key={t} className={`tab-btn${tab===t?" tab-on":""}`} onClick={()=>setTab(t)}>
            {{"Dashboard":"◈ ","Log":"✎ ","Timeline":"◷ ","Export":"↓ "}[t]}{t}
          </button>
        ))}
      </div>

      {/* Period filter */}
      {(tab==="Dashboard"||tab==="Log")&&(
        <div style={S.filterBar}>
          <span style={S.filterLbl}>Period</span>
          <button className={`mpill${fMonth==="all"?" m-on":""}`} onClick={()=>setFMonth("all")}>All Time</button>
          {months.map(mk=>(
            <button key={mk} className={`mpill${fMonth===mk?" m-on":""}`} onClick={()=>setFMonth(mk)}>{fmtMonth(mk)}</button>
          ))}
        </div>
      )}

      <div style={S.body}>

        {/* ════ DASHBOARD ════ */}
        {tab==="Dashboard" && (
          <div>
            <div style={S.periodHeader}>{periodLabel} — Employee Analytics</div>

            {/* Per-person cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:18,marginBottom:32}}>
              {Object.entries(personM).map(([name,m])=>{
                const color = m.color;
                const accent = m.accent;
                const chartData = [...m.times].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>({
                  label: fmtShort(t.date), mins: t.mins, date: t.date
                }));
                const pct = m.onTimePct;
                const pctColor = pct>=80 ? color : pct>=50 ? "#c4956a" : "#b07a7a";

                return (
                  <div key={name} style={S.personCard}>
                    {/* Card top */}
                    <div style={{...S.personCardTop, background: accent}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        <div>
                          <div style={{fontSize:22,fontWeight:"bold",color:"#2a2520",letterSpacing:-0.5}}>{name}</div>
                          <div style={{fontSize:10,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",color:color,marginTop:3}}>{m.role}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:36,fontWeight:"bold",color:pctColor,fontFamily:"monospace",lineHeight:1}}>{pct}<span style={{fontSize:18}}>%</span></div>
                          <div style={{fontSize:10,color:"#b5b0a8",fontFamily:"monospace",marginTop:2}}>on time</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div style={{marginTop:14,height:6,background:"rgba(0,0,0,0.08)",borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width .8s cubic-bezier(.4,0,.2,1)"}}/>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div style={S.personStatsRow}>
                      {[
                        ["On Time", m.onTime, STATUS.ontime.color, STATUS.ontime.bg],
                        ["Tardy",   m.tardy,  STATUS.tardy.color,  STATUS.tardy.bg],
                        ["Unknown", m.unknown,STATUS.unknown.color, STATUS.unknown.bg],
                        ["Days",    m.total,  "#2a2520",           "#f7f5f2"],
                      ].map(([l,v,c,bg])=>(
                        <div key={l} style={{textAlign:"center",background:bg,borderRadius:4,padding:"9px 6px"}}>
                          <div style={{fontSize:20,fontWeight:"bold",color:c,fontFamily:"monospace",lineHeight:1}}>{v}</div>
                          <div style={{fontSize:9,color:"#b5b0a8",fontFamily:"monospace",letterSpacing:0.8,textTransform:"uppercase",marginTop:3}}>{l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Arrival chart */}
                    <div style={{padding:"14px 18px 4px"}}>
                      {chartData.length>=2 ? (
                        <>
                          <div style={{fontSize:9,fontFamily:"monospace",color:"#c0bbb4",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Arrival History</div>
                          <ResponsiveContainer width="100%" height={88}>
                            <LineChart data={chartData} margin={{top:4,right:6,bottom:0,left:0}}>
                              <CartesianGrid strokeDasharray="2 4" stroke="#f0ede8" vertical={false}/>
                              <XAxis dataKey="label" tick={{fontSize:10,fontFamily:"monospace",fill:"#c0bbb4"}} axisLine={false} tickLine={false}/>
                              <YAxis domain={["auto","auto"]} hide/>
                              <Tooltip
                                contentStyle={{fontFamily:"monospace",fontSize:11,border:`1px solid ${color}44`,borderRadius:4,padding:"6px 12px",background:"#fff",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}
                                formatter={v=>[fmt12(fromMins(v)),"Arrival"]}
                                labelStyle={{color:"#b5b0a8",marginBottom:2}}
                              />
                              <ReferenceLine y={threshMins} stroke={STATUS.tardy.color} strokeDasharray="3 3" strokeOpacity={0.45} strokeWidth={1.5}/>
                              <Line type="monotone" dataKey="mins" stroke={color} strokeWidth={2.5} dot={{fill:color,r:3.5,strokeWidth:0}} activeDot={{r:5,strokeWidth:0,fill:color}}/>
                            </LineChart>
                          </ResponsiveContainer>
                          <div style={{fontSize:9,color:STATUS.tardy.color,fontFamily:"monospace",textAlign:"center",opacity:0.55,marginBottom:4}}>— threshold: {fmt12(meta.threshold)}</div>
                        </>
                      ) : chartData.length===1 ? (
                        <div style={{textAlign:"center",padding:"16px 0"}}>
                          <div style={{fontSize:26,fontFamily:"monospace",color,fontWeight:"bold"}}>{fmt12(fromMins(chartData[0].mins))}</div>
                          <div style={{fontSize:10,color:"#b5b0a8",fontFamily:"monospace",marginTop:3}}>Single recorded arrival</div>
                        </div>
                      ) : (
                        <div style={{textAlign:"center",padding:"16px 0",color:"#c0bbb4",fontSize:12,fontStyle:"italic"}}>No arrival times recorded</div>
                      )}
                    </div>

                    {/* Footer stats */}
                    <div style={{padding:"8px 18px 16px",display:"flex",flexWrap:"wrap",gap:"6px 18px",fontSize:11,fontFamily:"monospace",color:"#b5b0a8",borderTop:"1px solid #f0ede8",marginTop:6}}>
                      {m.earliestMins!=null&&<span>⬆ Earliest <strong style={{color:STATUS.ontime.color}}>{fmt12(fromMins(m.earliestMins))}</strong></span>}
                      {m.latestMins!=null&&<span>⬇ Latest <strong style={{color:STATUS.tardy.color}}>{fmt12(fromMins(m.latestMins))}</strong></span>}
                      {m.avgMins!=null&&<span>∅ Avg <strong style={{color}}>{fmt12(fromMins(m.avgMins))}</strong></span>}
                      {m.times.length>=2&&m.trend!==0&&(
                        <span style={{color:m.trend>0?STATUS.tardy.color:STATUS.ontime.color}}>
                          {m.trend>0?"↑ trending later":"↓ trending earlier"} <strong>({Math.round(Math.abs(m.trend))}m)</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparative bar chart */}
            {Object.keys(personM).length>1&&(
              <div style={S.card}>
                <div style={S.cardTitle}>Attendance Comparison — {periodLabel}</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={Object.entries(personM).map(([name,m])=>({
                      name, "On Time":m.onTime, Tardy:m.tardy, Unknown:m.unknown
                    }))}
                    barCategoryGap="38%" margin={{top:4,right:12,bottom:4,left:-12}}
                  >
                    <CartesianGrid strokeDasharray="2 4" stroke="#f0ede8" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:12,fontFamily:"monospace",fill:"#8a857e"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:11,fontFamily:"monospace",fill:"#c0bbb4"}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{fontFamily:"monospace",fontSize:11,border:"1px solid #e8e4de",borderRadius:4,padding:"8px 14px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}} cursor={{fill:"#f7f5f2"}}/>
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{fontSize:11,fontFamily:"monospace",color:"#8a857e"}}/>
                    <Bar dataKey="On Time" fill={STATUS.ontime.color} radius={[3,3,0,0]}/>
                    <Bar dataKey="Tardy"   fill={STATUS.tardy.color}  radius={[3,3,0,0]}/>
                    <Bar dataKey="Unknown" fill={STATUS.unknown.color} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ════ LOG ════ */}
        {tab==="Log"&&(
          <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>

              {!showEF&&!showNF&&(
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <button className="primary-btn" onClick={()=>{setEditId(null);setShowEF(true);}}>+ Log Arrival</button>
                  <button className="ghost-btn" onClick={()=>{setNForm({date:new Date().toISOString().slice(0,10),event:"",notes:""});setShowNF(true);}}>+ Day Note</button>
                </div>
              )}

              {showEF&&(
                <div style={{...S.card,marginBottom:14}}>
                  <h3 style={S.miniTitle}>{editId?"Edit Arrival":"Log Arrival"}</h3>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                    <Field label="Date"><input type="date" style={S.input} value={eForm.date} onChange={e=>setEForm(p=>({...p,date:e.target.value}))}/></Field>
                    <Field label="Person">
                      <select style={S.input} value={eForm.person} onChange={e=>setEForm(p=>({...p,person:e.target.value}))}>
                        {Object.keys(PEOPLE).map(p=><option key={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="Arrival Time"><input type="time" style={S.input} value={eForm.arrival} onChange={e=>setEForm(p=>({...p,arrival:e.target.value}))}/></Field>
                    {!eForm.arrival&&(
                      <Field label="Est. Arrival (if unknown)" fullWidth>
                        <input type="time" style={S.input} value={eForm.eta} onChange={e=>setEForm(p=>({...p,eta:e.target.value}))}/>
                      </Field>
                    )}
                  </div>
                  <div style={S.btnRow}>
                    <button className="ghost-btn" onClick={()=>{setShowEF(false);setEditId(null);}}>Cancel</button>
                    <button className="primary-btn" onClick={saveEntry}>{editId?"Save":"Log"}</button>
                  </div>
                </div>
              )}

              {showNF&&(
                <div style={{...S.card,marginBottom:14,borderLeft:"3px solid #9c6e8c"}}>
                  <h3 style={S.miniTitle}>Day Note <span style={{fontSize:11,color:"#c0bbb4",fontWeight:"normal"}}>(not tied to any person)</span></h3>
                  <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
                    <Field label="Date"><input type="date" style={S.input} value={nForm.date} onChange={e=>{const d=e.target.value;const dn=notes[d]||{event:"",notes:""};setNForm({date:d,event:dn.event||"",notes:dn.notes||""});}}/></Field>
                    <Field label="Event"><input style={S.input} value={nForm.event} onChange={e=>setNForm(p=>({...p,event:e.target.value}))} placeholder="e.g. Meeting re: arrival expectations"/></Field>
                    <Field label="Notes"><textarea style={{...S.input,minHeight:70,resize:"vertical",lineHeight:1.7}} value={nForm.notes} onChange={e=>setNForm(p=>({...p,notes:e.target.value}))} placeholder="Context for this day..."/></Field>
                  </div>
                  <div style={S.btnRow}>
                    <button className="ghost-btn" onClick={()=>setShowNF(false)}>Cancel</button>
                    <button className="primary-btn" onClick={saveNote}>Save Note</button>
                  </div>
                </div>
              )}

              {weekGroups.length===0&&<div style={{color:"#c0bbb4",fontStyle:"italic",fontSize:14,textAlign:"center",padding:"48px 0"}}>No entries for this period.</div>}
              {weekGroups.map(([ws,datePairs])=>{
                const wEntries = datePairs.flatMap(([,e])=>e);
                const wm = calcPersonMetrics(wEntries, meta.threshold);
                const col = collapsed[ws];
                const onTimeTotal  = Object.values(wm).reduce((s,m)=>s+m.onTime,0);
                const tardyTotal   = Object.values(wm).reduce((s,m)=>s+m.tardy,0);
                const unknownTotal = Object.values(wm).reduce((s,m)=>s+m.unknown,0);
                return (
                  <div key={ws} style={S.weekBlock}>
                    <div style={S.weekHdr} onClick={()=>toggleWeek(ws)}>
                      <span style={{fontSize:10,color:"#c0bbb4",marginRight:6,fontFamily:"monospace"}}>{col?"▶":"▼"}</span>
                      <span style={{fontSize:12,fontFamily:"monospace",color:"#6a6560",flex:1,letterSpacing:0.5}}>Week of {weekLabel(ws)}</span>
                      <div style={{display:"flex",gap:6}}>
                        {onTimeTotal>0&&<Chip label={`${onTimeTotal} on time`} c={STATUS.ontime.color} bg={STATUS.ontime.bg}/>}
                        {tardyTotal>0&&<Chip label={`${tardyTotal} tardy`} c={STATUS.tardy.color} bg={STATUS.tardy.bg}/>}
                        {unknownTotal>0&&<Chip label={`${unknownTotal} unknown`} c={STATUS.unknown.color} bg={STATUS.unknown.bg}/>}
                      </div>
                    </div>
                    {!col&&(
                      <div>
                        {datePairs.map(([date,dayEntries])=>{
                          const dn=notes[date]; const hasN=dn&&(dn.event||dn.notes);
                          return (
                            <div key={date} style={S.dateGroup}>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                                <span style={{fontSize:11,fontFamily:"monospace",letterSpacing:1.5,textTransform:"uppercase",color:"#b5b0a8"}}>{fmtDate(date)}</span>
                                {hasN
                                  ?<button className="note-chip" onClick={()=>openNote(date)}>✎ Note</button>
                                  :<button className="note-chip add" onClick={()=>openNote(date)}>+ Note</button>
                                }
                              </div>
                              {hasN&&(
                                <div style={S.noteInline}>
                                  {dn.event&&<span style={{color:"#9c6e8c",fontSize:12,lineHeight:1.6}}>⚡ {dn.event}</span>}
                                  {dn.notes&&<span style={{fontStyle:"italic",color:"#8a857e",fontSize:12,lineHeight:1.6}}>{dn.notes}</span>}
                                </div>
                              )}
                              {dayEntries.map(e=>{
                                const st=entryStatus(e);
                                return (
                                  <div key={e.id} style={S.entryRow}>
                                    <div style={{width:9,height:9,borderRadius:"50%",background:pc(e.person),flexShrink:0}}/>
                                    <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"2px 10px",alignItems:"center"}}>
                                      <span style={{fontSize:13,fontWeight:"bold",color:pc(e.person)}}>{e.person}</span>
                                      <span style={{fontSize:9,fontFamily:"monospace",letterSpacing:1.2,textTransform:"uppercase",color:"#c0bbb4"}}>{pr(e.person)}</span>
                                      <span style={{fontSize:13,fontFamily:"monospace",color:"#2a2520",marginLeft:"auto"}}>
                                        {e.arrival
                                          ?fmt12(e.arrival)
                                          :<span style={{color:"#b5b0a8"}}>Unknown{e.eta?` (est. ~${fmt12(e.eta)})`:""}</span>
                                        }
                                      </span>
                                      <SChip st={st}/>
                                    </div>
                                    <div style={{display:"flex",gap:2,flexShrink:0}}>
                                      <button className="icon-btn" onClick={()=>startEdit(e)}>✎</button>
                                      <button className="icon-btn" onClick={()=>deleteEntry(e.id)}>✕</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Sidebar: per-person only ── */}
            <div style={S.sidebar}>
              <div style={S.sidebarPeriod}>{periodLabel}</div>
              {Object.entries(personM).map(([name,m])=>(
                <div key={name} style={S.sbPerson}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:"bold",color:m.color}}>{name}</span>
                      <span style={{fontSize:9,display:"block",fontFamily:"monospace",letterSpacing:1.2,textTransform:"uppercase",color:"#c0bbb4",marginTop:1}}>{m.role}</span>
                    </div>
                    <span style={{fontSize:18,fontWeight:"bold",fontFamily:"monospace",color:m.onTimePct>=80?m.color:m.onTimePct>=50?STATUS.tardy.color:"#b07a7a"}}>{m.onTimePct}%</span>
                  </div>
                  <div style={{height:5,background:"#f0ede8",borderRadius:3,overflow:"hidden",marginBottom:5}}>
                    <div style={{height:"100%",width:`${m.onTimePct}%`,background:m.color,borderRadius:3}}/>
                  </div>
                  <div style={{display:"flex",gap:8,fontSize:10,fontFamily:"monospace",color:"#b5b0a8"}}>
                    <span style={{color:STATUS.ontime.color}}>{m.onTime} on time</span>
                    <span>·</span>
                    <span style={{color:STATUS.tardy.color}}>{m.tardy} tardy</span>
                    {m.unknown>0&&<><span>·</span><span>{m.unknown} unk.</span></>}
                  </div>
                  {m.avgMins&&<div style={{fontSize:10,fontFamily:"monospace",color:"#c0bbb4",marginTop:3}}>avg {fmt12(fromMins(m.avgMins))}</div>}
                </div>
              ))}
              {Object.keys(personM).length===0&&(
                <div style={{color:"#c0bbb4",fontSize:12,fontStyle:"italic",textAlign:"center",padding:"16px 0"}}>No data</div>
              )}
            </div>
          </div>
        )}

        {/* ════ TIMELINE ════ */}
        {tab==="Timeline"&&(
          <div>
            {groupByDate(entries).map(([date,dayEntries])=>{
              const dn=notes[date]; const hasN=dn&&(dn.event||dn.notes);
              return (
                <div key={date} style={{marginBottom:44}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
                    <div style={{flex:1,height:1,background:"#e8e4de"}}/>
                    <span style={{fontSize:11,fontFamily:"monospace",letterSpacing:2.5,color:"#b5b0a8",textTransform:"uppercase",whiteSpace:"nowrap"}}>{fmtDate(date)}</span>
                    <div style={{flex:1,height:1,background:"#e8e4de"}}/>
                  </div>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <div style={{position:"relative",display:"flex",flexDirection:"column",gap:10,paddingLeft:30,minWidth:260,maxWidth:400}}>
                      <div style={{position:"absolute",left:8,top:0,bottom:0,width:2,background:"#e8e4de",borderRadius:2}}/>
                      {dayEntries.map(e=>(
                        <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,position:"relative"}}>
                          <div style={{width:18,height:18,borderRadius:"50%",background:pc(e.person),border:"2px solid #fff",boxShadow:`0 0 0 3px ${pac(e.person)}`,flexShrink:0,position:"absolute",left:-6,zIndex:2}}/>
                          <div style={{background:"#fff",border:"1px solid #e8e4de",borderLeft:`3px solid ${pc(e.person)}`,borderRadius:4,display:"flex",alignItems:"center",padding:"10px 12px",gap:10,flex:1,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                            <div style={{flex:1,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                              <div>
                                <div style={{fontSize:14,fontWeight:"bold",color:pc(e.person)}}>{e.person}</div>
                                <div style={{fontSize:9,fontFamily:"monospace",letterSpacing:1.2,textTransform:"uppercase",color:"#c0bbb4",marginTop:2}}>{pr(e.person)}</div>
                              </div>
                              <div style={{textAlign:"right"}}>
                                <div style={{fontSize:18,fontFamily:"monospace",color:"#2a2520"}}>{e.arrival?fmt12(e.arrival):"—"}</div>
                                {!e.arrival&&e.eta&&<div style={{fontSize:11,color:"#b5b0a8",fontFamily:"monospace"}}>est. ~{fmt12(e.eta)}</div>}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column"}}>
                              <button className="icon-btn" onClick={()=>startEdit(e)}>✎</button>
                              <button className="icon-btn" onClick={()=>deleteEntry(e.id)}>✕</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {hasN&&(
                      <>
                        <div style={{display:"flex",alignItems:"center",flexShrink:0,padding:"0 6px"}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:"#c0bbb4"}}/>
                          <div style={{width:48,borderTop:"1.5px dashed #c0bbb4"}}/>
                          <div style={{width:7,height:7,borderRadius:"50%",background:"#c0bbb4"}}/>
                        </div>
                        <div style={{flex:1,display:"flex",alignItems:"center"}}>
                          <div style={{background:"#fff",border:"1px solid #e8e4de",borderRadius:6,padding:"14px 16px",flex:1,maxWidth:420,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                            <div style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",fontFamily:"monospace",color:"#c0bbb4",marginBottom:10}}>Day Note</div>
                            {dn.event&&<div style={{fontSize:12,color:"#9c6e8c",fontFamily:"monospace",lineHeight:1.6,marginBottom:6}}>⚡ {dn.event}</div>}
                            {dn.notes&&<div style={{fontSize:13,color:"#6a6560",fontStyle:"italic",lineHeight:1.8}}>{dn.notes}</div>}
                          </div>
                        </div>
                      </>
                    )}
                    {!hasN&&<div style={{flex:1}}/>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ════ EXPORT ════ */}
        {tab==="Export"&&(
          <div style={S.card}>
            <div style={S.cardTitle}>Export</div>
            <p style={{color:"#b5b0a8",fontSize:14,marginBottom:24}}><strong style={{color:"#2a2520"}}>{entries.length} entries</strong> across <strong style={{color:"#2a2520"}}>{[...new Set(entries.map(e=>e.date))].length} days</strong>.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(195px,1fr))",gap:16,marginBottom:32}}>
              {[
                {icon:"◻",title:"Plain Text",desc:"Formatted document ready to save or print.",label:"Download .txt",fn:()=>{
                  const lines=["ATTENDANCE LOG","=".repeat(50),""];
                  groupByDate(entries).forEach(([date,dE])=>{lines.push(fmtDate(date).toUpperCase());lines.push("-".repeat(40));dE.forEach(e=>{let l=`  ${e.person} (${pr(e.person)}): ${e.arrival?fmt12(e.arrival):"Unknown"}`;if(!e.arrival&&e.eta)l+=` (est. ~${fmt12(e.eta)})`;lines.push(l);});const dn=notes[date];if(dn?.event)lines.push(`  EVENT: ${dn.event}`);if(dn?.notes)lines.push(`  NOTE:  ${dn.notes}`);lines.push("");});
                  dl("attendance-log.txt",lines.join("\n"),"text/plain");
                }},
                {icon:"◻",title:"CSV Spreadsheet",desc:"Import into Excel or Google Sheets.",label:"Download .csv",fn:()=>{
                  const hdr=["Date","Person","Role","Arrival","Est. Arrival","Status","Day Event","Day Notes"];
                  const thresh=toMins(meta.threshold);
                  const rows=entries.map(e=>{const m=toMins(e.arrival);const st=m===null?"Unknown":m<=thresh?"On Time":"Tardy";return[fmtDate(e.date),e.person,pr(e.person),e.arrival?fmt12(e.arrival):"",e.eta?fmt12(e.eta):"",st,notes[e.date]?.event||"",notes[e.date]?.notes||""];});
                  dl("attendance-log.csv",[hdr,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"),"text/csv");
                }},
                {icon:"◻",title:"Copy to Clipboard",desc:"Paste into email, Word, or notes app.",label:"Copy Text",fn:()=>{
                  const lines=[];groupByDate(entries).forEach(([date,dE])=>{lines.push(fmtDate(date));dE.forEach(e=>{let l=`  ${e.person}: ${e.arrival?fmt12(e.arrival):"Unknown"}`;if(!e.arrival&&e.eta)l+=` (est. ~${fmt12(e.eta)})`;lines.push(l);});const dn=notes[date];if(dn?.event)lines.push(`  EVENT: ${dn.event}`);if(dn?.notes)lines.push(`  NOTE: ${dn.notes}`);lines.push("");});
                  navigator.clipboard.writeText(lines.join("\n")).then(()=>showToast("Copied!")).catch(()=>showToast("Failed.","err"));
                }},
              ].map(({icon,title,desc,label,fn})=>(
                <div key={title} style={{background:"#faf8f5",border:"1px solid #e8e4de",borderRadius:6,padding:20,display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{fontSize:11,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase",color:"#b5b0a8",marginBottom:4}}>{title}</div>
                  <div style={{fontSize:12,color:"#a8a5a0",lineHeight:1.7,flex:1}}>{desc}</div>
                  <button className="ex-btn" onClick={fn}>{label}</button>
                </div>
              ))}
            </div>
            <div style={{borderTop:"1px solid #f0ede8",paddingTop:20}}>
              <p style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",fontFamily:"monospace",color:"#c0bbb4",marginBottom:12}}>On-Time Threshold</p>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <input type="time" style={{...S.input,maxWidth:140}} value={meta.threshold} onChange={e=>setMeta(p=>({...p,threshold:e.target.value}))}/>
                <span style={{fontSize:12,color:"#a8a5a0"}}>Currently <strong style={{color:"#2a2520"}}>{fmt12(meta.threshold)}</strong> — arrivals at or before this are "on time"</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast&&<div style={{...S.toast,background:toast.type==="err"?"#b07a7a":"#7a9e7e"}}>{toast.type==="err"?"✕":"✓"} {toast.msg}</div>}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({label,children,fullWidth}) {
  return (
    <div style={{gridColumn:fullWidth?"1 / -1":undefined}}>
      <label style={{display:"block",fontSize:9,letterSpacing:1.8,textTransform:"uppercase",fontFamily:"monospace",color:"#b5b0a8",marginBottom:5}}>{label}</label>
      {children}
    </div>
  );
}

function Chip({label,c,bg}) {
  return <span style={{fontSize:10,fontFamily:"monospace",padding:"3px 9px",borderRadius:20,color:c,background:bg,letterSpacing:0.5}}>{label}</span>;
}

function SChip({st}) {
  const s=STATUS[st]||STATUS.unknown;
  return <span style={{fontSize:9,fontFamily:"monospace",padding:"2px 8px",borderRadius:20,color:s.color,background:s.bg,letterSpacing:0.8,textTransform:"uppercase",flexShrink:0}}>{s.label}</span>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root:        { minHeight:"100vh", background:"#f4f1ed", color:"#2a2520", fontFamily:"'Georgia','Times New Roman',serif", paddingBottom:60 },
  header:      { display:"flex", justifyContent:"space-between", alignItems:"flex-end", padding:"28px 36px 22px", borderBottom:"1px solid #e8e4de", flexWrap:"wrap", gap:16, background:"#fff" },
  badge:       { display:"inline-block", fontSize:9, letterSpacing:3, color:"#9c6e8c", border:"1px solid #9c6e8c", padding:"3px 10px", marginBottom:10, fontFamily:"monospace" },
  title:       { margin:0, fontSize:26, fontWeight:"normal", letterSpacing:-0.5, color:"#2a2520" },
  subtitle:    { margin:"5px 0 0", fontSize:12, color:"#b5b0a8", fontStyle:"italic", fontFamily:"monospace" },
  tabBar:      { display:"flex", borderBottom:"1px solid #e8e4de", padding:"0 36px", background:"#fff" },
  filterBar:   { display:"flex", alignItems:"center", gap:8, padding:"10px 36px", background:"#fff", borderBottom:"1px solid #ede9e3", flexWrap:"wrap" },
  filterLbl:   { fontSize:9, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase", color:"#c0bbb4", marginRight:4 },
  body:        { padding:"22px 36px", maxWidth:1160, margin:"0 auto" },
  periodHeader:{ fontSize:10, fontFamily:"monospace", letterSpacing:2.5, textTransform:"uppercase", color:"#b5b0a8", marginBottom:20 },
  card:        { background:"#fff", border:"1px solid #e8e4de", borderRadius:6, padding:22 },
  cardTitle:   { fontSize:12, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase", color:"#b5b0a8", marginBottom:16, paddingBottom:12, borderBottom:"1px solid #f0ede8" },
  miniTitle:   { margin:"0 0 14px", fontSize:14, fontWeight:"bold", color:"#2a2520" },
  input:       { width:"100%", background:"#faf8f5", border:"1px solid #e0dbd4", color:"#2a2520", padding:"8px 11px", fontSize:13, fontFamily:"Georgia,serif", outline:"none", borderRadius:3, boxSizing:"border-box" },
  btnRow:      { marginTop:14, display:"flex", gap:10, justifyContent:"flex-end" },

  personCard:    { background:"#fff", border:"1px solid #e8e4de", borderRadius:8, overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" },
  personCardTop: { padding:"20px 20px 16px" },
  personStatsRow:{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, padding:"14px 20px" },

  weekBlock: { marginBottom:10, border:"1px solid #e8e4de", borderRadius:6, overflow:"hidden", background:"#fff" },
  weekHdr:   { display:"flex", alignItems:"center", gap:8, padding:"11px 16px", cursor:"pointer", background:"#faf8f5", userSelect:"none" },
  dateGroup: { padding:"10px 16px 8px", borderTop:"1px solid #f5f1ec" },
  noteInline:{ display:"flex", flexDirection:"column", gap:4, padding:"8px 12px", background:"#fdf9ff", borderLeft:"2px solid #c8a8c0", borderRadius:"0 4px 4px 0", marginBottom:8 },
  entryRow:  { display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:"1px solid #faf7f3" },

  sidebar:      { width:200, flexShrink:0, background:"#fff", border:"1px solid #e8e4de", borderRadius:6, padding:16, position:"sticky", top:20, alignSelf:"flex-start" },
  sidebarPeriod:{ fontSize:9, fontFamily:"monospace", letterSpacing:2.5, textTransform:"uppercase", color:"#c0bbb4", marginBottom:16 },
  sbPerson:     { marginBottom:16, paddingBottom:16, borderBottom:"1px solid #f5f1ec" },

  toast: { position:"fixed", bottom:24, right:24, padding:"11px 20px", borderRadius:4, fontSize:13, fontFamily:"monospace", color:"#fff", zIndex:999, boxShadow:"0 4px 16px rgba(0,0,0,0.1)" },
};

const CSS=`
  *{box-sizing:border-box;}
  input[type=date]::-webkit-calendar-picker-indicator,input[type=time]::-webkit-calendar-picker-indicator{cursor:pointer;opacity:0.35;}
  input:focus,textarea:focus,select:focus{border-color:#5b87a6!important;box-shadow:0 0 0 2px rgba(91,135,166,0.1);}
  .icon-btn{background:none;border:none;cursor:pointer;font-size:13px;padding:2px 6px;opacity:0.3;transition:opacity .15s;color:#2a2520;font-family:monospace;}
  .icon-btn:hover{opacity:0.9;}
  .tab-btn{background:none;border:none;color:#b5b0a8;padding:12px 18px;cursor:pointer;font-size:12px;font-family:monospace;letter-spacing:1px;border-bottom:2px solid transparent;transition:all .15s;}
  .tab-on{color:#2a2520!important;border-bottom:2px solid #2a2520!important;}
  .mpill{background:none;border:1px solid #e8e4de;color:#a8a5a0;padding:4px 14px;font-size:10px;font-family:monospace;cursor:pointer;border-radius:20px;transition:all .15s;letter-spacing:0.5px;}
  .mpill:hover{border-color:#8a857e;color:#6a6560;}
  .m-on{background:#2a2520!important;color:#fff!important;border-color:#2a2520!important;}
  .primary-btn{background:#2a2520;color:#fff;border:none;padding:9px 22px;font-size:11px;font-family:monospace;letter-spacing:1.5px;cursor:pointer;font-weight:bold;border-radius:3px;transition:opacity .15s;}
  .primary-btn:hover{opacity:0.78;}
  .ghost-btn{background:none;color:#8a857e;border:1px solid #e0dbd4;padding:9px 16px;font-size:11px;font-family:monospace;cursor:pointer;border-radius:3px;transition:all .15s;letter-spacing:0.5px;}
  .ghost-btn:hover{border-color:#8a857e;color:#2a2520;}
  .ex-btn{background:none;border:1px solid #2a2520;color:#2a2520;padding:8px 0;font-size:10px;font-family:monospace;letter-spacing:1.5px;cursor:pointer;border-radius:3px;width:100%;transition:all .15s;text-transform:uppercase;}
  .ex-btn:hover{background:#2a2520;color:#fff;}
  .note-chip{background:none;border:1px solid #c8a8c0;color:#9c6e8c;padding:2px 9px;font-size:10px;font-family:monospace;cursor:pointer;border-radius:3px;transition:all .15s;}
  .note-chip:hover{background:#9c6e8c;color:#fff;}
  .note-chip.add{border-color:#e8e4de;color:#c0bbb4;}
  .note-chip.add:hover{border-color:#c8a8c0;color:#9c6e8c;background:none;}
`;
