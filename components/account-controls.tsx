'use client';
import {useEffect,useState} from 'react';

export function SessionRefresh({source}:{source?:string}){
 useEffect(()=>{if(source!=='signalforge')return;const refresh=()=>fetch('/api/auth/get-session',{cache:'no-store'}).catch(()=>{});refresh();const timer=setInterval(refresh,15*60*1000);const onFocus=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',onFocus);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onFocus);};},[source]);
 return null;
}

export function SignOut({source}:{source?:string}){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function signOut(){setBusy(true);setError('');try{if(source==='signalforge'){const r=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error('Could not sign out. Please try again.');location.assign('/login');}else location.assign('/signout-with-chatgpt?return_to=/');}catch(e){setError((e as Error).message);setBusy(false);}}
 return <><button className="text-link" disabled={busy} onClick={signOut}>{busy?'Signing out…':'Sign out'}</button>{error&&<p role="alert">{error}</p>}</>;
}

export function AccountControls({source}:{source?:string}){
 const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selection,setSelection]=useState<{linked:boolean;workspace:string}|null>(null);
 useEffect(()=>{if(source==='signalforge')fetch('/api/account/workspace',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>setSelection(v as {linked:boolean;workspace:string}|null)).catch(()=>{});},[source]);
 if(source!=='signalforge')return null;
 async function link(){setBusy(true);setMessage('');try{const r=await fetch('/api/account/link-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const v:any=await r.json();if(!r.ok)throw new Error(v.error||'Could not link preview records.');setMessage('Preview workspace linked. Reloading…');location.reload();}catch(e){setMessage((e as Error).message);setBusy(false);}}
 async function switchWorkspace(){setBusy(true);setMessage('');try{const r=await fetch('/api/account/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace:selection?.workspace==='preview'?'personal':'preview'})});if(!r.ok)throw new Error('Could not switch workspace.');location.reload();}catch(e){setMessage((e as Error).message);setBusy(false);}}
 async function linkGoogle(){setBusy(true);setMessage('');try{const r=await fetch('/api/auth/link-social',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'google',callbackURL:'/workspace/settings',errorCallbackURL:'/login'})});const v:any=await r.json();if(!r.ok)throw new Error(v.message||'Google could not be linked.');const target=new URL(v.url);if(target.protocol!=='https:'||target.hostname!=='accounts.google.com')throw new Error('Invalid provider response.');location.assign(target.href);}catch(e){setMessage((e as Error).message);setBusy(false);}}
 return <section className="panel account-settings"><h2>Your SignalForge account</h2><p>You sign in directly to SignalForge. Link Google while signed in to add it to an email/password account.</p><button disabled={busy} className="button button-outline" onClick={linkGoogle}>Link Google account</button>{selection?.linked&&<div><p>Current workspace: {selection.workspace==='preview'?'original preview':'new SignalForge account'}.</p><button disabled={busy} className="button button-outline" onClick={switchWorkspace}>Switch to {selection.workspace==='preview'?'new':'preview'} workspace</button></div>}<details><summary>Bring reports from the original preview</summary><p>This optional step requires your original ChatGPT preview session and a fresh SignalForge sign-in with the same verified email. It preserves the original records and keys. Your new and preview workspaces stay separate, and you can switch between them.</p><a className="text-link" target="_top" href="/signin-with-chatgpt?return_to=/workspace/settings">Sign in to the original preview account</a><button disabled={busy} className="button button-outline" onClick={link}>Link preview reports</button></details>{message&&<p role="status">{message}</p>}</section>;
}
