// Tokens survive sign-in in this tab only; never send them in query strings or referrers.
export const portalInvitationKey='signalforge.pending-portal-invitation';
export function capturePortalInvitation(where:Pick<Location,'hash'>,store:Pick<Storage,'getItem'|'setItem'|'removeItem'>){
 if(where.hash.startsWith('#portal-invite=')){let token='';try{token=decodeURIComponent(where.hash.slice(15));}catch{return ''; }if(!/^[a-zA-Z0-9-]{40,160}$/.test(token))return '';try{store.setItem(portalInvitationKey,JSON.stringify({token,at:Date.now()}));}catch{}return token;}
 try{const v=JSON.parse(store.getItem(portalInvitationKey)||'null');if(v&&Date.now()-v.at>=0&&Date.now()-v.at<86400000&&/^[a-zA-Z0-9-]{40,160}$/.test(v.token))return v.token;store.removeItem(portalInvitationKey);}catch{}return '';
}
