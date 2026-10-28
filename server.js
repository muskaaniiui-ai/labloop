// LabLoop - zero-dependency Node server. Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const DB=path.join(__dirname,'data.json'),PORT=process.env.PORT||3000;
const H=36e5,now=()=>Date.now(),uid=p=>p+crypto.randomBytes(3).toString('hex');
function seed(){const t=now();return{
users:[
{id:'u1',name:'Ana Silva (Student)',email:'ana@uni.test',role:'student',training:['microscopy','camera']},
{id:'u2',name:'Ben Okoye (Student)',email:'ben@uni.test',role:'student',training:[]},
{id:'u3',name:'Dr. Rao (Owner)',email:'rao@uni.test',role:'owner',training:['microscopy','camera','spectro']},
{id:'u4',name:'Mia Chen (Lab Manager)',email:'mia@uni.test',role:'manager',training:[]}],
resources:[
{id:'r1',name:'Confocal Microscope Zeiss LSM',category:'Microscopy',location:'Bio Building, Room 214',owner:'u3',requires:['microscopy'],weeklyLimitHrs:6,available:true,desc:'High-resolution fluorescence imaging.'},
{id:'r2',name:'Mirrorless Research Camera Kit',category:'Imaging',location:'Media Lab, Cabinet B',owner:'u3',requires:['camera'],weeklyLimitHrs:8,available:true,desc:'Camera with macro lens and tripod for field studies.'},
{id:'r3',name:'UV-Vis Spectrophotometer',category:'Analysis',location:'Chem Building, Room 105',owner:'u3',requires:['spectro'],weeklyLimitHrs:6,available:true,desc:'Absorbance measurements 190-1100 nm.'},
{id:'r4',name:'Portable Thermal Camera',category:'Imaging',location:'Engineering Store',owner:'u3',requires:[],weeklyLimitHrs:10,available:false,desc:'Currently under calibration (unavailable).'}],
bookings:[],incidents:[],audit:[{t,actor:'system',msg:'LabLoop seeded with fictional demo data'}]}}
let db=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):seed();
const save=()=>fs.writeFileSync(DB,JSON.stringify(db,null,1));
const log=(actor,msg,bookingId)=>{db.audit.unshift({t:now(),actor,msg,bookingId});};
const sessions={};
const ACTIVE=['approved','checked_out'];
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const user=id=>db.users.find(u=>u.id===id);
const missing=(u,r)=>r.requires.filter(x=>!u.training.includes(x));
const usedHrs=(uid_,rid)=>db.bookings.filter(b=>b.userId===uid_&&b.resourceId===rid&&['approved','checked_out','returned','closed'].includes(b.status)&&b.start>now()-7*24*H).reduce((s,b)=>s+(b.end-b.start)/H,0);
const conflict=(b)=>db.bookings.find(x=>x.id!==b.id&&x.resourceId===b.resourceId&&ACTIVE.includes(x.status)&&overlap(x,b));
const err=(code,msg,extra)=>{const e=new Error(msg);e.code=code;e.extra=extra;return e};
function view(b){const r=db.resources.find(x=>x.id===b.resourceId);return{...b,resourceName:r&&r.name,userName:(user(b.userId)||{}).name,
 overdue:b.status==='checked_out'&&b.end<now(),
 eligibility:r?missing(user(b.userId),r):[],
 competing:db.bookings.filter(x=>x.id!==b.id&&x.resourceId===b.resourceId&&['pending','waitlisted'].includes(x.status)&&overlap(x,b)).length,
 waitPos:b.status==='waitlisted'?db.bookings.filter(x=>x.resourceId===b.resourceId&&x.status==='waitlisted').sort((p,q)=>p.waitlistedAt-q.waitlistedAt).findIndex(x=>x.id===b.id)+1:0}}
function promote(rid,actor){ // FairShare: longest-waiting eligible user, tie-break by least recent usage
 const r=db.resources.find(x=>x.id===rid);if(!r.available)return;
 const w=db.bookings.filter(b=>b.resourceId===rid&&b.status==='waitlisted'&&!missing(user(b.userId),r)).sort((a,b)=>a.waitlistedAt-b.waitlistedAt||usedHrs(a.userId,rid)-usedHrs(b.userId,rid))[0];
 if(w){w.status='pending';w.reason='Promoted from waiting list (longest wait first)';log('FairShare',`Promoted ${user(w.userId).name} from waiting list on ${r.name}`,w.id)}}
