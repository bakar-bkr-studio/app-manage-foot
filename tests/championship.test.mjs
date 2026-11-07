import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithOxc } from 'vite'

// Run the same TypeScript logic used by the app without a separate test dependency.
const source=await readFile(new URL('../src/championship.ts',import.meta.url),'utf8')
const output=await transformWithOxc(source,'championship.ts',{lang:'ts'})
const {calculateStandings,applyFixtureResult,applyMatchResult}=await import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`)

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
