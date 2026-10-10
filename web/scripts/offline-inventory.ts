import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Plugin } from 'vite';
function listFiles(root:string, directory=root):string[] {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(entry.name.startsWith('.')) return [];
    const path=resolve(directory,entry.name);
    return entry.isDirectory()?listFiles(root,path):[relative(root,path).split('\\').join('/')];
  });
}
/** Inventory is itself precached; the UI validates Cache Storage against it on reload. */
export function offlineInventory():Plugin {
  let publicDir='';
  return {
    name:'civicmesh-offline-inventory',enforce:'post',
    configResolved(config){publicDir=config.publicDir;},
    generateBundle(_options,bundle){
      const files=listFiles(publicDir);
      const model=files.filter(path=>(path.startsWith('model/')||path.startsWith('experimental/')));
      const wasm=files.filter(path=>path.startsWith('ort/'));
      const required=['model/model.json','model/tokenizer.json'];
      if(model.includes('model/model.json')) {
        const config=JSON.parse(readFileSync(resolve(publicDir,'model/model.json'),'utf8')) as {kind:string};
        if(config.kind==='prototype') required.push('model/embedder.onnx.gz','model/prototypes.json');
        else if(config.kind==='classifier') required.push('model/classifier.onnx.gz');
        else throw Error('Unknown local model kind');
      } else required.push('model/embedder.onnx.gz','model/prototypes.json');
      const missingInference=required.filter(path=>!model.includes(path));
      if(!wasm.some(path=>path.endsWith('.wasm'))) missingInference.push('ort/local-runtime.wasm');
      const shell=[...new Set([...Object.keys(bundle),...files.filter(path=>!model.includes(path)&&!wasm.includes(path))])];
      this.emitFile({type:'asset',fileName:'offline-assets.json',source:JSON.stringify({version:1,shell,model,wasm,missingInference},null,2)});
    },
  };
}
