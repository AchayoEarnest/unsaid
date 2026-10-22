/* Wires the prototype UI to the real API. If the API is unreachable, the app falls back to the built-in sample data. */
(()=>{
const api=async(p,o={})=>{const r=await fetch(p,{credentials:"same-origin",headers:{"Content-Type":"application/json"},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||"Something went wrong. Please try again."),{status:r.status});return d};
const J=b=>JSON.stringify(b),RK=["here","love","understand","keep_going","thinking_of_you","you_got_this"];
const slug=m=>String(m||"").toLowerCase().replace(/ /g,"_"),CLSOF={auto:"glass"};
let me=null;
/* ---- auth ---- */
function authModal(msg){const o=modal(`<h2 style="margin-top:0">Sign in to Unsaid</h2>${msg?`<p class="tag">${esc(msg)}</p>`:""}
<label for="ae">Email</label><input id="ae" type="text" autocomplete="email"><label for="ap">Password (10+ characters to sign up)</label><input id="ap" type="password" autocomplete="current-password" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;min-height:46px">
<label for="an">Nickname (new accounts)</label><input id="an" type="text" maxlength="24"><label for="aa">Age group (new accounts)</label><select id="aa"><option value="adult">18 or older</option><option value="minor">Under 18</option></select>
<div id="aerr" class="err" role="alert"></div><div class="row" style="margin-top:12px"><button class="btn" id="si">Sign in</button><button class="btn g" id="su">Create account</button><a class="btn g" href="/api/auth/google" style="text-decoration:none">Google</a></div><p><a href="#" id="fp">Forgot password?</a></p>`);
const go=async(path,body)=>{try{await api(path,{method:"POST",body:J(body)});o.remove();await refresh();toast("Welcome");if(typeof render==="function")render()}catch(e){o.querySelector("#aerr").textContent=e.message}};
o.querySelector("#fp").onclick=e=>{e.preventDefault();o.remove();window.forgot&&window.forgot()};o.querySelector("#si").onclick=()=>go("/api/auth/signin",{email:o.querySelector("#ae").value,password:o.querySelector("#ap").value});
o.querySelector("#su").onclick=()=>go("/api/auth/signup",{email:o.querySelector("#ae").value,password:o.querySelector("#ap").value,nickname:o.querySelector("#an").value||"Friend",isMinor:o.querySelector("#aa").value==="minor"})}
async function refresh(){try{me=await api("/api/me")}catch{me=null}window.__me=me;if(me&&me.age_confirmed){try{localStorage.setItem('unsaid_onboarded','1')}catch(e){}}const b=document.getElementById("authbtn");if(b){b.textContent=me?"Sign out":"Sign in";b.onclick=me?async()=>{await api("/api/auth/logout",{method:"POST"}).catch(()=>{});me=null;refresh();toast("Signed out")}:()=>authModal()}
if(me&&typeof st!=="undefined"){st.set.minor=me.is_minor;st.set.reqs=me.allow_requests;st.set.fol=me.topics_only_feed;st.set.seen=me.hide_online}}
const hd=document.querySelector("header"),ab=document.createElement("button");ab.id="authbtn";ab.className="btn g sm";ab.textContent="Sign in";hd.insertBefore(ab,hd.querySelector(".ib"));refresh();
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
/* ---- wall ---- */
const wall0=wall;
wall=async function(){try{const d=await api("/api/wall");if(!d.items.length)return wall0();st.api={};const l=d.items.map((p,i)=>{const x={id:p.id,who:p.author,text:p.body,mood:p.mood&&MOODS[p.mood]?p.mood:"Need someone",topic:"Life",cls:CLS[i%8],age:"",care:0,re:0,cw:!!p.content_warning,image:p.image};st.api[p.id]=x;return x});
$("#wall").innerHTML=l.map(sticker).join("")}catch{wall0()}};
/* ---- thread ---- */
const thread0=thread;
thread=function(id,reply){const p=st.api&&st.api[id];if(!p)return thread0(id,reply);
const o=modal(`<h2 style="margin-top:0">“${esc(p.text)}”</h2><small>${esc(p.who)}</small>${p.image?`<img src="/api/uploads/${p.image}" alt="Image shared with this post" style="max-width:100%;border-radius:14px;margin:8px 0">`:""}<div class="rx" style="margin:12px 0">${RK.map((k,i)=>`<button data-r="${k}">${RX[i]}</button>`).join("")}</div><h3>Responses</h3><div id="cl">Loading…</div>
<label for="rp">Write a kind reply</label><textarea id="rp" style="min-height:70px"></textarea><div id="re" class="err" role="alert"></div>
<div class="row"><button class="btn sm" id="rs">Reply</button><button class="btn g sm" id="tp">Talk privately</button><button class="btn g sm" id="rr">Report</button></div><p class="tag">Peer perspectives aren’t professional advice.</p>`);
const need=e=>{if(e.status===401){o.remove();authModal("Please sign in to do that.")}else o.querySelector("#re").textContent=e.message};
const load=async()=>{try{const d=await api(`/api/posts/${id}/comments`);o.querySelector("#cl").innerHTML=d.items.length?d.items.map(c=>`<div class="cm"><span class="tag">${c.kind==="advice"?"Peer perspective · advice":"Supportive response"}</span><p style="margin:.3em 0">${esc(c.body)}</p></div>`).join(""):"<p>No replies yet. You could be the first.</p>"}catch(e){o.querySelector("#cl").innerHTML="<p>Sign in to read and join the conversation.</p>"}};load();
o.querySelector(".rx").onclick=async e=>{const b=e.target.closest("[data-r]");if(!b)return;try{await api(`/api/posts/${id}/react`,{method:"PUT",body:J({kind:b.dataset.r})});b.classList.add("on")}catch(x){need(x)}};
o.querySelector("#rs").onclick=async()=>{const t=o.querySelector("#rp").value.trim();if(!t)return;try{const r=await api(`/api/posts/${id}/comments`,{method:"POST",body:J({body:t})});o.querySelector("#rp").value="";toast(r.status==="live"?"Reply posted":"Thanks. Your reply is being reviewed.");load()}catch(x){need(x)}};
o.querySelector("#tp").onclick=async()=>{try{const r=await api("/api/requests",{method:"POST",body:J({postId:id})});toast(r.note||"Request sent")}catch(x){need(x)}};
o.querySelector("#rr").onclick=async()=>{try{await api("/api/reports",{method:"POST",body:J({target:"post",targetId:id,reason:"Reported by a community member"})});toast("Reported. Thank you.")}catch(x){need(x)}}};
/* ---- posting: intercept the share form's local insert and send it to the API ---- */
POSTS.unshift=function(p){api("/api/posts",{method:"POST",body:J({body:p.text,identity:p.who==="Anonymous"?"anonymous":"nickname",moods:[slug(p.mood)],contentWarning:p.cw?"Content warning":undefined,imageId:window.__imgId||undefined})})
.then(r=>{window.__imgId=null;toast(r.status==="live"?"Shared. Someone will hear you.":"Shared. It will appear after a quick safety review.");if(r.showHelp)crisis();wall()})
.catch(e=>{if(e.status===401)authModal("Please sign in to share.");else{toast(e.message);Array.prototype.unshift.call(POSTS,p)}});return POSTS.length};
/* ---- help resources from the API ---- */
const help0=help;
help=function(){help0();const s=document.getElementById("co");if(!s)return;const CC={Kenya:"KE","United States":"US","United Kingdom":"GB",Other:""};
const fill=async()=>{try{const d=await api("/api/help?country="+CC[s.value]);if(d.items.length)document.getElementById("hl").innerHTML=d.items.map(i=>`<b>${esc(i.label)}:</b> ${esc(i.contact)}`).join("<br>")}catch{}};
s.addEventListener("change",fill);fill()};
window.authModal=authModal;window.api=api;})();
