// Invitation secrets stay in the URL fragment / tab storage through sign-in, never in a query parameter.
export function captureInvitation(where:Pick<Location,'hash'|'pathname'|'search'>,store:Pick<Storage,'getItem'|'setItem'|'removeItem'>){
 const key='signalforge.pending-invitation';let token='';if(where.hash.startsWith('#invite=')){try{token=decodeURIComponent(where.hash.slice(8));}catch{return ''; }if(!/^[a-zA-Z0-9-]{40,160}$/.test(token))return '';try{store.setItem(key,JSON.stringify({token,at:Date.now()}));}catch{}return token;}
 try{const v=JSON.parse(store.getItem(key)||'null');if(v&&Date.now()-v.at<7*86400000&&/^[a-zA-Z0-9-]{40,160}$/.test(v.token))return v.token;store.removeItem(key);}catch{}return '';
}
