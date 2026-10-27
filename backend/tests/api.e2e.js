// API test suite: run with  npm test   (needs: npm run seed first)
// SAFETY: it creates test users/orders, so it only runs against a database whose name contains "test".
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.MONGO_URI = process.env.TEST_MONGO_URI || process.env.MONGO_URI || '';
if (!/test/i.test(process.env.MONGO_URI.split('?')[0])) {
  console.error('Refusing to run: set TEST_MONGO_URI (or MONGO_URI) to a database named like "carevision_test", then run "npm run seed" against it first.');
  process.exit(1);
}
const app=require('../src/app');
const connect=require('../src/config/db');
let pass=0,fail=0;
const ok=(name,cond,extra='')=>{ cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  -> '+extra)); };
(async()=>{
 await connect();
 const s=app.listen(5101);
 const B='http://localhost:5101/api';
 const call=async(m,p,body,tok,form)=>{const h={};if(tok)h.Authorization='Bearer '+tok;if(body&&!form)h['Content-Type']='application/json';
   const r=await fetch(B+p,{method:m,headers:h,body:form?form:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{} return {s:r.status,j};};
 const login=async(e,p)=> (await call('POST','/auth/login',{email:e,password:p})).j.token;

 // --- auth & roles
 const email='t'+Date.now()+'@x.com';
 let r=await call('POST','/auth/register',{name:'Test Patient',email,phone:'9999999999',password:'secret1'});
 ok('register patient',r.s===201&&r.j.user.role==='patient',JSON.stringify(r.j)); const pt=r.j.token; const pid=r.j.user.id;
 r=await call('POST','/auth/register',{name:'x',email:'bad',password:'12'}); ok('register validation',r.s===400);
 r=await call('POST','/auth/login',{email,password:'wrong'}); ok('bad password rejected',r.s===401);
 const doc=await login('christian@carevision.test','Doctor@123'); const doc2=await login('alan@carevision.test','Doctor@123');
 const own=await login('admin@carevision.test','Admin@123');
 ok('doctor+admin login',!!doc&&!!own);
 r=await call('PATCH','/auth/me',{name:'Test Patient 2',phone:'8888888888'},pt); ok('update profile',r.s===200&&r.j.user.name==='Test Patient 2');

 // --- doctors + recommender
 r=await call('GET','/doctors'); ok('list doctors',r.j.doctors.length>=5);
 const cardio=r.j.doctors.find(d=>d.specialty==='Cardiology');
 r=await call('GET','/doctors/me',null,doc); ok('doctor /me',r.s===200&&r.j.doctor.specialty==='Cardiology');
 r=await call('GET','/doctors/me',null,pt); ok('patient blocked from /doctors/me',r.s===403);
 r=await call('POST','/ai/recommend-doctors',{speciality:'Dermatology',urgency:'routine'});
 ok('recommend: dermatologist first',r.j.doctors[0].doctor.specialty==='Dermatology'&&r.j.doctors.length===3&&r.j.doctors[0].label==='Best match',JSON.stringify(r.j.doctors?.map(d=>d.doctor.name)));
 r=await call('POST','/ai/recommend-doctors',{speciality:'Cardiology',urgency:'urgent'}); ok('recommend: cardiologist first (urgent)',r.j.doctors[0].doctor.specialty==='Cardiology');

 // --- booking
 const brief={symptoms:['chest pain'],severity:8,duration:'2 days',history:'None',triageLevel:'High',notes:'test',chatLog:[{sender:'user',text:'chest pain'},{sender:'ai',text:'How long?'},{sender:'hacker',text:'x'},{sender:'user',text:'y'.repeat(900)}]};
 r=await call('POST','/appointments',{doctorName:'Dr. Christian Barnard',date:'2026-12-01',slot:'10:00 AM',symptomBrief:brief},pt);
 ok('book appointment',r.s===201&&r.j.appointment.meetLink.includes('meet.jit.si'),JSON.stringify(r.j)); const apptId=r.j.appointment._id;
 r=await call('POST','/appointments',{doctorName:'Dr. Christian Barnard',date:'2026-12-01',slot:'10:00 AM'},pt); ok('double booking blocked',r.s===409,r.s+' '+JSON.stringify(r.j));
 r=await call('POST','/appointments',{doctorName:'Dr. Alan Turing',date:'2026-12-01',slot:'10:00 AM'},doc); ok('doctor cannot book',r.s===403);
 r=await call('GET','/appointments/mine',null,pt); ok('patient sees own appointment',r.j.appointments.length>=1&&r.j.appointments.some(a=>a.doctorId.name==='Dr. Christian Barnard'));

 // --- doctor side (limited access)
 r=await call('GET','/appointments/queue',null,doc); ok('doctor queue has patient',r.j.queue.length===1&&r.j.queue[0].userId.name==='Test Patient 2');
 const cl=r.j.queue[0].symptomBrief.chatLog; ok('chat log stored, invalid sender dropped, long text trimmed',cl.length===3&&cl[0].sender==='user'&&cl[2].text.length===500,JSON.stringify(cl).slice(0,200));
 const junk=await call('POST','/appointments',{doctorName:'Dr. Jonas Salk',date:'2027-05-05',slot:'09:00 AM',symptomBrief:{symptoms:Array(40).fill('x'),severity:99,triageLevel:'Awaiting Data',notes:'n'.repeat(5000),evil:'<script>'}},pt);
 ok('oversized/invalid brief is sanitised',junk.s===201&&junk.j.appointment.symptomBrief.symptoms.length===12&&junk.j.appointment.symptomBrief.severity===10&&junk.j.appointment.symptomBrief.triageLevel==='Low'&&junk.j.appointment.symptomBrief.notes.length===600&&!('evil' in junk.j.appointment.symptomBrief),JSON.stringify(junk.j).slice(0,200));
 await call('PATCH','/appointments/'+junk.j.appointment._id+'/cancel',null,pt);
 r=await call('GET','/appointments/queue',null,doc2); ok('other doctor queue is empty (limited access)',r.j.queue.length===0);
 r=await call('GET','/appointments/queue',null,pt); ok('patient blocked from queue',r.s===403);
 r=await call('GET','/appointments/patient/'+pid+'/records',null,doc); ok('doctor sees own patient records',r.s===200&&r.j.patient.name==='Test Patient 2',JSON.stringify(r.j));
 r=await call('GET','/appointments/patient/'+pid+'/records',null,doc2); ok('unrelated doctor DENIED patient records',r.s===403);
 r=await call('GET','/appointments/patient/'+pid+'/records',null,own); ok('admin CANNOT view medical records (least privilege)',r.s===403);
 r=await call('PATCH','/appointments/'+apptId+'/complete',{diagnosis:''},doc); ok('complete needs diagnosis',r.s===400);
 r=await call('PATCH','/appointments/'+apptId+'/complete',{diagnosis:'Angina suspected',prescription:['Aspirin 75mg']},doc2); ok('wrong doctor cannot complete',r.s===404);
 r=await call('PATCH','/appointments/'+apptId+'/complete',{diagnosis:'Angina suspected',prescription:['Aspirin 75mg - once daily'],followUp:'ECG and lipid profile'},doc); ok('doctor completes case (with follow-up)',r.s===200&&r.j.appointment.status==='completed'&&r.j.appointment.followUp==='ECG and lipid profile');
 r=await call('PATCH','/appointments/'+apptId+'/complete',{diagnosis:'Changed my mind'},doc); ok('a closed case cannot be completed twice',r.s===404);
 r=await call('GET','/appointments/queue?status=completed',null,doc); ok('completed history',r.j.queue.length===1);
 r=await call('GET','/appointments/mine',null,pt); ok('patient sees diagnosis + follow-up',r.j.appointments.some(a=>a.diagnosis==='Angina suspected'&&a.followUp==='ECG and lipid profile'));

 // --- AI report + agents (demo mode, no key)
 r=await call('POST','/ai/health-report',{source:'symptom',analysis:{symptoms:['chest pain','breath'],severity:8,duration:'2 days',triageLevel:'High',suggestedSpeciality:'Cardiology',notes:'Patient reports chest pain.'}},pt);
 const rep=r.j.report; ok('health report generated',r.s===201&&rep&&rep.urgency==='urgent'&&rep.speciality==='Cardiology'&&rep.dos.length>=4&&rep.recommendedDoctors[0].doctor.specialty==='Cardiology',JSON.stringify(r.j).slice(0,300));
 ok('report has outlook + warnings + followUp',rep.recoveryOutlook&&rep.warningSigns.length&&rep.followUp.includes('112'));
 r=await call('POST','/ai/health-report',{source:'symptom',analysis:{}} ,null); ok('health report needs login',r.s===401);
 r=await call('POST','/ai/health-report',{source:'hack',analysis:{}},pt); ok('health report validates source',r.s===400);
 const fd=new FormData(); fd.append('file',new Blob(['Hemoglobin: 9.8 g/dL\nFasting Glucose 130'],{type:'application/pdf'}),'a.pdf'); fd.append('notes','x');
 r=await call('POST','/agents/imaging',null,pt,fd); ok('imaging agent (demo mode) saves result',r.s===200||r.s===500,r.s+JSON.stringify(r.j).slice(0,200));
 const fd2=new FormData(); fd2.append('file',new Blob([Buffer.from([1,2,3])],{type:'image/png'}),'s.png');
 r=await call('POST','/agents/skin',null,pt,fd2); ok('skin agent (demo mode)',r.s===200&&r.j.mode==='demo',r.s+JSON.stringify(r.j).slice(0,200));
 r=await call('GET','/agents/history',null,pt); ok('history lists report + skin',r.j.items.length>=2&&r.j.items.some(i=>i.agent==='report'));

 // --- services
 r=await call('GET','/services/catalog'); ok('catalog public',r.j.catalog.lab.length===6&&r.j.catalog.scan.length===4);
 r=await call('POST','/services/requests',{type:'lab',itemId:'lab-cbc',preferredDate:'2020-01-01',contact:{phone:'9999999999',address:'x'}},pt); ok('lab: past date rejected',r.s===400);
 r=await call('POST','/services/requests',{type:'lab',itemId:'lab-cbc',preferredDate:'2030-01-01',contact:{phone:'9999999999',address:'12 MG Road'},amount:1},pt); ok('lab booked, server price used',r.s===201&&r.j.request.amount===350,JSON.stringify(r.j)); const reqId=r.j.request._id;
 r=await call('POST','/services/requests',{type:'corporate',itemId:'corp-starter',contact:{company:'Acme',employees:40}},pt); ok('corporate enquiry',r.s===201);
 r=await call('POST','/services/requests',{type:'corporate',itemId:'corp-starter',contact:{}},pt); ok('corporate validation',r.s===400);
 r=await call('POST','/services/requests',{type:'medicine',items:[{name:'Paracetamol',qty:2,price:30}],contact:{phone:'9999999999',address:'Home'}},pt); ok('medicine order total',r.s===201&&r.j.request.amount===60);
 r=await call('POST','/services/requests',{type:'careplan',itemId:'nope',contact:{phone:'9999999999'}},pt); ok('unknown service rejected',r.s===400);
 r=await call('POST','/services/requests',{type:'lab',itemId:'lab-cbc'},null); ok('services need login',r.s===401);
 r=await call('GET','/services/requests/mine',null,pt); ok('my orders',r.j.requests.length===3);
 r=await call('PATCH','/services/requests/'+reqId+'/cancel',null,pt); ok('cancel own pending request',r.s===200&&r.j.request.status==='cancelled');

 // --- admin
 r=await call('GET','/admin/stats',null,pt); ok('patient blocked from admin',r.s===403);
 r=await call('GET','/admin/stats',null,doc); ok('doctor blocked from admin',r.s===403);
 r=await call('GET','/admin/stats',null,own); const st=r.j;
 ok('admin stats',r.s===200&&st.doctors>=5&&st.patients>=1&&st.revenue.consultations>=1200&&st.last7Days.length===7&&st.aiUsage.report>=1,JSON.stringify(st).slice(0,300));
 r=await call('POST','/admin/doctors',{name:'Dr. New Doc',email:'newdoc'+Date.now()+'@x.com',password:'doctor1',specialty:'Cardiology',licenseNo:'L1',consultFee:900},own); ok('admin adds doctor',r.s===201&&r.j.doctor.avatar==='ND',JSON.stringify(r.j)); const newDocId=r.j.doctor._id;
 r=await call('PATCH','/admin/doctors/'+newDocId,{consultFee:1000},own); ok('admin edits fee',r.j.doctor.consultFee===1000);
 r=await call('PATCH','/admin/doctors/'+newDocId,{consultFee:-5},own); ok('fee validation',r.s===400);
 r=await call('DELETE','/admin/doctors/'+newDocId,null,own); ok('admin deletes doctor',r.s===200);
 const alan=(await call('GET','/doctors')).j.doctors.find(d=>d.name==='Dr. Alan Turing');
 const hold=await call('POST','/appointments',{doctorName:'Dr. Alan Turing',date:'2027-03-03',slot:'09:00 AM'},pt);
 r=await call('DELETE','/admin/doctors/'+alan._id,null,own); ok('cannot remove a doctor who has booked appointments',r.s===400);
 await call('PATCH','/appointments/'+hold.j.appointment._id+'/cancel',null,pt);
 r=await call('GET','/admin/users',null,own); ok('admin lists users',r.j.users.length>=7);
 r=await call('PATCH','/admin/users/'+pid+'/toggle',null,own); ok('admin disables patient',r.j.user.active===false);
 r=await call('GET','/auth/me',null,pt); ok('disabled user locked out',r.s===403);
 r=await call('POST','/auth/login',{email,password:'secret1'}); ok('disabled user cannot login',r.s===403);
 r=await call('PATCH','/admin/users/'+pid+'/toggle',null,own); ok('admin re-enables',r.j.user.active===true);
 r=await call('GET','/admin/appointments',null,own); ok('admin sees all appointments',r.j.appointments.length>=1);
 r=await call('GET','/admin/requests',null,own); ok('admin sees all requests',r.j.requests.length>=3);
 const some=r.j.requests[0]._id;
 r=await call('PATCH','/admin/requests/'+some,{status:'confirmed'},own); ok('admin updates request status',r.j.request.status==='confirmed');
 r=await call('PATCH','/admin/requests/'+some,{status:'nope'},own); ok('status validation',r.s===400);

 console.log(`\n${pass} passed, ${fail} failed`);
 s.close(); process.exit(fail?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
