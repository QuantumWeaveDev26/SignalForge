import {Info,Product,Sample} from '@/components/marketing';
import {notFound} from 'next/navigation';
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params;if(['research','pitch','monitor','build'].includes(slug))return <Product slug={slug}/>;if(slug==='sample')return <Sample/>;if(['pricing','use-cases','contact','privacy','terms'].includes(slug))return <Info slug={slug}/>;notFound();}
