import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'

// Run the same TypeScript logic used by the app without a separate test dependency.
const source=await readFile(new URL('../src/championship.ts',import.meta.url),'utf8')
const output=await transformWithOxc(source,'championship.ts',{lang:'ts'})
const {calculateStandings,applyFixtureResult,applyMatchResult,addMatchWithChampionship,attachExistingMatch}=await import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`)

const setup=()=>{
 const championship={id:'league',name:'Groupe A',season:'2026–27',winPoints:3,drawPoints:1,lossPoints:0,teams:[{id:'own',name:'Nous',own:true},{id:'a',name:'Alpha'},{id:'b',name:'Beta'},{id:'c',name:'Charlie'}],rounds:[{id:'day',name:'Journée 1',date:'2026-09-01',fixtures:[{id:'fixture',homeId:'a',awayId:'own',matchId:'match'},{id:'other',homeId:'b',awayId:'c'}]}]}
 const match={id:'match',opponent:'Alpha',date:'2026-09-01',time:'',venue:'',home:false,calledUp:['p1'],formation:'4-4-2',lineup:{GB:'p1'},substitutes:[],events:[{id:'event',type:'but',playerId:'p1'}],championshipFixtureId:'fixture'}
 return {players:[],sessions:[],matches:[match],championships:[championship]}
}

test('le classement ignore les rencontres sans score et compte un 0–0',()=>{
 let data=setup()
 assert.ok(calculateStandings(data.championships[0]).every(row=>row.played===0&&row.points===0))
 data=applyFixtureResult(data,'league','day','other',0,0)
 const rows=calculateStandings(data.championships[0])
 assert.deepEqual(rows.filter(row=>row.played).map(row=>[row.team.id,row.points,row.rank]),[['b',1,1],['c',1,1]])
})

test('un score à l’extérieur est synchronisé sans effacer la feuille ou les événements',()=>{
 const original=setup()
 const data=applyFixtureResult(original,'league','day','fixture',1,3)
 assert.equal(data.matches[0].scoreHome,3)
 assert.equal(data.matches[0].scoreAway,1)
 assert.equal(data.matches[0].completed,true)
 assert.deepEqual(data.matches[0].lineup,original.matches[0].lineup)
 assert.deepEqual(data.matches[0].events,original.matches[0].events)
 const first=calculateStandings(data.championships[0])[0]
 assert.deepEqual([first.team.id,first.played,first.won,first.points,first.goalsFor,first.goalsAgainst],['own',1,1,3,3,1])
 assert.equal(original.championships[0].rounds[0].fixtures[0].homeScore,undefined)
})

test('le bilan met à jour le bon sens du score dans le championnat',()=>{
 const original=setup()
 const updated={...original.matches[0],scoreHome:2,scoreAway:4,completed:true}
 const data=applyMatchResult(original,updated)
 const fixture=data.championships[0].rounds[0].fixtures[0]
 assert.deepEqual([fixture.homeScore,fixture.awayScore],[4,2])
 assert.deepEqual(data.matches[0].events,original.matches[0].events)
})

test('un match à domicile synchronise les scores dans le même ordre',()=>{
 const original=setup()
 original.championships[0].rounds[0].fixtures[0].homeId='own'
 original.championships[0].rounds[0].fixtures[0].awayId='a'
 original.matches[0].home=true
 let data=applyFixtureResult(original,'league','day','fixture',4,1)
 assert.deepEqual([data.matches[0].scoreHome,data.matches[0].scoreAway],[4,1])
 data=applyMatchResult(data,{...data.matches[0],scoreHome:0,scoreAway:0})
 assert.deepEqual([data.championships[0].rounds[0].fixtures[0].homeScore,data.championships[0].rounds[0].fixtures[0].awayScore],[0,0])
})

test('corriger ou retirer un score recalcule le classement et préserve les événements',()=>{
 let data=applyFixtureResult(setup(),'league','day','fixture',1,3)
 data=applyFixtureResult(data,'league','day','fixture',2,2)
 assert.equal(calculateStandings(data.championships[0]).find(row=>row.team.id==='own').points,1)
 data=applyFixtureResult(data,'league','day','fixture',undefined,undefined)
 assert.equal(data.matches[0].completed,false)
 assert.equal(data.matches[0].scoreHome,undefined)
 assert.equal(data.matches[0].events.length,1)
 assert.equal(calculateStandings(data.championships[0]).find(row=>row.team.id==='own').played,0)
})

test('le barème choisi est appliqué aux victoires, nuls et défaites',()=>{
 let data=applyFixtureResult(setup(),'league','day','fixture',1,3)
 data=applyFixtureResult(data,'league','day','other',0,0)
 const rows=calculateStandings({...data.championships[0],winPoints:4,drawPoints:2,lossPoints:1})
 assert.equal(rows.find(row=>row.team.id==='own').points,4)
 assert.equal(rows.find(row=>row.team.id==='a').points,1)
 assert.equal(rows.find(row=>row.team.id==='b').points,2)
})

test('le critère de départage choisi change l’ordre et conserve les égalités',()=>{
 const championship=setup().championships[0]
 championship.rounds[0].fixtures=[{id:'f1',homeId:'a',awayId:'c',homeScore:3,awayScore:2},{id:'f2',homeId:'b',awayId:'own',homeScore:2,awayScore:0}]
 assert.equal(calculateStandings({...championship,tieBreak:'goalDifference'})[0].team.id,'b')
 assert.equal(calculateStandings({...championship,tieBreak:'goalsScored'})[0].team.id,'a')
 const pointsOnly=calculateStandings({...championship,tieBreak:'pointsOnly'})
 assert.equal(pointsOnly.find(row=>row.team.id==='a').rank,pointsOnly.find(row=>row.team.id==='b').rank)
})

test('un nouveau match de championnat crée simultanément sa rencontre et évite les doublons',()=>{
 const original=setup()
 original.championships[0].rounds[0].fixtures=[]
 const match={...original.matches[0],id:'new',matchType:'championnat'}
 delete match.championshipFixtureId
 const link={championshipId:'league',roundId:'day',opponentId:'a',fixtureId:'new-fixture'}
 const data=addMatchWithChampionship(original,match,link)
 const fixture=data.championships[0].rounds[0].fixtures[0]
 assert.deepEqual([fixture.homeId,fixture.awayId,fixture.matchId],['a','own','new'])
 assert.equal(data.matches[0].championshipFixtureId,'new-fixture')
 assert.equal(original.championships[0].rounds[0].fixtures.length,0)
 assert.throws(()=>addMatchWithChampionship(data,{...match,id:'duplicate'},link),/déjà lié/)
 assert.throws(()=>addMatchWithChampionship(original,{...match,matchType:'amical'},link),/Seul un match de championnat/)
})

test('une journée déjà jouée sans match lié transmet son score à la création',()=>{
 const original=setup()
 original.championships[0].rounds[0].fixtures=[{id:'existing-fixture',homeId:'a',awayId:'own',homeScore:1,awayScore:2}]
 const match={...original.matches[0],id:'new',matchType:'championnat'}
 delete match.championshipFixtureId
 const data=addMatchWithChampionship(original,match,{championshipId:'league',roundId:'day',opponentId:'a',fixtureId:'unused'})
 assert.deepEqual([data.matches[0].scoreHome,data.matches[0].scoreAway,data.matches[0].completed],[2,1,true])
 assert.equal(data.championships[0].rounds[0].fixtures[0].matchId,'new')
 assert.equal(data.championships[0].rounds[0].fixtures.length,1)
})

test('rattacher un ancien match conserve son bilan et met à jour le classement',()=>{
 const original=setup()
 original.championships[0].rounds[0].fixtures=[]
 original.matches[0]={...original.matches[0],opponent:'Alpha',completed:true,scoreHome:2,scoreAway:1}
 delete original.matches[0].championshipFixtureId
 const data=attachExistingMatch(original,'league','day','match','fixture')
 assert.equal(data.matches.length,1)
 assert.equal(data.matches[0].matchType,'championnat')
 assert.deepEqual(data.matches[0].events,original.matches[0].events)
 assert.deepEqual([data.championships[0].rounds[0].fixtures[0].homeScore,data.championships[0].rounds[0].fixtures[0].awayScore],[1,2])
 assert.equal(calculateStandings(data.championships[0]).find(row=>row.team.id==='own').points,3)
 assert.throws(()=>attachExistingMatch({...original,matches:[{...original.matches[0],matchType:'amical'}]},'league','day','match','fixture'),/amical/)
})

test('un brouillon vide ne peut être remplacé qu’après confirmation et sans effacer un bilan',()=>{
 const original=setup()
 original.matches[0]={...original.matches[0],completed:true,scoreHome:2,scoreAway:1}
 delete original.matches[0].championshipFixtureId
 original.matches.push({id:'draft',opponent:'Alpha',date:'2026-09-01',time:'',venue:'',home:false,calledUp:[],formation:'4-4-2',lineup:{},substitutes:[],events:[],championshipFixtureId:'fixture'})
 original.championships[0].rounds[0].fixtures[0]={id:'fixture',homeId:'a',awayId:'own',matchId:'draft'}
 assert.throws(()=>attachExistingMatch(original,'league','day','match','unused'),/Confirmez/)
 const linked=attachExistingMatch(original,'league','day','match','unused',true)
 assert.equal(linked.matches.length,1)
 assert.deepEqual(linked.matches[0].events,original.matches[0].events)
 assert.throws(()=>attachExistingMatch({...original,matches:original.matches.map(match=>match.id==='draft'?{...match,venue:'Stade'}:match)},'league','day','match','unused',true),/contient des informations/)
})
