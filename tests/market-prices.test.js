import test from 'node:test';import assert from 'node:assert/strict';import {getMaterialQuotes} from '../src/app/features/market-prices.js';
test('material quote reuse requires identity, exact name, freshness and unambiguous source',()=>{
 const now=new Date('2026-09-18T12:00Z'),material=[{itemId:'gold-token',name:'Gold Token'}],h={character:{name:'Test',world:'Antica'}},item={id:1,name:'Gold Token',world:'Antica',price:5000,observedAt:'2026-09-18T10:00Z',basis:'active-sell-offer'},m={world:'Antica',items:{1:item}};
 assert.equal(getMaterialQuotes(material,h,m,{now})[0].itemId,'gold-token');
 assert.deepEqual(getMaterialQuotes(material,{},m,{now}),[]);
 for(const patch of [{world:'Secura'},{observedAt:'2026-08-01T00:00Z'},{observedAt:'2099-01-01T00:00Z'},{name:'Gold Coin'},{price:null}])assert.deepEqual(getMaterialQuotes(material,h,{...m,items:{1:{...item,...patch}}},{now}),[]);
 assert.deepEqual(getMaterialQuotes(material,h,{...m,items:{1:item,2:{...item,id:2}}},{now}),[]);
});
