'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,Check,Eye,EyeOff,Loader2,ShieldCheck} from 'lucide-react';
import {Brand} from './brand';
import ThemeToggle from './theme-toggle';
import {safeAuthReturn} from '@/lib/auth-policy';

type Mode='login'|'signup'|'forgot'|'reset';
type Availability={ready:boolean;google:boolean;email:boolean};
const titles={login:'Welcome back.',signup:'Start with a question.',forgot:'Let’s get you back in.',reset:'A fresh start.'};
const errors:Record<string,string>={account_not_linked:'This email already has a SignalForge account. Sign in with your original method, then link Google in account settings.',email_not_verified:'Check your inbox and verify your email before signing in.',INVALID_TOKEN:'This link is invalid or expired. Request a new password reset.',state_mismatch:'The sign-in request expired. Please try again.',state_not_found:'The sign-in request expired. Please try again.',access_denied:'Google sign-in was cancelled. You can try again.'};

async function request(path:string,body:unknown){
 const r=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const value:any=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(r.status===429?'Too many attempts. Wait a few minutes and try again.':value.message||value.error||'This request could not be completed. Please try again.');
 return value;
}

export default function AccountForm({mode,returnTo,token,initialError}:{mode:Mode;returnTo:string;token?:string;initialError?:string}){
 const[available,setAvailable]=useState<Availability|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(initialError?(errors[initialError]||'Sign-in could not be completed. Please try again.'):'');
 const[notice,setNotice]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState(''),[show,setShow]=useState(false);
 const destination=safeAuthReturn(returnTo);
 useEffect(()=>{let active=true;fetch('/api/auth/config',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Account service could not be reached.');return r.json();}).then(v=>active&&setAvailable(v as Availability)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function google(){await run(async()=>{const v=await request('sign-in/social',{provider:'google',callbackURL:destination,errorCallbackURL:'/login'});const target=new URL(v.url);if(target.protocol!=='https:'||target.hostname!=='accounts.google.com')throw new Error('Google sign-in could not be started.');location.assign(target.href);});}
 async function submit(e:FormEvent){e.preventDefault();await run(async()=>{
  if((mode==='signup'||mode==='reset')&&password!==confirm)throw new Error('The passwords do not match.');
  if(mode==='login'){await request('sign-in/email',{email,password,callbackURL:destination});location.assign(destination);}
  if(mode==='signup'){await request('sign-up/email',{name,email,password,callbackURL:destination});setPassword('');setConfirm('');setNotice('Check your inbox for a verification link. Verify your email to finish creating your account.');}
  if(mode==='forgot'){await request('request-password-reset',{email,redirectTo:location.origin+'/reset-password'});setNotice('If this email has an account, a password-reset link is on its way. Check your inbox and spam folder.');}
  if(mode==='reset'){if(!token)throw new Error('Request a new password-reset link first.');await request('reset-password',{newPassword:password,token});setPassword('');setConfirm('');setNotice('Your password has been updated. You can now sign in.');}
 });}
 const emailEnabled=!!available?.email;
 return <div className="account-page"><aside className="account-story"><Brand/><div><span className="eyebrow">Your next advantage</span><h1>Good questions. Better <em>evidence.</em></h1><p>A place to understand your market, challenge your thinking, and find your next move.</p><ul>{['Research with a visible source trail','Your brands, briefs, and report history','A conversation that keeps going'].map(s=><li key={s}><Check size={17}/>{s}</li>)}</ul></div><div className="story-spectrum" aria-hidden="true">{['brand','competitors','audience','pitch','trends','category','custom'].map(t=><i key={t} className={'glyph t-'+t}/>)}</div><p className="account-footnote">Independent research. Your own perspective.</p></aside><main className="account-main"><div className="account-tools"><ThemeToggle/><a className="account-back text-link" href="/">Back to SignalForge <ArrowUpRight size={15}/></a></div><section className="account-card"><span className="eyebrow">Your account</span><h2>{titles[mode]}</h2><p className="account-intro">{mode==='login'?'Sign in to pick up where your thinking left off.':mode==='signup'?'Create your account. Keep the evidence close.':mode==='forgot'?'We’ll send a link to reset your password.':'Choose a new password for your account.'}</p>
 {!available&&!error&&<p className="account-loading"><Loader2 size={17} className="spin"/> Checking sign-in availability…</p>}
 {available&&!available.ready&&<div className="notice" role="status">Independent account setup is in progress. Google and email sign-in will be available after activation.</div>}
 {error&&<div className="alert" role="alert">{error}</div>}{notice&&<div className="notice" role="status">{notice}</div>}
 {(mode==='login'||mode==='signup')&&<><button className="google-signin" onClick={google} disabled={busy||!available?.google}><svg className="google-letter" aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google{busy&&<Loader2 size={17} className="spin"/>}</button>{available?.ready&&!available.google&&<p className="fine-print">Google sign-in is awaiting provider configuration.</p>}<div className="account-divider"><span>or use your email</span></div></>}
 <form className="account-form" onSubmit={submit}>
 {mode==='signup'&&<label>Your name<input name="name" autoComplete="name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}
 {mode!=='reset'&&<label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {(mode==='login'||mode==='signup'||mode==='reset')&&<label>{mode==='reset'?'New password':'Password'}<span className="password-field"><input name="password" type={show?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?undefined:12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="icon-button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>}
 {(mode==='signup'||mode==='reset')&&<><label>Confirm password<input name="confirmPassword" type={show?'text':'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><p className="fine-print">Use at least 12 characters and a password you don’t use elsewhere.</p></>}
 {mode==='login'&&<a className="forgot-link" href="/forgot-password">Forgot password?</a>}
 <button className="button button-dark account-submit" disabled={busy||!emailEnabled||(mode==='reset'&&!token)}>{busy?<Loader2 size={17} className="spin"/>:null}{mode==='login'?'Sign in':mode==='signup'?'Create account':mode==='forgot'?'Send reset link':'Update password'}<ArrowRight size={17}/></button>
 {available?.ready&&!emailEnabled&&<p className="fine-print">Email signup and password recovery are awaiting email-delivery setup.</p>}
 </form>
 <p className="account-switch">{mode==='login'?<>New here? <a href={'/signup?returnTo='+encodeURIComponent(destination)}>Create an account</a></>:mode==='signup'?<>Already have an account? <a href={'/login?returnTo='+encodeURIComponent(destination)}>Sign in</a></>:<a href="/login">Back to sign in</a>}</p>
 <p className="account-privacy"><ShieldCheck size={15}/> Your research stays in your workspace.</p><p className="fine-print account-policy"><a href="/privacy">Privacy</a><span>·</span><a href="/terms">Terms</a></p>
 </section></main></div>;
}
