'use client';
import {createContext,useContext} from 'react';
export type BrandView={brandId:string;select:(id:string)=>void};
export const BrandViewContext=createContext<BrandView|null>(null);
export const useBrandView=()=>useContext(BrandViewContext);
