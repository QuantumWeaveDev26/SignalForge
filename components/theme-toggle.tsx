'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {Moon,Sun} from 'lucide-react';

type Theme='light'|'dark';
function current():Theme{const set=document.documentElement.dataset.theme;if(set==='light'||set==='dark')return set;return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
function subscribe(notify:()=>void){const observer=new MutationObserver(notify);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const media=matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',notify);return()=>{observer.disconnect();media.removeEventListener('change',notify);};}

export default function ThemeToggle(){
 const theme=useSyncExternalStore<Theme|null>(subscribe,current,()=>null);
 // Fallback when the inline head script is blocked: apply the saved choice after hydration.
 useEffect(()=>{try{const saved=localStorage.getItem('sf-theme');if(saved==='light'||saved==='dark')document.documentElement.dataset.theme=saved;}catch{}},[]);
 function toggle(){const next:Theme=current()==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('sf-theme',next);}catch{}}
 const label=theme==='dark'?'Switch to light theme':'Switch to dark theme';
 return <button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={label} title={label}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
