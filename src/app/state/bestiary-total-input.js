/** An exact count replaces the old tile; blank explicitly returns progress to unknown. */
export function parseBestiaryTotalInput(raw) {
 const text=String(raw).trim();
 if(text==='')return {kills:0,stage:0,reviewed:false};
 if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw new Error('Total kills must be a nonnegative whole number.');
 return {kills:Number(text),stage:Number(text)===0?1:0,reviewed:true};
}
