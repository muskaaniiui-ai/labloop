// End-to-end test of server rules. Run: node server.js (in another terminal) then node test.js
const base='http://localhost:'+(process.env.PORT||3000);let pass=0,fail=0;
async function call(p,b,t){const r=await fetch(base+'/api'+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(t||'')},body:b?JSON.stringify(b):undefined});return{s:r.status,j:await r.json()}}
const ok=(n,c)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n)};
(async()=>{const T={};for(const e of['ana','ben','rao','mia'])T[e]=(await call('/login',{email:e+'@uni.test'})).j.token;
 await call('/reset',{},T.mia);const iso=h=>new Date(Date.now()+h*36e5).toISOString();
 let r=await call('/bookings',{resourceId:'r1',start:iso(24),end:iso(26),purpose:'x'},T.ben);ok('TrustPass blocks untrained user (403)',r.s===403);
 r=await call('/bookings',{resourceId:'r1',start:iso(24),end:iso(26),purpose:'imaging'},T.ana);ok('Eligible user can request',r.s===200);const b1=r.j.id;
 r=await call('/bookings',{resourceId:'r1',start:iso(100),end:iso(110),purpose:'long'},T.ana);ok('FairShare limit blocks 10h request (422)',r.s===422);
 r=await call('/bookings/decide',{id:b1,decision:'approve'},T.ana);ok('Student cannot approve (403)',r.s===403);
 r=await call('/bookings/decide',{id:b1,decision:'approve'},T.rao);ok('Owner approves',r.j.status==='approved');
 r=await call('/bookings',{resourceId:'r1',start:iso(25),end:iso(27),purpose:'overlap'},T.ana);ok('Double booking rejected (409)',r.s===409);
 r=await call('/bookings',{resourceId:'r4',start:iso(24),end:iso(26),purpose:'thermal'},T.ana);ok('Unavailable resource -> waitlist',r.j.status==='waitlisted');
 r=await call('/bookings/checkout',{id:b1,condition:'Clean'},T.ana);ok('Checkout records condition',r.j.status==='checked_out');
 r=await call('/bookings/return',{id:b1,condition:'Cracked lens cover, scratch',damaged:true},T.ana);ok('Damaged return opens incident',r.j.status==='returned');
 const st=(await call('/state',null,T.mia)).j;ok('Manager sees incident with summary',st.incidents.length===1&&st.incidents[0].summary.includes('HIGH'));
 r=await call('/incidents/review',{id:st.incidents[0].id,outcome:'resolve',note:'Minor, covered'},T.rao);ok('Owner cannot review incident (403)',r.s===403);
 r=await call('/incidents/review',{id:st.incidents[0].id,outcome:'resolve',note:'Minor, covered'},T.mia);ok('Manager reviews incident',r.s===200);
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)})();
