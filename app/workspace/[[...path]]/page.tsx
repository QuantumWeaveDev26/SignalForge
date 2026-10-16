import { requireApplicationUser } from '@/lib/application-auth';
import Workspace from '@/components/workspace';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;await requireApplicationUser('/workspace'+(path.length?'/'+path.map(encodeURIComponent).join('/'):''));return <Workspace/>;}
