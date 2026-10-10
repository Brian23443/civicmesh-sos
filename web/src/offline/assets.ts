export interface OfflineInventory { version: 1; shell: string[]; model: string[]; wasm: string[]; missingInference: string[] }
export function isInventory(value: unknown): value is OfflineInventory {
  if(!value||typeof value!=='object') return false;
  const data=value as Partial<OfflineInventory>;
  return data.version===1 && [data.shell,data.model,data.wasm,data.missingInference].every(list=>Array.isArray(list)&&list.every(path=>typeof path==='string' && path.length>0 && !path.startsWith('/') && !path.includes('..') && !path.includes(':')));
}
/** Always same-origin and base-aware; redirects cannot introduce a remote hub/CDN. */
export function localAssetUrl(path: string, base=import.meta.env.BASE_URL, origin=window.location.origin): string {
  if(!path || /[:?#\\]/.test(path) || path.startsWith('/') || path.split('/').some(part=>part==='..'||part==='.'||!part)) throw Error('Asset path must be local and relative');
  const root=new URL(base,origin); const asset=new URL(path,root);
  if(asset.origin!==new URL(origin).origin || !asset.pathname.startsWith(root.pathname)) throw Error('Remote assets are disabled');
  return asset.href;
}
export function fetchLocalAsset(path: string): Promise<Response> {
  return fetch(localAssetUrl(path),{redirect:'error'}).then(response=>{
    if(!response.ok) throw Error(`Local asset is unavailable: ${path}`);
    return response;
  });
}
/** Cache-only readiness checks: do not confuse an online response with offline availability. */
export async function verifyCachedInventory(inventory: OfflineInventory, match: (url:string)=>Promise<unknown>, url=(path:string)=>localAssetUrl(path)): Promise<boolean> {
  if(!inventory.shell.includes('index.html') || !inventory.shell.some(path=>path.endsWith('.js')) || !inventory.shell.some(path=>path.endsWith('.css')) || !inventory.shell.some(path=>/\.woff2?$/.test(path))) return false;
  const paths=[...inventory.shell,...inventory.model,...inventory.wasm,'offline-assets.json'];
  const results=await Promise.all(paths.map(path=>match(url(path))));
  return results.every(Boolean);
}
