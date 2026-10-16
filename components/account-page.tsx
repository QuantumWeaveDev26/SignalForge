import AccountForm from './account-form';
import {safeAuthReturn} from '@/lib/auth-policy';
type Query=Promise<Record<string,string|string[]|undefined>>;
export default async function AccountPage({mode,searchParams}:{mode:'login'|'signup'|'forgot'|'reset';searchParams:Query}){
 const q=await searchParams;
 return <AccountForm mode={mode} returnTo={safeAuthReturn(q.returnTo)} token={typeof q.token==='string'?q.token:undefined} initialError={typeof q.error==='string'?q.error:undefined}/>;
}
