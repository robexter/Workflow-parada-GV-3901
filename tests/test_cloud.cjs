const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const fakeStore={version:0,state:null};let uid='u-robson',role='admin';
const memberNames={'u-robson':'Robson Almeida','u-pedro':'Pedro Dantas','u-special':'Operador Especial'};
const app={innerHTML:''};let handlers={};
const fakeClient={
 auth:{onAuthStateChange:()=>{},getSession:async()=>({data:{session:null}}),
   getUser:async()=>({data:{user:{id:uid}}}),signInWithPassword:async()=>({data:{session:{user:{id:uid}}}}),signOut:async()=>({error:null})},
 from(table){return {select(){return this},eq(){return this},async single(){if(table==='gv3901_members')return {data:{user_id:uid,display_name:memberNames[uid],active:true,role},error:null};if(table==='gv3901_workspace')return {data:{state:fakeStore.state,version:fakeStore.version,updated_at:new Date().toISOString()},error:null};return {data:null,error:{message:'table'}}}}},
 async rpc(name,p){assert.equal(name,'gv3901_commit');if(p.p_expected_version!==fakeStore.version)return {error:{message:'GV3901_VERSION_CONFLICT'}};fakeStore.version++;fakeStore.state=p.p_state;return {data:[{committed_version:fakeStore.version,committed_at:new Date().toISOString()}],error:null}},
 channel(){return {on(){return this},subscribe(){return this}}},removeChannel(){}
};
let context=vm.createContext({
 window:{GV3901_CLOUD_CONFIG:{url:'https://demo.supabase.co',publishableKey:'sb_publishable_test'},supabase:{createClient:()=>fakeClient},addEventListener(){},scrollTo(){}},
 document:{getElementById(id){return id==='app'?app:null},addEventListener(name,fn){handlers[name]=fn},createElement:()=>({}),body:{append(){}}},
 location:{hash:'',protocol:'http:'},navigator:{onLine:true,userAgent:'Node test'},
 localStorage:{getItem:()=>null,setItem:()=>{}}, console,structuredClone,setTimeout,clearTimeout,
 URL,Blob,Date,Intl,Math,Number,String,Object,Array,Promise,JSON,Error,RegExp,Map,Set
});
const injection=`window.GV_TEST={state:()=>st,ready:()=>cloudReady,version:()=>cloudVersion,login:cloudSignIn,refresh:cloudRefresh,save,conflict:()=>cloudConflict,member:()=>cloudMember};\ninit();\n})();`;
vm.runInContext(code.replace('init();\n})();',injection),context);
(async()=>{
const api=context.window.GV_TEST;await new Promise(r=>setTimeout(r,10));
assert(!api.ready());assert(app.innerHTML.includes('login')||app.innerHTML.includes('Faça login'));
await api.login('robson@example.test','senha-ficticia');assert(api.ready());assert.strictEqual(api.member().display_name,'Robson Almeida');
assert.strictEqual(api.state().events.length,0);assert.strictEqual(api.state().activities.length,0);
api.state().events.push({id:'EVT-1',title:'Registro puramente fictício',body:'Teste em ambiente simulado'});
assert(await api.save('Teste de relato','somente teste'));assert.strictEqual(fakeStore.version,1);
// Alteração de outro operador, recebida ao recarregar no segundo dispositivo.
uid='u-pedro';await api.refresh();assert.equal(api.state().settings.activeOperator,'Robson Almeida');
// Versão divergente: a gravação deve ser BLOQUEADA e pendente preservada.
fakeStore.version=2;api.state().events.push({id:'EVT-2',title:'Edição pendente fictícia'});
assert.strictEqual(await api.save('Teste de conflito'),false);assert(api.conflict());assert(app.innerHTML.includes('Gravação não confirmada'));assert.strictEqual(fakeStore.state.events.length,1);
console.log('PASSOU: login, perfil, estado inicialmente limpo, gravação central, versionamento e conflito sem sobrescrita.');
})().catch(err=>{console.error(err);process.exitCode=1});
