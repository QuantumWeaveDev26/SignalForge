import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
type RunnerConfig={MONITOR_RUNNER_SECRET?:string;MONITOR_GOOGLE_SERVICE_ACCOUNT?:string;MONITOR_GOOGLE_AUDIENCE?:string};

export async function monitorAuthorized(request:Request,config:RunnerConfig,keys:JWTVerifyGetKey=googleKeys){
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer ')||header.length>16384)return false;
  const token=header.slice(7);
  if(config.MONITOR_RUNNER_SECRET){
    const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
    const [left,right]=await Promise.all([hash(token),hash(config.MONITOR_RUNNER_SECRET)]);
    let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];
    if(diff===0)return true;
  }
  if(!config.MONITOR_GOOGLE_SERVICE_ACCOUNT||!config.MONITOR_GOOGLE_AUDIENCE)return false;
  try{
    const {payload}=await jwtVerify(token,keys,{
      algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],
      audience:config.MONITOR_GOOGLE_AUDIENCE,requiredClaims:['exp','iat','sub','email','email_verified'],maxTokenAge:'65m',clockTolerance:30,
    });
    return payload.email===config.MONITOR_GOOGLE_SERVICE_ACCOUNT&&payload.email_verified===true;
  }catch{return false;}
}
