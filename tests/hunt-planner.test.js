import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../src/data/hunt-grounds.json" with {type:"json"};
import { filterHuntGrounds, rankHuntGrounds, normalizeVocation, parseMinLevel, parseReferenceRate } from "../src/app/features/hunt-planner.js";

test("curated snapshot validates all 880 source identities, minima, rates and optional video targets",()=>{
 assert.equal(catalog.grounds.length,880);
 assert.equal(new Set(catalog.grounds.map(row=>row.id)).size,880);
 assert.equal(catalog.source.revision,"899d3720e46c36e0eb9e35c6147bf4191ccc69cd");
 for(const row of catalog.grounds){
  assert.ok(row.place.trim());assert.ok(parseMinLevel(row.minLevel)>=8);
  const xp=parseReferenceRate(row.referenceRawExperiencePerHour);assert.ok(xp===null || xp>=0);
  assert.doesNotThrow(()=>parseReferenceRate(row.referenceProfitPerHour));
  if(row.referenceVideoUrl)assert.match(row.referenceVideoUrl,/^https:\/\/youtu\.be\/[\w-]+/);
 }
});
test("reference quantities preserve absent, zero and negative profit, rejecting malformed units",()=>{
 assert.equal(parseReferenceRate("1.05kk"),1050000);assert.equal(parseReferenceRate("-50k"),-50000);
 assert.equal(parseReferenceRate("0k"),0);assert.equal(parseReferenceRate("-"),null);
 for(const value of ["1kkjunk","1,2k","NaN"])assert.throws(()=>parseReferenceRate(value));
 assert.equal(parseMinLevel("80+"),80);assert.equal(parseMinLevel("80maybe"),null);
});
test("filters normalize promotions and retain team composition uncertainty",()=>{
 assert.equal(normalizeVocation("Elite Knight"),"knight");assert.equal(normalizeVocation("Exalted Monk"),"monk");
 assert.throws(()=>normalizeVocation("fighter"));
 const solo=filterHuntGrounds(catalog.grounds,{level:50,vocation:"Royal Paladin",partySize:"solo"});
 assert.ok(solo.length>0);assert.ok(solo.every(row=>row.vocation==="paladin" && parseMinLevel(row.minLevel)<=50));
 const team=filterHuntGrounds(catalog.grounds,{level:100,vocation:"druid",partySize:"team"});
 assert.ok(team.length>0);assert.ok(team.every(row=>row.vocation===null));
 assert.throws(()=>filterHuntGrounds(catalog.grounds,{level:0}));
 assert.throws(()=>filterHuntGrounds(catalog.grounds,{partySize:"duo"}));
});
test("missing reference rates stay unknown and cannot outrank a measured/reference zero",()=>{
 const base={place:"Place",minLevel:"8+",vocation:"knight",partySize:"solo",context:""};
 const rows=[{...base,id:"unknown",referenceProfitPerHour:"-"},{...base,id:"loss",referenceProfitPerHour:"-10k"},{...base,id:"zero",referenceProfitPerHour:"0k"}];
 assert.deepEqual(rankHuntGrounds(rows,{objective:"profit"}).map(row=>row.ground.id),["zero","loss","unknown"]);
});
test("explicitly linked processed sessions form a duration-weighted rate isolated by spawn mode and source",()=>{
 const ground={id:"one",place:"Name",minLevel:"8+",vocation:"paladin",partySize:"solo",context:"",referenceRawExperiencePerHour:"60k"};
 const hunt=(id,hours,xp,mode="regular")=>({id,name:id,respawnMode:mode,processedLog:`Session: ${hours}:00h\nRaw XP Gain: ${xp}\nKilled Monsters:\n1x rat\n`,sessionLog:"unfinished",hasProcessedLog:true});
 const hunts=[hunt("a",1,1000),hunt("b",2,4000),hunt("rapid",1,900000,"rapid"),hunt("unlinked",1,900000)];
 const links={a:"one",b:"one",rapid:"one"};
 const [measured]=rankHuntGrounds([ground],{evidence:"measured"},{hunts,links});
 assert.equal(measured.value,5000/3);assert.equal(measured.measured.minutes,180);assert.equal(measured.measured.sessions.length,2);
 assert.equal(measured.reference,60000);assert.ok(measured.measured.sessions.every(row=>row.hasDraft));
 assert.equal(rankHuntGrounds([ground],{evidence:"reference"},{hunts,links})[0].value,60000);
 assert.equal(rankHuntGrounds([ground],{evidence:"measured",respawnMode:"rapid"},{hunts,links})[0].value,900000);
 assert.equal(rankHuntGrounds([ground],{evidence:"measured"},{hunts,links:{}})[0].value,null);
});
