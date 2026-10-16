import AccountPage from '@/components/account-page';
export const dynamic='force-dynamic';
export const metadata={title:'Sign in — SignalForge',referrer:'no-referrer' as const};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <AccountPage mode="login" searchParams={searchParams}/>;}
