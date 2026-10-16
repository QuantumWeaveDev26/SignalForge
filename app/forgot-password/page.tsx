import AccountPage from '@/components/account-page';
export const dynamic='force-dynamic';
export const metadata={title:'Reset password — SignalForge',referrer:'no-referrer' as const};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <AccountPage mode="forgot" searchParams={searchParams}/>;}