const routes={
'POST /api/login':(u,b)=>{const x=db.users.find(y=>y.email===b.email);if(!x)throw err(401,'Unknown demo account');const t=uid('t');sessions[t]=x.id;return{token:t,user:x}},
'GET /api/state':(u)=>({me:u,users:db.users.map(({id,name,role,training})=>({id,name,role,training})),
 resources:db.resources.map(r=>({...r,ownerName:user(r.owner).name,eligible:missing(u,r).length===0,missing:missing(u,r),usedHrs:usedHrs(u.id,r.id),waitlist:db.bookings.filter(b=>b.resourceId===r.id&&b.status==='waitlisted').length,
  nextFree:(db.bookings.filter(b=>b.resourceId===r.id&&ACTIVE.includes(b.status)&&b.end>now()).sort((a,b)=>a.end-b.end)[0]||{}).end})),
 bookings:db.bookings.filter(b=>u.role==='manager'||b.userId===u.id||(db.resources.find(r=>r.id===b.resourceId)||{}).owner===u.id).map(view).sort((a,b)=>b.createdAt-a.createdAt),
 incidents:u.role==='student'?[]:db.incidents,audit:u.role==='student'?db.audit.filter(a=>a.actor===u.name).slice(0,30):db.audit.slice(0,60)}),
'POST /api/resources':(u,b)=>{if(u.role==='student')throw err(403,'Only owners or managers can list equipment');
 if(!b.name||!b.location)throw err(400,'Name and location are required');
 const r={id:uid('r'),name:b.name,category:b.category||'General',location:b.location,owner:u.role==='owner'?u.id:(b.owner||u.id),requires:(b.requires||[]).filter(Boolean),weeklyLimitHrs:+b.weeklyLimitHrs||6,available:true,desc:b.desc||''};
 db.resources.push(r);log(u.name,`Listed new resource: ${r.name}`);return r},
'POST /api/resources/availability':(u,b)=>{const r=db.resources.find(x=>x.id===b.id);if(!r||(u.role!=='manager'&&r.owner!==u.id))throw err(403,'Not your resource');
 r.available=!!b.available;log(u.name,`${r.name} marked ${r.available?'available':'unavailable'}`);if(r.available)promote(r.id,u.name);return r},
'POST /api/bookings':(u,b)=>{ // TrustPass + conflict + FairShare, all server-side
 if(u.role!=='student')throw err(403,'Only students/researchers can request access');
 const r=db.resources.find(x=>x.id===b.resourceId);if(!r)throw err(404,'Resource not found');
 const start=new Date(b.start).getTime(),end=new Date(b.end).getTime();
 if(!(start>0&&end>start))throw err(400,'Choose a valid start and end time');
 if(start<now()-6e4)throw err(400,'Start time is in the past');
 if(!(b.purpose||'').trim())throw err(400,'Purpose is required');
 const m=missing(u,r);if(m.length)throw err(403,`TrustPass: missing required training: ${m.join(', ')}`,{missing:m});
 const bk={id:uid('b'),resourceId:r.id,userId:u.id,start,end,purpose:b.purpose.trim(),status:'pending',reason:'',createdAt:now(),history:[]};
 if(!r.available){bk.status='waitlisted';bk.waitlistedAt=now();bk.reason='Resource currently unavailable - added to waiting list';}
 else{const c=conflict(bk);if(c)throw err(409,'Time slot conflicts with an existing approved booking');
  const hrs=(end-start)/H,used=usedHrs(u.id,r.id);
  if(used+hrs>r.weeklyLimitHrs)throw err(422,`FairShare: weekly limit ${r.weeklyLimitHrs}h exceeded (you used ${used.toFixed(1)}h in the last 7 days, requested ${hrs.toFixed(1)}h)`)}
 db.bookings.push(bk);log(u.name,`Requested ${r.name} (${bk.status})`,bk.id);return view(bk)},
'POST /api/bookings/decide':(u,b)=>{const k=db.bookings.find(x=>x.id===b.id);if(!k)throw err(404,'Not found');const r=db.resources.find(x=>x.id===k.resourceId);
 if(u.role==='student'||(u.role==='owner'&&r.owner!==u.id))throw err(403,'Only the resource owner or a lab manager can decide');
 if(!['pending','waitlisted'].includes(k.status))throw err(400,'Request already decided');
 if(b.decision==='approve'){if(!r.available)throw err(409,'Resource is unavailable');const m=missing(user(k.userId),r);if(m.length)throw err(403,'Applicant missing training: '+m.join(', '));
  const c=conflict(k);if(c)throw err(409,'Conflicts with an approved booking - reject or waitlist instead');k.status='approved';k.reason=b.reason||'Approved by '+u.name}
 else if(b.decision==='reject'){if(!(b.reason||'').trim())throw err(400,'A reason is required to reject');k.status='rejected';k.reason=b.reason}
 else if(b.decision==='waitlist'){if(!(b.reason||'').trim())throw err(400,'A reason is required to waitlist');k.status='waitlisted';k.waitlistedAt=now();k.reason=b.reason}
 else throw err(400,'Unknown decision');
 log(u.name,`${b.decision} -> ${k.status}: ${k.reason}`,k.id);return view(k)},
'POST /api/bookings/checkout':(u,b)=>{const k=db.bookings.find(x=>x.id===b.id);if(!k||k.userId!==u.id)throw err(403,'Only the borrower can check out');
 if(k.status!=='approved')throw err(400,'Booking must be approved first');if(!(b.condition||'').trim())throw err(400,'Record the initial condition');
 k.status='checked_out';k.checkout={t:now(),condition:b.condition,photoNote:b.photoNote||''};log(u.name,`Checked out. Initial condition: ${b.condition}`,k.id);return view(k)},
'POST /api/bookings/return':(u,b)=>{const k=db.bookings.find(x=>x.id===b.id);if(!k||k.userId!==u.id)throw err(403,'Only the borrower can return');
 if(k.status!=='checked_out')throw err(400,'Item is not checked out');if(!(b.condition||'').trim())throw err(400,'Record the return condition');
 const late=now()>k.end;k.ret={t:now(),condition:b.condition,damaged:!!b.damaged,late};
 if(b.damaged){k.status='returned';const i={id:uid('i'),bookingId:k.id,resourceId:k.resourceId,reportedBy:u.name,desc:b.condition,t:now(),status:'open',summary:summarise(k,b.condition,late)};db.incidents.unshift(i);log(u.name,'Returned with DAMAGE reported - sent to manager review',k.id)}
 else{k.status='closed';log(u.name,`Returned${late?' (late)':''} in good condition - transaction closed`,k.id)}
 const r=db.resources.find(x=>x.id===k.resourceId);if(r.available)promote(r.id,u.name);return view(k)},
'POST /api/incidents/review':(u,b)=>{if(u.role!=='manager')throw err(403,'Only a lab manager can review incident reports');
 const i=db.incidents.find(x=>x.id===b.id);if(!i)throw err(404,'Not found');if(!(b.note||'').trim())throw err(400,'Add a review note');
 i.status=b.outcome==='repair'?'repair_required':'resolved';i.reviewNote=b.note;i.reviewedBy=u.name;i.reviewedAt=now();
 const k=db.bookings.find(x=>x.id===i.bookingId);k.status='closed';
 if(b.outcome==='repair'){const r=db.resources.find(x=>x.id===i.resourceId);r.available=false}
 log(u.name,`Incident reviewed: ${i.status}. ${b.note}`,i.bookingId);return i},
'POST /api/reset':(u)=>{if(u.role!=='manager')throw err(403,'Managers only');db=seed();return{ok:true}}};
function summarise(k,c,late){ // rule-based assistive summary (no external AI). A human decides the outcome.
 const r=db.resources.find(x=>x.id===k.resourceId),kw=['crack','broken','scratch','leak','dent','missing','lens','screen'].filter(w=>c.toLowerCase().includes(w));
 return `${user(k.userId).name} reported an issue with ${r.name}${late?' (returned late)':''}. Keywords: ${kw.join(', ')||'none detected'}. Initial condition at checkout: "${k.checkout.condition}". Suggested severity: ${kw.length>1?'HIGH':kw.length?'MEDIUM':'LOW'} - manager must review.`}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
 const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
 if(!req.url.startsWith('/api')){let f=path.join(__dirname,'public',req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  if(!f.startsWith(path.join(__dirname,'public'))||!fs.existsSync(f)){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'text/plain'});return res.end(fs.readFileSync(f))}
 let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{
  const key=req.method+' '+req.url.split('?')[0],h=routes[key];if(!h)return send(404,{error:'No such endpoint'});
  const u=user(sessions[(req.headers.authorization||'').replace('Bearer ','')]);if(key!=='POST /api/login'&&!u)return send(401,{error:'Please sign in'});
  const out=h(u,body?JSON.parse(body):{});save();send(200,out)}catch(e){send(e.code||500,{error:e.message,...e.extra})}})}
).listen(PORT,()=>console.log(`LabLoop running at http://localhost:${PORT}`));
