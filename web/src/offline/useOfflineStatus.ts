import { useCallback, useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { fetchLocalAsset, isInventory, verifyCachedInventory } from './assets';

type State = 'preparing'|'ready'|'unavailable'|'development';
export function useOfflineStatus() {
  const [state,setState]=useState<State>(import.meta.env.DEV?'development':'preparing');
  const [missingInference,setMissingInference]=useState<string[]>([]);
  const check=useCallback(async()=>{
    if(import.meta.env.DEV) return;
    if(!('serviceWorker' in navigator)||!('caches' in window)) {setState('unavailable');return;}
    if(!navigator.serviceWorker.controller) return;
    try {
      const inventory:unknown=await (await fetchLocalAsset('offline-assets.json')).json();
      if(!isInventory(inventory)) throw Error('Invalid offline inventory');
      setMissingInference(inventory.missingInference);
      const cached=await verifyCachedInventory(inventory,url=>caches.match(url,{ignoreSearch:true}));
      setState(cached?'ready':'unavailable');
    } catch {setState('unavailable');}
  },[]);
  const { offlineReady:[installed] }=useRegisterSW({
    immediate:true,
    onRegisteredSW:()=>{void check();},
    onOfflineReady:()=>{void check();},
    onRegisterError:()=>setState('unavailable'),
  });
  useEffect(()=>{
    if(import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    const listener=()=>{void check();};
    navigator.serviceWorker.addEventListener('controllerchange',listener);
    window.addEventListener('pageshow',listener);
    void check();
    return ()=>{navigator.serviceWorker.removeEventListener('controllerchange',listener);window.removeEventListener('pageshow',listener);};
  },[check,installed]);
  // Best effort, never a prerequisite for manual mode or sending.
  useEffect(()=>{
    if(state==='ready') void navigator.storage?.persist?.().catch(()=>false);
  },[state]);
  return {state,missingInference};
}
