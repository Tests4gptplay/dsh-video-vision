const chain = new Proxy(function(){return chain;},{get(_target,key){return key==='then'?undefined:chain;}});
export default chain;
