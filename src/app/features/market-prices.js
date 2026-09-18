import {getCharacterHistorySummary,getMarketWatchSummary} from './public-data.js';
/** Quotes are suggestions only: exact name, configured World and fresh source time are required. */
export function getMaterialQuotes(materials,history,market,{now=new Date()}={}){
 const character=getCharacterHistorySummary(history,{now}),quotes=getMarketWatchSummary(market,{now});
 if(!character.configured||!character.world||character.world!==quotes.world)return [];
 return materials.flatMap(material=>{
  const matches=quotes.items.filter(item=>item.name.trim().toLowerCase()===material.name.trim().toLowerCase()&&item.world===character.world&&item.freshness==='fresh'&&Number.isFinite(item.price)&&item.price>0);
  return matches.length===1?[{...matches[0],itemId:material.itemId}]:[];
 });
}
